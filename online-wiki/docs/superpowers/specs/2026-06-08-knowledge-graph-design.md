# 知识图谱功能设计

**目标：** 为 online-wiki 每个 wiki 构建知识图谱（节点 + 边），存储为 MinIO 中的 `graph.json`，关系来源同时支持 LLM 提取和 Markdown 链接解析。

---

## 数据结构

每个 wiki 在 MinIO 存储一个 `graph.json`，路径为 `wikis/{wikiId}/graph.json`：

```json
{
  "nodes": [
    {
      "id": "wiki/Hello.md",
      "title": "Hello World"
    }
  ],
  "edges": [
    {
      "source": "wiki/Hello.md",
      "target": "wiki/Deploy.md",
      "relation": "提到",
      "sourceType": "llm"
    },
    {
      "source": "wiki/Hello.md",
      "target": "wiki/Intro.md",
      "relation": "链接",
      "sourceType": "link"
    }
  ],
  "updatedAt": "2026-06-08T12:00:00Z"
}
```

- `node.id` 与 Qdrant/MinIO 的 `pageId` 保持一致
- `edge.sourceType`：`"llm"` 为 LLM 提取，`"link"` 为 Markdown 链接解析
- `edge.relation`：link 类型固定为 `"链接"`，llm 类型为语义描述（如 `"介绍了"`、`"依赖"`）

---

## 架构

### 新增文件

| 文件 | 职责 |
|------|------|
| `src/graph/graph-store.ts` | 读写 MinIO `graph.json`，Redis 分布式锁保护并发写 |
| `src/graph/link-extractor.ts` | 解析 Markdown `[text](./Page.md)` 格式链接，返回 edges |
| `src/graph/llm-extractor.ts` | 调用 DeepSeek 提取实体关系，返回 edges |
| `src/queue/graph-extraction-handler.ts` | graph-extraction job 的 worker handler |
| `src/routes/graph.ts` | `GET /api/wiki/:wikiId/graph` 端点 |

### 修改文件

| 文件 | 变更 |
|------|------|
| `src/queue/ingest-handler.ts` | 向量写入完成后 enqueue graph-extraction job |
| `src/queue/worker.ts` | 注册 graph-extraction handler |
| `src/app.ts` 或路由入口 | 挂载 graph 路由 |

---

## 数据流

```
Ingest job 完成向量写入
        ↓
enqueue graph-extraction job
  { wikiId, pageId, title, content }
        ↓
Worker 拿到 job
        ↓
  并行执行两路提取
    link-extractor: 解析 [text](./Page.md) → edges (sourceType=link)
    llm-extractor:  DeepSeek prompt → edges (sourceType=llm)
        ↓
  获取 Redis 锁 graph:lock:{wikiId}
        ↓
  读取 MinIO graph.json（不存在则初始化空结构）
        ↓
  合并：
    upsert 本页面的 node（id/title）
    删除 source === pageId 的旧 edges
    写入新 edges
        ↓
  写回 MinIO graph.json（含更新的 updatedAt）
        ↓
  释放锁
```

---

## API

```
GET /api/wiki/:wikiId/graph
Authorization: Bearer <JWT>
```

响应：直接返回 `graph.json` 内容（200），wiki 不存在返回 404，graph 尚未生成返回空结构 `{"nodes":[],"edges":[]}`。

---

## LLM 提取 Prompt

```
你是知识图谱提取助手。从以下页面内容中提取与其他主题/文档的关系。
只提取明确提到的关系，不要过度推断。
返回 JSON 数组格式：[{"target":"目标主题","relation":"关系描述"}]
如果没有明确关系，返回空数组 []。

页面标题：{title}
页面内容：{content 前 1000 字}
```

LLM 返回的 `target` 为语义描述（不一定是精确 pageId），存入 edge 时 `target` 字段直接使用返回值。后续可通过标题匹配关联到实际 node。

---

## 错误处理

- LLM 提取失败（超时/非 JSON）：跳过 llm edges，仍写入 link edges，job 标记 done（不 error）
- Redis 锁超时（默认 10s）：抛出异常，job 重试
- MinIO 写入失败：job 标记 error，BullMQ 自动重试

---

## 安全考量

- graph 读取受 JWT 鉴权保护，与其他 wiki API 一致
- LLM prompt 中只传入页面内容前 1000 字，避免超长内容注入
