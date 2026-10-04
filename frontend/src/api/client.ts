/** Minimal typed fetch wrapper: session cookies + Django CSRF. */

export class ApiError extends Error {
  status: number
  data: unknown

  constructor(status: number, data: unknown) {
    super(`API ${status}`)
    this.status = status
    this.data = data
  }
}

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}

async function ensureCsrf(): Promise<string> {
  const existing = getCookie('csrftoken')
  if (existing) return existing
  const response = await fetch('/api/v1/csrf/', { credentials: 'same-origin' })
  const data = (await response.json()) as { csrfToken: string }
  return data.csrfToken
}

export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const method = options.method ?? 'GET'
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'
  if (method !== 'GET' && method !== 'HEAD') {
    headers['X-CSRFToken'] = await ensureCsrf()
  }
  const response = await fetch(path, {
    method,
    headers,
    credentials: 'same-origin',
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  })
  const text = await response.text()
  const data: unknown = text ? JSON.parse(text) : null
  if (!response.ok) throw new ApiError(response.status, data)
  return data as T
}
