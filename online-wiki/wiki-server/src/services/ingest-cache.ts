import { createHash } from 'crypto'
import type { WikiStore } from '../storage/wiki-store'

/**
 * SHA256-based ingest cache.
 * 服务端版：原版缓存存在本地 .llm-wiki/ingest-cache.json，
 * 这里改存在 S3（wiki-id/meta/ingest-cache.json）。
 * 核心逻辑和 llm_wiki/src/lib/ingest-cache.ts 一致，只是换了 IO 后端。
 */

interface CacheEntry {
  hash: string
  timestamp: number
  pagesWritten: string[]
}

type CacheData = Record<string, CacheEntry>

const CACHE_PAGE_ID = 'meta/ingest-cache.json'

function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex')
}

async function loadCache(store: WikiStore, wikiId: string): Promise<CacheData> {
  try {
    const raw = await store.readPage(wikiId, CACHE_PAGE_ID)
    return JSON.parse(raw) as CacheData
  } catch {
    return {}
  }
}

async function saveCache(store: WikiStore, wikiId: string, data: CacheData): Promise<void> {
  await store.writePage(wikiId, CACHE_PAGE_ID, JSON.stringify(data, null, 2))
}

export async function checkIngestCache(
  store: WikiStore,
  wikiId: string,
  sourceFileName: string,
  sourceContent: string,
): Promise<string[] | null> {
  const cache = await loadCache(store, wikiId)
  const entry = cache[sourceFileName]
  if (!entry) return null

  const currentHash = sha256(sourceContent)
  if (entry.hash !== currentHash) return null

  // 验证缓存记录的页面是否真实存在，有缺失则视为缓存失效
  const checks = await Promise.all(
    entry.pagesWritten.map(p =>
      store.readPage(wikiId, p).then(() => true).catch(() => false)
    )
  )
  if (checks.some(exists => !exists)) return null

  return entry.pagesWritten
}

export async function saveIngestCache(
  store: WikiStore,
  wikiId: string,
  sourceFileName: string,
  sourceContent: string,
  pagesWritten: string[],
): Promise<void> {
  const cache = await loadCache(store, wikiId)
  const hash = sha256(sourceContent)
  cache[sourceFileName] = {
    hash,
    timestamp: Date.now(),
    pagesWritten,
  }
  await saveCache(store, wikiId, cache)
}
