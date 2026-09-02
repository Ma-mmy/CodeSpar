import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FileText, RotateCcw, Swords, Trash2 } from 'lucide-react'
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
  EXAM_STATUS_LABEL,
  examsApi,
  type ExamListItem,
  type ExamStatus,
} from '@/api/exams'

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

function pct(rate?: number) {
  if (rate == null || Number.isNaN(rate)) return null
  return `${Math.round(rate * 100)}%`
}

function ExamHistoryCard({
  exam,
  onRetake,
  retaking,
  onDelete,
  deleting,
}: {
  exam: ExamListItem
  onRetake: () => void
  retaking: boolean
  onDelete: () => void
  deleting: boolean
}) {
  const navigate = useNavigate()
  const rateLabel = pct(exam.scoreRate)

  return (
    <GlassCard>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-medium">{exam.name}</h3>
            <Badge variant={STATUS_VARIANT[exam.status]}>{EXAM_STATUS_LABEL[exam.status]}</Badge>
            {exam.categoryLabel && <Badge variant="outline">{exam.categoryLabel}</Badge>}
            {exam.source === 'RETAKE' && <Badge variant="outline">重刷</Badge>}
            {exam.originExamId && <Badge variant="neutral">原卷 #{exam.originExamId}</Badge>}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {exam.questionCount} 题 · 满分 {exam.fullScore}
            {exam.totalScore != null && (
              <>
                {' '}
                · 得分{' '}
                <span className="font-medium text-foreground">
                  {exam.totalScore}
                  {rateLabel && `（${rateLabel}）`}
                </span>
              </>
            )}
          </p>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            交卷于 {formatTime(exam.submittedAt)}
            {exam.durationSec != null && <> · 用时 {Math.max(1, Math.round(exam.durationSec / 60))} 分</>}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate(`/exams/${exam.id}/report`)}>
            <FileText />
            查看报告
          </Button>
          <Button variant="primary" size="sm" loading={retaking} onClick={onRetake}>
            <RotateCcw />
            重刷此卷
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

export function GradingsHistoryPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const qc = useQueryClient()
  const [statusFilter, setStatusFilter] = useState<string>('ALL')
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL')
  const [pendingDelete, setPendingDelete] = useState<ExamListItem | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['exams'],
    queryFn: examsApi.list,
  })
  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: categoriesApi.list,
  })

  /** 阅卷历史：已交卷或已阅卷 */
  const history = useMemo(() => {
    let list = (data ?? []).filter((e) => e.status === 'SUBMITTED' || e.status === 'GRADED')
    if (statusFilter !== 'ALL') list = list.filter((e) => e.status === statusFilter)
    if (categoryFilter === 'NONE') list = list.filter((e) => !e.category)
    else if (categoryFilter !== 'ALL') list = list.filter((e) => e.category === categoryFilter)
    return list
  }, [data, statusFilter, categoryFilter])

  const retake = useMutation({
    mutationFn: (id: number) => examsApi.retake(id),
    onSuccess: (detail) => {
      qc.invalidateQueries({ queryKey: ['exams'] })
      toast('已创建重刷卷', { variant: 'success', description: '同题重做，可对比两次得分。' })
      navigate(`/exams/${detail.id}/take`)
    },
    onError: (e) => toast('重刷失败', { variant: 'danger', description: (e as Error).message }),
  })

  const remove = useMutation({
    mutationFn: (id: number) => examsApi.remove(id),
    onSuccess: () => {
      setPendingDelete(null)
      qc.invalidateQueries({ queryKey: ['exams'] })
      toast('已删除阅卷记录', { variant: 'success' })
    },
    onError: (e) => toast('删除失败', { variant: 'danger', description: (e as Error).message }),
  })

  return (
    <PageContainer>
      <PageHeader
        title="阅卷历史"
        description="已交卷 / 已阅卷的模考记录。可回看完整报告，或重刷同题检验是否掌握。"
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
            <SelectItem value="ALL">全部</SelectItem>
            <SelectItem value="GRADED">已阅卷</SelectItem>
            <SelectItem value="SUBMITTED">已交卷</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">{history.length} 条</span>
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

      {!isLoading && !error && history.length === 0 && (
        <GlassCard>
          <EmptyState
            icon={Swords}
            title="还没有阅卷记录"
            description="完成一套模考并交卷后，记录会出现在这里。"
            action={
              <Button variant="primary" size="sm" onClick={() => navigate('/exams')}>
                <Swords />
                我的试卷
              </Button>
            }
          />
        </GlassCard>
      )}

      <Dialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>删除这条阅卷记录？</DialogTitle>
            <DialogDescription>
              将删除对应试卷的作答与阅卷结果。题目仍保留在题库。
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

      {history.length > 0 && (
        <div className="space-y-4">
          {history.map((exam) => (
            <ExamHistoryCard
              key={exam.id}
              exam={exam}
              retaking={retake.isPending && retake.variables === exam.id}
              onRetake={() => retake.mutate(exam.id)}
              onDelete={() => setPendingDelete(exam)}
              deleting={remove.isPending && remove.variables === exam.id}
            />
          ))}
        </div>
      )}
    </PageContainer>
  )
}
