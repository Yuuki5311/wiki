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

export interface GraphNode {
  id: string
  title: string
}

export interface GraphEdge {
  source: string
  target: string
  relation: string
  sourceType: 'llm' | 'link'
}

export interface WikiGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
  updatedAt: string
}

export async function fetchGraph(): Promise<WikiGraph> {
  const res = await fetch(`${API_BASE}/${WIKI_ID}/graph`, { headers: authHeaders() })
  handleResponse(res, '获取图谱失败')
  return res.json() as Promise<WikiGraph>
}

export async function saveGraph(graph: WikiGraph): Promise<void> {
  const res = await fetch(`${API_BASE}/${WIKI_ID}/graph`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ nodes: graph.nodes, edges: graph.edges }),
  })
  handleResponse(res, '保存图谱失败')
}
