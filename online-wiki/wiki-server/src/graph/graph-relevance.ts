import type { GraphEdge, WikiGraph } from './graph-store'
import type { WikiStore } from '../storage/wiki-store'

function extractSourceFiles(content: string): string[] {
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return []
  const frontmatter = match[1]
  const sourceFileMatch = frontmatter.match(/^source_file:\s*(.+)$/m)
  if (!sourceFileMatch) return []
  return sourceFileMatch[1].split(',').map(s => s.trim()).filter(Boolean)
}

function getDegree(nodeId: string, edges: GraphEdge[]): number {
  return edges.filter(e => e.source === nodeId || e.target === nodeId).length
}

function getNeighbors(nodeId: string, edges: GraphEdge[]): Set<string> {
  const neighbors = new Set<string>()
  for (const edge of edges) {
    if (edge.source === nodeId) neighbors.add(edge.target)
    if (edge.target === nodeId) neighbors.add(edge.source)
  }
  return neighbors
}

export async function computePageWeights(
  wikiId: string,
  pageId: string,
  edges: GraphEdge[],
  graph: WikiGraph,
  store: WikiStore,
): Promise<GraphEdge[]> {
  const result: GraphEdge[] = []

  for (const edge of edges) {
    let weight = 0

    // Signal 1: 直接链接
    if (edge.sourceType === 'link') {
      weight += 3.0
      const hasBidirectional = graph.edges.some(
        e => e.source === edge.target && e.target === edge.source && e.sourceType === 'link'
      )
      if (hasBidirectional) {
        weight += 3.0
      }
    }

    // Signal 2: 共享原文件
    try {
      const [sourceContent, targetContent] = await Promise.all([
        store.readPage(wikiId, edge.source),
        store.readPage(wikiId, edge.target),
      ])
      const sourceSources = new Set(extractSourceFiles(sourceContent))
      const targetSources = new Set(extractSourceFiles(targetContent))
      const commonCount = [...sourceSources].filter(s => targetSources.has(s)).length
      weight += commonCount * 4.0
    } catch {
      // 页面不存在或读取失败，signal2 贡献 0
    }

    // Signal 3: Adamic-Adar
    const sourceNeighbors = getNeighbors(edge.source, graph.edges)
    const targetNeighbors = getNeighbors(edge.target, graph.edges)
    let adamicAdar = 0
    for (const neighbor of sourceNeighbors) {
      if (targetNeighbors.has(neighbor)) {
        const degree = getDegree(neighbor, graph.edges)
        if (degree >= 2) {
          adamicAdar += 1 / Math.log(degree)
        }
      }
    }
    weight += adamicAdar * 1.5

    // Signal 4: 类型亲和（固定）
    weight += 1.0

    result.push({ ...edge, weight })
  }

  return result
}
