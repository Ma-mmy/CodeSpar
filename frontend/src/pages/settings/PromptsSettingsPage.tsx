import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, RotateCcw, Save } from 'lucide-react'
import {
  Alert,
  Badge,
  Button,
  Field,
  GlassCard,
  Skeleton,
  Textarea,
  useToast,
} from '@/components/ui'
import { promptsApi, type PromptMeta } from '@/api/prompts'
import { cn } from '@/lib/utils'

export function PromptsSettingsPage() {
  const toast = useToast()
  const qc = useQueryClient()
  const listQ = useQuery({ queryKey: ['settings', 'prompts'], queryFn: promptsApi.list })
  const [activeKey, setActiveKey] = useState<string>('')
  const [draft, setDraft] = useState<Record<string, string>>({})

  const active = (listQ.data ?? []).find((p) => p.key === activeKey) ?? listQ.data?.[0]

  useEffect(() => {
    if (!active) return
    setActiveKey(active.key)
    setDraft({ ...active.values })
  }, [active?.key, listQ.dataUpdatedAt])

  const save = useMutation({
    mutationFn: () => promptsApi.save({ promptKey: active!.key, slots: draft }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings', 'prompts'] })
      toast('已保存提示词槽位', { variant: 'success' })
    },
    onError: (e) => toast('保存失败', { variant: 'danger', description: (e as Error).message }),
  })

  const reset = useMutation({
    mutationFn: () => promptsApi.reset({ promptKey: active!.key }),
    onSuccess: (meta) => {
      setDraft({ ...meta.values })
      qc.invalidateQueries({ queryKey: ['settings', 'prompts'] })
      toast('已恢复默认', { variant: 'success' })
    },
    onError: (e) => toast('恢复失败', { variant: 'danger', description: (e as Error).message }),
  })

  if (listQ.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (listQ.isError) {
    return <Alert variant="danger">加载失败：{(listQ.error as Error).message}</Alert>
  }

  const prompts = listQ.data ?? []

  return (
    <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
      <GlassCard className="!p-2">
        <nav className="flex flex-col gap-1">
          {prompts.map((p) => (
            <PromptNavItem
              key={p.key}
              prompt={p}
              active={p.key === active?.key}
              onClick={() => setActiveKey(p.key)}
            />
          ))}
        </nav>
      </GlassCard>

      {active && (
        <GlassCard className="space-y-4">
          <div>
            <h2 className="text-base font-semibold">{active.label}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{active.description}</p>
            <p className="mt-2 font-mono text-[11px] text-muted-foreground">{active.key}</p>
          </div>

          <Alert variant="info">
            主模板结构（输出 JSON 格式、变量占位符）由平台锁定；下方槽位可自由改写角色设定与业务规则。
          </Alert>

          {active.slots.map((slot) => (
            <div key={slot.key} className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                {slot.label}
                {active.overridden[slot.key] && <Badge variant="warning">已自定义</Badge>}
              </div>
              <Field>
                {(id) => (
                  <Textarea
                    id={id}
                    value={draft[slot.key] ?? ''}
                    onChange={(e) => setDraft((d) => ({ ...d, [slot.key]: e.target.value }))}
                    className="min-h-[140px] font-mono text-sm"
                  />
                )}
              </Field>
            </div>
          ))}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="primary"
              disabled={save.isPending}
              onClick={() => save.mutate()}
            >
              {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              保存
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={reset.isPending}
              onClick={() => {
                if (confirm('确认将该提示词全部槽位恢复为默认？')) reset.mutate()
              }}
            >
              <RotateCcw className="size-4" /> 恢复默认
            </Button>
          </div>
        </GlassCard>
      )}
    </div>
  )
}

function PromptNavItem({
  prompt,
  active,
  onClick,
}: {
  prompt: PromptMeta
  active: boolean
  onClick: () => void
}) {
  const customized = Object.values(prompt.overridden).some(Boolean)
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-lg px-3 py-2 text-left text-sm transition',
        active
          ? 'bg-white/80 font-medium shadow-sm dark:bg-white/15'
          : 'text-muted-foreground hover:bg-black/5 hover:text-foreground dark:hover:bg-white/5',
      )}
    >
      <div className="truncate">{prompt.label}</div>
      {customized && <div className="mt-0.5 text-[10px] text-chart-4">已自定义</div>}
    </button>
  )
}
