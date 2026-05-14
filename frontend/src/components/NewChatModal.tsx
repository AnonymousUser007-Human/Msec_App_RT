import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import type { Conversation, User } from '../lib/types'
import { getJson, postJson } from '../lib/api'
import { initials, mediaUrl } from '../lib/format'

type Props = {
  open: boolean
  onClose: () => void
  onCreated: (conversationId: string) => void
}

export function NewChatModal({ open, onClose, onCreated }: Props) {
  const { token } = useAuth()
  const [q, setQ] = useState('')
  const [results, setResults] = useState<User[]>([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState<string | null>(null)

  const search = useCallback(async () => {
    if (!token || q.trim().length < 2) {
      setResults([])
      return
    }
    setLoading(true)
    try {
      const rows = await getJson<User[]>(`/api/users/search?q=${encodeURIComponent(q.trim())}&limit=20`, token)
      setResults(rows)
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [q, token])

  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => {
      void search()
    }, 300)
    return () => clearTimeout(t)
  }, [open, search])

  async function startWith(u: User) {
    if (!token) return
    setCreating(u.id)
    try {
      const conv = await postJson<Conversation>('/api/conversations', { receiverId: u.id }, token)
      onCreated(conv.id)
      onClose()
      setQ('')
      setResults([])
    } finally {
      setCreating(null)
    }
  }

  if (!open) return null

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex cursor-default items-end justify-center p-4 md:items-center"
      style={{ backgroundColor: 'var(--sc-overlay)' }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-chat-title"
        className="w-full max-w-md cursor-auto rounded-3xl border border-[var(--sc-border)] bg-[var(--sc-elevated)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--sc-border)] px-4 py-3">
          <h3 id="new-chat-title" className="font-display text-lg font-semibold text-[var(--sc-text)]">
            Nouvelle discussion
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-lg px-2 py-1 text-sm text-[var(--sc-text-muted)] transition hover:bg-[var(--sc-muted-bg)] hover:text-[var(--sc-text)]"
          >
            Fermer
          </button>
        </div>
        <div className="p-4">
          <input
            className="w-full rounded-xl border border-[var(--sc-border)] bg-[var(--sc-input-bg)] px-3 py-2.5 text-sm text-[var(--sc-text)] outline-none placeholder:text-[var(--sc-text-muted)] focus:border-[var(--sc-orange)] focus:ring-2 focus:ring-orange-500/25"
            placeholder="Rechercher par nom, téléphone ou email…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
          />
          <p className="mt-2 text-xs text-[var(--sc-text-muted)]">Saisissez au moins 2 caractères.</p>
        </div>
        <div className="max-h-72 overflow-y-auto border-t border-[var(--sc-border)]">
          {loading ? <p className="px-4 py-6 text-center text-sm text-[var(--sc-text-muted)]">Recherche…</p> : null}
          {!loading && results.length === 0 && q.trim().length >= 2 ? (
            <p className="px-4 py-6 text-center text-sm text-[var(--sc-text-muted)]">Aucun résultat.</p>
          ) : null}
          <ul>
            {results.map((u) => (
              <li key={u.id} className="border-b border-[var(--sc-border)] last:border-0">
                <button
                  type="button"
                  disabled={creating === u.id}
                  onClick={() => void startWith(u)}
                  className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition hover:bg-[var(--sc-muted-bg)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--sc-border)] bg-[var(--sc-input-bg)] text-xs font-semibold text-[var(--sc-text)]">
                    {u.avatar ? <img src={mediaUrl(u.avatar)} alt="" className="h-full w-full object-cover" /> : initials(u.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-[var(--sc-text)]">{u.name}</p>
                    <p className="truncate text-xs text-[var(--sc-text-muted)]">{u.phone ?? u.email ?? ''}</p>
                  </div>
                  {u.isOnline ? <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--sc-online)]" /> : null}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
