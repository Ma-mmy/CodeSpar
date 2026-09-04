import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  LayoutGrid,
  Loader2,
  Rows3,
  Send,
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
  PageContainer,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  useToast,
} from '@/components/ui'
import { Markdown } from '@/components/Markdown'
import { DIFFICULTIES, QUESTION_TYPES } from '@/api/generation'
import { modelsApi } from '@/api/models'
import { examsApi, type ExamDetail, type QuestionForTaking } from '@/api/exams'
import {
  clearDraft,
  filterAnswersByQuestionIds,
  isAnswered,
  loadDraft,
  loadNavMode,
  mergeAnswers,
  saveDraft,
  saveNavMode,
  type DraftMap,
  type NavMode,
} from './draft'
import { FlagToggle, QuestionWidget } from './QuestionWidgets'

function formatElapsed(sec: number) {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

function Timer({
  startedAt,
  timeLimitMin,
}: {
  startedAt?: string
  timeLimitMin?: number
}) {
  const toast = useToast()
  const [elapsed, setElapsed] = useState(0)
  const warned5 = useRef(false)
  const warned0 = useRef(false)

  useEffect(() => {
    if (!startedAt) return
    const start = Date.parse(startedAt)
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [startedAt])

  const limitSec = timeLimitMin ? timeLimitMin * 60 : null
  const remaining = limitSec != null ? limitSec - elapsed : null

  useEffect(() => {
    if (remaining == null) return
    if (remaining <= 300 && remaining > 0 && !warned5.current) {
      warned5.current = true
      toast('还剩不到 5 分钟', { variant: 'warning' })
    }
    if (remaining <= 0 && !warned0.current) {
      warned0.current = true
      toast('时间到，可继续作答或交卷', { variant: 'warning', duration: 8000 })
    }
  }, [remaining, toast])

  const overtime = remaining != null && remaining <= 0
  const urgent = remaining != null && remaining <= 300

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-sm tabular-nums',
        overtime || urgent ? 'bg-destructive/12 text-destructive' : 'bg-black/5 text-muted-foreground dark:bg-white/8',
      )}
    >
      <Clock className="size-3.5" />
      {limitSec != null ? (
        <span>
          {overtime ? '+' : ''}
          {formatElapsed(Math.abs(remaining!))}
          <span className="ml-1 opacity-70">/ {formatElapsed(limitSec)}</span>
        </span>
      ) : (
        <span>{formatElapsed(elapsed)}</span>
      )}
    </div>
  )
}

function NavButton({
  q,
  active,
  answered,
  flagged,
  onClick,
}: {
  q: QuestionForTaking
  active: boolean
  answered: boolean
  flagged: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative flex size-9 items-center justify-center rounded-lg text-sm font-medium transition-colors',
        active
          ? 'bg-primary text-primary-foreground shadow-sm'
          : answered
            ? 'bg-primary/12 text-primary dark:bg-primary/20'
            : 'bg-black/5 text-muted-foreground hover:bg-black/10 dark:bg-white/8 dark:hover:bg-white/12',
      )}
      aria-current={active ? 'true' : undefined}
      aria-label={`第 ${q.seq} 题${answered ? '已答' : '未答'}${flagged ? '待定' : ''}`}
    >
      {q.seq}
      {flagged && (
        <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-chart-4" />
      )}
    </button>
  )
}

export function TakeExamPage() {
  const { id: idParam } = useParams()
  const examId = Number(idParam)
  const navigate = useNavigate()
  const toast = useToast()

  const [exam, setExam] = useState<ExamDetail | null>(null)
  const [answers, setAnswers] = useState<DraftMap>({})
  const [currentIdx, setCurrentIdx] = useState(0)
  const [loading, setLoading] = useState(true)
  const [submitOpen, setSubmitOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [navOpen, setNavOpen] = useState(false)
  const [navMode, setNavMode] = useState<NavMode>(() => loadNavMode())
  const [gradingModelId, setGradingModelId] = useState<number | undefined>()

  function switchNavMode(mode: NavMode) {
    setNavMode(mode)
    saveNavMode(mode)
    if (mode === 'scroll') setNavOpen(false)
  }

  const questionRefs = useRef<Record<number, HTMLElement | null>>({})

  const modelsQuery = useQuery({
    queryKey: ['models'],
    queryFn: modelsApi.list,
  })
  const gradeModels = useMemo(
    () => (modelsQuery.data ?? []).filter((m) => m.enabled && m.canGrade),
    [modelsQuery.data],
  )
  const defaultGradeId = gradeModels.find((m) => m.isDefaultGrade)?.id ?? gradeModels[0]?.id

  useEffect(() => {
    if (gradingModelId == null && defaultGradeId != null) {
      setGradingModelId(defaultGradeId)
    }
  }, [defaultGradeId, gradingModelId])

  const answersRef = useRef(answers)
  answersRef.current = answers
  const saveTimers = useRef<Record<number, number>>({})
  /** 交卷成功后关闭，避免卸载时再 flush 触发「只有作答中才能保存」提示 */
  const syncEnabledRef = useRef(true)

  const questions = exam?.questions ?? []
  const current = questions[currentIdx]

  const unansweredCount = useMemo(
    () => questions.filter((q) => !isAnswered(answers[q.id]?.content)).length,
    [questions, answers],
  )

  const advanceTimer = useRef<number | null>(null)
  useEffect(() => {
    return () => {
      if (advanceTimer.current != null) window.clearTimeout(advanceTimer.current)
    }
  }, [])

  /** 客观题作答完成后：单题模式切下一题；滚动模式滚到下一题卡片。 */
  const goNextAfterAnswer = useCallback(() => {
    if (advanceTimer.current != null) window.clearTimeout(advanceTimer.current)
    advanceTimer.current = window.setTimeout(() => {
      setCurrentIdx((i) => {
        if (i >= questions.length - 1) return i
        const next = i + 1
        if (navMode === 'scroll') {
          const q = questions[next]
          const el = q ? questionRefs.current[q.id] : null
          el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
        return next
      })
    }, 280)
  }, [questions, questions.length, navMode])

  // 滚动模式：根据视口同步「当前题」指示
  useEffect(() => {
    if (navMode !== 'scroll' || questions.length === 0) return
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)
        const top = visible[0]
        if (!top) return
        const id = Number((top.target as HTMLElement).dataset.qid)
        const idx = questions.findIndex((q) => q.id === id)
        if (idx >= 0) setCurrentIdx(idx)
      },
      { rootMargin: '-20% 0px -55% 0px', threshold: [0.2, 0.5, 0.8] },
    )
    for (const q of questions) {
      const el = questionRefs.current[q.id]
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [navMode, questions, exam?.id])

  const flushOne = useCallback(
    async (qid: number, entry: { content: string; flagged: boolean }) => {
      if (!syncEnabledRef.current) return
      try {
        await examsApi.saveAnswer(examId, qid, {
          content: entry.content,
          flagged: entry.flagged,
        })
      } catch (e) {
        if (!syncEnabledRef.current) return
        const msg = (e as Error).message || ''
        // 试卷已交卷/结束时再同步草稿是预期失败，不打扰用户
        if (msg.includes('只有作答中的试卷可以保存答案')) return
        toast('草稿同步失败', {
          variant: 'danger',
          description: msg,
          duration: 6000,
        })
      }
    },
    [examId, toast],
  )

  const flushAll = useCallback(async () => {
    if (!syncEnabledRef.current) return
    const map = answersRef.current
    await Promise.all(
      Object.entries(map).map(([qid, entry]) => flushOne(Number(qid), entry)),
    )
  }, [flushOne])

  const scheduleSave = useCallback(
    (qid: number, entry: { content: string; flagged: boolean }) => {
      if (!syncEnabledRef.current) return
      saveDraft(examId, answersRef.current)
      window.clearTimeout(saveTimers.current[qid])
      saveTimers.current[qid] = window.setTimeout(() => {
        flushOne(qid, entry)
      }, 500)
    },
    [examId, flushOne],
  )

  const updateAnswer = useCallback(
    (qid: number, patch: Partial<{ content: string; flagged: boolean }>) => {
      setAnswers((prev) => {
        const cur = prev[qid] ?? { content: '', flagged: false, updatedAt: 0 }
        const next = {
          content: patch.content ?? cur.content,
          flagged: patch.flagged ?? cur.flagged,
          updatedAt: Date.now(),
        }
        const map = { ...prev, [qid]: next }
        answersRef.current = map
        scheduleSave(qid, next)
        return map
      })
    },
    [scheduleSave],
  )

  useEffect(() => {
    if (!examId) return
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        let detail = await examsApi.get(examId)
        if (detail.status === 'NOT_STARTED') {
          detail = await examsApi.start(examId)
        }
        if (detail.status === 'SUBMITTED' || detail.status === 'GRADED') {
          if (!cancelled) {
            toast('试卷已交卷', { variant: 'warning' })
            navigate(`/exams/${examId}/report`, { replace: true })
          }
          return
        }
        const serverAnswers = await examsApi.answers(examId)
        const local = filterAnswersByQuestionIds(
          loadDraft(examId),
          detail.questions.map((q) => q.id),
        )
        const merged = filterAnswersByQuestionIds(
          mergeAnswers(serverAnswers, local),
          detail.questions.map((q) => q.id),
        )
        if (!cancelled) {
          setExam(detail)
          setAnswers(merged)
          answersRef.current = merged
          saveDraft(examId, merged)
          setLoading(false)
        }
      } catch (e) {
        if (!cancelled) {
          setLoading(false)
          toast('加载试卷失败', { variant: 'danger', description: (e as Error).message })
        }
      }
    })()
    return () => {
      cancelled = true
      Object.values(saveTimers.current).forEach((t) => window.clearTimeout(t))
    }
  }, [examId, navigate, toast])

  // 卸载前尽量 flush
  useEffect(() => {
    return () => {
      void flushAll()
    }
  }, [flushAll])

  async function handleSubmit() {
    setSubmitting(true)
    try {
      Object.values(saveTimers.current).forEach((t) => window.clearTimeout(t))
      await flushAll()
      // 交卷前已落盘；之后禁止再同步，避免跳转卸载时 flush 报错弹 toast
      syncEnabledRef.current = false
      const result = await examsApi.submit(examId, {
        gradingModelId: gradingModelId,
      })
      clearDraft(examId)
      setSubmitOpen(false)
      toast('已交卷，正在阅卷', {
        variant: 'success',
        description:
          result.unansweredCount > 0
            ? `有 ${result.unansweredCount} 题未答。可在报告页查看阅卷进度。`
            : '可在报告页查看阅卷进度与得分。',
      })
      navigate(`/exams/${examId}/report`, { replace: true })
    } catch (e) {
      syncEnabledRef.current = true
      toast('交卷失败', { variant: 'danger', description: (e as Error).message })
    } finally {
      setSubmitting(false)
    }
  }

  if (loading || !exam || !current) {
    return (
      <PageContainer>
        <GlassCard>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            加载试卷…
          </div>
        </GlassCard>
      </PageContainer>
    )
  }

  const curAnswer = answers[current.id] ?? { content: '', flagged: false, updatedAt: 0 }
  const isPager = navMode === 'pager'

  return (
    <div className="min-h-svh">
      {/* 顶栏：悬浮圆角玻璃条，与侧边题号卡视觉一致 */}
      <div className="sticky top-3 z-20 px-4 sm:px-6">
        <header className="glass-strong mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h1 className="truncate text-[15px] font-semibold">{exam.name}</h1>
            <p className="text-[12px] text-muted-foreground">
              第 {current.seq}/{questions.length} 题 · 已答 {questions.length - unansweredCount} · 未答{' '}
              {unansweredCount}
              {!isPager && <span className="ml-1 opacity-70">· 滚动浏览整卷</span>}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div
              className="flex rounded-xl bg-black/5 p-0.5 dark:bg-white/5"
              role="group"
              aria-label="题目展示方式"
            >
              <button
                type="button"
                title="单题模式：一题一页 + 题号导航"
                aria-pressed={isPager}
                onClick={() => switchNavMode('pager')}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] transition-colors',
                  isPager
                    ? 'bg-white/80 font-medium text-foreground shadow-sm dark:bg-white/15'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <LayoutGrid className="size-3.5" />
                <span className="hidden sm:inline">单题</span>
              </button>
              <button
                type="button"
                title="滚动模式：整卷纵向排列，滚轮往下做题"
                aria-pressed={!isPager}
                onClick={() => switchNavMode('scroll')}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] transition-colors',
                  !isPager
                    ? 'bg-white/80 font-medium text-foreground shadow-sm dark:bg-white/15'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Rows3 className="size-3.5" />
                <span className="hidden sm:inline">滚动</span>
              </button>
            </div>
            <Timer startedAt={exam.startedAt} timeLimitMin={exam.timeLimitMin} />
            {isPager && (
              <Button
                variant="outline"
                size="sm"
                className="md:hidden"
                onClick={() => setNavOpen((v) => !v)}
              >
                题号
              </Button>
            )}
            <Button variant="primary" size="sm" onClick={() => setSubmitOpen(true)}>
              <Send />
              交卷
            </Button>
          </div>
        </header>
      </div>

      <div className="mx-auto flex max-w-6xl gap-4 px-4 py-4 sm:px-6 sm:py-6">
        {/* 题号导航（仅单题模式 · 桌面） */}
        {isPager && (
          <aside className="glass sticky top-24 hidden w-44 shrink-0 self-start rounded-2xl p-3 md:block">
            <p className="mb-2 px-1 text-[12px] font-medium text-muted-foreground">题目导航</p>
            <div className="flex flex-wrap gap-1.5">
              {questions.map((q, i) => (
                <NavButton
                  key={q.id}
                  q={q}
                  active={i === currentIdx}
                  answered={isAnswered(answers[q.id]?.content)}
                  flagged={!!answers[q.id]?.flagged}
                  onClick={() => setCurrentIdx(i)}
                />
              ))}
            </div>
          </aside>
        )}

        {/* 移动端题号抽屉（仅单题模式） */}
        {isPager && navOpen && (
          <div className="glass fixed inset-x-4 top-20 z-30 rounded-2xl p-3 shadow-lg md:hidden">
            <div className="flex flex-wrap gap-1.5">
              {questions.map((q, i) => (
                <NavButton
                  key={q.id}
                  q={q}
                  active={i === currentIdx}
                  answered={isAnswered(answers[q.id]?.content)}
                  flagged={!!answers[q.id]?.flagged}
                  onClick={() => {
                    setCurrentIdx(i)
                    setNavOpen(false)
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {/* 主作答区 */}
        <main className="min-w-0 flex-1 space-y-4">
          {isPager ? (
            <>
              <GlassCard>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="primary">{QUESTION_TYPES[current.type]}</Badge>
                  <Badge variant="outline">{DIFFICULTIES[current.difficulty]}</Badge>
                  <Badge variant="outline">{current.fullScore} 分</Badge>
                </div>
                <div className="mt-4">
                  <Markdown>{current.stem}</Markdown>
                </div>
              </GlassCard>

              <GlassCard>
                <QuestionWidget
                  question={current}
                  content={curAnswer.content}
                  onChange={(c) => updateAnswer(current.id, { content: c })}
                  onComplete={goNextAfterAnswer}
                />
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                  <FlagToggle
                    id={`flag-${current.id}`}
                    flagged={curAnswer.flagged}
                    onChange={(v) => updateAnswer(current.id, { flagged: v })}
                  />
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={currentIdx === 0}
                      onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
                    >
                      <ChevronLeft />
                      上一题
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={currentIdx >= questions.length - 1}
                      onClick={() => setCurrentIdx((i) => Math.min(questions.length - 1, i + 1))}
                    >
                      下一题
                      <ChevronRight />
                    </Button>
                  </div>
                </div>
              </GlassCard>
            </>
          ) : (
            <>
              {questions.map((q, i) => {
                const a = answers[q.id] ?? { content: '', flagged: false, updatedAt: 0 }
                return (
                  <section
                    key={q.id}
                    ref={(el) => {
                      questionRefs.current[q.id] = el
                    }}
                    data-qid={q.id}
                    id={`exam-q-${q.id}`}
                    className="scroll-mt-32 space-y-3"
                  >
                    <GlassCard
                      className={cn(
                        i === currentIdx && 'ring-2 ring-primary/35',
                      )}
                    >
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="neutral">第 {q.seq} 题</Badge>
                        <Badge variant="primary">{QUESTION_TYPES[q.type]}</Badge>
                        <Badge variant="outline">{DIFFICULTIES[q.difficulty]}</Badge>
                        <Badge variant="outline">{q.fullScore} 分</Badge>
                        {isAnswered(a.content) && <Badge variant="success">已答</Badge>}
                      </div>
                      <div className="mt-4">
                        <Markdown>{q.stem}</Markdown>
                      </div>
                      <div className="mt-5 border-t border-border pt-4">
                        <QuestionWidget
                          question={q}
                          content={a.content}
                          onChange={(c) => updateAnswer(q.id, { content: c })}
                          onComplete={goNextAfterAnswer}
                        />
                        <div className="mt-4">
                          <FlagToggle
                            id={`flag-${q.id}`}
                            flagged={a.flagged}
                            onChange={(v) => updateAnswer(q.id, { flagged: v })}
                          />
                        </div>
                      </div>
                    </GlassCard>
                  </section>
                )
              })}
            </>
          )}

        </main>
      </div>

      <Dialog open={submitOpen} onOpenChange={setSubmitOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>确认交卷？</DialogTitle>
            <DialogDescription>
              {unansweredCount > 0
                ? `还有 ${unansweredCount} 题未作答。交卷后不能再改，将立即开始阅卷。`
                : '全部题目已作答。交卷后不能再改，将立即开始阅卷。'}
            </DialogDescription>
          </DialogHeader>
          <Field
            label="阅卷模型"
            description="客观题本地判分不耗 token；主观题按评分要点调用此模型。"
          >
            {() =>
              gradeModels.length === 0 ? (
                <Alert variant="warning" title="尚未配置阅卷模型">
                  纯客观卷仍可交卷；含主观题时请先到模型管理开启「可用于阅卷」。
                </Alert>
              ) : (
                <Select
                  value={gradingModelId ? String(gradingModelId) : undefined}
                  onValueChange={(v) => setGradingModelId(Number(v))}
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
          <DialogFooter>
            <Button variant="secondary" onClick={() => setSubmitOpen(false)}>
              继续作答
            </Button>
            <Button variant="primary" loading={submitting} onClick={handleSubmit}>
              <Send />
              确认交卷并阅卷
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
