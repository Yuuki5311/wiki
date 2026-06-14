import { API_BASE } from '@/config'

const AUTH_BASE = API_BASE.replace('/api/wiki', '/auth')

export async function loginWithPassword(password: string): Promise<string> {
  const res = await fetch(`${AUTH_BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  })
  if (res.status === 401) throw new Error('密码错误')
  if (!res.ok) throw new Error('登录失败，请稍后重试')
  const data = await res.json() as Record<string, unknown>
  if (typeof data.token !== 'string' || !data.token) {
    throw new Error('服务器响应格式错误')
  }
  return data.token
}
