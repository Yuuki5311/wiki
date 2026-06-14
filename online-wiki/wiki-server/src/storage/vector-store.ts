import { QdrantClient } from '@qdrant/js-client-rest'
import { createHash } from 'crypto'

interface ChunkPayload {
  pageId: string
  chunkIndex: number
  chunkText: string
  headingPath: string
}

export class VectorStore {
  private readonly client: QdrantClient

  constructor() {
    this.client = new QdrantClient({
      url: process.env.QDRANT_URL ?? 'http://localhost:6333',
    })
  }

  private collectionName(wikiId: string): string {
    return `wiki_${wikiId.replace(/-/g, '_')}`
  }

  private pointId(pageId: string, chunkIndex: number): string {
    const hash = createHash('md5').update(`${pageId}#${chunkIndex}`).digest('hex')
    return `${hash.slice(0,8)}-${hash.slice(8,12)}-${hash.slice(12,16)}-${hash.slice(16,20)}-${hash.slice(20,32)}`
  }

  async ensureCollection(wikiId: string, vectorSize: number): Promise<void> {
    const name = this.collectionName(wikiId)
    try {
      await this.client.getCollection(name)
    } catch {
      await this.client.createCollection(name, {
        vectors: { size: vectorSize, distance: 'Cosine' },
      })
    }
  }

  async upsertChunks(
    wikiId: string,
    pageId: string,
    chunks: Array<{
      chunkIndex: number
      chunkText: string
      headingPath: string
      embedding: number[]
    }>,
  ): Promise<void> {
    if (chunks.length === 0) return

    const vectorSize = chunks[0].embedding.length
    await this.ensureCollection(wikiId, vectorSize)

    const points = chunks.map((chunk) => ({
      id: this.pointId(pageId, chunk.chunkIndex),
      vector: chunk.embedding,
      payload: {
        pageId,
        chunkIndex: chunk.chunkIndex,
        chunkText: chunk.chunkText,
        headingPath: chunk.headingPath,
      } satisfies ChunkPayload,
    }))

    await this.client.upsert(this.collectionName(wikiId), { wait: true, points })
  }

  async search(
    wikiId: string,
    queryEmbedding: number[],
    topK: number = 20,
  ): Promise<Array<{
    pageId: string
    chunkIndex: number
    chunkText: string
    score: number
  }>> {
    const name = this.collectionName(wikiId)
    try {
      const results = await this.client.search(name, {
        vector: queryEmbedding,
        limit: topK,
        with_payload: true,
      })
      return results.map((r) => {
        const payload = r.payload as unknown as ChunkPayload
        return {
          pageId: payload.pageId,
          chunkIndex: payload.chunkIndex,
          chunkText: payload.chunkText,
          score: r.score,
        }
      })
    } catch (err: unknown) {
      if ((err as { message?: string }).message?.includes('Not found')) return []
      throw err
    }
  }

  async deletePageChunks(wikiId: string, pageId: string): Promise<void> {
    const name = this.collectionName(wikiId)
    try {
      await this.client.delete(name, {
        filter: { must: [{ key: 'pageId', match: { value: pageId } }] },
      })
    } catch {
      // 集合不存在时忽略
    }
  }
}
