# 设计文档：llm_wiki 线上知识库 OpenClaw 接入方案

**日期：** 2026-06-06
**背景：** 在 llm_wiki 线上化（6篇文档系列）的基础上，将 wiki 知识库暴露为 OpenClaw 可用的 MCP Server + Skill，支持公司多台设备上的 OpenClaw 实例同时查询同一个知识库。

---

## 一、背景与目标

### 已有基础

llm_wiki 线上化系列（online-01 ~ online-06）已完成：

| 组件 | 作用 |
|------|------|
| Express 服务 | HTTP API + WebSocket |
| S3/MinIO | Wiki Markdown 文件存储 |
| Qdrant | 向量数据库，支持语义搜索 |
| Redis | 分布式锁 + 任务队列 |
| JWT 认证 | 用户身份验证 |

### 新增目标

在上述基础上，新增两个组件：
1. **MCP Server**：在 Express 服务上新增 `/mcp` 端点，暴露 wiki 查询工具
2. **Skill 文件**：一个 `wiki-skill/SKILL.md`，教 OpenClaw 何时、如何使用这些工具

### 使用场景

公司内多台设备各自运行 OpenClaw 实例，安装同一个 `wiki-skill`，通过公网访问同一个 wiki 服务，实现知识共享。

---

## 二、整体架构

```
Ubuntu 服务器（124.71.66.20）2核 2GiB Ubuntu 24.04
┌─────────────────────────────────────────────────────────┐
│  wiki-server（已有）                                      │
│  ├── POST /api/wiki/:id/ingest    文档摄入               │
│  ├── GET  /api/wiki/:id/search    全文搜索               │
│  ├── GET  /api/wiki/:id/pages/*   读取页面               │
│  └── WS   /ws/chat               流式问答               │
│                                                         │
│  +新增 MCP Server                                        │
│  └── POST /mcp                   标准 MCP 端点           │
│       ├── tool: search_wiki      语义搜索（查 Qdrant）   │
│       ├── tool: get_page         读取页面（查 S3）        │
│       └── tool: list_pages       列出目录（查 S3）        │
└─────────────────────────────────────────────────────────┘
         ↑ HTTPS + X-API-Key
┌────────┴──────────────────────────────────┐
│  公司多台设备（各自运行 OpenClaw）           │
│  设备 A：OpenClaw + wiki-skill             │
│  设备 B：OpenClaw + wiki-skill             │
│  设备 C：OpenClaw + wiki-skill             │
└───────────────────────────────────────────┘
```

### 新增 vs 已有

```
已有（online-01 ~ 06）       新增（本文档）
──────────────────────       ──────────────────────────
Express 服务骨架              /mcp 端点（MCP Server）
S3 存储层                     3 个 wiki 查询工具
Qdrant 向量库                 wiki-skill/SKILL.md
Redis 队列/锁                 Nginx HTTPS 配置
WebSocket 聊天                API Key 认证中间件
JWT 用户认证
```

新增部分**完全复用**已有基础设施，不引入新的存储或服务依赖。

---

## 三、认证方案

### 选型：HTTP + API Key

当前只有 IP（124.71.66.20），无域名，无法申请 Let's Encrypt 证书，暂时使用 HTTP 明文传输。API Key 仍然有效，防止未授权访问。如后续绑定域名，可升级为 HTTPS。

- **HTTP**：Nginx 反向代理，无 TLS
- **API Key**：请求头 `X-API-Key`，每台 OpenClaw 设备配置同一个 key（公司内部共享）

```
OpenClaw → POST http://124.71.66.20/mcp
           Header: X-API-Key: wk_xxxxxxxxxxxxxxxx
```

### 为什么不用 JWT

JWT 是面向**用户**的认证（区分不同用户身份）。OpenClaw 是公司内部工具，所有实例访问同一个知识库，不需要区分身份，API Key 够用且简单。

### API Key 管理

```bash
# .env
WIKI_MCP_API_KEY=wk_xxxxxxxxxxxxxxxx   # 随机生成，32+ 位
```

认证中间件（复用已有模式，新增 mcp 路由前注册）：

```typescript
// src/middleware/api-key.ts
export function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const key = req.headers['x-api-key']
  if (key !== process.env.WIKI_MCP_API_KEY) {
    return res.status(401).json({ error: 'Invalid API key' })
  }
  next()
}
```

---

## 四、MCP Server 设计

### 端点

```
POST /mcp
Content-Type: application/json
X-API-Key: <key>
```

遵循 MCP 标准协议，请求体格式：

```json
{
  "tool": "search_wiki",
  "parameters": { ... }
}
```

### 工具定义

#### search_wiki（核心工具）

语义搜索，查询 Qdrant 向量库，返回最相关的页面摘要。

```typescript
// 输入
{
  query: string      // 搜索问题，自然语言
  wiki_id: string    // 知识库 ID
  top_k?: number     // 返回条数，默认 5
}

// 输出
{
  results: [
    {
      path: string     // 页面路径，如 "wiki/concepts/量子纠缠.md"
      title: string    // 页面标题
      excerpt: string  // 相关片段（200字以内）
      score: number    // 相关性分数 0~1
    }
  ]
}
```

#### get_page

按路径读取完整页面内容，从 S3 获取。

```typescript
// 输入
{
  wiki_id: string
  path: string       // 如 "wiki/concepts/量子纠缠.md"
}

// 输出
{
  path: string
  content: string    // 完整 Markdown 内容
}
```

#### list_pages

列出知识库所有页面路径，从 S3 列举对象。

```typescript
// 输入
{
  wiki_id: string
}

// 输出
{
  pages: [
    {
      path: string   // 页面路径
      title: string  // 从 frontmatter 或首行 # 提取
    }
  ]
}
```

### 路由注册（在 src/index.ts 中新增）

```typescript
import { mcpRouter } from './routes/mcp'
import { requireApiKey } from './middleware/api-key'

// MCP 路由，API Key 保护
app.use('/mcp', requireApiKey, mcpRouter)
```

### 文件结构（新增部分）

```
wiki-server/src/
├── middleware/
│   └── api-key.ts          ← 新增：API Key 认证中间件
└── routes/
    └── mcp.ts              ← 新增：MCP Server 路由
```

---

## 五、Skill 文件设计

Skill 文件部署在**每台 OpenClaw 设备**上，告诉 agent 何时调用 wiki 工具以及如何组织回答。

### 文件结构

```
wiki-skill/
├── SKILL.md              ← 主指令文件
└── references/
    └── api.md            ← MCP 工具参数速查
```

### SKILL.md

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

### references/api.md

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

### OpenClaw 设备端配置

每台设备在 OpenClaw 配置中添加：

```env
WIKI_API_KEY=wk_xxxxxxxxxxxxxxxx
WIKI_ID=wiki-001
```

---

## 六、Ubuntu 部署准备

在启动服务前，需要完成以下 Ubuntu 环境配置。

### 防火墙

Ubuntu 默认启用 ufw，需要开放 80 和 443 端口：

```bash
sudo ufw allow 80
sudo ufw allow 443
sudo ufw status   # 确认规则已生效
```

### Node.js

Ubuntu apt 源的 Node.js 版本过旧，使用 NodeSource 安装：

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### 进程管理

Express 服务需要保活，SSH 断开后不能退出。使用 PM2：

```bash
npm install -g pm2
pm2 start dist/index.js --name wiki-server
pm2 save        # 保存进程列表
pm2 startup     # 生成开机自启命令（按提示执行输出的 sudo 命令）
```

---

## 七、Nginx 配置

当前无域名，只做 HTTP 反代。Nginx 监听 80 端口，转发到本地 Express 服务：

```nginx
server {
    listen 80;
    server_name 124.71.66.20;

    # WebSocket 支持（/ws/chat 已有）
    # 注意：/ws 必须在 / 之前，否则被普通反代拦截
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

如后续绑定域名，可补充申请 Let's Encrypt 证书，将 HTTP 升级为 HTTPS。

---

## 八、数据流说明

OpenClaw 查询 wiki 的完整链路：

```
用户在设备上问："量子纠缠是什么？"
        ↓
OpenClaw 加载 wiki-skill，识别这是知识库问题
        ↓
调用 search_wiki { query: "量子纠缠", wiki_id: "wiki-001" }
        ↓
POST http://124.71.66.20/mcp  (HTTP + API Key)
        ↓
Express /mcp 路由 → 查询 Qdrant 向量库
        ↓
返回 [ { path: "wiki/concepts/量子纠缠.md", score: 0.92, excerpt: "..." } ]
        ↓
调用 get_page { wiki_id: "wiki-001", path: "wiki/concepts/量子纠缠.md" }
        ↓
Express /mcp 路由 → 从 S3 读取页面内容
        ↓
OpenClaw 基于页面内容组织回答，注明来源
        ↓
用户收到回答："根据 wiki/concepts/量子纠缠.md，量子纠缠是..."
```

---

## 九、实现检查清单

### 服务端（wiki-server）

- [ ] 新增 `src/middleware/api-key.ts`
- [ ] 新增 `src/routes/mcp.ts`，实现三个工具的处理逻辑
- [ ] 在 `src/index.ts` 注册 `/mcp` 路由，挂载 API Key 中间件
- [ ] `.env` 新增 `WIKI_MCP_API_KEY`
- [ ] Ubuntu 环境：开放防火墙端口（80）
- [ ] Ubuntu 环境：用 NodeSource 安装 Node.js 20
- [ ] Ubuntu 环境：用 PM2 管理进程，配置开机自启
- [ ] Nginx 配置 HTTP 反代，`/ws` location 在 `/` 之前

### 客户端（每台 OpenClaw 设备）

- [ ] 创建 `wiki-skill/` 目录，写入 `SKILL.md` 和 `references/api.md`
- [ ] 在 OpenClaw 配置中添加 `WIKI_API_KEY` 和 `WIKI_ID`
- [ ] 在 OpenClaw 中安装/注册 `wiki-skill`

---

## 十、扩展方向（不在本期范围）

- **写入工具**：新增 `create_page`、`update_page` 工具，让 OpenClaw 也能向知识库写入内容
- **多知识库**：`wiki_id` 参数已预留，天然支持托管多个 wiki
- **细粒度权限**：为不同 OpenClaw 实例发放不同 API Key，限制可访问的 wiki_id
- **标准 MCP 协议**：当前 `/mcp` 端点是自定义协议（`tool` + `parameters` 字段），非标准 MCP（标准走 stdio 或 SSE）。如需接入其他支持标准 MCP 的客户端，需要额外适配层
