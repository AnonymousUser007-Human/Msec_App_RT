import { useEffect, useState } from 'react'
import { ThemeToggle } from './ThemeToggle'

const LOGO_SRC = '/logo.png'

export function NotFoundPage() {
  const [logoSrc, setLogoSrc] = useState(LOGO_SRC)

  useEffect(() => {
    const prev = document.title
    document.title = 'Page introuvable — SOBOLO CHAT'
    return () => {
      document.title = prev
    }
  }, [])

  return (
    <div className="relative flex min-h-dvh flex-col overflow-x-hidden bg-[var(--sc-page)] text-[var(--sc-text)]">
      <div className="absolute right-[max(0.75rem,env(safe-area-inset-right))] top-[max(0.75rem,env(safe-area-inset-top))] z-10">
        <ThemeToggle />
      </div>

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-6 sm:px-6 sm:py-8">
        <header className="mb-6 shrink-0 text-center">
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
          <p className="font-display text-6xl font-bold tabular-nums tracking-tight text-[var(--sc-orange)]">404</p>
          <h1 className="mt-2 font-display text-xl font-semibold tracking-tight text-[var(--sc-text)] sm:text-2xl">Page introuvable</h1>
          <p className="mt-2 text-sm text-[var(--sc-text-muted)]">
            Cette adresse ne correspond à aucune page de SOBOLO CHAT.
          </p>
        </header>

        <div className="shrink-0 rounded-2xl border border-[var(--sc-border)] bg-[var(--sc-elevated)] p-5 text-center shadow-md sm:p-6">
          <p className="mb-4 break-all text-xs text-[var(--sc-text-muted)]" title={typeof window !== 'undefined' ? window.location.pathname : ''}>
            {typeof window !== 'undefined' ? window.location.pathname : ''}
          </p>
          <a
            href="/"
            className="inline-flex w-full cursor-pointer items-center justify-center rounded-lg bg-[var(--sc-orange)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--sc-orange-hover)]"
          >
            Retour à l’accueil
          </a>
        </div>

        <p className="mt-4 shrink-0 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-center text-[0.65rem] text-[var(--sc-text-muted)]">
          © SOBOLO CHAT
        </p>
      </div>
    </div>
  )
}
