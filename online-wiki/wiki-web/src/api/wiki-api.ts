import { API_BASE, WIKI_ID } from '@/config'
import { getToken, useAuthStore } from '@/stores/auth-store'

function authHeaders(): HeadersInit {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function handleResponse(res: Response, errorMsg: string): Response {
  if (res.status === 401) {
    useAuthStore.getState().logout()
    throw new Error('登录已过期，请重新登录')
  }
  if (!res.ok) throw new Error(errorMsg)
  return res
}

export interface PageSummary {
  path: string
  title: string
}

export interface SearchResult {
  path: string
  title: string
  excerpt: string
  score: number
}

export async function listPages(): Promise<PageSummary[]> {
  const res = await fetch(`${API_BASE}/${WIKI_ID}/pages`, { headers: authHeaders() })
  handleResponse(res, '获取页面列表失败')
  const data = await res.json() as { pages: string[] }
  return data.pages.map(path => ({
    path,
    title: path.replace(/^wiki\//, '').replace(/\.md$/, ''),
  }))
}

export async function readPage(pageId: string): Promise<string> {
  const res = await fetch(`${API_BASE}/${WIKI_ID}/pages/${encodeURIComponent(pageId)}`, { headers: authHeaders() })
  handleResponse(res, `读取页面失败: ${pageId}`)
  const data = await res.json() as { content: string }
  return data.content
}

export async function savePage(pageId: string, content: string): Promise<void> {
  const res = await fetch(`${API_BASE}/${WIKI_ID}/pages/${encodeURIComponent(pageId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ content }),
  })
  handleResponse(res, '保存页面失败')
}

export async function searchPages(query: string): Promise<SearchResult[]> {
  const res = await fetch(`${API_BASE}/${WIKI_ID}/search?q=${encodeURIComponent(query)}`, { headers: authHeaders() })
  handleResponse(res, '搜索失败')
  const data = await res.json() as { results: SearchResult[] }
  return data.results
}

export async function submitIngest(fileName: string, content: string): Promise<string> {
  const res = await fetch(`${API_BASE}/${WIKI_ID}/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ sourceFileName: fileName, sourceContent: content }),
  })
  handleResponse(res, '提交失败')
  const data = await res.json() as { jobId: string }
  return data.jobId
}

export type JobStatus =
  | { status: 'queued' }
  | { status: 'processing'; step: string }
  | { status: 'done'; pagesWritten: string[] }
  | { status: 'error'; error: string }

export async function getJobStatus(jobId: string): Promise<JobStatus> {
  const res = await fetch(`${API_BASE}/${WIKI_ID}/jobs/${jobId}`, { headers: authHeaders() })
  handleResponse(res, '查询任务状态失败')
  return res.json() as Promise<JobStatus>
}

export async function deletePage(pageId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/${WIKI_ID}/pages/${encodeURIComponent(pageId)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  handleResponse(res, '删除页面失败')
}

export async function listSourceFiles(): Promise<string[]> {
  const res = await fetch(`${API_BASE}/${WIKI_ID}/sources`, { headers: authHeaders() })
  handleResponse(res, '获取原文件列表失败')
  const data = await res.json() as { files: string[] }
  return data.files
}

export async function getSourceFile(fileName: string): Promise<string> {
  const res = await fetch(`${API_BASE}/${WIKI_ID}/sources/${encodeURIComponent(fileName)}`, { headers: authHeaders() })
  handleResponse(res, `读取原文件失败: ${fileName}`)
  const data = await res.json() as { content: string }
  return data.content
}
