const raw = (import.meta.env.VITE_API_ORIGIN as string | undefined)?.replace(/\/$/, '') ?? ''

/** Origine du backend pour les requêtes REST (vide = chemins relatifs via proxy Vite). */
export const API_ORIGIN = raw

/** Origine pour Socket.IO (toujours absolue). */
export const SOCKET_ORIGIN = raw || (import.meta.env.DEV ? 'http://localhost:4000' : typeof window !== 'undefined' ? window.location.origin : '')
