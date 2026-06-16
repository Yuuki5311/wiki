import * as path from 'path'
import type { GraphEdge } from './graph-store'

const MD_LINK = /\[([^\]]+)\]\(([^)]+)\)/g

function normalize(s: string): string {
  return s.toLowerCase().replace(/[\s\-_]/g, '')
}

export function resolveTarget(target: string, knownPages: string[]): string | null {
  // 精确匹配
  if (knownPages.includes(target)) {
    return target
  }

  // 标题归一化匹配
  const normalizedTarget = normalize(target)
  if (!normalizedTarget) return null

  for (const page of knownPages) {
    const baseName = path.basename(page, '.md')
    if (normalize(baseName) === normalizedTarget) {
      return page
    }
  }

  return null
}

export function extractLinks(pageId: string, content: string): GraphEdge[] {
  const edges: GraphEdge[] = []
  let match: RegExpExecArray | null
  const pageDir = path.dirname(pageId)

  while ((match = MD_LINK.exec(content)) !== null) {
    const href = match[2].trim()
    if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('#')) {
      continue
    }
    const withoutAnchor = href.split('#')[0]
    if (!withoutAnchor) continue

    // 将相对路径解析为基于仓库根的完整路径
    const resolved = path.posix.normalize(path.posix.join(pageDir, withoutAnchor))
    // 过滤掉解析后逃出 wiki/ 目录的路径
    if (!resolved.startsWith('wiki/')) continue

    edges.push({
      source: pageId,
      target: resolved,
      relation: '链接',
      sourceType: 'link',
    })
  }

  return edges
}
