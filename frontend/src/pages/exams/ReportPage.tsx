import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  CheckCircle2,
  CircleDashed,
  Loader2,
  Pencil,
  RefreshCw,
  RotateCcw,
  XCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
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
  Field,
  GlassCard,
  Input,
  PageContainer,
  PageHeader,
  Progress,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Textarea,
  useToast,
} from '@/components/ui'
import { Markdown } from '@/components/Markdown'
import { DIFFICULTIES, QUESTION_TYPES } from '@/api/generation'
import { modelsApi } from '@/api/models'
import {
  GRADING_STATUS_LABEL,
  gradingsApi,
  openGradingStream,
  type QuestionReport,
  type ReportView,
  type RubricHitStatus,
} from '@/api/gradings'
import { examsApi } from '@/api/exams'

const HIT_LABEL: Record<RubricHitStatus, string> = {
  HIT: '命中',
  PARTIAL: '部分',
  MISS: '遗漏',
}

const HIT_VARIANT: Record<RubricHitStatus, 'success' | 'warning' | 'danger'> = {
  HIT: 'success',
  PARTIAL: 'warning',
  MISS: 'danger',
}

function pct(rate?: number) {
  if (rate == null || Number.isNaN(rate)) return '—'
  return `${Math.round(rate * 100)}%`
}

function formatDuration(sec?: number) {
  if (sec == null) return '—'
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return m > 0 ? `${m} 分 ${s} 秒` : `${s} 秒`
}

function ScoreBar({ earned, full, label }: { earned: number; full: number; label: string }) {
  const rate = full > 0 ? earned / full : 0
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="truncate text-muted-foreground">{label}</span>
        <span className="shrink-0 tabular-nums">
          {earned}/{full} · {pct(rate)}
        </span>
      </div>
      <Progress value={Math.min(100, Math.round(rate * 100))} />
    </div>
  )
}

function QuestionBlock({
  q,
  gradingId,
  gradingRunning,
  onChanged,
}: {
  q: QuestionReport
  gradingId?: number
  gradingRunning: boolean
  onChanged: () => void
}) {
  const toast = useToast()
  const [overrideOpen, setOverrideOpen] = useState(false)
  const [score, setScore] = useState(String(q.score ?? 0))
  const [reason, setReason] = useState(q.overrideReason ?? '')

  const retry = useMutation({
    mutationFn: () => gradingsApi.retryQuestion(gradingId!, q.questionId),
    onSuccess: () => {
      toast('已重新提交阅卷', { variant: 'success' })
      onChanged()
    },
    onError: (e) => toast('重试失败', { variant: 'danger', description: (e as Error).message }),
  })

  const override = useMutation({
    mutationFn: () =>
      gradingsApi.override(gradingId!, q.questionId, {
        score: Number(score),
        reason: reason.trim() || undefined,
      }),
    onSuccess: () => {
      setOverrideOpen(false)
      toast('已覆盖分数', { variant: 'success' })
      onChanged()
    },
    onError: (e) => toast('覆盖失败', { variant: 'danger', description: (e as Error).message }),
  })

  const failed = !!q.errorMsg && !q.manualOverride
  const rate = q.fullScore > 0 && q.score != null ? q.score / q.fullScore : null

  return (
    <GlassCard>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="neutral">第 {q.seq} 题</Badge>
            <Badge variant="primary">{QUESTION_TYPES[q.type]}</Badge>
            <Badge variant="outline">{DIFFICULTIES[q.difficulty]}</Badge>
            {q.tags.map((t) => (
              <Badge key={t} variant="outline">
                {t}
              </Badge>
            ))}
            {q.inWrongBook && <Badge variant="warning">错题本</Badge>}
            {q.manualOverride && <Badge variant="warning">人工覆盖</Badge>}
            {q.gradedBy === 'LOCAL' && <Badge variant="neutral">本地判分</Badge>}
            {q.gradedBy === 'MODEL' && <Badge variant="neutral">模型阅卷</Badge>}
          </div>
          <div className="text-sm text-muted-foreground">
            得分{' '}
            <span
              className={cn(
                'font-semibold tabular-nums text-foreground',
                rate != null && rate < 0.6 && 'text-destructive',
                rate != null && rate >= 0.8 && 'text-success',
              )}
            >
              {q.score ?? '—'}
            </span>
            /{q.fullScore}
            {rate != null && <> · {pct(rate)}</>}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {failed && gradingId && !gradingRunning && (
            <Button variant="outline" size="sm" loading={retry.isPending} onClick={() => retry.mutate()}>
              <RefreshCw />
              重试阅卷
            </Button>
          )}
          {gradingId && !gradingRunning && q.score != null && !failed && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setScore(String(q.score ?? 0))
                setReason(q.overrideReason ?? '')
                setOverrideOpen(true)
              }}
            >
              <Pencil />
              改分
            </Button>
          )}
        </div>
      </div>

      <div className="mt-4 space-y-4">
        <div>
          <h4 className="mb-2 text-sm font-medium text-muted-foreground">题干</h4>
          <Markdown>{q.stem}</Markdown>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <h4 className="mb-2 text-sm font-medium text-muted-foreground">你的作答</h4>
            {q.userAnswer ? (
              <div className="rounded-xl bg-black/4 p-3 dark:bg-white/6">
                <Markdown>{q.userAnswer}</Markdown>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">（未作答）</p>
            )}
          </div>
          <div>
            <h4 className="mb-2 text-sm font-medium text-muted-foreground">参考答案</h4>
            {q.referenceAnswer || q.correctAnswer || q.explanation ? (
              <div className="rounded-xl bg-black/4 p-3 dark:bg-white/6">
                {q.correctAnswer && (
                  <p className="mb-2 text-sm">
                    <span className="text-muted-foreground">正确答案：</span>
                    {q.correctAnswer}
                  </p>
                )}
                {q.referenceAnswer && <Markdown>{q.referenceAnswer}</Markdown>}
                {q.explanation && (
                  <div className="mt-2 border-t border-border pt-2 text-sm text-muted-foreground">
                    <Markdown>{q.explanation}</Markdown>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">—</p>
            )}
          </div>
        </div>

        {q.rubricResult && q.rubricResult.length > 0 && (
          <div>
            <h4 className="mb-2 text-sm font-medium text-muted-foreground">评分要点</h4>
            <ul className="space-y-2">
              {q.rubricResult.map((h, i) => (
                <li
                  key={i}
                  className="flex flex-wrap items-start gap-2 rounded-xl border border-border/70 px-3 py-2.5"
                >
                  <Badge variant={HIT_VARIANT[h.status]}>{HIT_LABEL[h.status]}</Badge>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">
                      {h.point}{' '}
                      <span className="tabular-nums text-muted-foreground">
                        ({h.score}/{h.maxScore})
                      </span>
                    </p>
                    {h.reason && <p className="mt-0.5 text-[13px] text-muted-foreground">{h.reason}</p>}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {q.comment && (
          <div>
            <h4 className="mb-2 text-sm font-medium text-muted-foreground">点评</h4>
            <div className="rounded-xl bg-primary/6 p-3 dark:bg-primary/10">
              <Markdown>{q.comment}</Markdown>
            </div>
          </div>
        )}

        {failed && (
          <Alert variant="danger" title="本题阅卷失败">
            {q.errorMsg}
          </Alert>
        )}
      </div>

      <Dialog open={overrideOpen} onOpenChange={setOverrideOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>人工改分</DialogTitle>
            <DialogDescription>
              覆盖第 {q.seq} 题分数（满分 {q.fullScore}）。AI 判分仅供参考，你的判断是最终裁决。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Field label="新分数">
              {(id) => (
                <Input
                  id={id}
                  type="number"
                  min={0}
                  max={q.fullScore}
                  step={0.5}
                  value={score}
                  onChange={(e) => setScore(e.target.value)}
                />
              )}
            </Field>
            <Field label="理由（可选）">
              {(id) => (
                <Textarea
                  id={id}
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="例如：要点其实写到了，模型漏判"
                />
              )}
            </Field>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOverrideOpen(false)}>
              取消
            </Button>
            <Button
              variant="primary"
              loading={override.isPending}
              onClick={() => override.mutate()}
              disabled={Number.isNaN(Number(score)) || Number(score) < 0 || Number(score) > q.fullScore}
            >
              确认覆盖
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </GlassCard>
  )
}

export function ReportPage() {
  const { id: idParam } = useParams()
  const examId = Number(idParam)
  const navigate = useNavigate()
  const toast = useToast()
  const qc = useQueryClient()
  const streamRef = useRef<(() => void) | null>(null)

  const [progress, setProgress] = useState<{ graded: number; total: number } | null>(null)

  const reportQuery = useQuery({
    queryKey: ['exam-report', examId],
    queryFn: () => gradingsApi.report(examId),
    enabled: !!examId,
    refetchInterval: (q) => {
      const data = q.state.data as ReportView | undefined
      return data?.grading?.status === 'RUNNING' ? 4000 : false
    },
  })

  const modelsQuery = useQuery({
    queryKey: ['models'],
    queryFn: modelsApi.list,
  })

  const gradeModels = useMemo(
    () => (modelsQuery.data ?? []).filter((m) => m.enabled && m.canGrade),
    [modelsQuery.data],
  )
  const defaultGradeId = gradeModels.find((m) => m.isDefaultGrade)?.id ?? gradeModels[0]?.id
  const [gradeModelId, setGradeModelId] = useState<number | undefined>()

  useEffect(() => {
    if (gradeModelId == null && defaultGradeId != null) {
      setGradeModelId(defaultGradeId)
    }
  }, [defaultGradeId, gradeModelId])

  const refresh = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['exam-report', examId] })
    qc.invalidateQueries({ queryKey: ['exams'] })
  }, [qc, examId])

  const startGrade = useMutation({
    mutationFn: () => gradingsApi.start(examId, gradeModelId),
    onSuccess: (res) => {
      toast('已开始阅卷', { variant: 'success' })
      refresh()
      attachStream(res.gradingId)
    },
    onError: (e) => toast('启动阅卷失败', { variant: 'danger', description: (e as Error).message }),
  })

  const retake = useMutation({
    mutationFn: () => examsApi.retake(examId),
    onSuccess: (detail) => {
      qc.invalidateQueries({ queryKey: ['exams'] })
      toast('已创建重刷卷', { variant: 'success' })
      navigate(`/exams/${detail.id}/take`)
    },
    onError: (e) => toast('重刷失败', { variant: 'danger', description: (e as Error).message }),
  })

  const attachStream = useCallback(
    (gradingId: number) => {
      streamRef.current?.()
      streamRef.current = openGradingStream(gradingId, (e) => {
        if (e.type === 'progress' || e.type === 'question_done') {
          const graded = Number(e.data.graded ?? 0)
          const total = Number(e.data.total ?? 0)
          setProgress({ graded, total })
        }
        if (e.type === 'done') {
          streamRef.current?.()
          streamRef.current = null
          setProgress(null)
          refresh()
          const status = String(e.data.status ?? '')
          if (status === 'SUCCESS') {
            toast('阅卷完成', { variant: 'success' })
          } else if (status === 'PARTIAL') {
            toast('阅卷部分完成', {
              variant: 'warning',
              description: String(e.data.errorMsg || '部分题目失败，可在下方重试'),
            })
          } else if (status === 'FAILED') {
            toast('阅卷失败', {
              variant: 'danger',
              description: String(e.data.errorMsg || ''),
              duration: 8000,
            })
          }
        }
      })
    },
    [refresh, toast],
  )

  // 若报告显示阅卷中，自动挂 SSE
  useEffect(() => {
    const g = reportQuery.data?.grading
    if (g?.status === 'RUNNING' && g.id) {
      attachStream(g.id)
    }
    return () => {
      streamRef.current?.()
      streamRef.current = null
    }
  }, [reportQuery.data?.grading?.id, reportQuery.data?.grading?.status, attachStream])

  const report = reportQuery.data
  const grading = report?.grading
  const running = grading?.status === 'RUNNING'
  const hasGrading = !!grading

  if (reportQuery.isLoading) {
    return (
      <PageContainer>
        <PageHeader title="成绩报告" description="加载中…" />
        <GlassCard>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="mt-4 h-24 w-full" />
        </GlassCard>
      </PageContainer>
    )
  }

  if (reportQuery.error) {
    return (
      <PageContainer>
        <PageHeader title="成绩报告" />
        <Alert variant="danger" title="加载失败">
          {(reportQuery.error as Error).message}
        </Alert>
        <Button className="mt-4" variant="outline" onClick={() => navigate('/exams')}>
          <ArrowLeft />
          返回试卷列表
        </Button>
      </PageContainer>
    )
  }

  if (!report) return null

  const totalScore = grading?.totalScore
  const fullScore = grading?.fullScore ?? report.fullScore
  const scoreRate = grading?.scoreRate

  return (
    <PageContainer>
      <div className="mb-4">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/exams">
            <ArrowLeft />
            我的试卷
          </Link>
        </Button>
      </div>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <PageHeader
          title={report.examName}
          description={`成绩报告 · ${report.questionCount} 题 · 用时 ${formatDuration(report.durationSec)}`}
        />
        {(report.examStatus === 'SUBMITTED' || report.examStatus === 'GRADED') && !running && (
          <Button variant="primary" size="sm" loading={retake.isPending} onClick={() => retake.mutate()}>
            <RotateCcw />
            重刷此卷
          </Button>
        )}
      </div>

      {report.originExamId != null && (
        <Alert variant="info" title="这是重刷卷" className="mb-4">
          原卷 #{report.originExamId}
          {report.originTotalScore != null && (
            <>
              {' '}
              得分 {report.originTotalScore}
              {report.originScoreRate != null && `（${pct(report.originScoreRate)}）`}
            </>
          )}
          {totalScore != null && report.originTotalScore != null && (
            <>
              {' '}
              · 本次 {totalScore}
              {scoreRate != null && `（${pct(scoreRate)}）`}
              {Number(totalScore) - Number(report.originTotalScore) !== 0 && (
                <>
                  ，
                  {Number(totalScore) > Number(report.originTotalScore) ? '提高' : '变化'}{' '}
                  {Math.abs(Number(totalScore) - Number(report.originTotalScore))} 分
                </>
              )}
            </>
          )}
          。
          <Button
            variant="ghost"
            size="sm"
            className="ml-1 px-1"
            onClick={() => navigate(`/exams/${report.originExamId}/report`)}
          >
            查看原卷报告
          </Button>
        </Alert>
      )}

      {/* 阅卷进度 / 启动 */}
      {!hasGrading && (
        <GlassCard className="mb-4">
          <h2 className="font-medium">尚未阅卷</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            选择阅卷模型后开始。客观题本地判分不耗 token；主观题按评分要点逐点打分。
          </p>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <Field label="阅卷模型" className="min-w-56 flex-1">
              {() =>
                gradeModels.length === 0 ? (
                  <Alert variant="warning" title="没有可阅卷模型">
                    请先到模型管理配置并开启「可用于阅卷」。纯客观卷也可不选模型直接开跑。
                  </Alert>
                ) : (
                  <Select
                    value={gradeModelId ? String(gradeModelId) : undefined}
                    onValueChange={(v) => setGradeModelId(Number(v))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="选择阅卷模型" />
                    </SelectTrigger>
                    <SelectContent>
                      {gradeModels.map((m) => (
                        <SelectItem key={m.id} value={String(m.id)}>
                          {m.name}
                          {m.isDefaultGrade ? '（默认）' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )
              }
            </Field>
            <Button
              variant="primary"
              loading={startGrade.isPending}
              onClick={() => startGrade.mutate()}
            >
              开始阅卷
            </Button>
          </div>
        </GlassCard>
      )}

      {running && (
        <GlassCard className="mb-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Loader2 className="size-4 animate-spin text-primary" />
            阅卷进行中
            {grading?.modelSnapshot && (
              <span className="font-normal text-muted-foreground">· {grading.modelSnapshot}</span>
            )}
          </div>
          <div className="mt-3">
            <Progress
              value={
                progress && progress.total > 0
                  ? Math.round((progress.graded / progress.total) * 100)
                  : grading && grading.questionCount > 0
                    ? Math.round((grading.gradedCount / grading.questionCount) * 100)
                    : 0
              }
            />
            <p className="mt-2 text-sm text-muted-foreground">
              已处理 {progress?.graded ?? grading?.gradedCount ?? 0} /{' '}
              {progress?.total ?? grading?.questionCount ?? report.questionCount} 题
            </p>
          </div>
        </GlassCard>
      )}

      {/* 总分卡片 */}
      {hasGrading && !running && (
        <div className="mb-4 grid gap-4 sm:grid-cols-3">
          <GlassCard>
            <p className="text-sm text-muted-foreground">总分</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums">
              {totalScore ?? '—'}
              <span className="text-lg font-normal text-muted-foreground">/{fullScore}</span>
            </p>
            <p className="mt-1 text-sm text-muted-foreground">得分率 {pct(scoreRate)}</p>
          </GlassCard>
          <GlassCard>
            <p className="text-sm text-muted-foreground">阅卷状态</p>
            <div className="mt-2 flex items-center gap-2">
              {grading?.status === 'SUCCESS' && <CheckCircle2 className="size-5 text-success" />}
              {grading?.status === 'PARTIAL' && <CircleDashed className="size-5 text-chart-4" />}
              {grading?.status === 'FAILED' && <XCircle className="size-5 text-destructive" />}
              <span className="font-medium">
                {grading ? GRADING_STATUS_LABEL[grading.status] : '—'}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {grading?.modelSnapshot ?? '本地判分'}
              {grading && (
                <>
                  {' '}
                  · {grading.promptTokens + grading.completionTokens} tokens
                </>
              )}
            </p>
          </GlassCard>
          <GlassCard>
            <p className="text-sm text-muted-foreground">用时</p>
            <p className="mt-1 text-2xl font-semibold">{formatDuration(report.durationSec)}</p>
            <p className="mt-1 text-sm text-muted-foreground">{report.questionCount} 道题</p>
          </GlassCard>
        </div>
      )}

      {grading?.errorMsg && grading.status !== 'SUCCESS' && !running && (
        <Alert variant="warning" title="阅卷提示" className="mb-4">
          {grading.errorMsg}
        </Alert>
      )}

      {/* 维度分 */}
      {hasGrading && !running && (report.tagScores.length > 0 || report.typeScores.length > 0) && (
        <div className="mb-4 grid gap-4 md:grid-cols-2">
          {report.typeScores.length > 0 && (
            <GlassCard>
              <h3 className="mb-3 font-medium">题型得分</h3>
              <div className="space-y-3">
                {report.typeScores.map((t) => (
                  <ScoreBar
                    key={t.type}
                    label={QUESTION_TYPES[t.type]}
                    earned={t.earned}
                    full={t.full}
                  />
                ))}
              </div>
            </GlassCard>
          )}
          {report.tagScores.length > 0 && (
            <GlassCard>
              <h3 className="mb-3 font-medium">知识点得分</h3>
              <div className="space-y-3">
                {report.tagScores.map((t) => (
                  <ScoreBar key={t.tag} label={t.tag} earned={t.earned} full={t.full} />
                ))}
              </div>
            </GlassCard>
          )}
        </div>
      )}

      {/* 逐题 */}
      {report.questions.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-sm font-medium text-muted-foreground">逐题详情</h2>
          {report.questions.map((q) => (
            <QuestionBlock
              key={q.questionId}
              q={q}
              gradingId={grading?.id}
              gradingRunning={!!running}
              onChanged={refresh}
            />
          ))}
        </div>
      )}
    </PageContainer>
  )
}
