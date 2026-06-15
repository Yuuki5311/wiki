import type { GraphEdge } from './graph-store'

describe('GraphEdge', () => {
  it('should allow weight field', () => {
    const edge: GraphEdge = {
      source: 'wiki/a.md',
      target: 'wiki/b.md',
      relation: '链接',
      sourceType: 'link',
      weight: 5.0,
    }
    expect(edge.weight).toBe(5.0)
  })

  it('should allow missing weight field', () => {
    const edge: GraphEdge = {
      source: 'wiki/a.md',
      target: 'wiki/b.md',
      relation: '链接',
      sourceType: 'link',
    }
    expect(edge.weight).toBeUndefined()
  })
})
