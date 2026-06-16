import { extractLinks, resolveTarget } from './link-extractor'

describe('resolveTarget', () => {
  const knownPages = [
    'wiki/index.md',
    'wiki/getting-started.md',
    'wiki/advanced/config.md',
  ]

  it('should match by exact path', () => {
    expect(resolveTarget('wiki/index.md', knownPages)).toBe('wiki/index.md')
  })

  it('should match by normalized title', () => {
    expect(resolveTarget('Getting Started', knownPages)).toBe('wiki/getting-started.md')
    expect(resolveTarget('getting_started', knownPages)).toBe('wiki/getting-started.md')
    expect(resolveTarget('GETTINGSTARTED', knownPages)).toBe('wiki/getting-started.md')
  })

  it('should match nested file by title', () => {
    expect(resolveTarget('Config', knownPages)).toBe('wiki/advanced/config.md')
  })

  it('should return null for unknown target', () => {
    expect(resolveTarget('Unknown Page', knownPages)).toBeNull()
  })
})

describe('extractLinks with wikilinks', () => {
  const knownPages = ['wiki/index.md', 'wiki/setup.md', 'wiki/api/auth.md']

  it('should extract [[Title]] wikilink', () => {
    const content = 'See [[Setup]] for details'
    const edges = extractLinks('wiki/index.md', content, knownPages)
    expect(edges).toContainEqual({
      source: 'wiki/index.md',
      target: 'wiki/setup.md',
      relation: '链接',
      sourceType: 'link',
    })
  })

  it('should extract [[path]] wikilink', () => {
    const content = 'See [[wiki/api/auth.md]] for auth'
    const edges = extractLinks('wiki/index.md', content, knownPages)
    expect(edges).toContainEqual({
      source: 'wiki/index.md',
      target: 'wiki/api/auth.md',
      relation: '链接',
      sourceType: 'link',
    })
  })

  it('should extract [[target|alias]] wikilink', () => {
    const content = 'See [[Setup|installation guide]] here'
    const edges = extractLinks('wiki/index.md', content, knownPages)
    expect(edges).toContainEqual({
      source: 'wiki/index.md',
      target: 'wiki/setup.md',
      relation: '链接',
      sourceType: 'link',
    })
  })

  it('should ignore unknown wikilinks', () => {
    const content = '[[Unknown Page]] does not exist'
    const edges = extractLinks('wiki/index.md', content, knownPages)
    expect(edges.length).toBe(0)
  })

  it('should handle mixed markdown and wikilinks', () => {
    const content = '[MD Link](setup.md) and [[Setup]] both work'
    const edges = extractLinks('wiki/index.md', content, knownPages)
    expect(edges.length).toBe(2)
    expect(edges.some(e => e.target === 'wiki/setup.md')).toBe(true)
  })

  it('should work correctly when called multiple times', () => {
    const knownPages = ['wiki/index.md', 'wiki/setup.md']
    const content = '[[Setup]] and some text'

    const edges1 = extractLinks('wiki/index.md', content, knownPages)
    const edges2 = extractLinks('wiki/index.md', content, knownPages)

    expect(edges1.length).toBe(1)
    expect(edges2.length).toBe(1)
    expect(edges1[0].target).toBe('wiki/setup.md')
    expect(edges2[0].target).toBe('wiki/setup.md')
  })
})
