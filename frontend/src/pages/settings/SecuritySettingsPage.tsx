import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, Button, Field, GlassCard, Input, Spinner, useToast } from '@/components/ui'
import { authApi } from '@/api/auth'
import { ApiError } from '@/api/client'

export function SecuritySettingsPage() {
  const toast = useToast()
  const qc = useQueryClient()
  const statusQ = useQuery({
    queryKey: ['auth-status'],
    queryFn: authApi.status,
    retry: false,
    staleTime: Infinity,
  })
  const [currentPassword, setCurrent] = useState('')
  const [newPassword, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (newPassword.length < 8) {
      setError('新口令至少 8 位')
      return
    }
    if (newPassword !== confirm) {
      setError('两次输入的新口令不一致')
      return
    }
    setSaving(true)
    try {
      await authApi.changePassword(currentPassword, newPassword)
      setCurrent('')
      setNext('')
      setConfirm('')
      qc.setQueryData(['auth-status'], (prev: { enabled?: boolean; unlocked?: boolean } | undefined) => ({
        enabled: prev?.enabled ?? true,
        unlocked: prev?.unlocked ?? true,
        managedByConfig: false,
      }))
      toast('访问口令已更新，其他会话已失效', { variant: 'success' })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '更新失败')
    } finally {
      setSaving(false)
    }
  }

  if (statusQ.isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner className="size-6" />
      </div>
    )
  }

  if (!statusQ.data?.enabled) {
    return (
      <Alert>
        当前未启用访问口令。远程访问时在配置里写上默认口令{' '}
        <code className="rounded bg-black/5 px-1 dark:bg-white/10">CODESPAR_ACCESS_PASSWORD</code>
        （至少 8 位）再重启，之后可在本页修改。
      </Alert>
    )
  }

  return (
    <GlassCard>
      <h2 className="text-base font-medium">修改访问口令</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {statusQ.data.managedByConfig
          ? '当前使用配置文件中的默认口令。在这里改过之后以本页为准，配置文件不再覆盖。'
          : '当前是自定义口令。修改后其他已解锁的浏览器需要重新输入。'}
      </p>
      <form onSubmit={onSubmit} className="mt-5 max-w-md space-y-4">
        <Field label="当前口令" required>
          {(id) => (
            <Input
              id={id}
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrent(e.target.value)}
            />
          )}
        </Field>
        <Field label="新口令" required description="至少 8 位">
          {(id) => (
            <Input
              id={id}
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNext(e.target.value)}
            />
          )}
        </Field>
        <Field label="确认新口令" required error={error}>
          {(id) => (
            <Input
              id={id}
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              invalid={!!error}
            />
          )}
        </Field>
        <Button
          type="submit"
          variant="primary"
          loading={saving}
          disabled={!currentPassword || !newPassword || !confirm}
        >
          更新口令
        </Button>
      </form>
    </GlassCard>
  )
}
