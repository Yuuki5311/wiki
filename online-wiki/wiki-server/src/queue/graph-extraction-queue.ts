import Redis from 'ioredis'

export interface GraphExtractionTask {
  wikiId: string
  pageId: string
  title: string
  content: string
}

const QUEUE_KEY = 'graph-extraction-queue'

export class GraphExtractionQueue {
  private readonly producer: Redis
  private readonly consumer: Redis

  constructor() {
    const url = process.env.REDIS_URL ?? 'redis://localhost:6379'
    this.producer = new Redis(url)
    this.consumer = new Redis(url)
  }

  async enqueue(task: GraphExtractionTask): Promise<void> {
    await this.producer.lpush(QUEUE_KEY, JSON.stringify(task))
  }

  async dequeue(timeoutSec: number = 30): Promise<GraphExtractionTask | null> {
    const result = await this.consumer.brpop(QUEUE_KEY, timeoutSec)
    if (!result) return null
    try {
      return JSON.parse(result[1]) as GraphExtractionTask
    } catch {
      console.error('[graph-queue] 解析任务失败:', result[1])
      return null
    }
  }
}
