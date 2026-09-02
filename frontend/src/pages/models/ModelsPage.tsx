import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Plug, Pencil, Trash2, Star, Settings2, Loader2 } from 'lucide-react'
import {
  Alert,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  GlassCard,
  PageContainer,
  Skeleton,
  Tooltip,
  useToast,
} from '@/components/ui'
import { modelsApi, type ModelProfile, type TestResult } from '@/api/models'
import { ModelFormDialog } from './ModelFormDialog'

function ModelCard({
  profile,
  onEdit,
  onDelete,
}: {
  profile: ModelProfile
  onEdit: () => void
  onDelete: () => void
}) {
  const toast = useToast()
  const qc = useQueryClient()
  const [result, setResult] = useState<TestResult | null>(null)

  const test = useMutation({
    mutationFn: () => modelsApi.test(profile.id),
    onSuccess: (r) => {
      setResult(r)
      toast(r.success ? '连接成功' : '连接失败', {
        variant: r.success ? 'success' : 'danger',
        description: r.success ? `延迟 ${r.latencyMs}ms` : r.error,
        duration: r.success ? 3000 : 10000,
      })
    },
    onError: (e) => setResult({ success: false, latencyMs: 0, error: (e as Error).message }),
  })

  const setDefault = useMutation({
    mutationFn: (role: 'generate' | 'grade') => modelsApi.setDefault(profile.id, role),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['models'] })
      toast('已设为默认', { variant: 'success' })
    },
    onError: (e) => toast('设置失败', { variant: 'danger', description: (e as Error).message }),
  })

  return (
    <GlassCard className={profile.enabled ? undefined : 'opacity-60'}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-medium">{profile.name}</h3>
            {!profile.enabled && <Badge variant="outline">已禁用</Badge>}
            {profile.isDefaultGenerate && <Badge variant="primary">默认出题</Badge>}
            {profile.isDefaultGrade && <Badge variant="success">默认阅卷</Badge>}
          </div>
          <p className="mt-1 truncate text-sm text-muted-foreground">
            {profile.modelName}
            {profile.baseUrl && <> · {profile.baseUrl}</>}
          </p>
          <p className="mt-0.5 font-mono text-xs text-muted-foreground">{profile.apiKeyMask}</p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Tooltip content="测试连接">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="测试连接"
              loading={test.isPending}
              onClick={() => test.mutate()}
            >
              {!test.isPending && <Plug />}
            </Button>
          </Tooltip>
          <Tooltip content="编辑">
            <Button variant="ghost" size="icon-sm" aria-label="编辑" onClick={onEdit}>
              <Pencil />
            </Button>
          </Tooltip>
          <Tooltip content="删除">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="删除"
              className="text-destructive"
              onClick={onDelete}
            >
              <Trash2 />
            </Button>
          </Tooltip>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {profile.canGenerate && (
          <Button
            size="sm"
            variant={profile.isDefaultGenerate ? 'secondary' : 'ghost'}
            disabled={profile.isDefaultGenerate || !profile.enabled}
            onClick={() => setDefault.mutate('generate')}
          >
            <Star className={profile.isDefaultGenerate ? 'fill-current' : undefined} />
            {profile.isDefaultGenerate ? '默认出题模型' : '设为默认出题'}
          </Button>
        )}
        {profile.canGrade && (
          <Button
            size="sm"
            variant={profile.isDefaultGrade ? 'secondary' : 'ghost'}
            disabled={profile.isDefaultGrade || !profile.enabled}
            onClick={() => setDefault.mutate('grade')}
          >
            <Star className={profile.isDefaultGrade ? 'fill-current' : undefined} />
            {profile.isDefaultGrade ? '默认阅卷模型' : '设为默认阅卷'}
          </Button>
        )}
      </div>

      {result && (
        <Alert
          className="mt-3"
          variant={result.success ? 'success' : 'danger'}
          title={result.success ? `连接正常 · ${result.latencyMs}ms` : '连接失败'}
        >
          {result.success ? (
            <>回复：{result.reply}</>
          ) : (
            <code className="text-xs break-all">{result.error}</code>
          )}
        </Alert>
      )}
    </GlassCard>
  )
}

export function ModelsPage({ embedded = false }: { embedded?: boolean } = {}) {
  const toast = useToast()
  const qc = useQueryClient()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<ModelProfile | undefined>()
  const [deleting, setDeleting] = useState<ModelProfile | undefined>()

  const { data, isLoading, error } = useQuery({
    queryKey: ['models'],
    queryFn: modelsApi.list,
  })

  const remove = useMutation({
    mutationFn: (id: number) => modelsApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['models'] })
      toast('已删除', { variant: 'success' })
      setDeleting(undefined)
    },
    onError: (e) => toast('删除失败', { variant: 'danger', description: (e as Error).message }),
  })

  const body = (
    <>
      <div className={embedded ? 'mb-4 flex flex-wrap items-center justify-end gap-3' : 'mb-6 flex flex-wrap items-start justify-between gap-3 sm:mb-8'}>
        {!embedded && (
          <div>
            <h1 className="text-[22px] font-semibold tracking-tight sm:text-3xl">模型管理</h1>
            <p className="mt-1.5 text-sm text-muted-foreground sm:text-[15px]">
              接入任意 OpenAI 兼容端点，或通义千问 DashScope 原生。apiKey 加密存于本地。
            </p>
          </div>
        )}
        <Button
          variant="primary"
          onClick={() => {
            setEditing(undefined)
            setFormOpen(true)
          }}
        >
          <Plus />
          添加模型
        </Button>
      </div>

      {isLoading && (
        <div className="space-y-4">
          {[0, 1].map((i) => (
            <GlassCard key={i}>
              <Skeleton className="h-5 w-40" />
              <Skeleton className="mt-3 h-4 w-64" />
              <Skeleton className="mt-2 h-4 w-32" />
            </GlassCard>
          ))}
        </div>
      )}

      {error && (
        <Alert variant="danger" title="加载失败">
          {(error as Error).message}
        </Alert>
      )}

      {data && data.length === 0 && (
        <GlassCard>
          <EmptyState
            icon={Settings2}
            title="还没有配置模型"
            description="添加一个 DeepSeek 或通义千问，先跑通连接测试，就可以开始出题了。"
            action={
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setEditing(undefined)
                  setFormOpen(true)
                }}
              >
                <Plus />
                添加模型
              </Button>
            }
          />
        </GlassCard>
      )}

      {data && data.length > 0 && (
        <div className="space-y-4">
          {data.map((p) => (
            <ModelCard
              key={p.id}
              profile={p}
              onEdit={() => {
                setEditing(p)
                setFormOpen(true)
              }}
              onDelete={() => setDeleting(p)}
            />
          ))}
        </div>
      )}

      <ModelFormDialog open={formOpen} onOpenChange={setFormOpen} editing={editing} />

      <Dialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(undefined)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>删除「{deleting?.name}」？</DialogTitle>
            <DialogDescription>
              历史记录中的模型名会保留，但无法再用它出题或阅卷。此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDeleting(undefined)}>
              取消
            </Button>
            <Button
              variant="destructive"
              loading={remove.isPending}
              onClick={() => deleting && remove.mutate(deleting.id)}
            >
              {remove.isPending && <Loader2 className="animate-spin" />}
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )

  return embedded ? body : <PageContainer>{body}</PageContainer>
}
