import { GraphExtractionQueue } from './graph-extraction-queue'
import { GraphStore } from '../graph/graph-store'
import { getWikiStore } from '../storage/wiki-store'
import { extractLinks } from '../graph/link-extractor'
import { extractRelations } from '../graph/llm-extractor'

const queue = new GraphExtractionQueue()
const store = new GraphStore()
const wikiStore = getWikiStore()

export async function runGraphExtractionWorker(): Promise<never> {
  console.log('[graph-worker] 启动，等待图谱提取任务...')

  while (true) {
    const task = await queue.dequeue(30)
    if (!task) continue

    console.log(`[graph-worker] 处理: ${task.wikiId}/${task.pageId}`)

    try {
      const knownPages = await wikiStore.listPages(task.wikiId)

      const [linkEdges, llmEdges] = await Promise.all([
        Promise.resolve(extractLinks(task.pageId, task.content)),
        extractRelations(task.pageId, task.title, task.content, knownPages),
      ])

      await store.updatePageInGraph(
        task.wikiId,
        task.pageId,
        task.title,
        [...linkEdges, ...llmEdges],
      )

      console.log(`[graph-worker] 完成: ${task.pageId}，边数=${linkEdges.length + llmEdges.length}`)
    } catch (err) {
      console.error(`[graph-worker] 失败: ${task.pageId}`, (err as Error).message)
    }
  }
}
