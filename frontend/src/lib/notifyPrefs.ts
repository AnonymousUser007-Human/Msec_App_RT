/** Préférence utilisateur : afficher des `Notification` navigateur quand l’onglet est en arrière-plan. */
export const SYSTEM_NOTIFY_KEY = 'sobolo_system_notify'

export function isSystemNotifyEnabled(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(SYSTEM_NOTIFY_KEY) === '1'
  } catch {
    return false
  }
}

export function setSystemNotifyEnabled(on: boolean): void {
  try {
    if (on) localStorage.setItem(SYSTEM_NOTIFY_KEY, '1')
    else localStorage.removeItem(SYSTEM_NOTIFY_KEY)
  } catch {
    /* ignore */
  }
}
