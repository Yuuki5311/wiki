import { WebSocket, WebSocketServer } from 'ws'
import { IncomingMessage } from 'http'
import jwt from 'jsonwebtoken'
import { getWikiStore } from '../storage/wiki-store'
import { VectorStore } from '../storage/vector-store'
import { fetchEmbedding } from '../services/embedding-service'

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret'

interface ChatMessage {
  type: 'chat'
  messageId: string
  wikiId: string
  text: string
  history?: Array<{ role: 'user' | 'assistant'; content: string }>
}

type ServerMessage =
  | { type: 'token'; messageId: string; token: string }
  | { type: 'done'; messageId: string; sources: string[] }
  | { type: 'error'; messageId: string; error: string }
  | { type: 'connected'; userId: string }

function send(ws: WebSocket, msg: ServerMessage) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg))
  }
}

function authenticateWsRequest(req: IncomingMessage): { userId: string; email: string } | null {
  try {
    const url = new URL(req.url ?? '', 'http://localhost')
    const token = url.searchParams.get('token')
    if (!token) return null
    const payload = jwt.verify(token, JWT_SECRET) as { userId: string; email: string }
    return payload
  } catch {
    return null
  }
}

async function findRelevantPages(
  wikiId: string,
  query: string,
  topK: number = 5,
): Promise<Array<{ pageId: string; content: string }>> {
  const store = getWikiStore()
  const vectorStore = new VectorStore()
  const results: Array<{ pageId: string; content: string }> = []

  if (process.env.OPENAI_API_KEY) {
    try {
      const queryEmbedding = await fetchEmbedding(query, {
        apiKey: process.env.OPENAI_API_KEY ?? 'ollama',
        model: process.env.EMBEDDING_MODEL ?? 'text-embedding-3-small',
      })
      const vectorResults = await vectorStore.search(wikiId, queryEmbedding, topK * 2)

      const seen = new Set<string>()
      for (const r of vectorResults) {
        if (!seen.has(r.pageId)) {
          seen.add(r.pageId)
          try {
            const content = await store.readPage(wikiId, r.pageId)
            results.push({ pageId: r.pageId, content })
          } catch {
            // page removed but vector index not updated
          }
        }
        if (results.length >= topK) break
      }
    } catch (err) {
      console.warn('[chat] 向量搜索失败，降级到关键词搜索:', err)
    }
  }

  if (results.length < topK) {
    try {
      const indexContent = await store.readPage(wikiId, 'wiki/index.md')
      const queryWords = query.toLowerCase().split(/\s+/)
      const lines = indexContent.split('\n')
      for (const line of lines) {
        const lowerLine = line.toLowerCase()
        if (queryWords.some(w => lowerLine.includes(w))) {
          const match = line.match(/\(([^)]+\.md)\)/)
          if (match) {
            const pageId = match[1]
            if (!results.find(r => r.pageId === pageId)) {
              try {
                const content = await store.readPage(wikiId, pageId)
                results.push({ pageId, content })
              } catch {
                // skip
              }
            }
          }
        }
        if (results.length >= topK) break
      }
    } catch {
      // index.md not found
    }
  }

  return results.slice(0, topK)
}

async function streamAnswer(
  ws: WebSocket,
  messageId: string,
  query: string,
  context: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  sources: string[],
): Promise<void> {
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) {
    send(ws, { type: 'error', messageId, error: '未配置 DEEPSEEK_API_KEY' })
    return
  }

  const messages = [
    {
      role: 'system' as const,
      content: `你是一个知识库助手。根据以下 Wiki 页面内容回答用户的问题。
回答要准确、简洁，并标注引用的来源页面。

可参考的 Wiki 页面：
${context}`,
    },
    ...history,
    { role: 'user' as const, content: query },
  ]

  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.LLM_MODEL ?? 'deepseek-chat',
      max_tokens: 2048,
      stream: true,
      messages,
    }),
  })

  if (!response.ok || !response.body) {
    const body = await response.text()
    send(ws, { type: 'error', messageId, error: `LLM 调用失败: ${body}` })
    return
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6)
      if (data === '[DONE]') break

      try {
        const event = JSON.parse(data) as {
          choices: Array<{ delta?: { content?: string } }>
        }
        const token = event.choices[0]?.delta?.content ?? ''
        if (token) {
          send(ws, { type: 'token', messageId, token })
        }
      } catch {
        // skip malformed SSE line
      }
    }
  }

  send(ws, { type: 'done', messageId, sources })
}

export function createChatServer(httpServer: import('http').Server) {
  const wss = new WebSocketServer({
    server: httpServer,
    path: '/ws/chat',
  })

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const user = authenticateWsRequest(req)
    if (!user) {
      ws.send(JSON.stringify({ type: 'error', error: '未授权，请提供有效的 token' }))
      ws.close(1008, 'Unauthorized')
      return
    }

    console.log(`[ws] 用户 ${user.userId} 已连接`)
    send(ws, { type: 'connected', userId: user.userId })

    ws.on('message', async (raw) => {
      let msg: ChatMessage
      try {
        msg = JSON.parse(raw.toString()) as ChatMessage
      } catch {
        send(ws, { type: 'error', messageId: '', error: '消息格式错误，必须是 JSON' })
        return
      }

      if (msg.type !== 'chat') {
        send(ws, { type: 'error', messageId: msg.messageId, error: `未知消息类型: ${msg.type}` })
        return
      }

      console.log(`[ws] ${user.userId} 问: ${msg.text.slice(0, 50)}...`)

      try {
        const relevantPages = await findRelevantPages(msg.wikiId, msg.text)

        if (relevantPages.length === 0) {
          send(ws, { type: 'token', messageId: msg.messageId, token: '未找到相关 Wiki 页面。请先摄入一些文档。' })
          send(ws, { type: 'done', messageId: msg.messageId, sources: [] })
          return
        }

        const context = relevantPages
          .map(p => `=== ${p.pageId} ===\n${p.content}`)
          .join('\n\n')
        const sources = relevantPages.map(p => p.pageId)

        await streamAnswer(ws, msg.messageId, msg.text, context, msg.history ?? [], sources)
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        console.error(`[ws] 聊天处理失败:`, errorMsg)
        send(ws, { type: 'error', messageId: msg.messageId, error: errorMsg })
      }
    })

    ws.on('close', () => {
      console.log(`[ws] 用户 ${user.userId} 已断开`)
    })

    ws.on('error', (err) => {
      console.error(`[ws] 连接错误 (${user.userId}):`, err.message)
    })
  })

  console.log(`WebSocket 聊天服务已启动: ws://localhost/ws/chat`)
  return wss
}
