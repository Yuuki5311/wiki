import type { Request, Response, NextFunction } from 'express'

export function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const key = req.headers['x-api-key']
  if (!key || key !== process.env.WIKI_MCP_API_KEY) {
    res.status(401).json({ error: 'Invalid API key' })
    return
  }
  next()
}
