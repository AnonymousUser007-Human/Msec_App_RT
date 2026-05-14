import { useTheme } from '../context/ThemeContext'

const LABELS: Record<'light' | 'dark' | 'system', string> = {
  light: 'Clair',
  dark: 'Sombre',
  system: 'Auto',
}

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { preference, setPreference } = useTheme()

  const cycle = () => {
    const order: Array<'light' | 'dark' | 'system'> = ['light', 'dark', 'system']
    const i = order.indexOf(preference)
    setPreference(order[(i + 1) % order.length]!)
  }

  if (compact) {
    return (
      <button
        type="button"
        onClick={cycle}
        className="inline-flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--sc-border)] bg-[var(--sc-elevated)] px-2.5 text-xs font-medium text-[var(--sc-text)] transition hover:border-[var(--sc-orange)] hover:text-[var(--sc-orange)] active:scale-[0.98] md:min-h-0 md:min-w-0 md:px-2 md:py-1"
        title={`Thème : ${LABELS[preference]} (cliquer pour changer)`}
        aria-label={`Thème : ${LABELS[preference]}`}
      >
        <span className="text-base leading-none md:text-xs" aria-hidden>
          {preference === 'light' ? '☀' : preference === 'dark' ? '☾' : '◐'}
        </span>
        <span className="ml-1 hidden md:inline">{LABELS[preference]}</span>
      </button>
    )
  }

  return (
    <div className="flex rounded-xl border border-[var(--sc-border)] bg-[var(--sc-muted-bg)] p-0.5">
      {(['light', 'dark', 'system'] as const).map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => setPreference(p)}
          className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
            preference === p
              ? 'bg-[var(--sc-elevated)] text-[var(--sc-text)] shadow-sm'
              : 'text-[var(--sc-text-muted)] hover:text-[var(--sc-text)]'
          }`}
        >
          {LABELS[p]}
        </button>
      ))}
    </div>
  )
}
