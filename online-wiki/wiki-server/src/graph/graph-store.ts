import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3'
import { withDistributedLock } from '../lock/distributed-lock'

export interface GraphNode {
  id: string
  title: string
}

export interface GraphEdge {
  source: string
  target: string
  relation: string
  sourceType: 'llm' | 'link'
}

export interface WikiGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
  updatedAt: string
}

function emptyGraph(): WikiGraph {
  return { nodes: [], edges: [], updatedAt: new Date().toISOString() }
}

export class GraphStore {
  private readonly s3: S3Client
  private readonly bucket: string

  constructor() {
    this.s3 = new S3Client({
      region: process.env.S3_REGION ?? 'us-east-1',
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY!,
        secretAccessKey: process.env.S3_SECRET_KEY!,
      },
      ...(process.env.S3_ENDPOINT && {
        endpoint: process.env.S3_ENDPOINT,
        forcePathStyle: true,
      }),
    })
    this.bucket = process.env.S3_BUCKET!
  }

  private key(wikiId: string): string {
    return `${wikiId}/graph.json`
  }

  async readGraph(wikiId: string): Promise<WikiGraph> {
    try {
      const res = await this.s3.send(new GetObjectCommand({
        Bucket: this.bucket,
        Key: this.key(wikiId),
      }))
      const raw = await res.Body!.transformToString('utf-8')
      return JSON.parse(raw) as WikiGraph
    } catch (err: unknown) {
      if ((err as { name?: string }).name === 'NoSuchKey') return emptyGraph()
      throw err
    }
  }

  private async writeGraph(wikiId: string, graph: WikiGraph): Promise<void> {
    await this.s3.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: this.key(wikiId),
      Body: JSON.stringify(graph, null, 2),
      ContentType: 'application/json',
    }))
  }

  async updatePageInGraph(
    wikiId: string,
    pageId: string,
    title: string,
    newEdges: GraphEdge[],
  ): Promise<void> {
    await withDistributedLock(wikiId, async () => {
      const graph = await this.readGraph(wikiId)

      const nodeIdx = graph.nodes.findIndex(n => n.id === pageId)
      if (nodeIdx >= 0) {
        graph.nodes[nodeIdx].title = title
      } else {
        graph.nodes.push({ id: pageId, title })
      }

      graph.edges = graph.edges.filter(e => e.source !== pageId)
      const seen = new Set<string>()
      for (const edge of newEdges) {
        const key = `${edge.source}|${edge.target}|${edge.sourceType}`
        if (!seen.has(key)) {
          seen.add(key)
          graph.edges.push(edge)
        }
      }
      graph.updatedAt = new Date().toISOString()

      await this.writeGraph(wikiId, graph)
    }, 'graph')
  }

  async removePageFromGraph(wikiId: string, pageId: string): Promise<void> {
    await withDistributedLock(wikiId, async () => {
      const graph = await this.readGraph(wikiId)
      graph.nodes = graph.nodes.filter(n => n.id !== pageId)
      graph.edges = graph.edges.filter(e => e.source !== pageId && e.target !== pageId)
      graph.updatedAt = new Date().toISOString()
      await this.writeGraph(wikiId, graph)
    }, 'graph')
  }

  async writeFullGraph(wikiId: string, graph: WikiGraph): Promise<void> {
    await withDistributedLock(wikiId, async () => {
      await this.writeGraph(wikiId, { ...graph, updatedAt: new Date().toISOString() })
    }, 'graph')
  }
}
