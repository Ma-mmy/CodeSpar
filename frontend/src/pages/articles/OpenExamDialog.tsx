import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Loader2, RefreshCw, Sparkles } from 'lucide-react'
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  useToast,
} from '@/components/ui'
import {
  articlesApi,
  SUMMARY_STATUS_LABEL,
  type ArticleDetail,
  type SummaryStatus,
} from '@/api/articles'
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

export function OpenExamDialog({
  article,
  open,
  onOpenChange,
  onArticleUpdated,
}: {
  article: ArticleDetail
  open: boolean
  onOpenChange: (open: boolean) => void
  onArticleUpdated: (a: ArticleDetail) => void
}) {
  const navigate = useNavigate()
  const toast = useToast()
  const qc = useQueryClient()

  const examsQ = useQuery({
    queryKey: ['articles', article.id, 'exams'],
    queryFn: () => articlesApi.exams(article.id),
    enabled: open,
  })

  const refine = useMutation({
    mutationFn: (force: boolean) => articlesApi.refine(article.id, { force }),
    onSuccess: (a) => {
      onArticleUpdated(a)
      qc.invalidateQueries({ queryKey: ['articles', 'tree'] })
      if (a.summaryStatus === 'RUNNING') {
        toast('正在提炼考点摘要…', { variant: 'info' })
        void pollUntilReady()
      }
    },
    onError: (e) => toast('启动提炼失败', { variant: 'danger', description: (e as Error).message }),
  })

  async function pollUntilReady() {
    for (let i = 0; i < 90; i++) {
      await new Promise((r) => setTimeout(r, 2000))
      try {
        const a = await articlesApi.get(article.id)
        onArticleUpdated(a)
        if (a.summaryStatus === 'READY') {
          toast('考点摘要已就绪', { variant: 'success' })
          qc.invalidateQueries({ queryKey: ['articles', 'tree'] })
          return a
        }
        if (a.summaryStatus === 'FAILED') {
          toast('考点摘要失败', { variant: 'danger', description: a.summaryError })
          return null
        }
      } catch {
        // continue
      }
    }
    toast('提炼超时，请稍后刷新查看', { variant: 'warning' })
    return null
  }

  async function goOpen(forceRefine: boolean) {
    try {
      let current = article
      // 新开卷：可用 READY / STALE；无摘要或失败才自动提炼。重新提炼：强制重跑。
      const mustRefine =
        forceRefine ||
        current.summaryStatus === 'NONE' ||
        current.summaryStatus === 'FAILED'

      if (mustRefine) {
        if (current.summaryStatus !== 'RUNNING') {
          current = await articlesApi.refine(article.id, { force: forceRefine })
          onArticleUpdated(current)
        }
        if (current.summaryStatus === 'RUNNING') {
          const ready = await pollUntilReady()
          if (!ready) return
          current = ready
        }
      }

      if (current.summaryStatus !== 'READY' && current.summaryStatus !== 'STALE') {
        toast('摘要未就绪，无法开卷', { variant: 'danger' })
        return
      }

      const ctx = await articlesApi.openContext(article.id)
      onOpenChange(false)
      navigate('/generate', {
        state: {
          articleId: ctx.articleId,
          articleTitle: ctx.title,
          prompt: ctx.prompt,
          category: ctx.category ?? '',
          summaryStale: ctx.summaryStatus === 'STALE',
        },
      })
    } catch (e) {
      toast('开卷失败', { variant: 'danger', description: (e as Error).message })
    }
  }

  const retake = useMutation({
    mutationFn: (id: number) => examsApi.retake(id),
    onSuccess: (exam) => {
      onOpenChange(false)
      navigate(`/exams/${exam.id}/take`)
    },
    onError: (e) => toast('重刷失败', { variant: 'danger', description: (e as Error).message }),
  })

  const clearAnswers = useMutation({
    mutationFn: (id: number) => examsApi.clearAnswers(id),
    onSuccess: (exam) => {
      qc.invalidateQueries({ queryKey: ['articles', article.id, 'exams'] })
      toast('已清空答题记录', { variant: 'success' })
      navigate(`/exams/${exam.id}/take`)
      onOpenChange(false)
    },
    onError: (e) => toast('清空失败', { variant: 'danger', description: (e as Error).message }),
  })

  const refining = article.summaryStatus === 'RUNNING' || refine.isPending
  const status = article.summaryStatus as SummaryStatus

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>开卷 · {article.title}</DialogTitle>
          <DialogDescription>
            摘要状态：{SUMMARY_STATUS_LABEL[status]}
            {article.summaryError ? `（${article.summaryError}）` : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="primary"
              disabled={refining}
              onClick={() => void goOpen(false)}
            >
              {refining ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              新开卷
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={refining}
              onClick={() => void goOpen(true)}
            >
              <RefreshCw className="size-4" />
              重新提炼后开卷
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            新开卷使用已有考点摘要；重新提炼会先强制刷新摘要。摘要成功后跳转到出题页预填。
          </p>

          <div>
            <h3 className="mb-2 text-sm font-medium">历史卷</h3>
            {examsQ.isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> 加载中…
              </div>
            ) : (examsQ.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">该文章尚未开过卷</p>
            ) : (
              <ul className="space-y-2">
                {(examsQ.data ?? []).map((exam) => (
                  <HistoryExamRow
                    key={exam.id}
                    exam={exam}
                    onContinue={() => {
                      onOpenChange(false)
                      navigate(`/exams/${exam.id}/take`)
                    }}
                    onReport={() => {
                      onOpenChange(false)
                      navigate(`/exams/${exam.id}/report`)
                    }}
                    onRetake={() => retake.mutate(exam.id)}
                    onClear={() => {
                      if (confirm('确认清空该卷的答题与阅卷记录？题目保留，可重新作答。')) {
                        clearAnswers.mutate(exam.id)
                      }
                    }}
                    busy={retake.isPending || clearAnswers.isPending}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function HistoryExamRow({
  exam,
  onContinue,
  onReport,
  onRetake,
  onClear,
  busy,
}: {
  exam: ExamListItem
  onContinue: () => void
  onReport: () => void
  onRetake: () => void
  onClear: () => void
  busy: boolean
}) {
  const takeable = exam.status === 'NOT_STARTED' || exam.status === 'IN_PROGRESS'
  const done = exam.status === 'SUBMITTED' || exam.status === 'GRADED'
  return (
    <li className="rounded-xl border border-border/60 bg-black/[0.02] p-3 dark:bg-white/[0.03]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{exam.name}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant={STATUS_VARIANT[exam.status]}>{EXAM_STATUS_LABEL[exam.status]}</Badge>
            <span>{exam.questionCount} 题</span>
            {exam.scoreRate != null && <span>得分率 {(exam.scoreRate * 100).toFixed(0)}%</span>}
            <span>{formatTime(exam.createdAt)}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {takeable && (
            <Button type="button" size="sm" disabled={busy} onClick={onContinue}>
              继续作答
            </Button>
          )}
          {done && (
            <>
              <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={onReport}>
                报告
              </Button>
              <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={onRetake}>
                重刷
              </Button>
            </>
          )}
          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onClear}>
            清空记录
          </Button>
        </div>
      </div>
    </li>
  )
}
