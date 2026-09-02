/**
 * 后端 API 客户端。
 * 生产模式下前端与后端同源；dev 模式由 Vite 代理 /api → CODESPAR_PORT（默认 8099）。
 */

export class ApiError extends Error {
  readonly status: number
  readonly detail?: unknown

  constructor(message: string, status: number, detail?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  })

  if (!res.ok) {
    let detail: unknown
    let message = `${res.status} ${res.statusText}`
    try {
      detail = await res.json()
      if (detail && typeof detail === 'object' && 'message' in detail) {
        message = String((detail as { message: unknown }).message)
      }
    } catch {
      // 响应体不是 JSON，保留状态码文案
    }
    throw new ApiError(message, res.status, detail)
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body === undefined ? undefined : JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}

export interface HealthResponse {
  app: string
  status: string
  db?: string
  tables?: number
  dbError?: string
}
