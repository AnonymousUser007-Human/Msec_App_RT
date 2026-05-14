import { Toaster } from 'sonner'
import { useTheme } from '../context/ThemeContext'

export function AppToaster() {
  const { resolved } = useTheme()
  return (
    <Toaster
      position="top-right"
      theme={resolved}
      closeButton
      duration={7000}
      toastOptions={{
        classNames: {
          toast:
            'group border border-[var(--sc-border)] bg-[var(--sc-elevated)] text-[var(--sc-text)] shadow-lg',
          title: 'text-[var(--sc-text)]',
          description: 'text-[var(--sc-text-muted)]',
          closeButton:
            'cursor-pointer border-[var(--sc-border)] bg-[var(--sc-muted-bg)] text-[var(--sc-text)]',
          actionButton:
            'cursor-pointer rounded-md bg-[var(--sc-orange)] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[var(--sc-orange-hover)]',
          cancelButton: 'cursor-pointer',
        },
      }}
    />
  )
}
