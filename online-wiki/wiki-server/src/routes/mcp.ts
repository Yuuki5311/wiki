import { Router } from 'express'
import { getWikiStore } from '../storage/wiki-store'
import { VectorStore } from '../storage/vector-store'
import { fetchEmbedding } from '../services/embedding-service'
import { IngestQueue } from '../queue/ingest-queue'
import { GraphStore } from '../graph/graph-store'
import { SearchService } from '../services/search-service'

export const mcpRouter = Router()

const store = getWikiStore()
const vectorStore = new VectorStore()
const ingestQueue = new IngestQueue()
const graphStore = new GraphStore()
const searchService = new SearchService()

const TOOLS = [
  {
    name: 'search_wiki',
    description: '在 wiki 知识库中语义搜索相关页面',
    inputSchema: {
      type: 'object',
      properties: {
        wiki_id: { type: 'string', description: 'Wiki ID' },
        query: { type: 'string', description: '搜索关键词' },
        top_k: { type: 'number', description: '返回结果数量，默认 5' },
      },
      required: ['wiki_id', 'query'],
    },
  },
  {
    name: 'get_page',
    description: '获取 wiki 某个页面的完整内容',
    inputSchema: {
      type: 'object',
      properties: {
        wiki_id: { type: 'string', description: 'Wiki ID' },
        path: { type: 'string', description: '页面路径，如 wiki/页面名.md' },
      },
      required: ['wiki_id', 'path'],
    },
  },
  {
    name: 'list_pages',
    description: '列出 wiki 中所有页面',
    inputSchema: {
      type: 'object',
      properties: {
        wiki_id: { type: 'string', description: 'Wiki ID' },
      },
      required: ['wiki_id'],
    },
  },
  {
    name: 'ingest_wiki',
    description: `向 wiki 知识库传入原始文档，自动解析为 wiki 页面并建立向量索引和知识图谱。

【重要】content 必须以 YAML frontmatter 开头，记录原始数据来源，格式如下：

---
source: feishu
doc_id: 飞书文档节点ID
doc_url: 飞书文档完整URL
ingested_at: YYYY-MM-DD
---

正文内容...

若文档来自飞书，source 填 feishu，doc_id 填飞书节点 ID，doc_url 填完整链接。
若来自本地文件，source 填 local，doc_url 填文件路径。
这段 frontmatter 会被保留在生成的页面中，用于后续溯源查询原始数据。`,
    inputSchema: {
      type: 'object',
      properties: {
        wiki_id: { type: 'string', description: 'Wiki ID' },
        file_name: { type: 'string', description: '文件名，如 document.md' },
        content: { type: 'string', description: '原始文档内容，必须以 YAML frontmatter 开头记录来源信息（source/doc_id/doc_url/ingested_at）' },
      },
      required: ['wiki_id', 'file_name', 'content'],
    },
  },
  {
    name: 'get_job_status',
    description: '查询 ingest_wiki 提交的任务处理状态',
    inputSchema: {
      type: 'object',
      properties: {
        job_id: { type: 'string', description: 'ingest_wiki 返回的 jobId' },
      },
      required: ['job_id'],
    },
  },
  {
    name: 'delete_page',
    description: '删除 wiki 中的某个页面',
    inputSchema: {
      type: 'object',
      properties: {
        wiki_id: { type: 'string', description: 'Wiki ID' },
        path: { type: 'string', description: '页面路径，如 wiki/页面名.md' },
      },
      required: ['wiki_id', 'path'],
    },
  },
  {
    name: 'list_source_files',
    description: '列出 wiki 中所有已上传的原始文件',
    inputSchema: {
      type: 'object',
      properties: {
        wiki_id: { type: 'string', description: 'Wiki ID' },
      },
      required: ['wiki_id'],
    },
  },
  {
    name: 'get_source_file',
    description: '获取某个原始文件的完整内容。先用 search_wiki 或 get_page 找到页面的 source_file 字段，再用此工具读取原始内容实现分层索引。',
    inputSchema: {
      type: 'object',
      properties: {
        wiki_id: { type: 'string', description: 'Wiki ID' },
        file_name: { type: 'string', description: '原始文件名，来自页面 frontmatter 的 source_file 字段' },
      },
      required: ['wiki_id', 'file_name'],
    },
  },
]

async function callTool(tool: string, parameters: Record<string, unknown>) {
  function validWikiId(id: unknown): id is string {
    return typeof id === 'string' && /^[\w\-]+$/.test(id)
  }
  function validPageId(p: unknown): p is string {
    if (typeof p !== 'string' || !p) return false
    if (p.startsWith('/') || p.startsWith('\\')) return false
    if (p.split('/').some(s => s === '..')) return false
    if (!/^[\w一-鿿\-./]+$/.test(p)) return false
    return true
  }
  function validFileName(f: unknown): f is string {
    return typeof f === 'string' && f.length > 0 && !/[/\\]/.test(f) && !f.includes('..')
  }

  switch (tool) {
    case 'search_wiki': {
      const { query, wiki_id, top_k = 5 } = parameters as {
        query: string
        wiki_id: string
        top_k?: number
      }
      if (!validWikiId(wiki_id)) throw new Error('无效的 wiki_id')
      if (typeof query !== 'string' || !query.trim()) throw new Error('query 不能为空')
      const raw = await searchService.search(wiki_id, query, top_k)
      const results = raw.map(r => ({
        path: r.pageId,
        title: r.title,
        excerpt: r.snippet,
        score: r.score,
        ...(r.via ? { via: r.via } : {}),
      }))
      return { results }
    }

    case 'get_page': {
      const { wiki_id, path } = parameters as { wiki_id: string; path: string }
      if (!validWikiId(wiki_id)) throw new Error('无效的 wiki_id')
      if (!validPageId(path)) throw new Error('无效的页面路径')
      const content = await store.readPage(wiki_id, path)
      return { path, content }
    }

    case 'list_pages': {
      const { wiki_id } = parameters as { wiki_id: string }
      if (!validWikiId(wiki_id)) throw new Error('无效的 wiki_id')
      const paths = await store.listPages(wiki_id)

      const pages = await Promise.all(
        paths.map(async (path) => {
          let title = path
          try {
            const content = await store.readPage(wiki_id, path)
            const firstLine = content.split('\n').find(l => l.startsWith('# '))
            if (firstLine) title = firstLine.replace(/^#\s*/, '')
          } catch {
            // ignore
          }
          return { path, title }
        })
      )

      return { pages }
    }

    case 'ingest_wiki': {
      const { wiki_id, file_name, content } = parameters as {
        wiki_id: string
        file_name: string
        content: string
      }
      if (!validWikiId(wiki_id)) throw new Error('无效的 wiki_id')
      if (!validFileName(file_name)) throw new Error('无效的文件名')
      if (typeof content !== 'string' || !content.trim()) throw new Error('content 不能为空')
      const jobId = await ingestQueue.enqueue({
        wikiId: wiki_id,
        sourceFileName: file_name,
        sourceContent: content,
        sourceMimeType: 'text/plain',
      })
      return { jobId, status: 'queued' }
    }

    case 'get_job_status': {
      const { job_id } = parameters as { job_id: string }
      const result = await ingestQueue.getStatus(job_id)
      if (!result) return { job_id, status: 'not_found' }
      return { job_id, ...result }
    }

    case 'delete_page': {
      const { wiki_id, path } = parameters as { wiki_id: string; path: string }
      if (!validWikiId(wiki_id)) throw new Error('无效的 wiki_id')
      if (!validPageId(path)) throw new Error('无效的页面路径')
      await store.deletePage(wiki_id, path)
      await Promise.all([
        graphStore.removePageFromGraph(wiki_id, path),
        vectorStore.deletePageChunks(wiki_id, path),
      ])
      return { ok: true, path }
    }

    case 'list_source_files': {
      const { wiki_id } = parameters as { wiki_id: string }
      if (!validWikiId(wiki_id)) throw new Error('无效的 wiki_id')
      const files = await store.listRawFiles(wiki_id)
      return { files }
    }

    case 'get_source_file': {
      const { wiki_id, file_name } = parameters as { wiki_id: string; file_name: string }
      if (!validWikiId(wiki_id)) throw new Error('无效的 wiki_id')
      if (!validFileName(file_name)) throw new Error('无效的文件名')
      const content = await store.readRawFile(wiki_id, file_name)
      return { file_name, content }
    }

    default:
      throw new Error(`Unknown tool: ${tool}`)
  }
}

// 标准 MCP 协议（jsonrpc）
mcpRouter.post('/', async (req, res) => {
  const body = req.body as Record<string, unknown>

  // jsonrpc 请求
  if (body.jsonrpc === '2.0') {
    const { id, method, params } = body as {
      id: unknown
      method: string
      params?: Record<string, unknown>
    }

    try {
      if (method === 'initialize') {
        res.json({
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: { name: 'online-wiki', version: '1.0.0' },
          },
        })
        return
      }

      if (method === 'tools/list') {
        res.json({ jsonrpc: '2.0', id, result: { tools: TOOLS } })
        return
      }

      if (method === 'tools/call') {
        const { name, arguments: args = {} } = (params ?? {}) as {
          name: string
          arguments?: Record<string, unknown>
        }
        const result = await callTool(name, args)
        res.json({
          jsonrpc: '2.0',
          id,
          result: { content: [{ type: 'text', text: JSON.stringify(result) }] },
        })
        return
      }

      res.json({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      res.json({ jsonrpc: '2.0', id, error: { code: -32000, message } })
    }
    return
  }

  // 旧版自定义格式兼容
  const { tool, parameters = {} } = body as { tool: string; parameters?: Record<string, unknown> }
  try {
    const result = await callTool(tool, parameters)
    res.json({ result })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    res.status(400).json({ error: message })
  }
})
