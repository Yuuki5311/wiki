import { useState } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { Loader2, Lock } from 'lucide-react'

export function LoginPage() {
  const [password, setPassword] = useState('')
  const { login, loading, error } = useAuthStore()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password.trim()) return
    await login(password)
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-8 w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 bg-blue-600/20 rounded-full flex items-center justify-center mb-3">
            <Lock size={22} className="text-blue-400" />
          </div>
          <h1 className="text-lg font-semibold text-white">Wiki 知识库</h1>
          <p className="text-sm text-gray-400 mt-1">请输入访问密码</p>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <label htmlFor="wiki-password" className="sr-only">访问密码</label>
          <input
            id="wiki-password"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="输入密码"
            autoFocus
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
          {error && (
            <p className="text-xs text-red-400">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading || !password.trim()}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded text-sm text-white font-medium flex items-center justify-center gap-2 transition-colors"
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            进入
          </button>
        </form>
      </div>
    </div>
  )
}
