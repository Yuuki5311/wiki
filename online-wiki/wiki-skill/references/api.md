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
