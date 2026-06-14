import { create } from 'zustand'
import { loginWithPassword } from '@/api/auth-api'

const TOKEN_KEY = 'wiki_token'

interface AuthState {
  token: string | null
  error: string | null
  loading: boolean
  login: (password: string) => Promise<void>
  logout: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  token: (() => { try { return localStorage.getItem(TOKEN_KEY) } catch { return null } })(),
  error: null,
  loading: false,

  login: async (password: string) => {
    set({ loading: true, error: null })
    try {
      const token = await loginWithPassword(password)
      localStorage.setItem(TOKEN_KEY, token)
      set({ token, loading: false })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : '未知错误', loading: false })
    }
  },

  logout: () => {
    localStorage.removeItem(TOKEN_KEY)
    set({ token: null, error: null })
  },
}))

export function getToken(): string | null {
  return useAuthStore.getState().token
}
