import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FileText, Play, RotateCcw, Sparkles, Trash2 } from 'lucide-react'
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
import { EXAM_STATUS_LABEL, examsApi, type ExamListItem, type ExamStatus } from '@/api/exams'

const STATUS_VARIANT: Record<ExamStatus, 'neutral' | 'primary' | 'success' | 'warning'> = {
  NOT_STARTED: 'neutral',
  IN_PROGRESS: 'primary',
  SUBMITTED: 'warning',
  GRADED: 'success',
}

function formatTime(iso?: string) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('zh-CN', { hour12: false })
  } catch {
    return iso
  }
}

function ExamCard({
  exam,
  onStart,
  starting,
  onDelete,
  deleting,
}: {
  exam: ExamListItem
  onStart: () => void
  starting: boolean
  onDelete: () => void
  deleting: boolean
}) {
  const navigate = useNavigate()
  const status = exam.status

  return (
    <GlassCard>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-medium">{exam.name}</h3>
            <Badge variant={STATUS_VARIANT[status]}>{EXAM_STATUS_LABEL[status]}</Badge>
            {exam.categoryLabel && <Badge variant="outline">{exam.categoryLabel}</Badge>}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {exam.questionCount} 题 · 满分 {exam.fullScore}
            {exam.timeLimitMin ? ` · 限时 ${exam.timeLimitMin} 分钟` : ' · 不限时'}
            {status === 'SUBMITTED' && ' · 阅卷中或待查看报告'}
            {status === 'GRADED' && exam.totalScore != null && (
              <>
                {' '}
                · 得分 {exam.totalScore}
                {exam.scoreRate != null && `（${Math.round(exam.scoreRate * 100)}%）`}
              </>
            )}
            {exam.source === 'RETAKE' && ' · 重刷'}
          </p>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            创建于 {formatTime(exam.createdAt)}
            {exam.submittedAt && <> · 交卷于 {formatTime(exam.submittedAt)}</>}
            {exam.durationSec != null && <> · 用时 {Math.round(exam.durationSec / 60)} 分</>}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {status === 'NOT_STARTED' && (
            <Button variant="primary" size="sm" loading={starting} onClick={onStart}>
              <Play />
              开始答题
            </Button>
          )}
          {status === 'IN_PROGRESS' && (
            <Button variant="primary" size="sm" onClick={() => navigate(`/exams/${exam.id}/take`)}>
              <RotateCcw />
              继续答题
            </Button>
          )}
          {(status === 'SUBMITTED' || status === 'GRADED') && (
            <Button variant="outline" size="sm" onClick={() => navigate(`/exams/${exam.id}/report`)}>
              <FileText />
              查看报告
            </Button>
          )}
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

export function ExamsPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const qc = useQueryClient()
  const [pendingDelete, setPendingDelete] = useState<ExamListItem | null>(null)
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL')

  const { data, isLoading, error } = useQuery({
    queryKey: ['exams'],
    queryFn: examsApi.list,
  })
  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: categoriesApi.list,
  })

  const filtered = useMemo(() => {
    const list = data ?? []
    if (categoryFilter === 'ALL') return list
    if (categoryFilter === 'NONE') return list.filter((e) => !e.category)
    return list.filter((e) => e.category === categoryFilter)
  }, [data, categoryFilter])

  const start = useMutation({
    mutationFn: (id: number) => examsApi.start(id),
    onSuccess: (detail) => {
      qc.invalidateQueries({ queryKey: ['exams'] })
      navigate(`/exams/${detail.id}/take`)
    },
    onError: (e) => toast('开考失败', { variant: 'danger', description: (e as Error).message }),
  })

  const remove = useMutation({
    mutationFn: (id: number) => examsApi.remove(id),
    onSuccess: () => {
      setPendingDelete(null)
      qc.invalidateQueries({ queryKey: ['exams'] })
      toast('已删除试卷', { variant: 'success' })
    },
    onError: (e) => toast('删除失败', { variant: 'danger', description: (e as Error).message }),
  })

  return (
    <PageContainer>
      <PageHeader title="我的试卷" description="整卷模考：一次开考、全部答完、一次性交卷。" />

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
        <span className="text-sm text-muted-foreground">{filtered.length} 份</span>
      </div>

      {isLoading && (
        <div className="space-y-4">
          {[0, 1].map((i) => (
            <GlassCard key={i}>
              <Skeleton className="h-5 w-48" />
              <Skeleton className="mt-3 h-4 w-64" />
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
            icon={Sparkles}
            title="还没有试卷"
            description="先去出题页生成一套题，确认组卷后会出现在这里。"
            action={
              <Button variant="primary" size="sm" onClick={() => navigate('/generate')}>
                <Sparkles />
                去出题
              </Button>
            }
          />
        </GlassCard>
      )}

      {data && data.length > 0 && filtered.length === 0 && (
        <GlassCard>
          <EmptyState
            icon={Sparkles}
            title="没有符合筛选的试卷"
            description="试试切换分类筛选。"
          />
        </GlassCard>
      )}

      <Dialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>删除这份试卷？</DialogTitle>
            <DialogDescription>
              将删除作答与阅卷记录。题目仍保留在题库，不影响其他试卷。
              {pendingDelete ? `（${pendingDelete.name}）` : ''}
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
          {filtered.map((exam) => (
            <ExamCard
              key={exam.id}
              exam={exam}
              starting={start.isPending && start.variables === exam.id}
              onStart={() => start.mutate(exam.id)}
              onDelete={() => setPendingDelete(exam)}
              deleting={remove.isPending && remove.variables === exam.id}
            />
          ))}
        </div>
      )}
    </PageContainer>
  )
}
