# Wiki Web 界面设计文档

## 背景

online-wiki 目前只有 MCP 接口，没有可视化 Web 界面。本文档描述为其新增一个面向公司内部员工的 Web 前端，支持查看知识图谱、浏览和编辑页面、导入文档。

## 目标

- 非技术用户可以通过浏览器直接查阅公司 wiki
- 知识图谱可视化，既作导航工具也展示概念关系
- 支持页面编辑和文档导入（次要功能）
- 无需登录，公开访问

## 架构

```
online-wiki/
├── wiki-server/        # 已有，Express API（去掉 JWT 认证）
└── wiki-web/           # 新建，Vite + React 前端
```

**部署：**
- `http://124.71.66.20` → nginx 托管 wiki-web 静态文件
- `http://124.71.66.20:3000` → wiki-server API
- `wiki_id` 固定为 `company`，写死在前端 `src/config.ts`

**技术栈：**
- React + Vite + TypeScript
- Tailwind CSS（样式）
- Zustand（状态管理）
- sigma + graphology（图谱可视化，复用自 llm_wiki）
- Milkdown（Markdown 编辑器，复用自 llm_wiki）

## 页面结构

顶部导航栏固定，三个视图通过导航切换：

```
┌─────────────────────────────────┐
│  Wiki  [图谱] [页面] [导入]      │
├─────────────────────────────────┤
│                                 │
│         主内容区                 │
│                                 │
└─────────────────────────────────┘
```

### 图谱视图（默认首页）
- 全屏知识图谱，节点代表 wiki 页面，边代表关系
- 节点可点击，跳转到对应页面详情
- 边显示关系标签（relation 字段）
- 节点支持拖拽调整布局（纯前端，不写回服务器）
- 支持手动添加/删除边（写回服务器）

### 页面列表视图
- 展示所有 wiki 页面，显示标题
- 顶部搜索框，调用 `/api/wiki/:wikiId/search` 做语义搜索
- 点击页面进入详情视图

### 页面详情视图
- 默认阅读模式，渲染 Markdown 内容
- 右上角「编辑」按钮切换到编辑模式（Milkdown 编辑器）
- 编辑模式有「保存」和「取消」按钮
- 顶部面包屑导航返回列表

### 导入文档
- 顶部导航「导入」按钮打开对话框
- 填写文件名和文档内容，提交后显示进度
- 轮询 `get_job_status`（每 5 秒一次，最多 2 分钟）
- 完成后提示写入了哪些页面

## 数据层

### Store 设计

**graphStore**
- 从 `GET /api/wiki/:wikiId/graph` 拉取图谱
- `addEdge(source, target, relation)` / `removeEdge(source, target)` 后调用 `PUT /api/wiki/:wikiId/graph` 写回

**pageStore**
- `listPages()` → `GET /api/wiki/:wikiId/pages`
- `readPage(pageId)` → `GET /api/wiki/:wikiId/pages/:pageId`
- `savePage(pageId, content)` → `PUT /api/wiki/:wikiId/pages/:pageId`

**ingestStore**
- `submit(fileName, content)` → `POST /api/wiki/:wikiId/ingest`（不走 MCP，避免 API Key 暴露在浏览器）
- `pollStatus(jobId)` → `GET /api/wiki/:wikiId/jobs/:jobId`，每 5 秒轮询

## 后端改动

### 1. 去掉 JWT 认证
`src/index.ts` 中 `/api/wiki` 路由移除 `requireAuth` 中间件，改为公开访问。

### 2. 新增图谱写入端点
`src/routes/graph.ts` 新增：
```
PUT /api/wiki/:wikiId/graph
Body: { nodes: GraphNode[], edges: GraphEdge[] }
```
调用 `GraphStore` 的新方法 `writeFullGraph(wikiId, graph)` 覆盖写入。

### 3. nginx 配置
云服务器新增 nginx，80 端口 serve wiki-web 静态文件，3000 端口保持 wiki-server。

## 文件结构

```
wiki-web/
├── src/
│   ├── config.ts              # WIKI_ID、API_BASE 常量
│   ├── api/
│   │   ├── wiki-api.ts        # 页面 CRUD
│   │   └── graph-api.ts       # 图谱读写
│   ├── stores/
│   │   ├── graph-store.ts
│   │   ├── page-store.ts
│   │   └── ingest-store.ts
│   ├── components/
│   │   ├── layout/
│   │   │   └── nav-bar.tsx
│   │   ├── graph/
│   │   │   └── graph-view.tsx  # 复用 llm_wiki 图谱组件
│   │   ├── pages/
│   │   │   ├── page-list.tsx
│   │   │   └── page-detail.tsx
│   │   └── ingest/
│   │       └── ingest-dialog.tsx
│   ├── App.tsx
│   └── main.tsx
├── package.json
├── vite.config.ts
└── index.html
```

## 部署方式

1. `npm run build` 生成 `dist/`
2. 上传到云服务器 `/root/wiki-web/dist/`
3. nginx 配置 80 端口 serve `dist/`
4. docker-compose 加入 nginx 服务
