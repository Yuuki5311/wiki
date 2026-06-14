import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3'
import type { WikiStore } from './wiki-store'

interface S3WikiStoreConfig {
  region: string
  accessKeyId: string
  secretAccessKey: string
  bucket: string
  endpoint?: string
}

export class S3WikiStore implements WikiStore {
  private readonly s3: S3Client
  private readonly bucket: string

  constructor(config: S3WikiStoreConfig) {
    this.s3 = new S3Client({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      ...(config.endpoint && {
        endpoint: config.endpoint,
        forcePathStyle: true,
      }),
    })
    this.bucket = config.bucket
  }

  private toKey(wikiId: string, pageId: string): string {
    return `${wikiId}/${pageId}`
  }

  async readPage(wikiId: string, pageId: string): Promise<string> {
    const key = this.toKey(wikiId, pageId)
    try {
      const response = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }))
      return await response.Body!.transformToString('utf-8')
    } catch (err: unknown) {
      if ((err as { name?: string }).name === 'NoSuchKey') {
        throw new Error(`NoSuchKey: ${key}`)
      }
      throw err
    }
  }

  async writePage(wikiId: string, pageId: string, content: string): Promise<void> {
    await this.s3.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: this.toKey(wikiId, pageId),
      Body: content,
      ContentType: 'text/markdown; charset=utf-8',
    }))
  }

  async deletePage(wikiId: string, pageId: string): Promise<void> {
    await this.s3.send(new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: this.toKey(wikiId, pageId),
    }))
  }

  async listPages(wikiId: string): Promise<string[]> {
    const pages: string[] = []
    let continuationToken: string | undefined

    do {
      const response = await this.s3.send(new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: `${wikiId}/`,
        MaxKeys: 1000,
        ContinuationToken: continuationToken,
      }))

      for (const obj of response.Contents ?? []) {
        if (!obj.Key || !obj.Key.endsWith('.md')) continue
        const rel = obj.Key.slice(`${wikiId}/`.length)
        if (rel.startsWith('raw/')) continue  // 排除原文件目录
        pages.push(rel)
      }

      continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined
    } while (continuationToken)

    return pages
  }

  async writeRawFile(wikiId: string, fileName: string, content: string): Promise<void> {
    await this.s3.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: `${wikiId}/raw/${fileName}`,
      Body: content,
      ContentType: 'text/markdown; charset=utf-8',
    }))
  }

  async readRawFile(wikiId: string, fileName: string): Promise<string> {
    const key = `${wikiId}/raw/${fileName}`
    try {
      const response = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }))
      return await response.Body!.transformToString('utf-8')
    } catch (err: unknown) {
      if ((err as { name?: string }).name === 'NoSuchKey') {
        throw new Error(`NoSuchKey: ${key}`)
      }
      throw err
    }
  }

  async listRawFiles(wikiId: string): Promise<string[]> {
    const files: string[] = []
    let continuationToken: string | undefined
    const prefix = `${wikiId}/raw/`

    do {
      const response = await this.s3.send(new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: prefix,
        MaxKeys: 1000,
        ContinuationToken: continuationToken,
      }))

      for (const obj of response.Contents ?? []) {
        if (!obj.Key) continue
        files.push(obj.Key.slice(prefix.length))
      }

      continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined
    } while (continuationToken)

    return files
  }
}
