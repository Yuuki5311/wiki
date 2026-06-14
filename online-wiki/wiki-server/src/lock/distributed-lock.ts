import Redis from 'ioredis'
import { randomBytes } from 'crypto'

let redisClient: Redis | null = null

function getRedis(): Redis {
  if (!redisClient) {
    redisClient = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      retryStrategy: (times) => Math.min(times * 100, 3000),
    })
    redisClient.on('error', (err) => {
      console.error('[Redis] 连接错误:', err.message)
    })
  }
  return redisClient
}

const LOCK_TTL_SECONDS = 300
const RETRY_DELAY_MS = 500
const MAX_RETRIES = 20

async function tryAcquire(lockKey: string): Promise<string | null> {
  const redis = getRedis()
  const token = randomBytes(16).toString('hex')
  const result = await redis.set(lockKey, token, 'EX', LOCK_TTL_SECONDS, 'NX')
  return result === 'OK' ? token : null
}

async function release(lockKey: string, token: string): Promise<void> {
  const redis = getRedis()
  const luaScript = `
    if redis.call("GET", KEYS[1]) == ARGV[1] then
      return redis.call("DEL", KEYS[1])
    else
      return 0
    end
  `
  await redis.eval(luaScript, 1, lockKey, token)
}

export async function withDistributedLock<T>(
  wikiId: string,
  fn: () => Promise<T>,
  resource: string = 'wiki',
): Promise<T> {
  const lockKey = `lock:${resource}:${wikiId}`
  let token: string | null = null
  let retries = 0

  while (retries < MAX_RETRIES) {
    token = await tryAcquire(lockKey)
    if (token) break
    console.log(`[lock] ${wikiId} 锁被占用，等待 ${RETRY_DELAY_MS}ms 后重试（第 ${retries + 1} 次）`)
    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS))
    retries++
  }

  if (!token) {
    throw new Error(`获取分布式锁超时：wiki ${wikiId} 在 ${MAX_RETRIES * RETRY_DELAY_MS / 1000} 秒内未能获取锁`)
  }

  console.log(`[lock] ${wikiId} 获取锁成功`)

  try {
    return await fn()
  } finally {
    await release(lockKey, token)
    console.log(`[lock] ${wikiId} 释放锁`)
  }
}
