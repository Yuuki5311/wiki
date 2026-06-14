# 实施文档：llm_wiki OpenClaw 接入（MCP Server + Skill）

**对应设计文档：** `online-wiki/2026-06-06-openclaw-wiki-skill-design.md`  
**前置系列：** `llm_wiki/docs/online-01` 到 `online-06`（Express + S3 + Qdrant + Redis + WebSocket + JWT 均已完成）  
**目标：** 在已有 wiki-server 基础上，新增 `/mcp` 端点（3 个工具）和 `wiki-skill` 目录。

---

## 已有项目结构（online-01~06 产出）

```
wiki-server/
├── src/
│   ├── index.ts                  Express 入口，注册路由
│   ├── middleware/
│   │   └── auth.ts               JWT 认证中间件（已有）
│   ├── routes/
│   │   ├── wiki.ts               /api/wiki/:id/* 路由（已有）
│   │   └── chat.ts               WebSocket /ws/chat（已有）
│   ├── storage/
│   │   ├── wiki-store.ts         S3 存取（已有）
│   │   └── vector-store.ts       Qdrant 向量搜索（已有）
│   └── services/
│       ├── ingest-service.ts     摄入流程（已有）
│       └── embedding-service.ts  embedding + chunk（已有）
├── .env
└── package.json
```

online-06 结束后服务已能：摄入文档到 S3、向量化写 Qdrant、WebSocket 流式问答、JWT 用户认证。

---

## 本期新增内容

新增两部分，**不修改已有代码**，只增文件和路由注册：

```
wiki-server/src/
├── middleware/
│   └── api-key.ts          ← 新增
└── routes/
    └── mcp.ts              ← 新增

wiki-skill/                 ← 新增（OpenClaw 设备端）
├── SKILL.md
└── references/
    └── api.md
```

`.env` 新增一个变量：`WIKI_MCP_API_KEY`

---

## 第一步：API Key 中间件

文件：`src/middleware/api-key.ts`

```typescript
import type { Request, Response, NextFunction } from 'express'

export function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const key = req.headers['x-api-key']
  if (!key || key !== process.env.WIKI_MCP_API_KEY) {
    res.status(401).json({ error: 'Invalid API key' })
    return
  }
  next()
}
```

---

## 第二步：MCP 路由

文件：`src/routes/mcp.ts`

协议约定：`POST /mcp`，body `{ tool, parameters }`，返回 `{ result }` 或 `{ error }`。

```typescript
import { Router } from 'express'
import { S3WikiStore } from '../storage/wiki-store'
import { VectorStore } from '../storage/vector-store'
import { fetchEmbedding } from '../services/embedding-service'

export const mcpRouter = Router()

const store = new S3WikiStore()
const vectorStore = new VectorStore()

mcpRouter.post('/', async (req, res) => {
  const { tool, parameters } = req.body as { tool: string; parameters: Record<string, unknown> }

  try {
    switch (tool) {
      case 'search_wiki': {
        const { query, wiki_id, top_k = 5 } = parameters as {
          query: string
          wiki_id: string
          top_k?: number
        }
        const apiKey = process.env.OPENAI_API_KEY
        if (!apiKey) {
          res.status(500).json({ error: 'OPENAI_API_KEY not configured' })
          return
        }
        const queryEmbedding = await fetchEmbedding(query, {
          apiKey,
          model: 'text-embedding-3-small',
        })
        const raw = await vectorStore.search(wiki_id, queryEmbedding, top_k)

        // 合并同页面的结果，取最高分，用第一个 chunk 作 excerpt
        const pageMap = new Map<string, { path: string; excerpt: string; score: number }>()
        for (const r of raw) {
          const existing = pageMap.get(r.pageId)
          if (!existing || r.score > existing.score) {
            pageMap.set(r.pageId, {
              path: r.pageId,
              excerpt: r.chunkText.slice(0, 200),
              score: r.score,
            })
          }
        }

        // 读取页面标题（首行 # 标题）
        const results = await Promise.all(
          Array.from(pageMap.values()).map(async (item) => {
            let title = item.path
            try {
              const content = await store.readPage(wiki_id, item.path)
              const firstLine = content.split('\n').find(l => l.startsWith('# '))
              if (firstLine) title = firstLine.replace(/^#\s*/, '')
            } catch {
              // 读不到就用路径
            }
            return { ...item, title }
          })
        )

        res.json({ result: { results } })
        break
      }

      case 'get_page': {
        const { wiki_id, path } = parameters as { wiki_id: string; path: string }
        const content = await store.readPage(wiki_id, path)
        res.json({ result: { path, content } })
        break
      }

      case 'list_pages': {
        const { wiki_id } = parameters as { wiki_id: string }
        const paths = await store.listPages(wiki_id)

        const pages = await Promise.all(
          paths.map(async (path) => {
            let title = path
            try {
              const content = await store.readPage(wiki_id, path)
              const firstLine = content.split('\n').find(l => l.startsWith('# '))
              if (firstLine) title = firstLine.replace(/^#\s*/, '')
            } catch {
              // 读不到就用路径
            }
            return { path, title }
          })
        )

        res.json({ result: { pages } })
        break
      }

      default:
        res.status(400).json({ error: `Unknown tool: ${tool}` })
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: message })
  }
})
```

**注意**：`store.listPages(wikiId)` 需要在 `S3WikiStore` 里确认是否已有此方法。如果没有，需新增：

```typescript
// src/storage/wiki-store.ts 新增方法
async listPages(wikiId: string): Promise<string[]> {
  // 列举 S3 bucket 下 wiki_id/wiki/ 前缀的所有对象
  const prefix = `${wikiId}/wiki/`
  // 具体实现取决于 online-03 里 S3WikiStore 的写法，
  // 用 ListObjectsV2Command，过滤出 .md 文件路径
}
```

---

## 第三步：注册路由

在 `src/index.ts` 找到路由注册区域，加两行：

```typescript
import { mcpRouter } from './routes/mcp'
import { requireApiKey } from './middleware/api-key'

// 已有路由...
app.use('/api/wiki', authMiddleware, wikiRouter)

// 新增
app.use('/mcp', requireApiKey, mcpRouter)
```

---

## 第四步：环境变量

`.env` 新增：

```
WIKI_MCP_API_KEY=wk_xxxxxxxxxxxxxxxx   # 用 openssl rand -hex 16 生成
```

---

## 第五步：Ubuntu 环境准备

以下三步是首次部署到 Ubuntu 服务器（124.71.66.20）前必须完成的：

```bash
# 1. 开放防火墙端口
sudo ufw allow 80
sudo ufw status

# 2. 安装 Node.js 20（apt 源版本过旧）
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 3. 安装 PM2 并配置开机自启
npm install -g pm2
pm2 start dist/index.js --name wiki-server
pm2 save
pm2 startup   # 按照输出提示执行 sudo 命令
```

---

## 第六步：Nginx 配置

当前只有 IP，无域名，HTTP 明文（无 TLS）。配置文件路径通常是 `/etc/nginx/sites-available/wiki`：

```nginx
server {
    listen 80;
    server_name 124.71.66.20;

    # /ws 必须在 / 之前，否则 WebSocket 升级头被普通反代拦截
    location /ws {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/wiki /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 第七步：wiki-skill 文件（OpenClaw 设备端）

在每台安装了 OpenClaw 的设备上创建：

```
wiki-skill/
├── SKILL.md
└── references/
    └── api.md
```

**`wiki-skill/SKILL.md`**：

```markdown
---
name: wiki-knowledge
description: 查询公司 wiki 知识库，回答与公司文档、技术规范、流程相关的问题
version: 1.0.0
tools:
  - mcp: http://124.71.66.20/mcp
    auth:
      header: X-API-Key
      value: ${WIKI_API_KEY}
---

## 何时使用本 skill

遇到以下情况时，优先调用 wiki 工具而不是凭记忆回答：
- 用户问公司相关的技术、流程、规范问题
- 用户问"文档里说的是什么"、"wiki 里有没有"
- 用户问你不确定的具体细节

## 工作流程

1. 用 `search_wiki` 做语义搜索，query 填用户问题的核心词
2. 如果搜索结果中有高相关页面（score > 0.7），用 `get_page` 读取完整内容
3. 基于读取到的内容回答，注明来源页面路径
4. 如果搜索没有找到相关内容（所有 score < 0.5），如实告知用户

## 回答格式

- 引用内容时注明来源：`（来源：wiki/concepts/xxx.md）`
- 不要捏造 wiki 中没有的内容
- 如果多个页面都相关，综合引用并分别注明来源
```

**`wiki-skill/references/api.md`**：

```markdown
# MCP 工具参数速查

## search_wiki
- query: 搜索词（自然语言，必填）
- wiki_id: 知识库 ID（必填，见 .env WIKI_ID）
- top_k: 返回条数（选填，默认 5）

## get_page
- wiki_id: 知识库 ID（必填）
- path: 页面路径（必填，从 search_wiki 结果的 path 字段获取）

## list_pages
- wiki_id: 知识库 ID（必填）
```

每台 OpenClaw 设备的 `.env` 中配置：

```
WIKI_API_KEY=wk_xxxxxxxxxxxxxxxx
WIKI_ID=wiki-001
```

---

## 实施顺序与检查清单

### 服务端

- [ ] `src/middleware/api-key.ts` — 新建
- [ ] `src/routes/mcp.ts` — 新建
- [ ] `src/storage/wiki-store.ts` — 确认 `listPages()` 是否存在，不存在则新增
- [ ] `src/index.ts` — 注册 `/mcp` 路由 + `requireApiKey` 中间件
- [ ] `.env` — 新增 `WIKI_MCP_API_KEY`
- [ ] Ubuntu：开放 80 端口
- [ ] Ubuntu：安装 Node.js 20
- [ ] Ubuntu：PM2 保活 + 开机自启
- [ ] Nginx：HTTP 反代配置，`/ws` 在 `/` 之前

### 客户端（每台 OpenClaw 设备）

- [ ] 创建 `wiki-skill/SKILL.md` 和 `wiki-skill/references/api.md`
- [ ] 设备 `.env` 配置 `WIKI_API_KEY` 和 `WIKI_ID`
- [ ] OpenClaw 注册/安装 `wiki-skill`

---

## 关键约束与注意事项

**`listPages` 实现**：online-03（S3 存储层）里如果没有列举方法，需要用 AWS SDK 的 `ListObjectsV2Command`，前缀为 `${wikiId}/wiki/`，过滤 `.md` 后缀。

**MCP 协议**：当前实现是自定义协议（`{ tool, parameters }` 字段），不是标准 MCP（标准走 stdio 或 SSE）。只适配 OpenClaw，若需对接其他 MCP 客户端需额外适配。

**认证分层**：`/mcp` 用 API Key（机器间），`/api/wiki` 用 JWT（用户），两者互不干扰。

**向量搜索依赖 OPENAI_API_KEY**：`search_wiki` 工具调用 OpenAI embedding API 生成查询向量，服务端必须配置此变量。

**HTTP 而非 HTTPS**：当前 IP 直连无法申请证书，API Key 在明文 HTTP 中传输。公司内网可接受，如未来绑定域名则补充 Let's Encrypt 升级为 HTTPS。
