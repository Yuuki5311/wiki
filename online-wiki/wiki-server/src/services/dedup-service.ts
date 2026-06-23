import type { WikiStore } from '../storage/wiki-store'
import { VectorStore } from '../storage/vector-store'
import { fetchEmbedding } from './embedding-service'

interface EmbeddingConfig {
  apiKey: string
  model: string
}

interface DedupCheckResult {
  shouldMerge: boolean
  existingPageId: string | null
  score: number
}

/** 余弦相似度阈值：高于此值视为重复，触发合并 */
const SIMILARITY_THRESHOLD = 0.92

/**
 * 检查新页面是否与已有页面语义重复。
 * 先算新内容的 embedding，再去 Qdrant 搜索最相似的已有页面。
 * 返回最匹配的已有页面（如果有且高于阈值）。
 */
export async function findSimilarPage(
  wikiId: string,
  newPath: string,
  newContent: string,
  store: WikiStore,
  vectorStore: VectorStore,
  embedConfig: EmbeddingConfig,
): Promise<DedupCheckResult> {
  try {
    // 为新内容计算 embedding（取前 3000 字符足够判断主题相似度）
    const embedding = await fetchEmbedding(
      newContent.slice(0, 3000),
      embedConfig,
    )

    // 在 Qdrant 中搜索最相似的已有页面
    const results = await vectorStore.search(wikiId, embedding, 5)
    const ownNormalized = newPath.toLowerCase().replace(/\\/g, '/')

    for (const result of results) {
      // 跳过自身
      if (result.pageId.toLowerCase().replace(/\\/g, '/') === ownNormalized) continue
      // 跳过过短的匹配（标题级别的巧合）
      if (result.chunkText.length < 50) continue

      if (result.score >= SIMILARITY_THRESHOLD) {
        // 确认页面存在且未被废弃
        try {
          const existing = await store.readPage(wikiId, result.pageId)
          if (isPageDeprecated(existing)) continue
        } catch {
          continue // 页面可能已被删除
        }

        return {
          shouldMerge: true,
          existingPageId: result.pageId,
          score: result.score,
        }
      }
    }

    return { shouldMerge: false, existingPageId: null, score: 0 }
  } catch (err) {
    console.warn('[dedup] 相似度检查失败，跳过去重:', (err as Error).message)
    return { shouldMerge: false, existingPageId: null, score: 0 }
  }
}

/**
 * 将新内容合并到已有页面。
 * 优先用 LLM 做智能合并（去重拼接），LLM 不可用时降级为简单拼接。
 * 合并后保留所有 source_file 溯源信息。
 */
export async function mergeContent(
  existingPageId: string,
  existingContent: string,
  newContent: string,
  newSourceFileName: string,
): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY

  if (!apiKey) {
    console.log('[dedup] 未配置 DEEPSEEK_API_KEY，使用简单拼接合并')
    return simpleMerge(existingContent, newContent, newSourceFileName)
  }

  const prompt = `你是一个 wiki 知识库维护助手。请将"新增内容"合并到"已有页面"中。

规则：
1. 保留已有页面中仍然有效的所有信息和结构
2. 将新增内容中的增量信息补充到合适的章节中
3. 如果新增与已有内容高度重复，保留更完整、更准确的版本
4. 保持 markdown 格式整洁，标题层级合理
5. 不要添加 meta 说明文字，直接输出合并后的页面正文

已有页面（${existingPageId}）：
${existingContent.slice(0, 4000)}

新增内容：
${newContent.slice(0, 4000)}

请输出合并后的完整页面 markdown。只输出 markdown，不要加任何额外说明。`

  try {
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.LLM_MODEL ?? 'deepseek-chat',
        max_tokens: 8192,
        temperature: 0.2,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!response.ok) {
      console.warn(`[dedup] LLM 合并失败 (${response.status})，降级为简单拼接`)
      return simpleMerge(existingContent, newContent, newSourceFileName)
    }

    const data = await response.json() as { choices: Array<{ message: { content: string } }> }
    const merged = data.choices[0]?.message?.content ?? ''

    if (!merged.trim()) {
      return simpleMerge(existingContent, newContent, newSourceFileName)
    }

    // 保证 source_file 溯源信息不丢失
    return ensureSourceFileTracking(merged, existingContent, newSourceFileName)
  } catch (err) {
    console.warn('[dedup] LLM 合并异常，降级为简单拼接:', (err as Error).message)
    return simpleMerge(existingContent, newContent, newSourceFileName)
  }
}

/**
 * 简单拼接（LLM 不可用时的降级方案）。
 */
function simpleMerge(
  existingContent: string,
  newContent: string,
  newSourceFileName: string,
): string {
  const merged = existingContent + '\n\n---\n\n' + newContent
  return ensureSourceFileTracking(merged, existingContent, newSourceFileName)
}

/**
 * 保证合并后的内容包含所有 source_file 引用。
 */
function ensureSourceFileTracking(
  merged: string,
  existingContent: string,
  newSourceFileName: string,
): string {
  const existingSources = extractSourceFiles(existingContent)
  const allSources = [...new Set([...existingSources, newSourceFileName])]

  // 只剩一个 source，用简单的单行格式
  if (allSources.length === 1) {
    if (merged.includes('source_file:')) return merged
    return injectSingleSourceFile(merged, allSources[0])
  }

  // 多个 source，用 YAML 列表格式
  return injectMultiSourceFiles(merged, allSources)
}

function extractSourceFiles(content: string): string[] {
  const sources: string[] = []
  for (const line of content.split('\n')) {
    const match = line.match(/^source_file:\s*(.+)/)
    if (match) sources.push(match[1].trim())
  }
  return sources
}

function injectSingleSourceFile(content: string, sourceFile: string): string {
  if (content.startsWith('---\n')) {
    const endIdx = content.indexOf('\n---\n', 4)
    if (endIdx !== -1) {
      return content.slice(0, endIdx) + `\nsource_file: ${sourceFile}` + content.slice(endIdx)
    }
  }
  return `---\nsource_file: ${sourceFile}\n---\n\n${content}`
}

function injectMultiSourceFiles(content: string, sourceFiles: string[]): string {
  const sourceList = sourceFiles.map((f) => `  - ${f}`).join('\n')
  const sourceBlock = `source_files:\n${sourceList}`

  if (content.startsWith('---\n')) {
    const endIdx = content.indexOf('\n---\n', 4)
    if (endIdx !== -1) {
      // 移除已有的 source_file / source_files 行，重新写入
      let frontmatter = content.slice(0, endIdx)
      frontmatter = frontmatter
        .split('\n')
        .filter(
          (l) => !l.startsWith('source_file:') && !l.startsWith('source_files:'),
        )
        .join('\n')
      return frontmatter + '\n' + sourceBlock + content.slice(endIdx)
    }
  }
  return `---\n${sourceBlock}\n---\n\n${content}`
}

/** 检查页面是否已被废弃（deprecated: true） */
function isPageDeprecated(content: string): boolean {
  return /\bdeprecated:\s*true\b/.test(content)
}
