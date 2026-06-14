# 知识图谱 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为每个 wiki 构建知识图谱（节点 + 边），存储为 MinIO 中的 `graph.json`，关系来源同时支持 LLM 提取和 Markdown 链接解析，通过独立的 graph-extraction 队列任务异步处理。

**Architecture:** Ingest 完成后 enqueue graph-extraction job，worker 并行运行 link-extractor 和 llm-extractor，用 Redis 锁保护 graph.json 的读-改-写，最终通过 `GET /api/wiki/:wikiId/graph` 暴露图谱数据。

**Tech Stack:** Node.js 20, TypeScript, Redis (分布式锁 + 队列), MinIO/S3 (JSON 存储), DeepSeek API (LLM 提取), ioredis, @aws-sdk/client-s3

---

## 文件变更清单

| 文件 | 操作 |
|------|------|
| `src/graph/graph-store.ts` | 新建（读写 graph.json，Redis 锁） |
| `src/graph/link-extractor.ts` | 新建（解析 Markdown 链接） |
| `src/graph/llm-extractor.ts` | 新建（LLM 提取关系） |
| `src/queue/graph-extraction-queue.ts` | 新建（graph job 入队/出队/状态） |
| `src/queue/graph-extraction-handler.ts` | 新建（worker handler） |
| `src/routes/graph.ts` | 新建（GET /api/wiki/:wikiId/graph） |
| `src/queue/worker.ts` | 修改（注册 graph-extraction handler） |
| `src/services/ingest-service.ts` | 修改（ingest 完成后 enqueue graph job） |
| `src/index.ts` 或 `src/app.ts` | 修改（挂载 graph 路由） |

---

### Task 1: 新建 graph-store.ts

**Files:**
- Create: `wiki-server/src/graph/graph-store.ts`

graph.json 的 MinIO key 格式：`{wikiId}/graph.json`，与页面文件放在同一 bucket。
使用现有 `withDistributedLock` 实现的锁机制，但 graph 用独立的 lockKey `lock:graph:{wikiId}`。

- [ ] **Step 1: 新建 `src/graph/graph-store.ts`**

```typescript
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3'
import Redis from 'ioredis'
import { randomBytes } from 'crypto'

export interface GraphNode {
  id: string
  title: string
}

export interface GraphEdge {
  source: string
  target: string
  relation: string
  sourceType: 'llm' | 'link'
}

export interface WikiGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
  updatedAt: string
}

const LOCK_TTL = 10
const RETRY_DELAY = 300
const MAX_RETRIES = 20

function emptyGraph(): WikiGraph {
  return { nodes: [], edges: [], updatedAt: new Date().toISOString() }
}

export class GraphStore {
  private readonly s3: S3Client
  private readonly bucket: string
  private readonly redis: Redis

  constructor() {
    this.s3 = new S3Client({
      region: process.env.S3_REGION ?? 'us-east-1',
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY!,
        secretAccessKey: process.env.S3_SECRET_KEY!,
      },
      ...(process.env.S3_ENDPOINT && {
        endpoint: process.env.S3_ENDPOINT,
        forcePathStyle: true,
      }),
    })
    this.bucket = process.env.S3_BUCKET!
    this.redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379')
  }

  private key(wikiId: string): string {
    return `${wikiId}/graph.json`
  }

  async readGraph(wikiId: string): Promise<WikiGraph> {
    try {
      const res = await this.s3.send(new GetObjectCommand({
        Bucket: this.bucket,
        Key: this.key(wikiId),
      }))
      const raw = await res.Body!.transformToString('utf-8')
      return JSON.parse(raw) as WikiGraph
    } catch (err: unknown) {
      if ((err as { name?: string }).name === 'NoSuchKey') return emptyGraph()
      throw err
    }
  }

  async writeGraph(wikiId: string, graph: WikiGraph): Promise<void> {
    await this.s3.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: this.key(wikiId),
      Body: JSON.stringify(graph, null, 2),
      ContentType: 'application/json',
    }))
  }

  async updatePageInGraph(
    wikiId: string,
    pageId: string,
    title: string,
    newEdges: GraphEdge[],
  ): Promise<void> {
    const lockKey = `lock:graph:${wikiId}`
    const token = randomBytes(16).toString('hex')

    let acquired = false
    for (let i = 0; i < MAX_RETRIES; i++) {
      const ok = await this.redis.set(lockKey, token, 'EX', LOCK_TTL, 'NX')
      if (ok === 'OK') { acquired = true; break }
      await new Promise(r => setTimeout(r, RETRY_DELAY))
    }
    if (!acquired) throw new Error(`获取 graph 锁超时: ${wikiId}`)

    try {
      const graph = await this.readGraph(wikiId)

      const nodeIdx = graph.nodes.findIndex(n => n.id === pageId)
      if (nodeIdx >= 0) {
        graph.nodes[nodeIdx].title = title
      } else {
        graph.nodes.push({ id: pageId, title })
      }

      graph.edges = graph.edges.filter(e => e.source !== pageId)
      graph.edges.push(...newEdges)
      graph.updatedAt = new Date().toISOString()

      await this.writeGraph(wikiId, graph)
    } finally {
      const lua = `if redis.call("GET",KEYS[1])==ARGV[1] then return redis.call("DEL",KEYS[1]) else return 0 end`
      await this.redis.eval(lua, 1, lockKey, token)
    }
  }
}
```

- [ ] **Step 2: 验证 TypeScript 编译无报错**

```bash
cd wiki-server && npx tsc --noEmit
```

Expected：无报错输出。

---

### Task 2: 新建 link-extractor.ts

**Files:**
- Create: `wiki-server/src/graph/link-extractor.ts`

解析 Markdown 中的 `[text](./Page.md)` 和 `[text](Page.md)` 格式的相对链接。忽略 `http://`、`https://`、锚点链接 `#xxx`。

- [ ] **Step 1: 新建 `src/graph/link-extractor.ts`**

```typescript
import type { GraphEdge } from './graph-store'

const MD_LINK = /\[([^\]]+)\]\(([^)]+)\)/g

export function extractLinks(pageId: string, content: string): GraphEdge[] {
  const edges: GraphEdge[] = []
  let match: RegExpExecArray | null

  while ((match = MD_LINK.exec(content)) !== null) {
    const href = match[2].trim()
    if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('#')) {
      continue
    }
    // 去掉锚点后缀，如 ./Page.md#section → Page.md
    const clean = href.replace(/^\.\//, '').split('#')[0]
    if (!clean) continue

    edges.push({
      source: pageId,
      target: clean,
      relation: '链接',
      sourceType: 'link',
    })
  }

  return edges
}
```

- [ ] **Step 2: 验证 TypeScript 编译无报错**

```bash
cd wiki-server && npx tsc --noEmit
```

Expected：无报错输出。

---

### Task 3: 新建 llm-extractor.ts

**Files:**
- Create: `wiki-server/src/graph/llm-extractor.ts`

调用 DeepSeek API（复用现有 `DEEPSEEK_API_KEY` 和 `LLM_MODEL` 环境变量）。只取页面内容前 1000 字，要求 LLM 返回 JSON 数组。LLM 失败时返回空数组（不抛出）。

- [ ] **Step 1: 新建 `src/graph/llm-extractor.ts`**

```typescript
import type { GraphEdge } from './graph-store'

interface LLMRelation {
  target: string
  relation: string
}

const SYSTEM_PROMPT = `你是知识图谱提取助手。从页面内容中提取与其他主题/文档的明确关系。
只提取明确提到的关系，不要过度推断。
返回 JSON 数组格式：[{"target":"目标主题","relation":"关系描述"}]
如果没有明确关系，返回空数组 []。
只输出 JSON，不要任何解释。`

export async function extractRelations(
  pageId: string,
  title: string,
  content: string,
): Promise<GraphEdge[]> {
  const apiKey = process.env.DEEPSEEK_API_KEY
  const model = process.env.LLM_MODEL ?? 'deepseek-v4-flash'
  const baseUrl = 'https://api.deepseek.com'

  if (!apiKey) return []

  const userMsg = `页面标题：${title}\n页面内容：${content.slice(0, 1000)}`

  try {
    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMsg },
        ],
        temperature: 0,
        max_tokens: 512,
      }),
    })

    if (!res.ok) {
      console.warn(`[llm-extractor] API 返回 ${res.status}，跳过`)
      return []
    }

    const data = await res.json() as { choices: Array<{ message: { content: string } }> }
    const text = data.choices[0]?.message?.content?.trim() ?? '[]'

    const parsed = JSON.parse(text) as LLMRelation[]
    return parsed
      .filter(r => r.target && r.relation)
      .map(r => ({
        source: pageId,
        target: r.target,
        relation: r.relation,
        sourceType: 'llm' as const,
      }))
  } catch (err) {
    console.warn('[llm-extractor] 提取失败，跳过:', (err as Error).message)
    return []
  }
}
```

- [ ] **Step 2: 验证 TypeScript 编译无报错**

```bash
cd wiki-server && npx tsc --noEmit
```

Expected：无报错输出。

---

### Task 4: 新建 graph-extraction-queue.ts

**Files:**
- Create: `wiki-server/src/queue/graph-extraction-queue.ts`

复用现有 IngestQueue 的 Redis list 模式，使用独立的 queue key `graph-extraction-queue`。

- [ ] **Step 1: 新建 `src/queue/graph-extraction-queue.ts`**

```typescript
import Redis from 'ioredis'

export interface GraphExtractionTask {
  wikiId: string
  pageId: string
  title: string
  content: string
}

const QUEUE_KEY = 'graph-extraction-queue'

export class GraphExtractionQueue {
  private readonly producer: Redis
  private readonly consumer: Redis

  constructor() {
    const url = process.env.REDIS_URL ?? 'redis://localhost:6379'
    this.producer = new Redis(url)
    this.consumer = new Redis(url)
  }

  async enqueue(task: GraphExtractionTask): Promise<void> {
    await this.producer.lpush(QUEUE_KEY, JSON.stringify(task))
  }

  async dequeue(timeoutSec: number = 30): Promise<GraphExtractionTask | null> {
    const result = await this.consumer.brpop(QUEUE_KEY, timeoutSec)
    if (!result) return null
    try {
      return JSON.parse(result[1]) as GraphExtractionTask
    } catch {
      console.error('[graph-queue] 解析任务失败:', result[1])
      return null
    }
  }
}
```

- [ ] **Step 2: 验证 TypeScript 编译无报错**

```bash
cd wiki-server && npx tsc --noEmit
```

Expected：无报错输出。

---

### Task 5: 新建 graph-extraction-handler.ts 并注册到 worker

**Files:**
- Create: `wiki-server/src/queue/graph-extraction-handler.ts`
- Modify: `wiki-server/src/queue/worker.ts`

- [ ] **Step 1: 新建 `src/queue/graph-extraction-handler.ts`**

```typescript
import { GraphExtractionQueue } from './graph-extraction-queue'
import { GraphStore } from '../graph/graph-store'
import { extractLinks } from '../graph/link-extractor'
import { extractRelations } from '../graph/llm-extractor'

const queue = new GraphExtractionQueue()
const store = new GraphStore()

export async function runGraphExtractionWorker(): Promise<never> {
  console.log('[graph-worker] 启动，等待图谱提取任务...')

  while (true) {
    const task = await queue.dequeue(30)
    if (!task) continue

    console.log(`[graph-worker] 处理: ${task.wikiId}/${task.pageId}`)

    try {
      const [linkEdges, llmEdges] = await Promise.all([
        Promise.resolve(extractLinks(task.pageId, task.content)),
        extractRelations(task.pageId, task.title, task.content),
      ])

      await store.updatePageInGraph(
        task.wikiId,
        task.pageId,
        task.title,
        [...linkEdges, ...llmEdges],
      )

      console.log(`[graph-worker] 完成: ${task.pageId}，边数=${linkEdges.length + llmEdges.length}`)
    } catch (err) {
      console.error(`[graph-worker] 失败: ${task.pageId}`, (err as Error).message)
    }
  }
}
```

- [ ] **Step 2: 修改 `src/queue/worker.ts`，在 `runWorker()` 启动后并行启动 graph worker**

在文件末尾的 `runWorker().catch(...)` 之前，添加 import 并修改启动部分：

```typescript
import { runGraphExtractionWorker } from './graph-extraction-handler'

// 替换末尾的启动代码：
Promise.all([
  runWorker(),
  runGraphExtractionWorker(),
]).catch((err) => {
  console.error('[worker] 致命错误:', err)
  process.exit(1)
})
```

同时删除原有的：
```typescript
runWorker().catch((err) => {
  console.error('[worker] 致命错误:', err)
  process.exit(1)
})
```

- [ ] **Step 3: 验证 TypeScript 编译无报错**

```bash
cd wiki-server && npx tsc --noEmit
```

Expected：无报错输出。

---

### Task 6: 修改 ingest-service.ts，ingest 完成后 enqueue graph job

**Files:**
- Modify: `wiki-server/src/services/ingest-service.ts`

- [ ] **Step 1: 在 `ingest-service.ts` 顶部新增 import**

```typescript
import { GraphExtractionQueue } from '../queue/graph-extraction-queue'
```

- [ ] **Step 2: 在函数内初始化队列实例（`runIngest` 函数开头附近，`store` 参数之后）**

在 `runIngest` 函数内，`saveIngestCache` 调用之后、`return` 之前，添加：

```typescript
const graphQueue = new GraphExtractionQueue()
for (const block of fileBlocks) {
  await graphQueue.enqueue({
    wikiId,
    pageId: block.path,
    title: block.path.replace(/\.md$/, '').split('/').pop() ?? block.path,
    content: block.content,
  })
}
console.log(`[ingest] 已提交 ${fileBlocks.length} 个图谱提取任务`)
```

- [ ] **Step 3: 验证 TypeScript 编译无报错**

```bash
cd wiki-server && npx tsc --noEmit
```

Expected：无报错输出。

---

### Task 7: 新建 graph 路由并挂载

**Files:**
- Create: `wiki-server/src/routes/graph.ts`
- Modify: `wiki-server/src/index.ts`（或当前挂载路由的文件）

- [ ] **Step 1: 查看路由挂载位置**

```bash
grep -n "ingestRouter\|wikiRouter\|app.use" wiki-server/src/index.ts 2>/dev/null || \
grep -rn "ingestRouter\|wikiRouter\|app.use" wiki-server/src/ --include="*.ts" | head -20
```

确认路由挂载文件和前缀格式（如 `/api/wiki`）。

- [ ] **Step 2: 新建 `src/routes/graph.ts`**

```typescript
import { Router } from 'express'
import { GraphStore } from '../storage/graph-store'

export const graphRouter = Router()

const store = new GraphStore()

graphRouter.get('/:wikiId/graph', async (req, res, next) => {
  try {
    const { wikiId } = req.params
    const graph = await store.readGraph(wikiId)
    res.json(graph)
  } catch (err) {
    next(err)
  }
})
```

注意：`GraphStore` 的 import 路径为 `'../graph/graph-store'`（不是 `'../storage/graph-store'`），根据实际目录结构调整。

- [ ] **Step 3: 在路由挂载文件中注册 graphRouter**

找到挂载 `ingestRouter` 的位置，在同一处添加：

```typescript
import { graphRouter } from './routes/graph'
// ...
app.use('/api/wiki', graphRouter)
```

- [ ] **Step 4: 验证 TypeScript 编译无报错**

```bash
cd wiki-server && npx tsc --noEmit
```

Expected：无报错输出。

---

### Task 8: 本地集成验证

**Files:** 无代码变更

前提：本地已运行 `docker compose up -d`（MinIO/Qdrant/Redis），并在两个终端分别运行 `npm run dev` 和 `npm run worker`。

- [ ] **Step 1: 重启 worker（使其加载新代码）**

在 worker 终端按 `Ctrl+C` 后重新执行：
```bash
cd wiki-server && npm run worker
```

Expected：看到两行启动日志：
```
[worker] 启动，等待任务...
[graph-worker] 启动，等待图谱提取任务...
```

- [ ] **Step 2: 登录拿 Token**

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","password":"demo-password"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
echo $TOKEN
```

Expected：输出 JWT 字符串。

- [ ] **Step 3: 提交包含链接的 ingest 任务**

```bash
curl -s -X POST http://localhost:3000/api/wiki/my-wiki/ingest \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "sourceFileName": "graph-test.md",
    "sourceContent": "# 图谱测试\n\n这是一篇关于[部署](./Deploy.md)的文档。\n\n它还提到了[入门指南](./Intro.md)。",
    "sourceMimeType": "text/plain"
  }' | python3 -m json.tool
```

Expected：返回 `{"jobId":"...","status":"queued"}`。

- [ ] **Step 4: 等待 10 秒后查询图谱**

```bash
sleep 10
curl -s http://localhost:3000/api/wiki/my-wiki/graph \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

Expected：返回包含 nodes 和 edges 的 JSON，edges 中有 `sourceType: "link"` 的边指向 `Deploy.md` 和 `Intro.md`，以及若干 `sourceType: "llm"` 的边（可能为空数组，取决于 LLM 返回）。

- [ ] **Step 5: 提交第二篇有交叉链接的文档，验证图谱增量合并**

```bash
curl -s -X POST http://localhost:3000/api/wiki/my-wiki/ingest \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "sourceFileName": "Deploy.md",
    "sourceContent": "# 部署指南\n\n参考[图谱测试](./graph-test.md)中的步骤。",
    "sourceMimeType": "text/plain"
  }' | python3 -m json.tool

sleep 10

curl -s http://localhost:3000/api/wiki/my-wiki/graph \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

Expected：graph.json 中出现两个 nodes，edges 包含双向链接关系，`updatedAt` 已更新。
