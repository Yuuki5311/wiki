import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

declare global {
  namespace Express {
    interface Request {
      user?: { userId: string; email: string }
    }
  }
}

const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET) throw new Error('环境变量 JWT_SECRET 未设置')

export function signToken(payload: { userId: string; email: string }): string {
  return jwt.sign(payload, JWT_SECRET!, {
    expiresIn: '7d',
    algorithm: 'HS256',
  })
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: '未提供认证 token' })
    return
  }

  const token = authHeader.slice(7)

  try {
    const payload = jwt.verify(token, JWT_SECRET!) as { userId: string; email: string }
    req.user = { userId: payload.userId, email: payload.email }
    next()
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      res.status(401).json({ error: 'token 已过期，请重新登录' })
    } else {
      res.status(401).json({ error: '无效的 token' })
    }
  }
}
