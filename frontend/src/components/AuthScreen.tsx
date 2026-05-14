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
    <div className="relative flex min-h-dvh flex-col overflow-x-hidden bg-[var(--sc-page)] text-[var(--sc-text)]">
      <div className="absolute right-[max(0.75rem,env(safe-area-inset-right))] top-[max(0.75rem,env(safe-area-inset-top))] z-10">
        <ThemeToggle />
      </div>

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-6 sm:px-6 sm:py-8">
        <header className="mb-4 shrink-0 text-center">
          <div className="mx-auto mb-3 h-14 w-14 overflow-hidden rounded-full border border-[var(--sc-border)] bg-[var(--sc-elevated)] shadow-sm">
            <img
              src={logoSrc}
              alt=""
              width={56}
              height={56}
              className="h-full w-full object-cover"
              onError={() => setLogoSrc('/logo.svg')}
            />
          </div>
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-[var(--sc-text-muted)]">Messagerie temps réel</p>
          <h1 className="mt-1.5 font-display text-2xl font-bold tracking-tight text-[var(--sc-text)] sm:text-3xl">SOBOLO CHAT</h1>
        </header>

        <div className="shrink-0 rounded-2xl border border-[var(--sc-border)] bg-[var(--sc-elevated)] p-4 shadow-md sm:p-5">
          <div className="mb-4 flex rounded-xl border border-[var(--sc-border)] bg-[var(--sc-muted-bg)] p-0.5">
            <button
              type="button"
              className={`flex-1 cursor-pointer rounded-lg py-2 text-sm font-medium transition ${
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
              className={`flex-1 cursor-pointer rounded-lg py-2 text-sm font-medium transition ${
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
              className="mb-3 rounded-lg border px-2.5 py-1.5 text-sm"
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
            <form className="space-y-3" onSubmit={onLogin}>
              <label className="block text-sm font-medium text-[var(--sc-text)]">
                Téléphone ou email
                <input
                  className="mt-1 w-full rounded-lg border border-[var(--sc-border)] bg-[var(--sc-input-bg)] px-3 py-2.5 text-[var(--sc-text)] outline-none transition placeholder:text-[var(--sc-text-muted)] focus:border-[var(--sc-orange)] focus:ring-2 focus:ring-orange-500/25"
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
                  className="mt-1 w-full rounded-lg border border-[var(--sc-border)] bg-[var(--sc-input-bg)] px-3 py-2.5 text-[var(--sc-text)] outline-none transition placeholder:text-[var(--sc-text-muted)] focus:border-[var(--sc-orange)] focus:ring-2 focus:ring-orange-500/25"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </label>
              <button
                type="submit"
                disabled={pending}
                className="w-full cursor-pointer rounded-lg bg-[var(--sc-orange)] px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--sc-orange-hover)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pending ? 'Connexion…' : 'Entrer dans SOBOLO CHAT'}
              </button>
            </form>
          ) : (
            <form className="space-y-3" onSubmit={onRegister}>
              <label className="block text-sm font-medium text-[var(--sc-text)]">
                Nom affiché
                <input
                  className="mt-1 w-full rounded-lg border border-[var(--sc-border)] bg-[var(--sc-input-bg)] px-3 py-2.5 text-[var(--sc-text)] outline-none transition focus:border-[var(--sc-orange)] focus:ring-2 focus:ring-orange-500/25"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </label>
              <label className="block text-sm font-medium text-[var(--sc-text)]">
                Téléphone <span className="text-[var(--sc-text-muted)]">(optionnel si email)</span>
                <input
                  className="mt-1 w-full rounded-lg border border-[var(--sc-border)] bg-[var(--sc-input-bg)] px-3 py-2.5 text-[var(--sc-text)] outline-none transition focus:border-[var(--sc-orange)] focus:ring-2 focus:ring-orange-500/25"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+243…"
                />
              </label>
              <label className="block text-sm font-medium text-[var(--sc-text)]">
                Email <span className="text-[var(--sc-text-muted)]">(optionnel si téléphone)</span>
                <input
                  type="email"
                  className="mt-1 w-full rounded-lg border border-[var(--sc-border)] bg-[var(--sc-input-bg)] px-3 py-2.5 text-[var(--sc-text)] outline-none transition focus:border-[var(--sc-orange)] focus:ring-2 focus:ring-orange-500/25"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </label>
              <label className="block text-sm font-medium text-[var(--sc-text)]">
                Mot de passe
                <input
                  type="password"
                  className="mt-1 w-full rounded-lg border border-[var(--sc-border)] bg-[var(--sc-input-bg)] px-3 py-2.5 text-[var(--sc-text)] outline-none transition focus:border-[var(--sc-orange)] focus:ring-2 focus:ring-orange-500/25"
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
                className="w-full cursor-pointer rounded-lg bg-[var(--sc-orange)] px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--sc-orange-hover)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pending ? 'Création…' : 'Créer mon compte'}
              </button>
            </form>
          )}
        </div>

        <p className="mt-4 shrink-0 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-center text-[0.65rem] text-[var(--sc-text-muted)]">
          © SOBOLO CHAT
        </p>
      </div>
    </div>
  )
}
