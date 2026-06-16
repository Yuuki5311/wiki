import { Router } from 'express'
import { SearchService } from '../services/search-service'

export const searchRouter = Router()

const searchService = new SearchService()

function isValidWikiId(wikiId: string): boolean {
  return typeof wikiId === 'string' && /^[\w\-]+$/.test(wikiId)
}

searchRouter.get('/:wikiId/search', async (req, res, next) => {
  try {
    const { wikiId } = req.params
    const query = req.query.q as string
    const limit = Math.min(parseInt((req.query.limit as string) ?? '20', 10), 50)

    if (!isValidWikiId(wikiId)) {
      res.status(400).json({ error: '无效的 wikiId' })
      return
    }

    if (!query?.trim()) {
      res.status(400).json({ error: '搜索词 q 不能为空' })
      return
    }

    const results = await searchService.search(wikiId, query, limit)
    res.json({ results })
  } catch (err) {
    next(err)
  }
})
