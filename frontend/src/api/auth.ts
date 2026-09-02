import { api } from './client'

export interface AuthStatus {
  enabled: boolean
  unlocked: boolean
  managedByConfig: boolean
}

export const authApi = {
  status: () => api.get<AuthStatus>('/auth/status'),
  login: (password: string) => api.post<void>('/auth/login', { password }),
  logout: () => api.post<void>('/auth/logout'),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.post<void>('/auth/password', { currentPassword, newPassword }),
}

/** 防止 open redirect：只接受站内相对路径。 */
export function safeNextPath(raw: string | null | undefined): string {
  if (!raw) return '/'
  let path = raw
  try {
    path = decodeURIComponent(raw)
  } catch {
    return '/'
  }
  if (!path.startsWith('/') || path.startsWith('//') || path.startsWith('/unlock')) {
    return '/'
  }
  return path
}
