import { computePageWeights } from './graph-relevance'
import type { GraphEdge, WikiGraph } from './graph-store'
import type { WikiStore } from '../storage/wiki-store'

describe('computePageWeights', () => {
  const mockStore = {
    readPage: async (_wikiId: string, pageId: string) => {
      const pages: Record<string, string> = {
        'wiki/a.md': '---\nsource_file: doc1.md\n---\n# Page A',
        'wiki/b.md': '---\nsource_file: doc1.md\n---\n# Page B',
        'wiki/c.md': '---\nsource_file: doc2.md\n---\n# Page C',
      }
      return pages[pageId] ?? '# Unknown'
    },
  } as unknown as WikiStore

  it('should compute weight for direct link (signal 1)', async () => {
    const edges: GraphEdge[] = [
      { source: 'wiki/a.md', target: 'wiki/b.md', relation: '链接', sourceType: 'link' },
    ]
    const graph: WikiGraph = {
      nodes: [{ id: 'wiki/a.md', title: 'A' }, { id: 'wiki/b.md', title: 'B' }],
      edges: [],
      updatedAt: '',
    }

    const result = await computePageWeights('test', 'wiki/a.md', edges, graph, mockStore)

    expect(result[0].weight).toBe(8.0) // signal1: 3.0, signal2: 4.0 (shared doc1.md), signal4: 1.0
  })

  it('should add bidirectional bonus (signal 1)', async () => {
    const edges: GraphEdge[] = [
      { source: 'wiki/a.md', target: 'wiki/b.md', relation: '链接', sourceType: 'link' },
    ]
    const graph: WikiGraph = {
      nodes: [{ id: 'wiki/a.md', title: 'A' }, { id: 'wiki/b.md', title: 'B' }],
      edges: [
        { source: 'wiki/b.md', target: 'wiki/a.md', relation: '链接', sourceType: 'link' },
      ],
      updatedAt: '',
    }

    const result = await computePageWeights('test', 'wiki/a.md', edges, graph, mockStore)

    expect(result[0].weight).toBe(11.0) // signal1: 3.0 + 3.0, signal2: 4.0 (shared doc1.md), signal4: 1.0
  })

  it('should compute shared source_file weight (signal 2)', async () => {
    const edges: GraphEdge[] = [
      { source: 'wiki/a.md', target: 'wiki/b.md', relation: '语义', sourceType: 'llm' },
    ]
    const graph: WikiGraph = {
      nodes: [{ id: 'wiki/a.md', title: 'A' }, { id: 'wiki/b.md', title: 'B' }],
      edges: [],
      updatedAt: '',
    }

    const result = await computePageWeights('test', 'wiki/a.md', edges, graph, mockStore)

    expect(result[0].weight).toBe(5.0) // signal2: 4.0, signal4: 1.0
  })

  it('should compute Adamic-Adar weight (signal 3)', async () => {
    const edges: GraphEdge[] = [
      { source: 'wiki/a.md', target: 'wiki/c.md', relation: '链接', sourceType: 'link' },
    ]
    const graph: WikiGraph = {
      nodes: [
        { id: 'wiki/a.md', title: 'A' },
        { id: 'wiki/b.md', title: 'B' },
        { id: 'wiki/c.md', title: 'C' },
      ],
      edges: [
        { source: 'wiki/a.md', target: 'wiki/b.md', relation: '链接', sourceType: 'link' },
        { source: 'wiki/c.md', target: 'wiki/b.md', relation: '链接', sourceType: 'link' },
      ],
      updatedAt: '',
    }

    const result = await computePageWeights('test', 'wiki/a.md', edges, graph, mockStore)

    // B 是公共邻居，degree(B)=2，log(2)≈0.693
    // signal3: 1.5 * (1/0.693) ≈ 2.164
    // signal1: 3.0, signal4: 1.0, total ≈ 6.164
    expect(result[0].weight).toBeGreaterThan(6.0)
    expect(result[0].weight).toBeLessThan(7.0)
  })

  it('should handle missing source_file gracefully', async () => {
    const edges: GraphEdge[] = [
      { source: 'wiki/a.md', target: 'wiki/c.md', relation: '链接', sourceType: 'link' },
    ]
    const graph: WikiGraph = {
      nodes: [{ id: 'wiki/a.md', title: 'A' }, { id: 'wiki/c.md', title: 'C' }],
      edges: [],
      updatedAt: '',
    }

    // wiki/c.md has source_file: doc2.md, wiki/a.md has doc1.md — no shared source
    const result = await computePageWeights('test', 'wiki/a.md', edges, graph, mockStore)

    expect(result[0].weight).toBe(4.0) // signal1: 3.0, signal4: 1.0, no shared source
  })
})
