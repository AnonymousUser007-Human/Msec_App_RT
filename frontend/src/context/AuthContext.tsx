import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { getJson, postJson } from '../lib/api'
import type { User } from '../lib/types'

const TOKEN_KEY = 'sobolo_chat_token'

type AuthState = {
  token: string | null
  user: User | null
  loading: boolean
  error: string | null
  login: (identifier: string, password: string) => Promise<void>
  register: (payload: { name: string; password: string; phone?: string; email?: string }) => Promise<void>
  logout: () => void
  clearError: () => void
}

const AuthContext = createContext<AuthState | null>(null)

async function fetchMe(token: string): Promise<User> {
  return getJson<User>('/api/auth/me', token)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY))
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function boot() {
      if (!token) {
        setUser(null)
        setLoading(false)
        return
      }
      try {
        const me = await fetchMe(token)
        if (!cancelled) setUser(me)
      } catch {
        if (!cancelled) {
          setUser(null)
          setToken(null)
          localStorage.removeItem(TOKEN_KEY)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void boot()
    return () => {
      cancelled = true
    }
  }, [token])

  const loginRequest = useCallback(async (identifier: string, password: string) => {
    const trimmed = identifier.trim()
    const body =
      trimmed.includes('@') ? { email: trimmed.toLowerCase(), password } : { phone: trimmed, password }
    const res = await postJson<{ token: string; user: User }>('/api/auth/login', body)
    localStorage.setItem(TOKEN_KEY, res.token)
    setToken(res.token)
    setUser(res.user)
  }, [])

  const registerRequest = useCallback(async (payload: { name: string; password: string; phone?: string; email?: string }) => {
    const res = await postJson<{ token: string; user: User }>('/api/auth/register', {
      name: payload.name.trim(),
      password: payload.password,
      ...(payload.phone?.trim() ? { phone: payload.phone.trim() } : {}),
      ...(payload.email?.trim() ? { email: payload.email.trim().toLowerCase() } : {}),
    })
    localStorage.setItem(TOKEN_KEY, res.token)
    setToken(res.token)
    setUser(res.user)
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    setToken(null)
    setUser(null)
  }, [])

  const clearError = useCallback(() => setError(null), [])

  const login = useCallback(
    async (identifier: string, password: string) => {
      setError(null)
      try {
        await loginRequest(identifier, password)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Connexion impossible')
        throw e
      }
    },
    [loginRequest],
  )

  const register = useCallback(
    async (payload: { name: string; password: string; phone?: string; email?: string }) => {
      setError(null)
      try {
        await registerRequest(payload)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Inscription impossible')
        throw e
      }
    },
    [registerRequest],
  )

  const value = useMemo<AuthState>(
    () => ({
      token,
      user,
      loading,
      error,
      login,
      register,
      logout,
      clearError,
    }),
    [token, user, loading, error, login, register, logout, clearError],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth doit être utilisé dans AuthProvider')
  return ctx
}
