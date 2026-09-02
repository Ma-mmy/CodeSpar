import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { authApi } from '@/api/auth'

/** 已确认未解锁才跳走。加载中不挡页面，避免所有业务请求被串在 status 后面。 */
export function AuthGate() {
  const location = useLocation()
  const statusQ = useQuery({
    queryKey: ['auth-status'],
    queryFn: authApi.status,
    retry: false,
    staleTime: Infinity,
  })

  if (statusQ.data?.enabled && !statusQ.data.unlocked) {
    const next = location.pathname + location.search + location.hash
    return <Navigate to={`/unlock?next=${encodeURIComponent(next)}`} replace />
  }

  return <Outlet />
}
