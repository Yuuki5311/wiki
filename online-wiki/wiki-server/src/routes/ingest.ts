import { Router } from 'express'
import { IngestQueue } from '../queue/ingest-queue'

export const ingestRouter = Router()

const ingestQueue = new IngestQueue()

function isValidWikiId(wikiId: string): boolean {
  return typeof wikiId === 'string' && /^[\w\-]+$/.test(wikiId)
}

ingestRouter.post('/:wikiId/ingest', async (req, res, next) => {
  try {
    const { wikiId } = req.params
    const { sourceContent, sourceFileName, sourceMimeType } = req.body

    if (!isValidWikiId(wikiId)) {
      res.status(400).json({ error: '无效的 wikiId' })
      return
    }

    if (!sourceContent || !sourceFileName) {
      res.status(400).json({ error: '缺少 sourceContent 或 sourceFileName' })
      return
    }

    const jobId = await ingestQueue.enqueue({
      wikiId,
      sourceContent,
      sourceFileName,
      sourceMimeType: sourceMimeType ?? 'text/plain',
    })

    res.status(202).json({ jobId, status: 'queued' })
  } catch (err) {
    next(err)
  }
})

ingestRouter.get('/:wikiId/jobs/:jobId', async (req, res, next) => {
  try {
    const { wikiId, jobId } = req.params

    if (!isValidWikiId(wikiId)) {
      res.status(400).json({ error: '无效的 wikiId' })
      return
    }

    const status = await ingestQueue.getStatus(jobId)

    if (!status) {
      res.status(404).json({ error: '任务不存在' })
      return
    }

    res.json(status)
  } catch (err) {
    next(err)
  }
})
