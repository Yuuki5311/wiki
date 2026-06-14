import 'dotenv/config'
import express from 'express'
import { createServer } from 'http'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'

import { wikiRouter } from './routes/wiki'
import { ingestRouter } from './routes/ingest'
import { searchRouter } from './routes/search'
import { authRouter } from './routes/auth'
import { graphRouter } from './routes/graph'

import { requireAuth } from './middleware/auth'
import { createChatServer } from './ws/chat-handler'
import { mcpRouter } from './routes/mcp'
import { requireApiKey } from './middleware/api-key'

const PORT = parseInt(process.env.PORT ?? '3000', 10)
const app = express()

app.use(helmet())
app.use(cors({ origin: process.env.ALLOWED_ORIGIN ?? '*' }))
app.use(morgan('dev'))
app.use(express.json({ limit: '10mb' }))

// 公开路由
app.use('/auth', authRouter)

// JWT 认证路由
app.use('/api/wiki', requireAuth, wikiRouter)
app.use('/api/wiki', requireAuth, ingestRouter)
app.use('/api/wiki', requireAuth, searchRouter)
app.use('/api/wiki', requireAuth, graphRouter)

// MCP 路由（机器端，API Key 认证）
app.use('/mcp', requireApiKey, mcpRouter)

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[ERROR]', err.stack)
  res.status(500).json({ error: 'Internal server error' })
})

const httpServer = createServer(app)
createChatServer(httpServer)

httpServer.listen(PORT, () => {
  console.log(`服务启动: http://localhost:${PORT}`)
  console.log(`WebSocket: ws://localhost:${PORT}/ws/chat?token=<jwt>`)
  console.log(`MCP: http://localhost:${PORT}/mcp  (X-API-Key)`)
})
