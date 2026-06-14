import Redis from 'ioredis'

export interface IngestTask {
  jobId: string
  wikiId: string
  sourceFileName: string
  sourceContent: string
  sourceMimeType: string
  enqueuedAt: number
}

export type JobStatus =
  | { status: 'queued' }
  | { status: 'processing'; step: string }
  | { status: 'done'; pagesWritten: string[] }
  | { status: 'error'; error: string }

const QUEUE_KEY = 'ingest-queue'
const JOB_STATUS_PREFIX = 'job-status:'
const JOB_TTL_SECONDS = 60 * 60 * 24

export class IngestQueue {
  private readonly producer: Redis
  private readonly consumer: Redis

  constructor() {
    const url = process.env.REDIS_URL ?? 'redis://localhost:6379'
    this.producer = new Redis(url)
    this.consumer = new Redis(url)
  }

  async enqueue(params: Omit<IngestTask, 'jobId' | 'enqueuedAt'>): Promise<string> {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const task: IngestTask = { ...params, jobId, enqueuedAt: Date.now() }

    await this.setStatus(jobId, { status: 'queued' })
    await this.producer.lpush(QUEUE_KEY, JSON.stringify(task))

    return jobId
  }

  async dequeue(timeoutSec: number = 30): Promise<IngestTask | null> {
    const result = await this.consumer.brpop(QUEUE_KEY, timeoutSec)
    if (!result) return null

    const [, raw] = result
    try {
      return JSON.parse(raw) as IngestTask
    } catch {
      console.error('[queue] 解析任务失败:', raw)
      return null
    }
  }

  async setStatus(jobId: string, status: JobStatus): Promise<void> {
    const key = `${JOB_STATUS_PREFIX}${jobId}`
    await this.producer.setex(key, JOB_TTL_SECONDS, JSON.stringify(status))
  }

  async getStatus(jobId: string): Promise<JobStatus | null> {
    const key = `${JOB_STATUS_PREFIX}${jobId}`
    const raw = await this.producer.get(key)
    if (!raw) return null
    return JSON.parse(raw) as JobStatus
  }
}
