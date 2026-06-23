import type { WikiStore } from '../storage/wiki-store'
import { VectorStore } from '../storage/vector-store'
import { checkIngestCache, saveIngestCache } from './ingest-cache'
import { fetchEmbedding, chunkContent } from './embedding-service'
import { findSimilarPage, mergeContent } from './dedup-service'
import { GraphExtractionQueue } from '../queue/graph-extraction-queue'

function parseFileBlocks(text: string): Array<{ path: string; content: string }> {
  const blocks: Array<{ path: string; content: string }> = []
  const OPENER = /^---\s*FILE:\s*(.+?)\s*---\s*$/im
  const CLOSER = /^---\s*END\s+FILE\s*---\s*$/im

  const lines = text.split('\n')
  let inBlock = false
  let currentPath = ''
  let currentLines: string[] = []

  for (const line of lines) {
    if (!inBlock) {
      const m = line.match(OPENER)
      if (m) {
        inBlock = true
        currentPath = m[1].trim()
        currentLines = []
      }
    } else {
      if (CLOSER.test(line)) {
        if (isSafePath(currentPath)) {
          blocks.push({ path: currentPath, content: currentLines.join('\n') })
        }
        inBlock = false
        currentPath = ''
        currentLines = []
      } else {
        currentLines.push(line)
      }
    }
  }

  return blocks
}

function isSafePath(p: string): boolean {
  if (!p || p.startsWith('/') || p.startsWith('\\')) return false
  if (/[\x00-\x1f]/.test(p)) return false
  const segments = p.replace(/\\/g, '/').split('/')
  if (segments.some(s => s === '..')) return false
  if (!p.startsWith('wiki/')) return false
  return true
}

function buildStep1Prompt(sourceContent: string, indexContent: string): string {
  return `你是一个 wiki 知识库的维护者。请分析以下文档，提取关键实体、概念和论点。

现有 Wiki 目录：
${indexContent}

待分析文档：
${sourceContent}

请输出：
1. 需要新建或更新的 wiki 页面列表
2. 每个页面的关键内容要点
3. 与现有 wiki 页面的关联关系`
}

function buildStep2Prompt(analysis: string, schemaMd: string): string {
  return `根据以下分析，生成 Wiki 页面内容。每个文件用以下格式包裹：

---FILE: wiki/页面路径.md---
文件内容
---END FILE---

Wiki 结构规则：
${schemaMd}

分析结果：
${analysis}

请生成所有需要新建或更新的 wiki 页面。`
}

async function callLlm(prompt: string): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) throw new Error('未配置 DEEPSEEK_API_KEY')

  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.LLM_MODEL ?? 'deepseek-chat',
      max_tokens: 8192,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!response.ok) {
    throw new Error(`LLM 调用失败: ${response.status}`)
  }

  const data = await response.json() as {
    choices: Array<{ message: { content: string } }>
  }

  return data.choices[0]?.message.content ?? ''
}

export interface IngestInput {
  wikiId: string
  sourceFileName: string
  sourceContent: string
}

export interface IngestResult {
  pagesWritten: string[]
  skipped: boolean
}

export async function runIngest(
  input: IngestInput,
  store: WikiStore,
  vectorStore: VectorStore,
): Promise<IngestResult> {
  const { wikiId, sourceFileName, sourceContent } = input

  // 始终保存原文件（无论是否命中缓存）
  await store.writeRawFile(wikiId, sourceFileName, sourceContent)
  console.log(`[ingest] 原文件已保存: ${sourceFileName}`)

  const cached = await checkIngestCache(store, wikiId, sourceFileName, sourceContent)
  if (cached) {
    console.log(`[ingest] 命中缓存，跳过: ${sourceFileName}`)
    return { pagesWritten: cached, skipped: true }
  }

  let indexContent = ''
  try {
    indexContent = await store.readPage(wikiId, 'wiki/index.md')
  } catch {
    indexContent = '（空 wiki，尚未有任何页面）'
  }

  let schemaMd = ''
  try {
    schemaMd = await store.readPage(wikiId, 'schema.md')
  } catch {
    schemaMd = '按通用 wiki 格式组织页面。'
  }

  console.log(`[ingest] Step 1 开始: ${sourceFileName}`)
  const analysis = await callLlm(buildStep1Prompt(sourceContent, indexContent))

  console.log(`[ingest] Step 2 开始: ${sourceFileName}`)
  const generated = await callLlm(buildStep2Prompt(analysis, schemaMd))

  const fileBlocks = parseFileBlocks(generated)
  console.log(`[ingest] 解析到 ${fileBlocks.length} 个文件块`)

  // ── 准备去重所需配置 ──
  const embeddingApiKey = process.env.OPENAI_API_KEY ?? 'ollama'
  const embedModel = process.env.EMBEDDING_MODEL ?? 'text-embedding-3-small'
  const hasEmbedding = !!embeddingApiKey

  const pagesWritten: string[] = []
  // 记录本轮被合并过的已有页面 → 合并后的内容
  // 多个新页面可能合并到同一个已有页面，在此累积
  const mergedExistingPages = new Map<string, string>()

  // ── 1. 写入页面（带去重检查） ──
  for (const block of fileBlocks) {
    // 注入 source_file frontmatter
    let content = block.content
    if (content.startsWith('---\n')) {
      const endIdx = content.indexOf('\n---\n', 4)
      if (endIdx !== -1) {
        content = content.slice(0, endIdx) + `\nsource_file: ${sourceFileName}` + content.slice(endIdx)
      }
    } else {
      content = `---\nsource_file: ${sourceFileName}\n---\n\n${content}`
    }

    // 去重检查：对已有页面向量搜索，相似度 > 阈值则触发合并
    if (hasEmbedding) {
      const similar = await findSimilarPage(
        wikiId, block.path, block.content, store, vectorStore,
        { apiKey: embeddingApiKey, model: embedModel },
      )

      if (similar.shouldMerge && similar.existingPageId) {
        const existingId = similar.existingPageId
        console.log(
          `[ingest] 🔀 "${block.path}" 与已有 "${existingId}" 相似 ` +
          `(${(similar.score * 100).toFixed(0)}%)，触发合并`
        )

        // 读取已有页面（如这轮已合并过，用累积的最新版本）
        const baseContent = mergedExistingPages.has(existingId)
          ? mergedExistingPages.get(existingId)!
          : await store.readPage(wikiId, existingId)

        const merged = await mergeContent(
          existingId, baseContent, content, sourceFileName,
        )

        mergedExistingPages.set(existingId, merged)
        if (!pagesWritten.includes(existingId)) {
          pagesWritten.push(existingId)
        }
        continue
      }
    }

    // 不重复 → 正常写入新页面
    await store.writePage(wikiId, block.path, content)
    pagesWritten.push(block.path)
    console.log(`[ingest] 写入: ${block.path}`)
  }

  // 写入合并后的已有页面
  for (const [pageId, mergedContent] of mergedExistingPages) {
    await store.writePage(wikiId, pageId, mergedContent)
    console.log(`[ingest] 合并写入已有页面: ${pageId}`)
  }

  // ── 2. 向量索引 ──
  if (hasEmbedding) {
    // 合并过的页面：先删旧向量，再按新内容重新分块
    for (const [pageId, mergedContent] of mergedExistingPages) {
      await vectorStore.deletePageChunks(wikiId, pageId)
      const chunks = chunkContent(mergedContent)
      if (chunks.length > 0) {
        const chunksWithEmbeddings = await Promise.all(
          chunks.map(async (chunk) => ({
            ...chunk,
            embedding: await fetchEmbedding(chunk.chunkText, {
              apiKey: embeddingApiKey, model: embedModel,
            }),
          }))
        )
        await vectorStore.upsertChunks(wikiId, pageId, chunksWithEmbeddings)
      }
      console.log(`[ingest] 合并页面向量已更新: ${pageId}`)
    }

    // 新页面：正常分块向量化（排除已被判定合并的路径）
    const mergedPathSet = new Set(mergedExistingPages.keys())
    const newBlocks = fileBlocks.filter(b => !mergedPathSet.has(b.path))
    for (const block of newBlocks) {
      let pageContent: string
      try {
        pageContent = await store.readPage(wikiId, block.path)
      } catch {
        continue // 页面写入失败则跳过
      }
      const chunks = chunkContent(pageContent)
      if (chunks.length > 0) {
        const chunksWithEmbeddings = await Promise.all(
          chunks.map(async (chunk) => ({
            ...chunk,
            embedding: await fetchEmbedding(chunk.chunkText, {
              apiKey: embeddingApiKey, model: embedModel,
            }),
          }))
        )
        await vectorStore.upsertChunks(wikiId, block.path, chunksWithEmbeddings)
      }
    }
    console.log(`[ingest] 向量索引已更新`)
  } else {
    console.log(`[ingest] 未配置 OPENAI_API_KEY，跳过向量索引和去重`)
  }

  // ── 3. 保存缓存 ──
  await saveIngestCache(store, wikiId, sourceFileName, sourceContent, pagesWritten)

  // ── 4. 图谱提取队列 ──
  const graphQueue = new GraphExtractionQueue()
  // 新页面（排除被合并跳过的）
  for (const block of fileBlocks) {
    if (mergedExistingPages.has(block.path)) continue
    await graphQueue.enqueue({
      wikiId,
      pageId: block.path,
      title: block.path.replace(/\.md$/, '').split('/').pop() ?? block.path,
      content: block.content,
    })
  }
  // 合并过的已有页面（内容变了，需重建图谱连线）
  for (const [pageId, mergedContent] of mergedExistingPages) {
    await graphQueue.enqueue({
      wikiId,
      pageId,
      title: pageId.replace(/\.md$/, '').split('/').pop() ?? pageId,
      content: mergedContent,
    })
  }
  const graphTaskCount = fileBlocks.filter(b => !mergedExistingPages.has(b.path)).length
    + mergedExistingPages.size
  console.log(`[ingest] 已提交 ${graphTaskCount} 个图谱提取任务`)

  return { pagesWritten, skipped: false }
}
