import { postJson, getJson } from './api'

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = window.setTimeout(() => reject(new Error(`${label} : délai dépassé (${ms} ms)`)), ms)
    promise.then(
      (v) => {
        window.clearTimeout(t)
        resolve(v)
      },
      (e) => {
        window.clearTimeout(t)
        reject(e)
      },
    )
  })
}

/** Mis à jour par `registerSW(onRegisteredSW)` et par `resolveRegistrationForPush` — évite d’attendre `ready` au moment du clic. */
let lastActiveRegistration: ServiceWorkerRegistration | undefined

/**
 * À appeler depuis `registerSW({ onRegisteredSW })` pour que l’abonnement push
 * réutilise tout de suite le SW actif (moins d’`await` après le geste utilisateur).
 */
export function primeServiceWorkerRegistration(registration: ServiceWorkerRegistration | undefined) {
  if (registration?.active) {
    lastActiveRegistration = registration
  }
}

/**
 * Résout le `ServiceWorkerRegistration` utilisable pour Push (SW actif si possible).
 * Démarrer cette promesse **dans le même handler de clic** que `Notification.requestPermission()`
 * réduit les échecs « NotAllowedError » liés à l’expiration du geste utilisateur (Chrome).
 */
export async function resolveRegistrationForPush(timeoutMs = 20000): Promise<ServiceWorkerRegistration> {
  if (!('serviceWorker' in navigator)) {
    throw new Error('Service Worker non disponible')
  }
  if (lastActiveRegistration?.active) {
    return lastActiveRegistration
  }
  try {
    const local = await navigator.serviceWorker.getRegistration()
    if (local?.active) {
      lastActiveRegistration = local
      return local
    }
  } catch {
    /* ignore */
  }
  const r = await withTimeout(navigator.serviceWorker.ready, timeoutMs, 'Activation du service worker')
  lastActiveRegistration = r
  return r
}

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i)
  return outputArray
}

export type PushConfigResponse = { publicKey: string | null }

export async function fetchPushConfig(token: string): Promise<PushConfigResponse> {
  return getJson<PushConfigResponse>('/api/push/config', token)
}

export async function registerWebPushOnServer(
  token: string,
  body: { endpoint: string; keys: { p256dh: string; auth: string } },
): Promise<void> {
  await postJson('/api/push/subscribe', body, token)
}

export async function unregisterWebPushOnServer(token: string, endpoint?: string): Promise<void> {
  await postJson('/api/push/unsubscribe', { endpoint }, token)
}

async function unsubscribeExistingPush(reg: ServiceWorkerRegistration, maxMs = 2500): Promise<void> {
  const existing = await reg.pushManager.getSubscription()
  if (!existing) return
  await Promise.race([
    existing.unsubscribe().catch(() => {}),
    new Promise<void>((resolve) => setTimeout(resolve, maxMs)),
  ])
}

export async function subscribeUserToPush(
  token: string,
  publicKeyB64: string,
  opts?: { registration?: ServiceWorkerRegistration },
): Promise<PushSubscription> {
  const reg = opts?.registration ?? (await resolveRegistrationForPush())
  const key = urlBase64ToUint8Array(publicKeyB64)
  await unsubscribeExistingPush(reg)

  const sub = await withTimeout(
    reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: key as unknown as BufferSource,
    }),
    30000,
    'Abonnement push navigateur',
  )

  const json = sub.toJSON()
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error('Abonnement push incomplet')
  }
  await registerWebPushOnServer(token, {
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
  })
  return sub
}

/** Désinscrit le navigateur et supprime l’abonnement côté serveur (sub optionnel sinon détection auto). */
export async function unsubscribeUserFromPush(token: string, sub?: PushSubscription | null): Promise<void> {
  let actual = sub ?? null
  if (!actual) {
    const reg = await resolveRegistrationForPush()
    actual = await reg.pushManager.getSubscription()
  }
  if (actual) {
    await unregisterWebPushOnServer(token, actual.endpoint).catch(() => {})
    await actual.unsubscribe().catch(() => {})
    return
  }
  await unregisterWebPushOnServer(token).catch(() => {})
}
