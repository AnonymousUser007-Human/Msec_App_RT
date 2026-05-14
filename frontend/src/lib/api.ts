import { API_ORIGIN } from './config'

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const

function url(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`
  return API_ORIGIN ? `${API_ORIGIN}${p}` : p
}

export class ApiError extends Error {
  status: number
  body?: unknown

  constructor(status: number, message: string, body?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit & { token?: string | null } = {},
): Promise<T> {
  const { token, headers: h, ...rest } = init
  const headers = new Headers(h)
  if (!headers.has('Content-Type') && rest.body && typeof rest.body === 'string') {
    headers.set('Content-Type', 'application/json')
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  const res = await fetch(url(path), { ...rest, headers })
  const text = await res.text()
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text) as unknown
    } catch {
      data = text
    }
  }
  if (!res.ok) {
    const msg =
      typeof data === 'object' && data !== null && 'error' in data && typeof (data as { error: unknown }).error === 'string'
        ? (data as { error: string }).error
        : res.statusText
    throw new ApiError(res.status, msg, data)
  }
  return data as T
}

export function postJson<T>(path: string, body: unknown, token?: string | null): Promise<T> {
  return apiFetch<T>(path, { method: 'POST', body: JSON.stringify(body), headers: JSON_HEADERS, token })
}

export function patchJson<T>(path: string, body: unknown, token?: string | null): Promise<T> {
  return apiFetch<T>(path, { method: 'PATCH', body: JSON.stringify(body), headers: JSON_HEADERS, token })
}

export function getJson<T>(path: string, token?: string | null): Promise<T> {
  return apiFetch<T>(path, { method: 'GET', token })
}

export function deleteJson<T>(path: string, token?: string | null): Promise<T> {
  return apiFetch<T>(path, { method: 'DELETE', token })
}
