import 'dotenv/config'
import { IngestQueue } from './ingest-queue'
import { runGraphExtractionWorker } from './graph-extraction-handler'
import { withDistributedLock } from '../lock/distributed-lock'
import { runIngest } from '../services/ingest-service'
import { getWikiStore } from '../storage/wiki-store'
import { VectorStore } from '../storage/vector-store'

const queue = new IngestQueue()
const vectorStore = new VectorStore()

async function runWorker() {
  console.log('[worker] 启动，等待任务...')

  while (true) {
    const task = await queue.dequeue(30)

    if (!task) {
      console.log('[worker] 等待中...')
      continue
    }

    console.log(`[worker] 收到任务: ${task.jobId} (${task.sourceFileName})`)

    await queue.setStatus(task.jobId, {
      status: 'processing',
      step: 'Step 1/2: 分析文档',
    })

    try {
      const store = getWikiStore()
      const result = await withDistributedLock(task.wikiId, async () => {
        await queue.setStatus(task.jobId, {
          status: 'processing',
          step: 'Step 2/2: 生成 Wiki 页面',
        })

        return await runIngest(
          {
            wikiId: task.wikiId,
            sourceFileName: task.sourceFileName,
            sourceContent: task.sourceContent,
          },
          store,
          vectorStore,
        )
      })

      await queue.setStatus(task.jobId, {
        status: 'done',
        pagesWritten: result.pagesWritten,
      })

      console.log(`[worker] 完成: ${task.jobId}，写入 ${result.pagesWritten.length} 个页面`)
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      console.error(`[worker] 失败: ${task.jobId}`, errorMsg)

      await queue.setStatus(task.jobId, {
        status: 'error',
        error: errorMsg,
      })
    }
  }
}

process.on('SIGINT', () => {
  console.log('[worker] 收到关闭信号，等待当前任务完成后退出...')
  process.exit(0)
})

Promise.all([
  runWorker(),
  runGraphExtractionWorker(),
]).catch((err) => {
  console.error('[worker] 致命错误:', err)
  process.exit(1)
})
