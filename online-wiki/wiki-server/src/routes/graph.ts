import { Router } from 'express'
import { GraphStore, GraphNode, GraphEdge } from '../graph/graph-store'

export const graphRouter = Router()

const store = new GraphStore()

function isValidWikiId(wikiId: string): boolean {
  return typeof wikiId === 'string' && /^[\w\-]+$/.test(wikiId)
}

graphRouter.get('/:wikiId/graph', async (req, res, next) => {
  try {
    const { wikiId } = req.params
    if (!isValidWikiId(wikiId)) {
      res.status(400).json({ error: '无效的 wikiId' })
      return
    }
    const graph = await store.readGraph(wikiId)
    res.json(graph)
  } catch (err) {
    next(err)
  }
})

graphRouter.put('/:wikiId/graph', async (req, res, next) => {
  try {
    const { wikiId } = req.params
    if (!isValidWikiId(wikiId)) {
      res.status(400).json({ error: '无效的 wikiId' })
      return
    }
    const { nodes, edges } = req.body as { nodes: GraphNode[]; edges: GraphEdge[] }
    if (!Array.isArray(nodes) || !Array.isArray(edges)) {
      res.status(400).json({ error: 'nodes 和 edges 必须为数组' })
      return
    }
    await store.writeFullGraph(wikiId, { nodes, edges, updatedAt: '' })
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})
