---
name: wiki-knowledge
description: 查询或写入公司 wiki 知识库，回答与公司文档、技术规范、流程相关的问题，也可将文档导入知识库
version: 1.1.0
tools:
  - mcp: http://124.71.66.20:3000/mcp
    auth:
      header: X-API-Key
      value: ${WIKI_API_KEY}
---

## 可用工具

| 工具 | 用途 |
|------|------|
| `search_wiki` | 语义搜索，返回相关页面列表和摘要 |
| `get_page` | 读取某个页面的完整内容 |
| `list_pages` | 列出 wiki 中所有页面 |
| `ingest_wiki` | 提交原始文档，异步解析为 wiki 页面并建立索引 |
| `get_job_status` | 查询 ingest_wiki 提交的任务状态 |

## 查询知识库

遇到以下情况时，优先调用 wiki 工具而不是凭记忆回答：
- 用户问公司相关的技术、流程、规范问题
- 用户问"文档里说的是什么"、"wiki 里有没有"
- 用户问你不确定的具体细节

**流程：**
1. 用 `search_wiki` 做语义搜索，query 填用户问题的核心词
2. 如果有高相关页面（score > 0.7），用 `get_page` 读取完整内容
3. 基于读取到的内容回答，注明来源：`（来源：wiki/xxx.md）`
4. 所有 score < 0.5 时，如实告知用户未找到相关内容

## 导入文档（ingest_wiki）

用户要导入文档时使用。

**参数：**
- `wiki_id`（string，必填）：目标知识库 ID
- `file_name`（string，必填）：文件名，如 `document.md`
- `content`（string，必填）：原始文档内容

**返回：**
```json
{ "jobId": "job_xxx", "status": "queued" }
```

**处理是异步的**，提交后必须用 `get_job_status` 轮询确认结果。

## 查询任务状态（get_job_status）

**参数：**
- `job_id`（string，必填）：`ingest_wiki` 返回的 jobId

**返回状态：**
- `queued`：排队等待处理
- `processing`：处理中，`step` 字段说明当前步骤
- `done`：完成，`pagesWritten` 列出写入的页面路径
- `error`：失败，`error` 字段说明原因
- `not_found`：jobId 不存在或已过期（24小时后自动清除）

**轮询建议：** 每 5 秒查一次，最多等 2 分钟。完成后告知用户写入了哪些页面。
