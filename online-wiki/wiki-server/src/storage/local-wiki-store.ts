import * as fs from 'fs/promises'
import * as path from 'path'
import type { WikiStore } from './wiki-store'

export class LocalFileWikiStore implements WikiStore {
  constructor(private readonly basePath: string) {}

  private resolve(wikiId: string, pageId: string): string {
    return path.join(this.basePath, wikiId, pageId)
  }

  async readPage(wikiId: string, pageId: string): Promise<string> {
    try {
      return await fs.readFile(this.resolve(wikiId, pageId), 'utf-8')
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`NoSuchKey: ${pageId}`)
      }
      throw err
    }
  }

  async writePage(wikiId: string, pageId: string, content: string): Promise<void> {
    const filePath = this.resolve(wikiId, pageId)
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, content, 'utf-8')
  }

  async deletePage(wikiId: string, pageId: string): Promise<void> {
    try {
      await fs.unlink(this.resolve(wikiId, pageId))
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    }
  }

  async listPages(wikiId: string): Promise<string[]> {
    const wikiRoot = path.join(this.basePath, wikiId)
    const rawRoot = path.join(wikiRoot, 'raw')
    const pages: string[] = []

    async function walk(dir: string) {
      let entries: string[]
      try {
        entries = await fs.readdir(dir)
      } catch {
        return
      }
      for (const entry of entries) {
        const fullPath = path.join(dir, entry)
        const stat = await fs.stat(fullPath)
        if (stat.isDirectory()) {
          if (fullPath === rawRoot) continue  // 排除原文件目录
          await walk(fullPath)
        } else if (entry.endsWith('.md')) {
          pages.push(path.relative(wikiRoot, fullPath).replace(/\\/g, '/'))
        }
      }
    }

    await walk(wikiRoot)
    return pages
  }

  async writeRawFile(wikiId: string, fileName: string, content: string): Promise<void> {
    const filePath = path.join(this.basePath, wikiId, 'raw', fileName)
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, content, 'utf-8')
  }

  async readRawFile(wikiId: string, fileName: string): Promise<string> {
    const filePath = path.join(this.basePath, wikiId, 'raw', fileName)
    try {
      return await fs.readFile(filePath, 'utf-8')
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`NoSuchKey: raw/${fileName}`)
      }
      throw err
    }
  }

  async listRawFiles(wikiId: string): Promise<string[]> {
    const rawRoot = path.join(this.basePath, wikiId, 'raw')
    try {
      const entries = await fs.readdir(rawRoot)
      return entries.filter(e => !e.startsWith('.'))
    } catch {
      return []
    }
  }
}
