import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { isSystemNotifyEnabled, setSystemNotifyEnabled } from '../lib/notifyPrefs'
import {
  fetchPushConfig,
  resolveRegistrationForPush,
  subscribeUserToPush,
  unsubscribeUserFromPush,
} from '../lib/webPush'

type Props = {
  token: string
  /** En-têtes très serrés (mobile) : bouton plus petit */
  compact?: boolean
}

function BellIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function HeaderAlertsMenu({ token, compact }: Props) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  /** Évite les doubles clics pendant permission push / souscription. */
  const pushBusyRef = useRef(false)
  const [, bump] = useState(0)
  const refresh = useCallback(() => bump((n) => n + 1), [])

  const [publicKey, setPublicKey] = useState<string | null | undefined>(undefined)
  const [pushSubscribed, setPushSubscribed] = useState(false)
  const [pushBusy, setPushBusy] = useState(false)

  const startPushBusy = () => {
    pushBusyRef.current = true
    setPushBusy(true)
  }
  const endPushBusy = () => {
    pushBusyRef.current = false
    setPushBusy(false)
  }

  useEffect(() => {
    void fetchPushConfig(token)
      .then((c) => setPublicKey(c.publicKey))
      .catch(() => setPublicKey(null))
  }, [token])

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    void navigator.serviceWorker.ready.then((reg) =>
      reg.pushManager.getSubscription().then((s) => setPushSubscribed(!!s)),
    )
  }, [token, open, bump])

  /** Pré-chauffe le SW avant « Activer le Web Push » pour limiter les `await` après le geste utilisateur. */
  useEffect(() => {
    if (!open || !('serviceWorker' in navigator)) return
    void resolveRegistrationForPush().catch(() => {})
  }, [open])

  /** Fermeture au clic à l’extérieur du panneau (sauf pendant une opération push). */
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (pushBusyRef.current) return
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const t = window.setTimeout(() => document.addEventListener('click', onDoc), 0)
    return () => {
      window.clearTimeout(t)
      document.removeEventListener('click', onDoc)
    }
  }, [open])

  const notifSupported = typeof window !== 'undefined' && 'Notification' in window
  const notifPerm = notifSupported ? Notification.permission : 'denied'
  const systemOn = notifSupported && notifPerm === 'granted' && isSystemNotifyEnabled()
  const pushOn = pushSubscribed && !!publicKey
  const showBadge = systemOn || pushOn

  const sectionClass =
    'rounded-xl border border-[var(--sc-border)] bg-[var(--sc-muted-bg)]/80 p-3 dark:bg-[var(--sc-muted-bg)]/40'

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Notifications et alertes"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        className={`relative inline-flex cursor-pointer items-center justify-center rounded-xl border border-[var(--sc-border)] bg-[var(--sc-elevated)] text-[var(--sc-text)] shadow-sm transition hover:border-[var(--sc-orange)] hover:text-[var(--sc-orange)] active:scale-[0.97] ${
          compact ? 'h-9 w-9 min-h-9 min-w-9' : 'h-10 w-10 min-h-10 min-w-10'
        }`}
      >
        <BellIcon className={compact ? 'h-[18px] w-[18px]' : 'h-5 w-5'} />
        {showBadge ? (
          <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-[var(--sc-orange)] ring-2 ring-[var(--sc-elevated)]" />
        ) : null}
      </button>

      {open ? (
        <div
          className="absolute right-0 z-[100] mt-2 w-[min(calc(100vw-2rem),20rem)] origin-top-right rounded-2xl border border-[var(--sc-border)] bg-[var(--sc-elevated)] p-3 shadow-xl ring-1 ring-black/5 dark:ring-white/10"
          role="dialog"
          aria-label="Réglages des alertes"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-3 flex items-center justify-between gap-2 border-b border-[var(--sc-border)] pb-2">
            <p className="font-display text-sm font-semibold text-[var(--sc-text)]">Alertes</p>
            <button
              type="button"
              className="cursor-pointer rounded-lg px-2 py-1 text-xs text-[var(--sc-text-muted)] transition hover:bg-[var(--sc-muted-bg)] hover:text-[var(--sc-text)]"
              onClick={() => setOpen(false)}
            >
              Fermer
            </button>
          </div>

          <div className="flex max-h-[min(70dvh,24rem)] flex-col gap-3 overflow-y-auto pr-0.5">
            {/* Hors onglet */}
            <div className={sectionClass}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-[var(--sc-text)]">Onglet en arrière-plan</p>
                  <p className="mt-0.5 text-[10px] leading-snug text-[var(--sc-text-muted)]">
                    Notification navigateur quand une autre app / onglet est au premier plan.
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                    systemOn ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-[var(--sc-muted-bg)] text-[var(--sc-text-muted)]'
                  }`}
                >
                  {systemOn ? 'Actif' : 'Off'}
                </span>
              </div>
              {!notifSupported ? (
                <p className="text-[10px] text-[var(--sc-text-muted)]">Non disponible sur ce navigateur.</p>
              ) : notifPerm === 'denied' ? (
                <p className="text-[10px] leading-snug text-[var(--sc-text-muted)]">
                  Bloqué dans les paramètres du site — autorisez les notifications pour activer.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {!systemOn ? (
                    <button
                      type="button"
                      className="cursor-pointer rounded-lg bg-[var(--sc-orange)] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[var(--sc-orange-hover)]"
                      onClick={async () => {
                        const next = await Notification.requestPermission()
                        refresh()
                        if (next === 'granted') {
                          setSystemNotifyEnabled(true)
                          toast.success('Alertes arrière-plan activées.')
                          try {
                            new Notification('SOBOLO CHAT', { body: 'Notifications activées.', icon: '/icon.png' })
                          } catch {
                            /* ignore */
                          }
                        } else {
                          toast.message('Permission refusée.')
                        }
                      }}
                    >
                      Activer
                    </button>
                  ) : null}
                  {systemOn ? (
                    <button
                      type="button"
                      className="cursor-pointer rounded-lg border border-[var(--sc-border)] px-3 py-1.5 text-xs font-medium text-[var(--sc-text)] transition hover:bg-[var(--sc-muted-bg)]"
                      onClick={() => {
                        setSystemNotifyEnabled(false)
                        refresh()
                        toast.message('Alertes arrière-plan désactivées.')
                      }}
                    >
                      Désactiver
                    </button>
                  ) : null}
                </div>
              )}
            </div>

            {/* Web Push */}
            <div className={sectionClass}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-[var(--sc-text)]">Web Push (PWA)</p>
                  <p className="mt-0.5 text-[10px] leading-snug text-[var(--sc-text-muted)]">
                    Même avec l’app fermée, si le navigateur l’autorise.
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                    pushOn ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-[var(--sc-muted-bg)] text-[var(--sc-text-muted)]'
                  }`}
                >
                  {pushOn ? 'Actif' : 'Off'}
                </span>
              </div>
              {!('serviceWorker' in navigator) || !('PushManager' in window) ? (
                <p className="text-[10px] text-[var(--sc-text-muted)]">Non supporté ici.</p>
              ) : publicKey === undefined ? (
                <p className="text-[10px] text-[var(--sc-text-muted)]">Chargement…</p>
              ) : !publicKey ? (
                <p className="text-[10px] leading-snug text-[var(--sc-text-muted)]">
                  Serveur sans clés VAPID — Web Push indisponible.
                </p>
              ) : pushSubscribed ? (
                <button
                  type="button"
                  disabled={pushBusy}
                  className="cursor-pointer rounded-lg border border-[var(--sc-border)] px-3 py-1.5 text-xs font-medium text-[var(--sc-text)] transition hover:bg-[var(--sc-muted-bg)] disabled:opacity-50"
                  onClick={() => {
                    if (pushBusyRef.current) return
                    startPushBusy()
                    void (async () => {
                      try {
                        await unsubscribeUserFromPush(token)
                        setPushSubscribed(false)
                        refresh()
                        toast.message('Web Push désactivé sur cet appareil.')
                      } catch (err) {
                        const msg = err instanceof Error ? err.message : ''
                        toast.error(
                          msg.includes('délai')
                            ? msg
                            : 'Impossible de désactiver le Web Push (service worker ou réseau).',
                        )
                      } finally {
                        endPushBusy()
                      }
                    })()
                  }}
                >
                  Désactiver le Web Push
                </button>
              ) : (
                <button
                  type="button"
                  disabled={pushBusy}
                  className="cursor-pointer rounded-lg bg-[var(--sc-orange)] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[var(--sc-orange-hover)] disabled:opacity-50"
                  onClick={() => {
                    if (pushBusyRef.current) return
                    /* Lancer permission + SW dans le même handler que le clic (Chrome / geste utilisateur). */
                    const permPromise = Notification.requestPermission()
                    const regPromise = resolveRegistrationForPush()
                    startPushBusy()
                    void (async () => {
                      try {
                        const [perm, reg] = await Promise.all([permPromise, regPromise])
                        if (perm !== 'granted') {
                          toast.error('Les notifications sont nécessaires pour le Web Push.')
                          return
                        }
                        await subscribeUserToPush(token, publicKey, { registration: reg })
                        setPushSubscribed(true)
                        refresh()
                        toast.success('Web Push activé.')
                      } catch (err) {
                        const name = err instanceof Error ? err.name : ''
                        const msg = err instanceof Error ? err.message : ''
                        if (name === 'NotAllowedError' || /user gesture|geste/i.test(msg)) {
                          toast.error(
                            'Abonnement push refusé par le navigateur. Rechargez la page, ouvrez Alertes puis réessayez tout de suite.',
                          )
                        } else {
                          toast.error(
                            msg.includes('délai')
                              ? msg
                              : msg
                                ? `Activation impossible : ${msg}`
                                : 'Activation impossible.',
                          )
                        }
                      } finally {
                        endPushBusy()
                      }
                    })()
                  }}
                >
                  Activer le Web Push
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
