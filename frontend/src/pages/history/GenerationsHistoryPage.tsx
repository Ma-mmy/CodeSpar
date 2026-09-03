import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronUp, Eye, RefreshCw, Sparkles, Trash2 } from 'lucide-react'
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
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  useToast,
} from '@/components/ui'
import { categoriesApi } from '@/api/categories'
import {
  DIFFICULTIES,
  QUESTION_TYPES,
  QUESTION_TYPE_ORDER,
  generationApi,
  type GenerationView,
  type JobStatus,
} from '@/api/generation'

const STATUS_VARIANT: Record<JobStatus, 'primary' | 'success' | 'warning' | 'danger' | 'neutral'> = {
  RUNNING: 'primary',
  SUCCESS: 'success',
  PARTIAL: 'warning',
  FAILED: 'danger',
  CANCELLED: 'neutral',
}

const STATUS_LABEL: Record<JobStatus, string> = {
  RUNNING: '生成中',
  SUCCESS: '成功',
  PARTIAL: '部分成功',
  FAILED: '失败',
  CANCELLED: '已取消',
}

function formatTime(iso?: string) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('zh-CN', { hour12: false })
  } catch {
    return iso
  }
}

function formatCounts(job: GenerationView) {
  const counts = job.params?.counts
  if (!counts) return `${job.requestedCount} 题`
  const parts = QUESTION_TYPE_ORDER.filter((t) => (counts[t] ?? 0) > 0).map(
    (t) => `${QUESTION_TYPES[t]} ${counts[t]}`,
  )
  return parts.length > 0 ? parts.join(' · ') : `${job.requestedCount} 题`
}

function JobCard({
  job,
  expanded,
  onToggle,
  onRerun,
  rerunning,
  onDelete,
  deleting,
}: {
  job: GenerationView
  expanded: boolean
  onToggle: () => void
  onRerun: () => void
  rerunning: boolean
  onDelete: () => void
  deleting: boolean
}) {
  const navigate = useNavigate()
  const status = job.status

  return (
    <GlassCard>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>
            {job.categoryLabel && <Badge variant="outline">{job.categoryLabel}</Badge>}
            {job.modelSnapshot && <Badge variant="outline">{job.modelSnapshot}</Badge>}
            {job.params?.difficulty && (
              <Badge variant="outline">{DIFFICULTIES[job.params.difficulty]}</Badge>
            )}
          </div>
          <p className="mt-2 text-sm leading-relaxed text-foreground">
            {expanded ? job.prompt : job.prompt.length > 120 ? job.prompt.slice(0, 120) + '…' : job.prompt}
          </p>
          {job.prompt.length > 120 && (
            <button
              type="button"
              className="mt-1 inline-flex items-center gap-1 text-[13px] text-primary"
              onClick={onToggle}
            >
              {expanded ? (
                <>
                  收起 <ChevronUp className="size-3.5" />
                </>
              ) : (
                <>
                  展开全文 <ChevronDown className="size-3.5" />
                </>
              )}
            </button>
          )}
          <p className="mt-2 text-[13px] text-muted-foreground">
            {formatCounts(job)} · 生成 {job.generatedCount}/{job.requestedCount}
            {(job.promptTokens > 0 || job.completionTokens > 0) && (
              <> · {job.promptTokens + job.completionTokens} tokens</>
            )}
            {job.costMs > 0 && <> · {(job.costMs / 1000).toFixed(1)}s</>}
            <> · {formatTime(job.createdAt)}</>
          </p>
          {job.params?.tags && job.params.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {job.params.tags.map((t) => (
                <Badge key={t} variant="outline">
                  {t}
                </Badge>
              ))}
            </div>
          )}
          {job.errorMsg && status !== 'SUCCESS' && (
            <p className="mt-2 text-[13px] text-destructive">{job.errorMsg}</p>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate(`/generate/${job.id}`)}>
            <Eye />
            查看
          </Button>
          <Button variant="primary" size="sm" loading={rerunning} onClick={onRerun}>
            <RefreshCw />
            再来一次
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            title="删除"
            aria-label="删除"
            loading={deleting}
            onClick={onDelete}
            className="text-muted-foreground hover:text-foreground"
          >
            <Trash2 />
          </Button>
        </div>
      </div>
    </GlassCard>
  )
}

export function GenerationsHistoryPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const qc = useQueryClient()
  const [statusFilter, setStatusFilter] = useState<string>('ALL')
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL')
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [pendingDelete, setPendingDelete] = useState<GenerationView | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['generations'],
    queryFn: generationApi.list,
  })
  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: categoriesApi.list,
  })

  const filtered = useMemo(() => {
    let list = data ?? []
    if (statusFilter !== 'ALL') list = list.filter((j) => j.status === statusFilter)
    if (categoryFilter === 'NONE') list = list.filter((j) => !j.category)
    else if (categoryFilter !== 'ALL') list = list.filter((j) => j.category === categoryFilter)
    return list
  }, [data, statusFilter, categoryFilter])

  const rerun = useMutation({
    mutationFn: (id: number) => generationApi.rerun(id),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['generations'] })
      toast('已用相同参数重新出题', { variant: 'success' })
      navigate(`/generate/${res.id}`)
    },
    onError: (e) =>
      toast('再来一次失败', { variant: 'danger', description: (e as Error).message, duration: 8000 }),
  })

  const remove = useMutation({
    mutationFn: (id: number) => generationApi.remove(id),
    onSuccess: () => {
      setPendingDelete(null)
      qc.invalidateQueries({ queryKey: ['generations'] })
      toast('已删除出题记录', { variant: 'success' })
    },
    onError: (e) =>
      toast('删除失败', { variant: 'danger', description: (e as Error).message }),
  })

  return (
    <PageContainer>
      <PageHeader
        title="出题历史"
        description="每次出题任务一条记录。可查看生成结果，或用相同参数再来一次。"
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="分类" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">全部分类</SelectItem>
            <SelectItem value="NONE">未分类</SelectItem>
            {(categories ?? []).map((c) => (
              <SelectItem key={c.code} value={c.code}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="状态" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">全部状态</SelectItem>
            <SelectItem value="SUCCESS">成功</SelectItem>
            <SelectItem value="PARTIAL">部分成功</SelectItem>
            <SelectItem value="FAILED">失败</SelectItem>
            <SelectItem value="RUNNING">生成中</SelectItem>
            <SelectItem value="CANCELLED">已取消</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">{filtered.length} 条</span>
      </div>

      {isLoading && (
        <div className="space-y-4">
          {[0, 1].map((i) => (
            <GlassCard key={i}>
              <Skeleton className="h-5 w-48" />
              <Skeleton className="mt-3 h-4 w-full" />
            </GlassCard>
          ))}
        </div>
      )}

      {error && (
        <Alert variant="danger" title="加载失败">
          {(error as Error).message}
        </Alert>
      )}

      {data && filtered.length === 0 && (
        <GlassCard>
          <EmptyState
            icon={Sparkles}
            title={data.length === 0 ? '还没有出题记录' : '没有符合筛选的记录'}
            description={data.length === 0 ? '去出题页写一段提示词，生成第一套卷子。' : '试试切换状态筛选。'}
            action={
              data.length === 0 ? (
                <Button variant="primary" size="sm" onClick={() => navigate('/generate')}>
                  <Sparkles />
                  去出题
                </Button>
              ) : undefined
            }
          />
        </GlassCard>
      )}

      <Dialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>删除这条出题记录？</DialogTitle>
            <DialogDescription>
              将删除任务与未入卷的草稿题。已组进试卷的题目会保留，相关试卷不受影响。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setPendingDelete(null)}>
              取消
            </Button>
            <Button
              variant="outline"
              loading={remove.isPending}
              onClick={() => pendingDelete && remove.mutate(pendingDelete.id)}
            >
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {filtered.length > 0 && (
        <div className="space-y-4">
          {filtered.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              expanded={expandedId === job.id}
              onToggle={() => setExpandedId((id) => (id === job.id ? null : job.id))}
              onRerun={() => rerun.mutate(job.id)}
              rerunning={rerun.isPending && rerun.variables === job.id}
              onDelete={() => setPendingDelete(job)}
              deleting={remove.isPending && remove.variables === job.id}
            />
          ))}
        </div>
      )}
    </PageContainer>
  )
}
