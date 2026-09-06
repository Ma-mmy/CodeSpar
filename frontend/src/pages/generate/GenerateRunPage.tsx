import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  FileCheck,
  Loader2,
  Pause,
  RefreshCw,
  Sparkles,
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
  EmptyState,
  GlassCard,
  PageContainer,
  PageHeader,
  Progress,
  Textarea,
  useToast,
} from '@/components/ui'
import {
  QUESTION_TYPES,
  generationApi,
  openGenerationStream,
  type BatchResultView,
  type GenerationView,
  type JobStatus,
  type QuestionType,
  type QuestionView,
} from '@/api/generation'
import { QuestionCard } from './QuestionCard'
import type { GeneratePrefillState } from './GeneratePage'

function prefillFromJob(job: GenerationView): GeneratePrefillState {
  const p = job.params
  const language = p?.language === 'en' ? 'en' : p?.language === 'zh' ? 'zh' : undefined
  return {
    prompt: job.prompt,
    articleId: job.articleId,
    articleContextMode: p?.articleContextMode ?? 'SUMMARY',
    category: job.category ?? p?.category ?? '',
    counts: p?.counts ?? {},
    difficulty: p?.difficulty,
    tags: p?.tags ?? [],
    modelProfileId: job.modelProfileId ?? p?.modelProfileId,
    language,
    autoOptimize: p?.autoOptimize,
    fromJobId: job.id,
  }
}

const JOB_BADGE: Record<JobStatus, { label: string; variant: 'primary' | 'success' | 'warning' | 'danger' | 'neutral' }> = {
  RUNNING: { label: '生成中', variant: 'primary' },
  SUCCESS: { label: '全部成功', variant: 'success' },
  PARTIAL: { label: '部分成功', variant: 'warning' },
  FAILED: { label: '失败', variant: 'danger' },
  CANCELLED: { label: '已取消', variant: 'neutral' },
}

function truncatePrompt(s: string) {
  return s.length > 40 ? s.slice(0, 40) + '…' : s
}

/** 关自动优化时 skip 也会写入 optimizedPrompt，不能当成「又优化了一遍」。 */
function instructionBox(job: GenerationView): { title: string; text: string } | null {
  const text = job.optimizedPrompt
  if (!text || text === job.prompt) return null
  return {
    title: job.params?.autoOptimize === false ? '实际出题指令' : '优化后的出题指令',
    text,
  }
}

function BatchRow({ batch }: { batch: BatchResultView }) {
  const status = batch.status
  const Icon =
    status === 'SUCCESS' ? CheckCircle2 : status === 'FAILED' ? XCircle : status === 'RUNNING' ? Loader2 : Circle
  const color =
    status === 'SUCCESS' ? 'text-success' : status === 'FAILED' ? 'text-destructive' : 'text-muted-foreground'
  const label =
    status === 'SUCCESS'
      ? `${batch.generatedCount} 题`
      : status === 'FAILED'
        ? '失败'
        : status === 'CANCELLED'
          ? '已取消'
          : status === 'RUNNING'
            ? '生成中…'
            : '等待中'
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <span className="flex items-center gap-2 text-sm">
        <Icon className={cn('size-4 shrink-0', color, status === 'RUNNING' && 'animate-spin')} />
        {QUESTION_TYPES[batch.type]}
      </span>
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  )
}

function FailedBatchCard({ batch, onRetry }: { batch: BatchResultView; onRetry: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  return (
    <GlassCard className="border-destructive/30">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <XCircle className="size-4 shrink-0 text-destructive" />
            <span className="text-sm font-medium">{QUESTION_TYPES[batch.type]} 生成失败</span>
            <Badge variant="danger">还缺 {Math.max(0, batch.requestedCount - batch.generatedCount)} 题</Badge>
          </div>
          {batch.errorMsg && (
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{batch.errorMsg}</p>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          loading={busy}
          onClick={async () => {
            setBusy(true)
            try {
              await onRetry()
            } finally {
              setBusy(false)
            }
          }}
        >
          <RefreshCw />
          重试
        </Button>
      </div>
      {batch.rawOutput && (
        <details className="group mt-2">
          <summary className="cursor-pointer text-xs text-muted-foreground transition-colors select-none hover:text-foreground">
            查看模型原始输出
          </summary>
          <pre className="mt-2 max-h-52 overflow-auto rounded-xl bg-black/5 p-3 text-xs leading-relaxed whitespace-pre-wrap dark:bg-white/8">
            {batch.rawOutput}
          </pre>
        </details>
      )}
    </GlassCard>
  )
}

export function GenerateRunPage() {
  const { jobId: jobIdParam } = useParams()
  const jobId = Number(jobIdParam)
  const navigate = useNavigate()
  const toast = useToast()

  const [job, setJob] = useState<GenerationView | null>(null)
  const [questions, setQuestions] = useState<QuestionView[]>([])
  const [batches, setBatches] = useState<BatchResultView[]>([])
  const [phase, setPhase] = useState<'loading' | 'running' | 'preview'>('loading')
  /** 出题流水线子阶段：先优化提示词，再分批生成 */
  const [runStep, setRunStep] = useState<'optimize' | 'generate'>('optimize')
  const [regenerating, setRegenerating] = useState<QuestionView | null>(null)
  const [deleting, setDeleting] = useState<QuestionView | null>(null)
  const [feedback, setFeedback] = useState('')
  const [regenBusy, setRegenBusy] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const streamRef = useRef<(() => void) | null>(null)
  const phaseRef = useRef(phase)
  phaseRef.current = phase

  const upsertBatch = useCallback((patch: Partial<BatchResultView> & { type: QuestionType }) => {
    setBatches((prev) => {
      const idx = prev.findIndex((b) => b.type === patch.type)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = { ...next[idx], ...patch }
        return next
      }
      return [...prev, { status: 'PENDING', requestedCount: 0, generatedCount: 0, ...patch }]
    })
  }, [])

  const loadPreview = useCallback(async (id: number) => {
    const [qs, bs] = await Promise.all([generationApi.questions(id), generationApi.batches(id)])
    setQuestions(qs)
    setBatches(bs)
  }, [])

  /** 任务已终态：关掉 SSE，进入预览 */
  const finishToPreview = useCallback(
    async (id: number) => {
      streamRef.current?.()
      streamRef.current = null
      try {
        const [j, qs, bs] = await Promise.all([
          generationApi.get(id),
          generationApi.questions(id),
          generationApi.batches(id),
        ])
        setJob(j)
        setQuestions(qs)
        setBatches(bs)
        setPhase('preview')
      } catch (e) {
        toast('加载结果失败', { variant: 'danger', description: (e as Error).message })
        setPhase('preview')
      }
    },
    [toast],
  )

  /** SSE 断线或长时间无 done 时，用轮询对齐真实状态 */
  const syncJobFromServer = useCallback(
    async (id: number) => {
      try {
        const [j, bs] = await Promise.all([generationApi.get(id), generationApi.batches(id)])
        setJob(j)
        setBatches(bs)
        if (j.optimizedPrompt || j.params?.autoOptimize === false) setRunStep('generate')
        if (j.status !== 'RUNNING') {
          await finishToPreview(id)
        }
      } catch {
        // 轮询失败不打断页面，下次再试
      }
    },
    [finishToPreview],
  )

  const openStream = useCallback(
    (id: number) => {
      streamRef.current?.()
      streamRef.current = openGenerationStream(id, (e) => {
        switch (e.type) {
          case 'optimize_started':
            setRunStep('optimize')
            break
          case 'optimize_done':
            setRunStep('generate')
            setJob((prev) =>
              prev
                ? {
                    ...prev,
                    optimizedPrompt: String(e.data.optimizedPrompt ?? prev.optimizedPrompt ?? ''),
                    promptTokens: Number(e.data.promptTokens ?? prev.promptTokens),
                    completionTokens: Number(e.data.completionTokens ?? prev.completionTokens),
                    costMs: Number(e.data.costMs ?? prev.costMs),
                  }
                : prev,
            )
            if (e.data.skipped) {
              break
            }
            if (e.data.fallback) {
              toast('提示词优化未成功，已用原文继续出题', {
                variant: 'warning',
                description: String(e.data.error || ''),
              })
            }
            break
          case 'batch_started':
            setRunStep('generate')
            upsertBatch({
              type: e.data.type as QuestionType,
              status: 'RUNNING',
              requestedCount: Number(e.data.count ?? 0),
            })
            break
          case 'batch_done':
            upsertBatch({
              type: e.data.type as QuestionType,
              status: 'SUCCESS',
              generatedCount: Number(e.data.generated ?? 0),
            })
            break
          case 'batch_failed':
            upsertBatch({
              type: e.data.type as QuestionType,
              status: 'FAILED',
              errorMsg: String(e.data.error ?? ''),
              ...(e.data.generated != null ? { generatedCount: Number(e.data.generated) } : {}),
            })
            break
          case 'progress':
            setJob((prev) =>
              prev
                ? {
                    ...prev,
                    generatedCount: Number(e.data.generated ?? prev.generatedCount),
                    promptTokens: Number(e.data.promptTokens ?? prev.promptTokens),
                    completionTokens: Number(e.data.completionTokens ?? prev.completionTokens),
                    costMs: Number(e.data.costMs ?? prev.costMs),
                  }
                : prev,
            )
            break
          case 'done':
            void finishToPreview(id)
            break
          case 'stream_error':
            // SSE 被代理/浏览器掐断时，立刻向服务端对齐一次
            void syncJobFromServer(id)
            break
        }
      })
    },
    [upsertBatch, finishToPreview, syncJobFromServer, toast],
  )

  useEffect(() => {
    if (!jobId) {
      setPhase('preview')
      return
    }
    let cancelled = false
    setPhase('loading')
    setQuestions([])
    setBatches([])
    setJob(null)
    Promise.all([generationApi.get(jobId), generationApi.batches(jobId)])
      .then(([j, bs]) => {
        if (cancelled) return
        setJob(j)
        setBatches(bs)
        setRunStep(j.optimizedPrompt || j.params?.autoOptimize === false ? 'generate' : 'optimize')
        if (j.status === 'RUNNING') {
          setPhase('running')
          openStream(jobId)
        } else {
          setPhase('preview')
          loadPreview(jobId)
        }
      })
      .catch((e) => {
        if (cancelled) return
        setPhase('preview')
        toast('加载失败', { variant: 'danger', description: (e as Error).message, duration: 8000 })
      })
    return () => {
      cancelled = true
      streamRef.current?.()
      streamRef.current = null
    }
  }, [jobId, openStream, loadPreview, toast])

  // 生成中兜底轮询：SSE 丢包/超时后仍能进入预览
  useEffect(() => {
    if (!jobId || phase !== 'running') return
    const timer = window.setInterval(() => {
      if (phaseRef.current !== 'running') return
      void syncJobFromServer(jobId)
    }, 4000)
    return () => window.clearInterval(timer)
  }, [jobId, phase, syncJobFromServer])

  /* -------------------------------------------------- 操作 */

  async function handleCancel() {
    if (!jobId) return
    try {
      await generationApi.cancel(jobId)
      toast('已请求取消', { variant: 'warning' })
    } catch (e) {
      toast('取消失败', { variant: 'danger', description: (e as Error).message })
    }
  }

  async function handleConfirm() {
    if (!jobId) return
    try {
      const { examId } = await generationApi.confirm(jobId)
      toast('试卷已创建，开始答题', { variant: 'success' })
      navigate(`/exams/${examId}/take`)
    } catch (e) {
      toast('组卷失败', { variant: 'danger', description: (e as Error).message, duration: 8000 })
    }
  }

  async function handleRetry(type: QuestionType) {
    if (!jobId) return
    try {
      await generationApi.retryBatch(jobId, type)
      setRunStep('generate')
      setPhase('running')
      openStream(jobId)
    } catch (e) {
      toast('重试失败', { variant: 'danger', description: (e as Error).message, duration: 8000 })
    }
  }

  async function handleDelete(qid: number) {
    setDeleteBusy(true)
    try {
      await generationApi.deleteQuestion(qid)
      setQuestions((prev) => prev.filter((q) => q.id !== qid))
      setDeleting(null)
      toast('已删除', { variant: 'success' })
    } catch (e) {
      toast('删除失败', { variant: 'danger', description: (e as Error).message })
    } finally {
      setDeleteBusy(false)
    }
  }

  async function handleRegenerate(qid: number, fb: string) {
    setRegenBusy(true)
    try {
      const updated = await generationApi.regenerateQuestion(qid, fb.trim() || undefined)
      setQuestions((prev) => prev.map((q) => (q.id === qid ? updated : q)))
      setRegenerating(null)
      toast('已重新生成', { variant: 'success' })
    } catch (e) {
      toast('重生成失败', { variant: 'danger', description: (e as Error).message, duration: 8000 })
    } finally {
      setRegenBusy(false)
    }
  }

  /* -------------------------------------------------- 视图 */

  if (phase === 'loading' || (!job && phase === 'running')) {
    return (
      <PageContainer>
        <div className="space-y-4">
          <GlassCard>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              加载出题任务…
            </div>
          </GlassCard>
        </div>
      </PageContainer>
    )
  }

  if (phase === 'running' && job) {
    const skippedOptimize = job.params?.autoOptimize === false
    const step = skippedOptimize ? 'generate' : runStep
    const instruction = instructionBox(job)
    const pct =
      step === 'optimize'
        ? 8
        : job.requestedCount > 0
          ? Math.min(100, Math.round((job.generatedCount / job.requestedCount) * 100))
          : 0
    return (
      <PageContainer>
        <PageHeader title="正在出题" description={truncatePrompt(job.prompt)} />
        <GlassCard>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Loader2 className="size-4 animate-spin text-primary" />
              <span className="text-sm font-medium">
                {step === 'optimize' ? '正在优化出题要求…' : '模型正在生成题目…'}
              </span>
            </div>
            <Button variant="outline" size="sm" onClick={handleCancel}>
              <Pause />
              取消
            </Button>
          </div>
          <div className="mt-4 flex items-center gap-4">
            <Progress value={pct} className="flex-1" />
            <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
              {step === 'optimize' ? '优化中' : `${job.generatedCount}/${job.requestedCount}`}
            </span>
          </div>
          <p className="mt-3 text-[13px] text-muted-foreground">
            已用 {job.promptTokens + job.completionTokens} tokens · 耗时 {(job.costMs / 1000).toFixed(1)}s
          </p>
          {instruction && (
            <div className="mt-4 rounded-xl border border-border/70 bg-black/4 p-3 dark:bg-white/6">
              <p className="text-[12px] font-medium text-muted-foreground">{instruction.title}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{instruction.text}</p>
            </div>
          )}
        </GlassCard>
        {step === 'generate' && (
          <GlassCard className="mt-4">
            <h2 className="text-sm font-medium">批次进度</h2>
            <div className="mt-1 divide-y divide-border">
              {batches.map((b) => (
                <BatchRow key={b.type} batch={b} />
              ))}
            </div>
          </GlassCard>
        )}
      </PageContainer>
    )
  }

  // 预览
  const hasQuestions = questions.length > 0
  const failed = batches.filter((b) => b.status === 'FAILED')
  const totalScore = questions.reduce((s, q) => s + q.fullScore, 0)
  const badge = JOB_BADGE[job?.status ?? 'SUCCESS']
  const previewInstruction = job ? instructionBox(job) : null

  return (
    <PageContainer>
      <PageHeader title="出题预览" description={job ? truncatePrompt(job.prompt) : undefined} />

      {previewInstruction && (
        <GlassCard className="mb-4">
          <p className="text-[12px] font-medium text-muted-foreground">{previewInstruction.title}</p>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{previewInstruction.text}</p>
        </GlassCard>
      )}

      <GlassCard>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[15px] font-medium">生成结果</h2>
              <Badge variant={badge.variant}>{badge.label}</Badge>
            </div>
            <p className="mt-1 text-[13px] text-muted-foreground">
              已生成 {questions.length} 题 · 共 {totalScore} 分 · 模型 {job?.modelSnapshot ?? '—'} · 已用{' '}
              {(job?.promptTokens ?? 0) + (job?.completionTokens ?? 0)} tokens
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                navigate(job?.articleId != null
                  ? `/generate?articleId=${job.articleId}&articleContextMode=${job.params?.articleContextMode ?? 'SUMMARY'}`
                  : '/generate', {
                  state: job ? prefillFromJob(job) : undefined,
                })
              }
            >
              <ArrowLeft />
              返回修改
            </Button>
            <Button variant="primary" size="sm" disabled={!hasQuestions} onClick={handleConfirm}>
              <FileCheck />
              确认组卷
            </Button>
          </div>
        </div>

        {job?.status === 'CANCELLED' && (
          <Alert className="mt-3" variant="warning" title="任务已取消">
            已生成的题目保留为草稿，可以重试缺失的批次或从头再来。
          </Alert>
        )}
        {job?.status === 'FAILED' && (
          <Alert className="mt-3" variant="danger" title="出题失败">
            所有批次都失败了，可在下方重试失败的批次。
          </Alert>
        )}
        {job?.status === 'PARTIAL' && (
          <Alert className="mt-3" variant="warning" title="部分成功">
            部分题型生成失败，可在下方重试。
          </Alert>
        )}
      </GlassCard>

      {failed.length > 0 && (
        <div className="mt-4 space-y-3">
          {failed.map((b) => (
            <FailedBatchCard key={b.type} batch={b} onRetry={() => handleRetry(b.type)} />
          ))}
        </div>
      )}

      {questions.length > 0 && (
        <div className="mt-4 grid min-w-0 grid-cols-1 gap-4">
          {questions.map((q) => (
            <QuestionCard
              key={q.id}
              question={q}
              onRegenerate={() => {
                setRegenerating(q)
                setFeedback('')
              }}
              onDelete={() => setDeleting(q)}
            />
          ))}
        </div>
      )}

      {!hasQuestions && (
        <GlassCard className="mt-4">
          <EmptyState
            icon={Sparkles}
            title="还没有可用题目"
            description="可以重试失败的批次，或返回修改出题参数重新生成。"
          />
        </GlassCard>
      )}

      {/* 重新生成对话框 */}
      <Dialog open={!!regenerating} onOpenChange={(o) => !o && setRegenerating(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>重新生成此题</DialogTitle>
            <DialogDescription>
              可选填修改意见，如「太简单了，加大难度」「换个场景，贴近故障排查」。
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="修改意见（可选）"
            className="min-h-20"
          />
          <DialogFooter>
            <Button variant="secondary" onClick={() => setRegenerating(null)}>
              取消
            </Button>
            <Button
              variant="primary"
              loading={regenBusy}
              onClick={() => regenerating && handleRegenerate(regenerating.id, feedback)}
            >
              <RefreshCw />
              重新生成
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认 */}
      <Dialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>删除这道题？</DialogTitle>
            <DialogDescription>删除后不再出现在本次试卷中，可通过「重新生成」补上。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDeleting(null)}>
              取消
            </Button>
            <Button
              variant="destructive"
              loading={deleteBusy}
              onClick={() => deleting && handleDelete(deleting.id)}
            >
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  )
}
