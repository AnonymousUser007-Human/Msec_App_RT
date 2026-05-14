import { useAuth } from '../context/AuthContext'
import { useState, type FormEvent } from 'react'
import { ThemeToggle } from './ThemeToggle'

const LOGO_SRC = '/logo.png'

export function AuthScreen() {
  const { login, register, error, clearError } = useAuth()
  const [mode, setMode] = useState<'login' | 'register'>('login')

  const [identifier, setIdentifier] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [pending, setPending] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [logoSrc, setLogoSrc] = useState(LOGO_SRC)

  async function onLogin(e: FormEvent) {
    e.preventDefault()
    setLocalError(null)
    clearError()
    setPending(true)
    try {
      await login(identifier, password)
    } catch {
      /* erreur déjà dans contexte */
    } finally {
      setPending(false)
    }
  }

  async function onRegister(e: FormEvent) {
    e.preventDefault()
    setLocalError(null)
    clearError()
    if (!phone.trim() && !email.trim()) {
      setLocalError('Renseignez un numéro ou un email.')
      return
    }
    setPending(true)
    try {
      await register({
        name,
        password,
        ...(phone.trim() ? { phone: phone.trim() } : {}),
        ...(email.trim() ? { email: email.trim() } : {}),
      })
    } catch {
      /* contexte */
    } finally {
      setPending(false)
    }
  }

  const displayError = localError ?? error

  return (
    <div className="relative min-h-dvh bg-[var(--sc-page)] text-[var(--sc-text)]">
      <div className="absolute right-[max(1rem,env(safe-area-inset-right))] top-[max(1rem,env(safe-area-inset-top))] z-10">
        <ThemeToggle />
      </div>

      <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-16">
        <header className="mb-10 text-center">
          <div className="mx-auto mb-5 h-20 w-20 overflow-hidden rounded-full border border-[var(--sc-border)] bg-[var(--sc-elevated)] shadow-sm">
            <img
              src={logoSrc}
              alt=""
              width={80}
              height={80}
              className="h-full w-full object-cover"
              onError={() => setLogoSrc('/logo.svg')}
            />
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--sc-text-muted)]">Messagerie temps réel</p>
          <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-[var(--sc-text)] sm:text-4xl">SOBOLO CHAT</h1>
          <p className="mt-2 text-sm text-[var(--sc-text-muted)]">Discutez simplement, en direct.</p>
        </header>

        <div className="rounded-3xl border border-[var(--sc-border)] bg-[var(--sc-elevated)] p-6 shadow-md">
          <div className="mb-6 flex rounded-2xl border border-[var(--sc-border)] bg-[var(--sc-muted-bg)] p-1">
            <button
              type="button"
              className={`flex-1 rounded-xl py-2.5 text-sm font-medium transition ${
                mode === 'login' ? 'bg-[var(--sc-elevated)] text-[var(--sc-text)] shadow-sm' : 'text-[var(--sc-text-muted)] hover:text-[var(--sc-text)]'
              }`}
              onClick={() => {
                setMode('login')
                clearError()
                setLocalError(null)
              }}
            >
              Connexion
            </button>
            <button
              type="button"
              className={`flex-1 rounded-xl py-2.5 text-sm font-medium transition ${
                mode === 'register' ? 'bg-[var(--sc-elevated)] text-[var(--sc-text)] shadow-sm' : 'text-[var(--sc-text-muted)] hover:text-[var(--sc-text)]'
              }`}
              onClick={() => {
                setMode('register')
                clearError()
                setLocalError(null)
              }}
            >
              Inscription
            </button>
          </div>

          {displayError ? (
            <div
              className="mb-4 rounded-xl border px-3 py-2 text-sm"
              style={{
                borderColor: 'var(--sc-error-border)',
                backgroundColor: 'var(--sc-error-bg)',
                color: 'var(--sc-error-text)',
              }}
              role="alert"
            >
              {displayError}
            </div>
          ) : null}

          {mode === 'login' ? (
            <form className="space-y-4" onSubmit={onLogin}>
              <label className="block text-sm font-medium text-[var(--sc-text)]">
                Téléphone ou email
                <input
                  className="mt-1.5 w-full rounded-xl border border-[var(--sc-border)] bg-[var(--sc-input-bg)] px-4 py-3 text-[var(--sc-text)] outline-none transition placeholder:text-[var(--sc-text-muted)] focus:border-[var(--sc-orange)] focus:ring-2 focus:ring-orange-500/25"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  autoComplete="username"
                  placeholder="+243… ou vous@domaine.com"
                  required
                />
              </label>
              <label className="block text-sm font-medium text-[var(--sc-text)]">
                Mot de passe
                <input
                  type="password"
                  className="mt-1.5 w-full rounded-xl border border-[var(--sc-border)] bg-[var(--sc-input-bg)] px-4 py-3 text-[var(--sc-text)] outline-none transition placeholder:text-[var(--sc-text-muted)] focus:border-[var(--sc-orange)] focus:ring-2 focus:ring-orange-500/25"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </label>
              <button
                type="submit"
                disabled={pending}
                className="w-full rounded-xl bg-[var(--sc-orange)] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[var(--sc-orange-hover)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pending ? 'Connexion…' : 'Entrer dans SOBOLO CHAT'}
              </button>
            </form>
          ) : (
            <form className="space-y-4" onSubmit={onRegister}>
              <label className="block text-sm font-medium text-[var(--sc-text)]">
                Nom affiché
                <input
                  className="mt-1.5 w-full rounded-xl border border-[var(--sc-border)] bg-[var(--sc-input-bg)] px-4 py-3 text-[var(--sc-text)] outline-none transition focus:border-[var(--sc-orange)] focus:ring-2 focus:ring-orange-500/25"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </label>
              <label className="block text-sm font-medium text-[var(--sc-text)]">
                Téléphone <span className="text-[var(--sc-text-muted)]">(optionnel si email)</span>
                <input
                  className="mt-1.5 w-full rounded-xl border border-[var(--sc-border)] bg-[var(--sc-input-bg)] px-4 py-3 text-[var(--sc-text)] outline-none transition focus:border-[var(--sc-orange)] focus:ring-2 focus:ring-orange-500/25"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+243…"
                />
              </label>
              <label className="block text-sm font-medium text-[var(--sc-text)]">
                Email <span className="text-[var(--sc-text-muted)]">(optionnel si téléphone)</span>
                <input
                  type="email"
                  className="mt-1.5 w-full rounded-xl border border-[var(--sc-border)] bg-[var(--sc-input-bg)] px-4 py-3 text-[var(--sc-text)] outline-none transition focus:border-[var(--sc-orange)] focus:ring-2 focus:ring-orange-500/25"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </label>
              <label className="block text-sm font-medium text-[var(--sc-text)]">
                Mot de passe
                <input
                  type="password"
                  className="mt-1.5 w-full rounded-xl border border-[var(--sc-border)] bg-[var(--sc-input-bg)] px-4 py-3 text-[var(--sc-text)] outline-none transition focus:border-[var(--sc-orange)] focus:ring-2 focus:ring-orange-500/25"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  minLength={6}
                  required
                />
              </label>
              <button
                type="submit"
                disabled={pending}
                className="w-full rounded-xl bg-[var(--sc-orange)] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[var(--sc-orange-hover)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pending ? 'Création…' : 'Créer mon compte'}
              </button>
            </form>
          )}
        </div>

        <p className="mt-8 text-center text-xs text-[var(--sc-text-muted)]">© SOBOLO CHAT</p>
      </div>
    </div>
  )
}
