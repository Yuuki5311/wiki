import { Router, Request, Response, NextFunction } from 'express'
import { getWikiStore } from '../storage/wiki-store'
import { GraphStore } from '../graph/graph-store'

export const wikiRouter = Router()
const graphStore = new GraphStore()

function isValidPageId(pageId: string): boolean {
  if (!pageId || pageId.trim().length === 0) return false
  if (pageId.startsWith('/') || pageId.startsWith('\\')) return false
  const segments = pageId.split('/')
  if (segments.some(seg => seg === '..')) return false
  if (!/^[\w一-鿿\-./]+$/.test(pageId)) return false
  return true
}

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next)
  }
}

wikiRouter.get('/:wikiId/pages', asyncHandler(async (req, res) => {
  const { wikiId } = req.params
  const store = getWikiStore()
  const pages = await store.listPages(wikiId)
  res.json({ pages })
}))

wikiRouter.get('/:wikiId/pages/*', asyncHandler(async (req, res) => {
  const { wikiId } = req.params
  const pageId = req.params[0]

  if (!isValidPageId(pageId)) {
    res.status(400).json({ error: '无效的页面 ID' })
    return
  }

  const store = getWikiStore()
  try {
    const content = await store.readPage(wikiId, pageId)
    res.json({ pageId, content })
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('NoSuchKey')) {
      res.status(404).json({ error: '页面不存在', pageId })
    } else {
      throw err
    }
  }
}))

wikiRouter.put('/:wikiId/pages/*', asyncHandler(async (req, res) => {
  const { wikiId } = req.params
  const pageId = req.params[0]
  const { content } = req.body

  if (!isValidPageId(pageId)) {
    res.status(400).json({ error: '无效的页面 ID' })
    return
  }

  if (typeof content !== 'string') {
    res.status(400).json({ error: '请求体必须包含 content 字符串' })
    return
  }

  const store = getWikiStore()
  await store.writePage(wikiId, pageId, content)
  res.json({ ok: true, pageId })
}))

wikiRouter.delete('/:wikiId/pages/*', asyncHandler(async (req, res) => {
  const { wikiId } = req.params
  const pageId = req.params[0]

  if (!isValidPageId(pageId)) {
    res.status(400).json({ error: '无效的页面 ID' })
    return
  }

  const store = getWikiStore()
  await store.deletePage(wikiId, pageId)
  await graphStore.removePageFromGraph(wikiId, pageId)
  res.json({ ok: true })
}))
