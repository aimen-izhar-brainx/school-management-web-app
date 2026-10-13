/** Same-origin in dev via the Vite proxy (see vite.config.ts); override for other environments. */
const BASE_URL = import.meta.env.VITE_API_URL ?? '/api'

let accessToken: string | null = null

/** Called by lib/auth.ts whenever the session's access token changes, so it can be sent on later requests. */
export function setAccessToken(token: string | null) {
  accessToken = token
}

export class ApiError extends Error {
  status: number
  body: unknown

  constructor(status: number, body: unknown) {
    super(extractMessage(body))
    this.status = status
    this.body = body
  }
}

function extractMessage(body: unknown): string {
  const message = (body as { message?: unknown } | null)?.message
  if (Array.isArray(message)) return String(message[0] ?? 'Request failed.')
  if (typeof message === 'string') return message
  return 'Request failed.'
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...init.headers,
    },
  })

  const body = response.status === 204 ? null : await response.json().catch(() => null)
  if (!response.ok) throw new ApiError(response.status, body)
  return body as T
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'POST', body: data === undefined ? undefined : JSON.stringify(data) }),
  patch: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'PATCH', body: data === undefined ? undefined : JSON.stringify(data) }),
  put: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'PUT', body: data === undefined ? undefined : JSON.stringify(data) }),
  delete: <T = void>(path: string) => request<T>(path, { method: 'DELETE' }),
}
