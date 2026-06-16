import { createHash } from 'crypto'
import type { WikiStore } from '../storage/wiki-store'

interface CacheEntry {
  hash: string
  timestamp: number
  pagesWritten: string[]
}

type CacheData = Record<string, CacheEntry>

// 缓存文件存到 raw/ 目录下，不会被 listPages() 返回，也不会被 wiki 路由暴露
const CACHE_RAW_FILE = '_ingest_cache.json'

function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex')
}

async function loadCache(store: WikiStore, wikiId: string): Promise<CacheData> {
  try {
    const raw = await store.readRawFile(wikiId, CACHE_RAW_FILE)
    return JSON.parse(raw) as CacheData
  } catch {
    return {}
  }
}

async function saveCache(store: WikiStore, wikiId: string, data: CacheData): Promise<void> {
  await store.writeRawFile(wikiId, CACHE_RAW_FILE, JSON.stringify(data, null, 2))
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
  cache[sourceFileName] = {
    hash: sha256(sourceContent),
    timestamp: Date.now(),
    pagesWritten,
  }
  await saveCache(store, wikiId, cache)
}
