# 图谱边权重系统实施规划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 支持 `[[wikilink]]` 语法并为图谱边引入 4 信号权重计算模型

**Architecture:** 扩展 link-extractor 支持 wikilink 解析与 resolveTarget 匹配逻辑，新增 graph-relevance 模块实现 4 信号权重计算（直接链接、共享原文件、Adamic-Adar、类型亲和），在 graph-extraction-handler 中调用权重计算后再写入图谱

**Tech Stack:** TypeScript, Node.js, existing WikiStore/GraphStore

---

## 文件结构

**新建文件：**
- `wiki-server/src/graph/graph-relevance.ts` — 权重计算核心逻辑
- `wiki-server/src/graph/graph-relevance.test.ts` — 权重计算单元测试

**修改文件：**
- `wiki-server/src/graph/graph-store.ts` — GraphEdge 接口加 `weight?: number`
- `wiki-server/src/graph/link-extractor.ts` — 新增 wikilink 正则、resolveTarget 函数、knownPages 参数
- `wiki-server/src/graph/link-extractor.test.ts` — resolveTarget 单元测试（新建或扩展）
- `wiki-server/src/queue/graph-extraction-handler.ts` — 集成 computePageWeights 调用

---

### Task 1: GraphEdge 接口加 weight 字段

**Files:**
- Modify: `wiki-server/src/graph/graph-store.ts:15-20`

- [ ] **Step 1: 写失败测试（类型检查测试）**

创建 `wiki-server/src/graph/graph-store.test.ts`：

```typescript
import type { GraphEdge } from './graph-store'

describe('GraphEdge', () => {
  it('should allow weight field', () => {
    const edge: GraphEdge = {
      source: 'wiki/a.md',
      target: 'wiki/b.md',
      relation: '链接',
      sourceType: 'link',
      weight: 5.0,
    }
    expect(edge.weight).toBe(5.0)
  })

  it('should allow missing weight field', () => {
    const edge: GraphEdge = {
      source: 'wiki/a.md',
      target: 'wiki/b.md',
      relation: '链接',
      sourceType: 'link',
    }
    expect(edge.weight).toBeUndefined()
  })
})
```

- [ ] **Step 2: 运行测试验证失败**

```bash
cd wiki-server
npx jest src/graph/graph-store.test.ts
```

预期：类型错误或测试失败（weight 字段不存在）

- [ ] **Step 3: 修改 GraphEdge 接口**

在 `graph-store.ts` 中修改：

```typescript
export interface GraphEdge {
  source: string
  target: string
  relation: string
  sourceType: 'llm' | 'link'
  weight?: number
}
```

- [ ] **Step 4: 运行测试验证通过**

```bash
npx jest src/graph/graph-store.test.ts
```

预期：PASS

- [ ] **Step 5: 提交**

```bash
git add src/graph/graph-store.ts src/graph/graph-store.test.ts
git commit -m "feat: add optional weight field to GraphEdge

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 2: resolveTarget 函数实现

**Files:**
- Modify: `wiki-server/src/graph/link-extractor.ts:1-34`
- Create: `wiki-server/src/graph/link-extractor.test.ts`

- [ ] **Step 1: 写 resolveTarget 失败测试**

创建 `wiki-server/src/graph/link-extractor.test.ts`：

```typescript
import { resolveTarget } from './link-extractor'

describe('resolveTarget', () => {
  const knownPages = [
    'wiki/index.md',
    'wiki/getting-started.md',
    'wiki/advanced/config.md',
  ]

  it('should match by exact path', () => {
    expect(resolveTarget('wiki/index.md', knownPages)).toBe('wiki/index.md')
  })

  it('should match by normalized title', () => {
    expect(resolveTarget('Getting Started', knownPages)).toBe('wiki/getting-started.md')
    expect(resolveTarget('getting_started', knownPages)).toBe('wiki/getting-started.md')
    expect(resolveTarget('GETTINGSTARTED', knownPages)).toBe('wiki/getting-started.md')
  })

  it('should match nested file by title', () => {
    expect(resolveTarget('Config', knownPages)).toBe('wiki/advanced/config.md')
  })

  it('should return null for unknown target', () => {
    expect(resolveTarget('Unknown Page', knownPages)).toBeNull()
  })

  it('should handle pipe syntax by extracting target', () => {
    expect(resolveTarget('wiki/index.md', knownPages)).toBe('wiki/index.md')
  })
})
```

- [ ] **Step 2: 运行测试验证失败**

```bash
npx jest src/graph/link-extractor.test.ts
```

预期：FAIL（resolveTarget 未导出或不存在）

- [ ] **Step 3: 实现 resolveTarget 函数**

在 `link-extractor.ts` 开头添加：

```typescript
function normalize(s: string): string {
  return s.toLowerCase().replace(/[\s\-_]/g, '')
}

export function resolveTarget(target: string, knownPages: string[]): string | null {
  // 精确匹配
  if (knownPages.includes(target)) {
    return target
  }

  // 标题归一化匹配
  const normalizedTarget = normalize(target)
  for (const page of knownPages) {
    const baseName = page.split('/').pop()?.replace(/\.md$/, '') ?? ''
    if (normalize(baseName) === normalizedTarget) {
      return page
    }
  }

  return null
}
```

- [ ] **Step 4: 运行测试验证通过**

```bash
npx jest src/graph/link-extractor.test.ts
```

预期：PASS

- [ ] **Step 5: 提交**

```bash
git add src/graph/link-extractor.ts src/graph/link-extractor.test.ts
git commit -m "feat: add resolveTarget for wikilink matching

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 3: wikilink 正则解析

**Files:**
- Modify: `wiki-server/src/graph/link-extractor.ts:4-34`

- [ ] **Step 1: 写 wikilink 解析失败测试**

在 `link-extractor.test.ts` 中添加：

```typescript
import { extractLinks } from './link-extractor'

describe('extractLinks with wikilinks', () => {
  const knownPages = ['wiki/index.md', 'wiki/setup.md', 'wiki/api/auth.md']

  it('should extract [[Title]] wikilink', () => {
    const content = 'See [[Setup]] for details'
    const edges = extractLinks('wiki/index.md', content, knownPages)
    expect(edges).toContainEqual({
      source: 'wiki/index.md',
      target: 'wiki/setup.md',
      relation: '链接',
      sourceType: 'link',
    })
  })

  it('should extract [[path]] wikilink', () => {
    const content = 'See [[wiki/api/auth.md]] for auth'
    const edges = extractLinks('wiki/index.md', content, knownPages)
    expect(edges).toContainEqual({
      source: 'wiki/index.md',
      target: 'wiki/api/auth.md',
      relation: '链接',
      sourceType: 'link',
    })
  })

  it('should extract [[target|alias]] wikilink', () => {
    const content = 'See [[Setup|installation guide]] here'
    const edges = extractLinks('wiki/index.md', content, knownPages)
    expect(edges).toContainEqual({
      source: 'wiki/index.md',
      target: 'wiki/setup.md',
      relation: '链接',
      sourceType: 'link',
    })
  })

  it('should ignore unknown wikilinks', () => {
    const content = '[[Unknown Page]] does not exist'
    const edges = extractLinks('wiki/index.md', content, knownPages)
    expect(edges.length).toBe(0)
  })

  it('should handle mixed markdown and wikilinks', () => {
    const content = '[MD Link](setup.md) and [[Setup]] both work'
    const edges = extractLinks('wiki/index.md', content, knownPages)
    expect(edges.length).toBe(2)
    expect(edges.some(e => e.target === 'wiki/setup.md')).toBe(true)
  })
})
```

- [ ] **Step 2: 运行测试验证失败**

```bash
npx jest src/graph/link-extractor.test.ts --testNamePattern="extractLinks with wikilinks"
```

预期：FAIL（extractLinks 不接受 knownPages 参数，无 wikilink 解析）

- [ ] **Step 3: 修改 extractLinks 签名与实现**

在 `link-extractor.ts` 中修改：

```typescript
const MD_LINK = /\[([^\]]+)\]\(([^)]+)\)/g
const WIKI_LINK = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g

export function extractLinks(pageId: string, content: string, knownPages: string[]): GraphEdge[] {
  const edges: GraphEdge[] = []
  const pageDir = path.dirname(pageId)
  let match: RegExpExecArray | null

  // Markdown 链接（现有逻辑）
  while ((match = MD_LINK.exec(content)) !== null) {
    const href = match[2].trim()
    if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('#')) {
      continue
    }
    const withoutAnchor = href.split('#')[0]
    if (!withoutAnchor) continue

    const resolved = path.posix.normalize(path.posix.join(pageDir, withoutAnchor))
    if (!resolved.startsWith('wiki/')) continue

    edges.push({
      source: pageId,
      target: resolved,
      relation: '链接',
      sourceType: 'link',
    })
  }

  // Wikilink 解析
  while ((match = WIKI_LINK.exec(content)) !== null) {
    const target = match[1].trim()
    const resolved = resolveTarget(target, knownPages)
    if (resolved) {
      edges.push({
        source: pageId,
        target: resolved,
        relation: '链接',
        sourceType: 'link',
      })
    }
  }

  return edges
}
```

- [ ] **Step 4: 运行测试验证通过**

```bash
npx jest src/graph/link-extractor.test.ts
```

预期：PASS

- [ ] **Step 5: 提交**

```bash
git add src/graph/link-extractor.ts src/graph/link-extractor.test.ts
git commit -m "feat: support [[wikilink]] syntax in link extraction

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 4: graph-relevance 权重计算模块

**Files:**
- Create: `wiki-server/src/graph/graph-relevance.ts`
- Create: `wiki-server/src/graph/graph-relevance.test.ts`

- [ ] **Step 1: 写 computePageWeights 失败测试**

创建 `wiki-server/src/graph/graph-relevance.test.ts`：

```typescript
import { computePageWeights } from './graph-relevance'
import type { GraphEdge, WikiGraph } from './graph-store'
import type { WikiStore } from '../storage/wiki-store'

describe('computePageWeights', () => {
  const mockStore: WikiStore = {
    readPage: async (wikiId: string, pageId: string) => {
      const pages: Record<string, string> = {
        'wiki/a.md': '---\nsource_file: doc1.md\n---\n# Page A',
        'wiki/b.md': '---\nsource_file: doc1.md\n---\n# Page B',
        'wiki/c.md': '---\nsource_file: doc2.md\n---\n# Page C',
      }
      return pages[pageId] ?? '# Unknown'
    },
  } as WikiStore

  it('should compute weight for direct link (signal 1)', async () => {
    const edges: GraphEdge[] = [
      { source: 'wiki/a.md', target: 'wiki/b.md', relation: '链接', sourceType: 'link' },
    ]
    const graph: WikiGraph = {
      nodes: [{ id: 'wiki/a.md', title: 'A' }, { id: 'wiki/b.md', title: 'B' }],
      edges: [],
      updatedAt: '',
    }

    const result = await computePageWeights('test', 'wiki/a.md', edges, graph, mockStore)

    expect(result[0].weight).toBe(4.0) // signal1: 3.0, signal4: 1.0
  })

  it('should add bidirectional bonus (signal 1)', async () => {
    const edges: GraphEdge[] = [
      { source: 'wiki/a.md', target: 'wiki/b.md', relation: '链接', sourceType: 'link' },
    ]
    const graph: WikiGraph = {
      nodes: [{ id: 'wiki/a.md', title: 'A' }, { id: 'wiki/b.md', title: 'B' }],
      edges: [
        { source: 'wiki/b.md', target: 'wiki/a.md', relation: '链接', sourceType: 'link' },
      ],
      updatedAt: '',
    }

    const result = await computePageWeights('test', 'wiki/a.md', edges, graph, mockStore)

    expect(result[0].weight).toBe(7.0) // signal1: 3.0 + 3.0, signal4: 1.0
  })

  it('should compute shared source_file weight (signal 2)', async () => {
    const edges: GraphEdge[] = [
      { source: 'wiki/a.md', target: 'wiki/b.md', relation: '语义', sourceType: 'llm' },
    ]
    const graph: WikiGraph = {
      nodes: [{ id: 'wiki/a.md', title: 'A' }, { id: 'wiki/b.md', title: 'B' }],
      edges: [],
      updatedAt: '',
    }

    const result = await computePageWeights('test', 'wiki/a.md', edges, graph, mockStore)

    expect(result[0].weight).toBe(5.0) // signal2: 4.0, signal4: 1.0
  })

  it('should compute Adamic-Adar weight (signal 3)', async () => {
    const edges: GraphEdge[] = [
      { source: 'wiki/a.md', target: 'wiki/c.md', relation: '链接', sourceType: 'link' },
    ]
    const graph: WikiGraph = {
      nodes: [
        { id: 'wiki/a.md', title: 'A' },
        { id: 'wiki/b.md', title: 'B' },
        { id: 'wiki/c.md', title: 'C' },
      ],
      edges: [
        { source: 'wiki/a.md', target: 'wiki/b.md', relation: '链接', sourceType: 'link' },
        { source: 'wiki/c.md', target: 'wiki/b.md', relation: '链接', sourceType: 'link' },
      ],
      updatedAt: '',
    }

    const result = await computePageWeights('test', 'wiki/a.md', edges, graph, mockStore)

    // B 是公共邻居，degree(B) = 2，log(2) ≈ 0.693
    // signal3: 1.5 * (1 / 0.693) ≈ 2.16
    // signal1: 3.0, signal4: 1.0
    // total ≈ 6.16
    expect(result[0].weight).toBeGreaterThan(6.0)
    expect(result[0].weight).toBeLessThan(7.0)
  })
})
```

- [ ] **Step 2: 运行测试验证失败**

```bash
npx jest src/graph/graph-relevance.test.ts
```

预期：FAIL（模块不存在）

- [ ] **Step 3: 实现 computePageWeights 函数**

创建 `wiki-server/src/graph/graph-relevance.ts`：

```typescript
import type { GraphEdge, WikiGraph } from './graph-store'
import type { WikiStore } from '../storage/wiki-store'

function extractSourceFile(content: string): string[] {
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return []
  const frontmatter = match[1]
  const sourceFileMatch = frontmatter.match(/^source_file:\s*(.+)$/m)
  if (!sourceFileMatch) return []
  return sourceFileMatch[1].split(',').map(s => s.trim()).filter(Boolean)
}

function getDegree(nodeId: string, edges: GraphEdge[]): number {
  return edges.filter(e => e.source === nodeId || e.target === nodeId).length
}

function getNeighbors(nodeId: string, edges: GraphEdge[]): Set<string> {
  const neighbors = new Set<string>()
  for (const edge of edges) {
    if (edge.source === nodeId) neighbors.add(edge.target)
    if (edge.target === nodeId) neighbors.add(edge.source)
  }
  return neighbors
}

export async function computePageWeights(
  wikiId: string,
  pageId: string,
  edges: GraphEdge[],
  graph: WikiGraph,
  store: WikiStore,
): Promise<GraphEdge[]> {
  const result: GraphEdge[] = []

  for (const edge of edges) {
    let weight = 0

    // Signal 1: 直接链接
    if (edge.sourceType === 'link') {
      weight += 3.0
      // 检查反向边
      const hasBidirectional = graph.edges.some(
        e => e.source === edge.target && e.target === edge.source && e.sourceType === 'link'
      )
      if (hasBidirectional) {
        weight += 3.0
      }
    }

    // Signal 2: 共享原文件
    try {
      const [sourceContent, targetContent] = await Promise.all([
        store.readPage(wikiId, edge.source),
        store.readPage(wikiId, edge.target),
      ])
      const sourceSources = new Set(extractSourceFile(sourceContent))
      const targetSources = new Set(extractSourceFile(targetContent))
      const commonSources = [...sourceSources].filter(s => targetSources.has(s))
      weight += commonSources.length * 4.0
    } catch {
      // 页面不存在或读取失败，signal2 贡献 0
    }

    // Signal 3: Adamic-Adar
    const sourceNeighbors = getNeighbors(edge.source, graph.edges)
    const targetNeighbors = getNeighbors(edge.target, graph.edges)
    const commonNeighbors = [...sourceNeighbors].filter(n => targetNeighbors.has(n))
    let adamicAdar = 0
    for (const neighbor of commonNeighbors) {
      const degree = getDegree(neighbor, graph.edges)
      if (degree >= 2) {
        adamicAdar += 1 / Math.log(degree)
      }
    }
    weight += adamicAdar * 1.5

    // Signal 4: 类型亲和（固定）
    weight += 1.0

    result.push({ ...edge, weight })
  }

  return result
}
```

- [ ] **Step 4: 运行测试验证通过**

```bash
npx jest src/graph/graph-relevance.test.ts
```

预期：PASS

- [ ] **Step 5: 提交**

```bash
git add src/graph/graph-relevance.ts src/graph/graph-relevance.test.ts
git commit -m "feat: add 4-signal weight computation for graph edges

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 5: 集成到 graph-extraction-handler

**Files:**
- Modify: `wiki-server/src/queue/graph-extraction-handler.ts:1-40`

- [ ] **Step 1: 写集成测试**

扩展现有测试或创建新测试验证 edges 带 weight：

```typescript
// 此步骤依赖现有集成测试基础设施
// 如果没有现成测试，跳过此步骤，直接实现
```

- [ ] **Step 2: 修改 graph-extraction-handler**

在 `queue/graph-extraction-handler.ts` 中修改：

```typescript
import { GraphExtractionQueue } from './graph-extraction-queue'
import { GraphStore } from '../graph/graph-store'
import { getWikiStore } from '../storage/wiki-store'
import { extractLinks } from '../graph/link-extractor'
import { extractRelations } from '../graph/llm-extractor'
import { computePageWeights } from '../graph/graph-relevance'

const queue = new GraphExtractionQueue()
const store = new GraphStore()
const wikiStore = getWikiStore()

export async function runGraphExtractionWorker(): Promise<never> {
  console.log('[graph-worker] 启动，等待图谱提取任务...')

  while (true) {
    const task = await queue.dequeue(30)
    if (!task) continue

    console.log(`[graph-worker] 处理: ${task.wikiId}/${task.pageId}`)

    try {
      const knownPages = await wikiStore.listPages(task.wikiId)
      const currentGraph = await store.readGraph(task.wikiId)

      const [linkEdges, llmEdges] = await Promise.all([
        Promise.resolve(extractLinks(task.pageId, task.content, knownPages)),
        extractRelations(task.pageId, task.title, task.content, knownPages),
      ])

      const allEdges = [...linkEdges, ...llmEdges]
      const weightedEdges = await computePageWeights(
        task.wikiId,
        task.pageId,
        allEdges,
        currentGraph,
        wikiStore,
      )

      await store.updatePageInGraph(
        task.wikiId,
        task.pageId,
        task.title,
        weightedEdges,
      )

      console.log(`[graph-worker] 完成: ${task.pageId}，边数=${weightedEdges.length}`)
    } catch (err) {
      console.error(`[graph-worker] 失败: ${task.pageId}`, (err as Error).message)
    }
  }
}
```

- [ ] **Step 3: 运行 TypeScript 编译检查**

```bash
cd wiki-server
npx tsc --noEmit
```

预期：无编译错误

- [ ] **Step 4: 手动测试（导入文档触发权重计算）**

启动 worker，通过 ingest 上传文档，检查 `graph.json` 中 edges 是否包含 weight 字段：

```bash
# 启动 worker（后台或另一终端）
npm run worker

# 上传测试文档（通过前端或 API）
# 检查 data/<wikiId>/graph.json
cat data/test/graph.json | jq '.edges[0]'
```

预期输出示例：
```json
{
  "source": "wiki/a.md",
  "target": "wiki/b.md",
  "relation": "链接",
  "sourceType": "link",
  "weight": 4.0
}
```

- [ ] **Step 5: 提交**

```bash
git add src/queue/graph-extraction-handler.ts
git commit -m "feat: integrate weight computation into graph extraction

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Self-Review Checklist

**Spec 覆盖验证：**

- [x] 第 1 节：数据结构变更（GraphEdge.weight） → Task 1
- [x] 第 2 节：[[wikilink]] 解析 → Task 2 (resolveTarget), Task 3 (wikilink 正则)
- [x] 第 3 节：4 信号权重计算 → Task 4 (graph-relevance)
- [x] 第 4 节：集成到 handler → Task 5
- [x] 第 6 节：边界条件（null 处理、missing frontmatter、degree 检查） → Task 2/4 实现中覆盖

**占位符扫描：**

- [x] 无 TBD/TODO
- [x] 所有代码块完整，无"add validation"类泛指
- [x] 测试用例具体，有预期输出

**类型一致性：**

- [x] `resolveTarget` 返回 `string | null` 在 Task 2/3 中一致
- [x] `computePageWeights` 签名在 Task 4/5 中一致
- [x] `extractLinks` 新增 `knownPages` 参数在 Task 3/5 中一致

无遗漏需求，无占位符，类型签名一致。
