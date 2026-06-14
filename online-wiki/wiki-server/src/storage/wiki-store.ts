/**
 * WikiStore：Wiki 文件存储的抽象接口。
 * 来源：online-03-S3存储层实现，直接复制接口定义。
 */
export interface WikiStore {
  readPage(wikiId: string, pageId: string): Promise<string>
  writePage(wikiId: string, pageId: string, content: string): Promise<void>
  deletePage(wikiId: string, pageId: string): Promise<void>
  listPages(wikiId: string): Promise<string[]>
  writeRawFile(wikiId: string, fileName: string, content: string): Promise<void>
  readRawFile(wikiId: string, fileName: string): Promise<string>
  listRawFiles(wikiId: string): Promise<string[]>
}

let _store: WikiStore | null = null

export function getWikiStore(): WikiStore {
  if (_store) return _store

  const backend = process.env.STORAGE_BACKEND ?? 'local'

  if (backend === 's3') {
    const { S3WikiStore } = require('./s3-wiki-store')
    _store = new S3WikiStore({
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION ?? 'us-east-1',
      accessKeyId: process.env.S3_ACCESS_KEY!,
      secretAccessKey: process.env.S3_SECRET_KEY!,
      bucket: process.env.S3_BUCKET!,
    })
  } else {
    const { LocalFileWikiStore } = require('./local-wiki-store')
    _store = new LocalFileWikiStore(process.env.LOCAL_STORAGE_PATH ?? './data')
  }

  return _store!
}
