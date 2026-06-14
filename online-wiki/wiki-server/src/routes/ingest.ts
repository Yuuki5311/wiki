import { Router } from 'express'
import { IngestQueue } from '../queue/ingest-queue'

export const ingestRouter = Router()

const ingestQueue = new IngestQueue()

ingestRouter.post('/:wikiId/ingest', async (req, res, next) => {
  try {
    const { wikiId } = req.params
    const { sourceContent, sourceFileName, sourceMimeType } = req.body

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
    const { jobId } = req.params
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
