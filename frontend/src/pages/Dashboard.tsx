import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  BookOpen,
  ChevronRight,
  FileText,
  Sparkles,
  Target,
  TrendingUp,
  Zap,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  GlassCard,
  PageContainer,
  Progress,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
} from '@/components/ui'
import { cn } from '@/lib/utils'
import { dashboardApi, type TagStat, type TrendPoint } from '@/api/dashboard'
import { EXAM_STATUS_LABEL, type ExamListItem, type ExamStatus } from '@/api/exams'
import { QUESTION_TYPES, QUESTION_TYPE_ORDER } from '@/api/generation'
import type { GeneratePrefillState } from '@/pages/generate/GeneratePage'

const STATUS_VARIANT: Record<ExamStatus, 'neutral' | 'primary' | 'success' | 'warning'> = {
  NOT_STARTED: 'neutral',
  IN_PROGRESS: 'primary',
  SUBMITTED: 'warning',
  GRADED: 'success',
}

const TOOLTIP_STYLE: CSSProperties = {
  background: 'var(--popover)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  color: 'var(--foreground)',
  fontSize: 12,
  boxShadow: 'var(--glass-shadow)',
}

const TICK = { fill: 'var(--muted-foreground)', fontSize: 12 } as const

const DASHBOARD_MESSAGES = [
  '题海不用狂澜，灵机自破难关。准备好开启今日研习了吗？',
  '何须苦渡无涯海，巧思一点意自闲。今日练笔，从容以对。',
  '贪多不如得趣，博闻贵在心清。抽一缕闲暇，练两三关隘。',
  '莫谓前路漫漫，点滴皆是通途。静候下笔，渐入佳境。',
  '磨砚正宜此时，破关且待今朝。智能题库已备，静候君来。',
  '辨瑕始知胜处，淬锋方显奇功。挑几道好题，试一试手笔。',
  '见微知漏明方向，下笔千钧现真章。今日的第一关，交给你了。',
  '积跬步以致千里，汇纤尘以成泰山。每一次落笔，都是进阶的序曲。',
  '偷得浮生半日闲，借题磨砺两三篇。',
  '哪有什么天生开窍，不过是随手破了一层窗户纸。',
  '题海里别较劲，顺着思路走，顺手就解开了。',
  '累了就放一放，心闲下来，答案自己就冒出来了。',
] as const

function DashboardHeader() {
  const [messageIndex, setMessageIndex] = useState(() => Math.floor(Math.random() * DASHBOARD_MESSAGES.length))
  const [messageVisible, setMessageVisible] = useState(true)

  useEffect(() => {
    const pickRandomMessage = (current: number) => {
      const offset = Math.floor(Math.random() * (DASHBOARD_MESSAGES.length - 1)) + 1
      return (current + offset) % DASHBOARD_MESSAGES.length
    }

    let swapTimer: number | undefined
    const interval = window.setInterval(() => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        setMessageIndex(pickRandomMessage)
        return
      }

      setMessageVisible(false)
      swapTimer = window.setTimeout(() => {
        setMessageIndex(pickRandomMessage)
        setMessageVisible(true)
      }, 300)
    }, 20000)

    return () => {
      window.clearInterval(interval)
      if (swapTimer !== undefined) window.clearTimeout(swapTimer)
    }
  }, [])

  return (
    <header className="w-full sm:min-w-0 sm:flex-1">
      <h1 className="text-[22px] font-semibold tracking-tight sm:text-3xl">仪表盘</h1>
      <div className="mt-1.5 h-10 overflow-hidden sm:h-6">
        <p
          className={cn(
            'text-sm text-muted-foreground transition-[opacity,transform] duration-300 ease-out sm:text-[15px]',
            messageVisible ? 'translate-y-0 opacity-100' : '-translate-y-1.5 opacity-0',
          )}
        >
          {DASHBOARD_MESSAGES[messageIndex]}
        </p>
      </div>
    </header>
  )
}

function pct(rate?: number | null) {
  if (rate == null || Number.isNaN(Number(rate))) return '—'
  return `${Math.round(Number(rate) * 100)}%`
}

function rateTone(rate?: number | null) {
  if (rate == null || Number.isNaN(Number(rate))) return 'text-foreground'
  if (rate < 0.6) return 'text-destructive'
  if (rate >= 0.8) return 'text-success'
  return 'text-foreground'
}

function formatTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10_000) return `${Math.round(n / 1000)}k`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

function formatDay(day: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(day)
  if (!m) return day
  return `${m[2]}-${m[3]}`
}

function formatTime(iso?: string) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('zh-CN', { hour12: false, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch {
    return iso
  }
}

function RateBar({
  label,
  rate,
  earned,
  full,
  extra,
}: {
  label: string
  rate: number
  earned: number
  full: number
  extra?: string
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="truncate text-muted-foreground">{label}</span>
        <span className={cn('shrink-0 tabular-nums', rateTone(rate))}>
          {earned}/{full} · {pct(rate)}
          {extra ? <span className="text-muted-foreground"> · {extra}</span> : null}
        </span>
      </div>
      <Progress value={Math.min(100, Math.round(Number(rate) * 100))} />
    </div>
  )
}

function weakPrompt(tag: string): GeneratePrefillState {
  return {
    tags: [tag],
    prompt: `围绕「${tag}」出题，针对该知识点的薄弱项加深考查。题目贴近真实工程与故障排查，不要只考背诵定义。`,
    difficulty: 'ADVANCED',
    counts: { SINGLE_CHOICE: 4, SHORT_ANSWER: 3, SYSTEM_DESIGN: 1 },
  }
}

function examHref(exam: ExamListItem) {
  if (exam.status === 'SUBMITTED' || exam.status === 'GRADED') return `/exams/${exam.id}/report`
  return `/exams/${exam.id}/take`
}

export function Dashboard() {
  const navigate = useNavigate()
  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard'],
    queryFn: dashboardApi.get,
  })
  const [tagOverride, setTagOverride] = useState<string | null>(null)

  const defaultTag = data?.weakTags[0]?.tag ?? '__overall'
  const selectedTag = tagOverride ?? defaultTag

  const tagChart = useMemo(
    () =>
      (data?.allTags ?? []).slice(0, 16).map((t) => ({
        tag: t.tag,
        ratePct: Math.round(Number(t.rate) * 1000) / 10,
        rate: Number(t.rate),
        questionCount: t.questionCount,
      })),
    [data?.allTags],
  )

  const trendData = useMemo(() => {
    const overall = data?.trend ?? []
    const tagPoints: TrendPoint[] =
      selectedTag === '__overall' ? [] : (data?.tagTrends?.find((t) => t.tag === selectedTag)?.points ?? [])
    const days = [...new Set([...overall.map((p) => p.day), ...tagPoints.map((p) => p.day)])].sort()
    return days.map((day) => ({
      day,
      overall: overall.find((p) => p.day === day)?.rate ?? null,
      tag: tagPoints.find((p) => p.day === day)?.rate ?? null,
    }))
  }, [data?.trend, data?.tagTrends, selectedTag])

  function goGenerateWeak(tag: string) {
    navigate('/generate', { state: weakPrompt(tag) })
  }

  const totals = data?.totals
  const hasGraded = (totals?.gradedExamCount ?? 0) > 0
  const typeScores = useMemo(() => {
    const byType = new Map((data?.typeScores ?? []).map((t) => [t.type, t]))
    return QUESTION_TYPE_ORDER.map((type) => byType.get(type)).filter((t) => t != null)
  }, [data?.typeScores])

  return (
    <PageContainer>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3 sm:mb-8">
        <DashboardHeader />
        <Button variant="primary" size="sm" onClick={() => navigate('/generate')}>
          <Sparkles />
          去出题
        </Button>
      </div>

      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <GlassCard key={i}>
              <Skeleton className="h-3 w-16" />
              <Skeleton className="mt-3 h-8 w-24" />
              <Skeleton className="mt-2 h-3 w-28" />
            </GlassCard>
          ))}
        </div>
      )}

      {error && (
        <Alert variant="danger" title="加载失败">
          {(error as Error).message}
        </Alert>
      )}

      {data && !hasGraded && (
        <EmptyDashboard
          openCount={totals?.openExamCount ?? 0}
          submittedCount={totals?.submittedExamCount ?? 0}
          tokenTotal={totals?.tokenTotal ?? 0}
          recent={data.recentExams}
          onGenerate={() => navigate('/generate')}
          onExam={(e) => navigate(examHref(e))}
        />
      )}

      {data && hasGraded && totals && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              icon={FileText}
              label="已阅卷"
              value={`${totals.gradedExamCount}`}
              hint={
                [
                  totals.openExamCount > 0 ? `${totals.openExamCount} 份进行中` : null,
                  totals.submittedExamCount > 0 ? `${totals.submittedExamCount} 份待出分` : null,
                ]
                  .filter(Boolean)
                  .join(' · ') || '场次'
              }
            />
            <StatCard
              icon={BookOpen}
              label="做题数"
              value={`${totals.gradedQuestionCount}`}
              hint={
                totals.wrongQuestionCount > 0 ? (
                  <button
                    type="button"
                    className="underline hover:text-foreground"
                    onClick={() => navigate('/wrong-book')}
                  >
                    错题本 {totals.wrongQuestionCount} 道
                  </button>
                ) : (
                  '含重刷'
                )
              }
            />
            <StatCard
              icon={Target}
              label="整体得分率"
              value={pct(totals.overallScoreRate)}
              valueClass={rateTone(totals.overallScoreRate)}
              hint={
                totals.full > 0 ? `${totals.earned}/${totals.full} 分` : '按满分加权'
              }
            />
            <StatCard
              icon={Zap}
              label="Token"
              value={formatTokens(totals.tokenTotal)}
              hint={`出题 ${formatTokens(totals.generationTokens)} · 阅卷 ${formatTokens(totals.gradingTokens)}`}
            />
          </div>

          {(totals.openExamCount > 0 || totals.submittedExamCount > 0) && (
            <Alert variant="info" className="mt-4" title="还有未完成的卷子">
              {totals.openExamCount > 0 && <>作答中 / 未开始 {totals.openExamCount} 份。 </>}
              {totals.submittedExamCount > 0 && <>已交卷待出分 {totals.submittedExamCount} 份。 </>}
              <button type="button" className="underline" onClick={() => navigate('/exams')}>
                去试卷列表
              </button>
            </Alert>
          )}

          {data.weakTags.length > 0 && (
            <section className="mt-6">
              <h2 className="mb-3 text-sm font-medium">最弱知识点</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {data.weakTags.map((t, i) => (
                  <WeakTagCard
                    key={t.tag}
                    rank={i + 1}
                    tag={t}
                    minSample={data.minTagSample}
                    onPractice={() => goGenerateWeak(t.tag)}
                  />
                ))}
              </div>
            </section>
          )}

          {(typeScores.length > 0 || tagChart.length > 0) && (
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {typeScores.length > 0 && (
                <GlassCard>
                  <h3 className="mb-3 font-medium">题型得分</h3>
                  <div className="space-y-3">
                    {typeScores.map((t) => (
                      <RateBar
                        key={t.type}
                        label={QUESTION_TYPES[t.type]}
                        rate={t.rate}
                        earned={t.earned}
                        full={t.full}
                        extra={`${t.questionCount} 题`}
                      />
                    ))}
                  </div>
                </GlassCard>
              )}
              {tagChart.length > 0 && (
                <GlassCard>
                  <h3 className="mb-1 font-medium">标签得分率</h3>
                  <p className="mb-3 text-xs text-muted-foreground">
                    从低到高
                    {data.allTags.length > tagChart.length
                      ? ` · 显示最弱 ${tagChart.length} / ${data.allTags.length}`
                      : ` · ${data.allTags.length} 个标签`}
                  </p>
                  <div
                    className="w-full min-w-0"
                    style={{ height: Math.max(180, tagChart.length * 34) }}
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={tagChart}
                        layout="vertical"
                        margin={{ top: 4, right: 12, left: 0, bottom: 0 }}
                      >
                        <CartesianGrid stroke="var(--border)" horizontal={false} />
                        <XAxis
                          type="number"
                          domain={[0, 100]}
                          tick={TICK}
                          tickFormatter={(v: number) => `${v}%`}
                        />
                        <YAxis
                          type="category"
                          dataKey="tag"
                          width={84}
                          tick={TICK}
                          tickFormatter={(v: string) => (v.length > 7 ? `${v.slice(0, 7)}…` : v)}
                        />
                        <Tooltip
                          cursor={{ fill: 'var(--accent)' }}
                          contentStyle={TOOLTIP_STYLE}
                          formatter={(value) => [`${value}%`, '得分率']}
                        />
                        <Bar dataKey="ratePct" radius={[0, 6, 6, 0]} maxBarSize={18}>
                          {tagChart.map((d) => (
                            <Cell
                              key={d.tag}
                              fill={d.rate < 0.6 ? 'var(--destructive)' : 'var(--chart-1)'}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </GlassCard>
              )}
            </div>
          )}

          {data.trend.length > 0 && (
            <GlassCard className="mt-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="flex items-center gap-2 font-medium">
                    <TrendingUp className="size-4 text-muted-foreground" />
                    得分率趋势
                  </h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">按交卷日加权。可选一个标签叠加上去。</p>
                </div>
                <Select value={selectedTag} onValueChange={setTagOverride}>
                  <SelectTrigger className="w-44">
                    <SelectValue placeholder="叠加标签" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__overall">仅整体</SelectItem>
                    {data.allTags.map((t) => (
                      <SelectItem key={t.tag} value={t.tag}>
                        {t.tag}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="h-64 w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="day" tick={TICK} tickFormatter={formatDay} />
                    <YAxis
                      domain={[0, 1]}
                      tick={TICK}
                      tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
                      width={44}
                    />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      labelFormatter={(label) => String(label)}
                      formatter={(value, name) => [
                        pct(Number(value)),
                        name === 'tag' && selectedTag !== '__overall' ? selectedTag : '整体',
                      ]}
                    />
                    <Line
                      type="monotone"
                      dataKey="overall"
                      stroke="var(--chart-1)"
                      strokeWidth={2}
                      dot={{ r: 3, fill: 'var(--chart-1)' }}
                      connectNulls={false}
                    />
                    {selectedTag !== '__overall' && (
                      <Line
                        type="monotone"
                        dataKey="tag"
                        stroke="var(--chart-3)"
                        strokeWidth={2}
                        dot={{ r: 3, fill: 'var(--chart-3)' }}
                        connectNulls={false}
                      />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </GlassCard>
          )}

          {data.recentExams.length > 0 && (
            <section className="mt-6">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-sm font-medium">最近试卷</h2>
                <Button variant="ghost" size="sm" onClick={() => navigate('/exams')}>
                  全部
                  <ChevronRight className="size-4" />
                </Button>
              </div>
              <div className="space-y-3">
                {data.recentExams.map((exam) => (
                  <RecentExamRow key={exam.id} exam={exam} onOpen={() => navigate(examHref(exam))} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </PageContainer>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  valueClass,
}: {
  icon: typeof FileText
  label: string
  value: string
  hint: ReactNode
  valueClass?: string
}) {
  return (
    <GlassCard>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="size-4" />
        {label}
      </div>
      <p className={cn('mt-2 text-2xl font-semibold tabular-nums tracking-tight', valueClass)}>
        {value}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </GlassCard>
  )
}

const WEAK_RING_R = 52
const WEAK_RING_C = 2 * Math.PI * WEAK_RING_R

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function useCountUp(target: number, delayMs: number) {
  const [value, setValue] = useState(() => (prefersReducedMotion() ? target : 0))

  useEffect(() => {
    if (prefersReducedMotion()) {
      setValue(target)
      return
    }
    let raf = 0
    const startAt = performance.now() + delayMs
    const dur = 1050
    const tick = (now: number) => {
      if (now < startAt) {
        raf = requestAnimationFrame(tick)
        return
      }
      const t = Math.min(1, (now - startAt) / dur)
      const eased = 1 - (1 - t) ** 3
      setValue(Math.round(target * eased))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, delayMs])

  return value
}

function WeakRing({ rate, delayMs, gradientId }: { rate: number; delayMs: number; gradientId: string }) {
  const clamped = Math.min(1, Math.max(0, Number(rate) || 0))
  const offset = WEAK_RING_C * (1 - clamped)
  const targetPct = Math.round(clamped * 100)
  const shownPct = useCountUp(targetPct, delayMs + 120)

  return (
    <div
      className="relative size-[6.5rem] shrink-0"
      style={{ '--weak-delay': `${delayMs}ms` } as CSSProperties}
    >
      <svg viewBox="0 0 120 120" className="size-full overflow-visible" aria-hidden>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--primary)" />
            <stop offset="100%" stopColor="var(--chart-3)" />
          </linearGradient>
        </defs>
        <g transform="rotate(-90 60 60)">
          <circle
            cx="60"
            cy="60"
            r={WEAK_RING_R}
            fill="none"
            strokeWidth="9"
            className="stroke-foreground/10"
          />
          <circle
            cx="60"
            cy="60"
            r={WEAK_RING_R}
            fill="none"
            strokeWidth="9"
            strokeLinecap="round"
            stroke={`url(#${gradientId})`}
            className="animate-weak-ring"
            style={
              {
                strokeDasharray: WEAK_RING_C,
                '--weak-ring-c': `${WEAK_RING_C}`,
                '--weak-ring-offset': `${offset}`,
              } as CSSProperties
            }
          />
        </g>
      </svg>
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <span className={cn('text-xl font-semibold tabular-nums tracking-tight', rateTone(rate))}>
          {shownPct}%
        </span>
      </div>
    </div>
  )
}

function WeakTagCard({
  rank,
  tag,
  minSample,
  onPractice,
}: {
  rank: number
  tag: TagStat
  minSample: number
  onPractice: () => void
}) {
  const delayMs = (rank - 1) * 90
  return (
    <div
      className="animate-weak-card-in"
      style={{ '--weak-delay': `${delayMs}ms` } as CSSProperties}
    >
      <GlassCard>
        <div className="flex items-center gap-4">
          <WeakRing rate={tag.rate} delayMs={delayMs} gradientId={`weak-ring-${rank}`} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs tabular-nums text-muted-foreground">#{rank}</span>
              <h3 className="truncate font-medium">{tag.tag}</h3>
              {tag.sampleInsufficient && (
                <Badge variant="warning">样本不足（&lt; {minSample} 题）</Badge>
              )}
            </div>
            <p className="mt-1 text-sm tabular-nums text-muted-foreground">
              {tag.questionCount} 题 · {tag.earned}/{tag.full} 分
            </p>
            <Button variant="primary" size="sm" className="mt-3" onClick={onPractice}>
              <Sparkles />
              针对此项出题
            </Button>
          </div>
        </div>
      </GlassCard>
    </div>
  )
}

function RecentExamRow({ exam, onOpen }: { exam: ExamListItem; onOpen: () => void }) {
  const rateLabel = exam.scoreRate != null ? pct(exam.scoreRate) : null
  return (
    <GlassCard>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-medium">{exam.name}</h3>
            <Badge variant={STATUS_VARIANT[exam.status]}>{EXAM_STATUS_LABEL[exam.status]}</Badge>
            {exam.categoryLabel && <Badge variant="outline">{exam.categoryLabel}</Badge>}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {exam.questionCount} 题
            {exam.status === 'GRADED' && exam.totalScore != null && (
              <>
                {' '}
                · 得分 {exam.totalScore}
                {rateLabel && `（${rateLabel}）`}
              </>
            )}
            {' · '}
            {formatTime(exam.submittedAt ?? exam.createdAt)}
          </p>
        </button>
        <Button variant="outline" size="sm" onClick={onOpen}>
          {exam.status === 'GRADED' || exam.status === 'SUBMITTED' ? '查看报告' : '继续'}
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </GlassCard>
  )
}

function EmptyDashboard({
  openCount,
  submittedCount,
  tokenTotal,
  recent,
  onGenerate,
  onExam,
}: {
  openCount: number
  submittedCount: number
  tokenTotal: number
  recent: ExamListItem[]
  onGenerate: () => void
  onExam: (e: ExamListItem) => void
}) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <GlassCard to="/settings/models">
          <h3 className="flex items-center gap-1 font-medium">
            配置模型
            <ChevronRight className="size-4 text-muted-foreground" />
          </h3>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            接入 DeepSeek、通义或任意 OpenAI 兼容端点，先跑通连接测试。
          </p>
        </GlassCard>
        <GlassCard to="/generate">
          <h3 className="flex items-center gap-1 font-medium">
            开始出题
            <ChevronRight className="size-4 text-muted-foreground" />
          </h3>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            写一段提示词，指定题型与数量，让模型现场出一套卷子。
          </p>
        </GlassCard>
      </div>

      <GlassCard className="mt-4">
        <EmptyState
          icon={Target}
          title="还没有阅卷数据"
          description="完成一场模考并出分后，这里会排出最弱的知识点，并可以针对弱项再出一套。"
          action={
            <Button variant="primary" size="sm" onClick={onGenerate}>
              <Sparkles />
              去出题
            </Button>
          }
        />
      </GlassCard>

      {(openCount > 0 || submittedCount > 0 || tokenTotal > 0) && (
        <p className="mt-3 text-sm text-muted-foreground">
          {openCount > 0 && <>未完成 {openCount} 份。 </>}
          {submittedCount > 0 && <>待出分 {submittedCount} 份。 </>}
          {tokenTotal > 0 && <>已消耗 {formatTokens(tokenTotal)} tokens。</>}
        </p>
      )}

      {recent.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-3 text-sm font-medium">最近试卷</h2>
          <div className="space-y-3">
            {recent.map((exam) => (
              <RecentExamRow key={exam.id} exam={exam} onOpen={() => onExam(exam)} />
            ))}
          </div>
        </section>
      )}
    </>
  )
}
