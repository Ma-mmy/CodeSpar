import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Lock, Zap } from 'lucide-react'
import { Alert, Button, Field, GlassCard, Input } from '@/components/ui'
import { authApi, safeNextPath } from '@/api/auth'
import { ApiError } from '@/api/client'

export function UnlockPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [params] = useSearchParams()
  const next = safeNextPath(params.get('next'))
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const statusQ = useQuery({
    queryKey: ['auth-status'],
    queryFn: authApi.status,
    retry: false,
    staleTime: Infinity,
  })

  if (statusQ.data && (!statusQ.data.enabled || statusQ.data.unlocked)) {
    return <Navigate to={next} replace />
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await authApi.login(password)
      qc.setQueryData(['auth-status'], (prev: { managedByConfig?: boolean } | undefined) => ({
        enabled: true,
        unlocked: true,
        managedByConfig: prev?.managedByConfig ?? false,
      }))
      navigate(next, { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '解锁失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center px-4 py-10">
      <GlassCard className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-chart-3 shadow-md shadow-primary/25">
            <Zap className="size-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">解锁 CodeSpar</h1>
            <p className="text-sm text-muted-foreground">输入访问口令以继续</p>
          </div>
        </div>

        {statusQ.isError && (
          <Alert variant="danger" className="mb-4">
            无法连接后端，请确认服务已启动。
          </Alert>
        )}

        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="访问口令" required error={error}>
            {(id) => (
              <Input
                id={id}
                type="password"
                autoComplete="current-password"
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                invalid={!!error}
              />
            )}
          </Field>
          <Button type="submit" variant="primary" className="w-full" loading={submitting} disabled={!password}>
            <Lock className="size-4" />
            解锁
          </Button>
        </form>
      </GlassCard>
    </div>
  )
}
