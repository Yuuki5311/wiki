import { VectorStore } from '../storage/vector-store'
import { fetchEmbedding } from './embedding-service'
import { getWikiStore } from '../storage/wiki-store'
import { GraphStore } from '../graph/graph-store'

export class SearchService {
  private readonly vectorStore: VectorStore
  private readonly graphStore: GraphStore

  constructor() {
    this.vectorStore = new VectorStore()
    this.graphStore = new GraphStore()
  }

  async search(wikiId: string, query: string, limit: number): Promise<Array<{
    pageId: string
    title: string
    snippet: string
    score: number
    via?: string  // 通过哪个页面的关联找到的
  }>> {
    const apiKey = process.env.OPENAI_API_KEY ?? 'ollama'
    if (!apiKey) return []

    const store = getWikiStore()

    const queryEmbedding = await fetchEmbedding(query, {
      apiKey,
      model: process.env.EMBEDDING_MODEL ?? 'text-embedding-3-small',
    })

    const raw = await this.vectorStore.search(wikiId, queryEmbedding, limit * 2)

    const pageMap = new Map<string, { pageId: string; snippet: string; score: number; via?: string }>()
    for (const r of raw) {
      const existing = pageMap.get(r.pageId)
      if (!existing || r.score > existing.score) {
        pageMap.set(r.pageId, {
          pageId: r.pageId,
          snippet: r.chunkText.slice(0, 200),
          score: r.score,
        })
      }
    }

    // 图谱扩展：找向量搜索结果的邻居节点
    const topPages = Array.from(pageMap.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.ceil(limit / 2))

    if (topPages.length > 0) {
      const graph = await this.graphStore.readGraph(wikiId)
      const neighborScore = topPages[topPages.length - 1].score * 0.7  // 邻居节点给一个衰减分

      for (const page of topPages) {
        const neighbors = graph.edges
          .filter(e => e.source === page.pageId || e.target === page.pageId)
          .map(e => e.source === page.pageId ? e.target : e.source)

        for (const neighborId of neighbors) {
          if (pageMap.has(neighborId)) continue  // 已经在结果里了
          pageMap.set(neighborId, {
            pageId: neighborId,
            snippet: '',
            score: neighborScore,
            via: page.pageId,
          })
        }
      }
    }

    // 补全邻居节点的 snippet 和 title
    const results = await Promise.all(
      Array.from(pageMap.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(async (item) => {
          let title = item.pageId
          let snippet = item.snippet
          try {
            const content = await store.readPage(wikiId, item.pageId)
            const firstLine = content.split('\n').find(l => l.startsWith('# '))
            if (firstLine) title = firstLine.replace(/^#\s*/, '')
            if (!snippet) snippet = content.slice(0, 200)
          } catch {
            // use path as title
          }
          return { pageId: item.pageId, title, snippet, score: item.score, via: item.via }
        })
    )

    return results
  }
}
