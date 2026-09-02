import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BookMarked, RotateCcw, Sparkles, Trash2 } from 'lucide-react'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Alert,
  Badge,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Field,
  GlassCard,
  Input,
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
import { Markdown } from '@/components/Markdown'
import { DIFFICULTIES, QUESTION_TYPES } from '@/api/generation'
import { wrongBookApi, type WrongItem } from '@/api/wrongBook'
import { cn } from '@/lib/utils'

function pct(rate?: number | null) {
  if (rate == null || Number.isNaN(Number(rate))) return '—'
  return `${Math.round(Number(rate) * 100)}%`
}

function formatTime(iso?: string) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('zh-CN', { hour12: false })
  } catch {
    return iso
  }
}

export function WrongBookPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const qc = useQueryClient()
  const [status, setStatus] = useState<'ACTIVE' | 'MASTERED' | 'ALL'>('ACTIVE')
  const [tag, setTag] = useState<string>('ALL')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [composeOpen, setComposeOpen] = useState(false)
  const [limit, setLimit] = useState('10')
  const [pendingRemove, setPendingRemove] = useState<WrongItem | null>(null)

  const listQ = useQuery({
    queryKey: ['wrong-book', status, tag],
    queryFn: () =>
      wrongBookApi.list({
        status,
        tag: tag === 'ALL' ? undefined : tag,
      }),
  })

  const items = listQ.data?.items ?? []
  const tags = listQ.data?.tags ?? []
  const allIds = items.map((i) => i.questionId)
  const selectedInView = allIds.filter((id) => selected.has(id))
  const allChecked = allIds.length > 0 && selectedInView.length === allIds.length

  const compose = useMutation({
    mutationFn: () => {
      const n = Number(limit)
      const cap = Number.isFinite(n) ? Math.max(1, Math.min(30, Math.floor(n))) : 10
      return wrongBookApi.compose({
        questionIds: selectedInView.length > 0 ? selectedInView : undefined,
        tag: selectedInView.length > 0 || tag === 'ALL' ? undefined : tag,
        includeMastered: status !== 'ACTIVE',
        limit: cap,
      })
    },
    onSuccess: (exam) => {
      setComposeOpen(false)
      qc.invalidateQueries({ queryKey: ['exams'] })
      toast('已从错题本组卷', { variant: 'success' })
      navigate(`/exams/${exam.id}/take`)
    },
    onError: (e) =>
      toast('组卷失败', { variant: 'danger', description: (e as Error).message, duration: 8000 }),
  })

  const remove = useMutation({
    mutationFn: (id: number) => wrongBookApi.remove(id),
    onSuccess: () => {
      setPendingRemove(null)
      qc.invalidateQueries({ queryKey: ['wrong-book'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      toast('已移出错题本', { variant: 'success' })
    },
    onError: (e) => toast('移出失败', { variant: 'danger', description: (e as Error).message }),
  })

  function toggle(id: number, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }

  function toggleAll(on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (on) allIds.forEach((id) => next.add(id))
      else allIds.forEach((id) => next.delete(id))
      return next
    })
  }

  const composeCount =
    selectedInView.length > 0 ? selectedInView.length : items.filter((i) => status !== 'ACTIVE' || i.status === 'ACTIVE').length

  return (
    <PageContainer>
      <PageHeader
        title="错题本"
        description="低分题自动入库。可按标签组卷重刷；连续 2 次达标会标为已掌握。"
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ACTIVE">在册</SelectItem>
            <SelectItem value="MASTERED">已掌握</SelectItem>
            <SelectItem value="ALL">全部</SelectItem>
          </SelectContent>
        </Select>
        <Select value={tag} onValueChange={setTag}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="标签" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">全部标签</SelectItem>
            {tags.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Checkbox
            checked={allChecked}
            disabled={items.length === 0}
            onCheckedChange={(v) => toggleAll(v === true)}
            aria-label="全选当前列表"
          />
          全选
        </label>
        <span className="text-sm text-muted-foreground">
          {items.length} 道{selectedInView.length > 0 ? ` · 已选 ${selectedInView.length}` : ''}
        </span>
        <div className="ml-auto">
          <Button
            variant="primary"
            size="sm"
            disabled={items.length === 0}
            onClick={() => {
              setLimit(String(Math.min(10, Math.max(1, composeCount))))
              setComposeOpen(true)
            }}
          >
            <RotateCcw />
            组卷重刷
          </Button>
        </div>
      </div>

      {listQ.isLoading && (
        <div className="space-y-4">
          {[0, 1].map((i) => (
            <GlassCard key={i}>
              <Skeleton className="h-5 w-48" />
              <Skeleton className="mt-3 h-16 w-full" />
            </GlassCard>
          ))}
        </div>
      )}

      {listQ.error && (
        <Alert variant="danger" title="加载失败">
          {(listQ.error as Error).message}
        </Alert>
      )}

      {listQ.data && items.length === 0 && (
        <GlassCard>
          <EmptyState
            icon={BookMarked}
            title={status === 'ACTIVE' ? '错题本是空的' : '没有符合筛选的错题'}
            description={
              status === 'ACTIVE'
                ? '阅卷后得分率低于 60% 的题会自动进来，也可以在成绩报告里手动加入。'
                : '试试切换状态或标签。'
            }
            action={
              status === 'ACTIVE' ? (
                <Button variant="primary" size="sm" onClick={() => navigate('/generate')}>
                  <Sparkles />
                  去出题
                </Button>
              ) : undefined
            }
          />
        </GlassCard>
      )}

      <div className="space-y-4">
        {items.map((item) => (
          <WrongCard
            key={item.id}
            item={item}
            checked={selected.has(item.questionId)}
            onChecked={(on) => toggle(item.questionId, on)}
            onRemove={() => setPendingRemove(item)}
          />
        ))}
      </div>

      <Dialog open={composeOpen} onOpenChange={setComposeOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>从错题本组卷？</DialogTitle>
            <DialogDescription>
              {selectedInView.length > 0
                ? `将用已选的 ${selectedInView.length} 道题组一套新卷，零 token。`
                : `将按当前筛选组卷（${items.length} 道可见）。`}
              答完交卷后若连续达标，可自动标为已掌握。
            </DialogDescription>
          </DialogHeader>
          <Field label="题量上限" description="最多 30 道。超过上限时取最近错的。">
            {(id) => (
              <Input
                id={id}
                type="number"
                min={1}
                max={30}
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
              />
            )}
          </Field>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setComposeOpen(false)}>
              取消
            </Button>
            <Button variant="primary" loading={compose.isPending} onClick={() => compose.mutate()}>
              开始重刷
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pendingRemove} onOpenChange={(o) => !o && setPendingRemove(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>移出这道错题？</DialogTitle>
            <DialogDescription>只从错题本拿掉，题目仍在题库和历史试卷里。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setPendingRemove(null)}>
              取消
            </Button>
            <Button
              variant="outline"
              loading={remove.isPending}
              onClick={() => pendingRemove && remove.mutate(pendingRemove.id)}
            >
              确认移出
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  )
}

function WrongCard({
  item,
  checked,
  onChecked,
  onRemove,
}: {
  item: WrongItem
  checked: boolean
  onChecked: (on: boolean) => void
  onRemove: () => void
}) {
  const rate = item.lastScoreRate
  return (
    <GlassCard>
      <div className="flex items-start gap-3">
        <Checkbox
          className="mt-1"
          checked={checked}
          onCheckedChange={(v) => onChecked(v === true)}
          aria-label={`选择第 ${item.questionId} 题`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="primary">{QUESTION_TYPES[item.type]}</Badge>
            {item.difficulty && <Badge variant="outline">{DIFFICULTIES[item.difficulty]}</Badge>}
            {item.tags.map((t) => (
              <Badge key={t} variant="outline">
                {t}
              </Badge>
            ))}
            {item.status === 'MASTERED' && <Badge variant="success">已掌握</Badge>}
            {item.manualAdded && <Badge variant="neutral">手动加入</Badge>}
          </div>
          <div className="mt-2 line-clamp-4 text-sm leading-relaxed">
            <Markdown>{item.stem}</Markdown>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            错 {item.wrongCount} 次
            {rate != null && (
              <>
                {' '}
                · 最近得分率{' '}
                <span
                  className={cn(
                    'tabular-nums font-medium text-foreground',
                    rate < 0.6 && 'text-destructive',
                    rate >= 0.8 && 'text-success',
                  )}
                >
                  {pct(rate)}
                </span>
              </>
            )}
            {item.lastWrongAt && <> · {formatTime(item.lastWrongAt)}</>}
          </p>

          <Accordion type="single" collapsible className="mt-3">
            <AccordionItem value="detail">
              <AccordionTrigger className="text-sm">作答与参考</AccordionTrigger>
              <AccordionContent>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <h4 className="mb-1.5 text-xs font-medium text-muted-foreground">当时作答</h4>
                    {item.lastAnswer ? (
                      <div className="rounded-xl bg-black/4 p-3 text-sm dark:bg-white/6">
                        <Markdown>{item.lastAnswer}</Markdown>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">（无作答记录）</p>
                    )}
                  </div>
                  <div>
                    <h4 className="mb-1.5 text-xs font-medium text-muted-foreground">参考答案</h4>
                    {item.correctAnswer || item.referenceAnswer || item.explanation ? (
                      <div className="rounded-xl bg-black/4 p-3 text-sm dark:bg-white/6">
                        {item.correctAnswer && (
                          <p className="mb-2">
                            <span className="text-muted-foreground">正确答案：</span>
                            {item.correctAnswer}
                          </p>
                        )}
                        {item.referenceAnswer && <Markdown>{item.referenceAnswer}</Markdown>}
                        {item.explanation && (
                          <div className="mt-2 border-t border-border pt-2 text-muted-foreground">
                            <Markdown>{item.explanation}</Markdown>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">—</p>
                    )}
                  </div>
                </div>
                {item.lastComment && (
                  <div className="mt-3">
                    <h4 className="mb-1.5 text-xs font-medium text-muted-foreground">点评</h4>
                    <div className="rounded-xl bg-primary/6 p-3 text-sm dark:bg-primary/10">
                      <Markdown>{item.lastComment}</Markdown>
                    </div>
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          title="移出"
          aria-label="移出错题本"
          onClick={onRemove}
          className="shrink-0 text-muted-foreground hover:text-foreground"
        >
          <Trash2 />
        </Button>
      </div>
    </GlassCard>
  )
}
