import { Router } from 'express'
import { signToken } from '../middleware/auth'

export const authRouter = Router()

authRouter.post('/login', (req, res) => {
  const { password } = req.body as { password?: string }

  if (!password) {
    res.status(400).json({ error: '缺少 password' })
    return
  }

  const expected = process.env.WIKI_PASSWORD
  if (!expected || password !== expected) {
    res.status(401).json({ error: '密码错误' })
    return
  }

  const token = signToken({ userId: 'wiki-user', email: 'wiki@internal' })
  res.json({ token, expiresIn: 7 * 24 * 60 * 60 })
})
