import { chunkMarkdown } from './text-chunker'

interface EmbeddingConfig {
  apiKey: string
  model: string
  baseUrl?: string
}

export async function fetchEmbedding(
  text: string,
  config: EmbeddingConfig,
): Promise<number[]> {
  const url = `${config.baseUrl ?? process.env.EMBEDDING_BASE_URL ?? 'https://api.openai.com'}/v1/embeddings`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({ model: config.model, input: text }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Embedding API 错误 ${response.status}: ${body}`)
  }

  const data = await response.json() as { data: Array<{ embedding: number[] }> }
  return data.data[0].embedding
}

/**
 * 对 Markdown 内容分块，复用 llm_wiki 的 text-chunker 逻辑。
 * text-chunker.ts 直接从 llm_wiki 复制，是纯函数无副作用。
 */
export function chunkContent(content: string): Array<{
  chunkIndex: number
  chunkText: string
  headingPath: string
}> {
  const chunks = chunkMarkdown(content, { targetChars: 800, overlapChars: 150 })
  return chunks.map((c) => ({
    chunkIndex: c.index,
    chunkText: c.text,
    headingPath: c.headingPath,
  }))
}
