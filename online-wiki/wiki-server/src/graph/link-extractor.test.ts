import { resolveTarget } from './link-extractor'

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
