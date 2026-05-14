import { useEffect, useState } from 'react'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import { AppToaster } from './components/AppToaster'
import { AuthScreen } from './components/AuthScreen'
import { ChatShell } from './components/ChatShell'
import { NotFoundPage } from './components/NotFoundPage'

function isHomePath(pathname: string): boolean {
  const normalized = pathname.replace(/\/+$/, '') || '/'
  return normalized === '/'
}

function Gate() {
  const { loading, user } = useAuth()
  if (loading) {
    return (
      <div className="flex h-dvh items-center justify-center bg-[var(--sc-page)] text-[var(--sc-text)]">
        <div className="flex flex-col items-center gap-3">
          <div
            className="h-10 w-10 animate-spin rounded-full border-2 border-[var(--sc-orange)] border-t-transparent"
            aria-hidden
          />
          <p className="text-sm text-[var(--sc-text-muted)]">Chargement de SOBOLO CHAT…</p>
        </div>
      </div>
    )
  }
  if (!user) return <AuthScreen />
  return <ChatShell />
}

export default function App() {
  const [pathname, setPathname] = useState(() => window.location.pathname)

  useEffect(() => {
    const sync = () => setPathname(window.location.pathname)
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [])

  return (
    <ThemeProvider>
      <AppToaster />
      {!isHomePath(pathname) ? (
        <NotFoundPage />
      ) : (
        <AuthProvider>
          <Gate />
        </AuthProvider>
      )}
    </ThemeProvider>
  )
}
