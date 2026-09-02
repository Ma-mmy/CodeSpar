import {
  Button,
  OptionCard,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from '@/components/ui'
import { Markdown } from '@/components/Markdown'
import type { QuestionForTaking } from '@/api/exams'
import { cn } from '@/lib/utils'
import { ChevronRight } from 'lucide-react'

function countBlanks(stem: string) {
  const matches = stem.match(/_{3,}/g)
  return Math.max(1, matches?.length ?? 1)
}

function parseFillContent(content: string, blankCount: number): string[] {
  if (!content) return Array.from({ length: blankCount }, () => '')
  try {
    const arr = JSON.parse(content)
    if (Array.isArray(arr)) {
      return Array.from({ length: blankCount }, (_, i) => String(arr[i] ?? ''))
    }
  } catch {
    // 兼容旧的换行分隔
  }
  const lines = content.split('\n')
  return Array.from({ length: blankCount }, (_, i) => lines[i] ?? '')
}

export function QuestionWidget({
  question,
  content,
  onChange,
  onComplete,
}: {
  question: QuestionForTaking
  content: string
  onChange: (content: string) => void
  /** 客观题作答完成时回调（用于自动跳下一题）；主观题不触发 */
  onComplete?: () => void
}) {
  const type = question.type

  if (type === 'SINGLE_CHOICE' || type === 'TRUE_FALSE') {
    const options = question.options ?? []
    return (
      <div className="space-y-2">
        {options.map((o) => (
          <OptionCard
            key={o.key}
            selected={content === o.key}
            onClick={() => {
              onChange(o.key)
              onComplete?.()
            }}
          >
            <span className="shrink-0 font-mono text-xs text-muted-foreground">{o.key}.</span>
            <span className="min-w-0 flex-1">{o.text}</span>
          </OptionCard>
        ))}
      </div>
    )
  }

  if (type === 'MULTI_CHOICE') {
    const options = question.options ?? []
    const selected = new Set(content ? content.split(',').filter(Boolean) : [])
    const toggle = (key: string) => {
      if (selected.has(key)) selected.delete(key)
      else selected.add(key)
      onChange([...selected].sort().join(','))
    }
    return (
      <div className="space-y-2">
        {options.map((o) => (
          <OptionCard key={o.key} selected={selected.has(o.key)} onClick={() => toggle(o.key)}>
            <span className="shrink-0 font-mono text-xs text-muted-foreground">{o.key}.</span>
            <span className="min-w-0 flex-1">{o.text}</span>
          </OptionCard>
        ))}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <p className="text-[13px] text-muted-foreground">
            可多选，已选 {[...selected].sort().join(', ') || '无'}
          </p>
          {onComplete && (
            <Button
              variant="primary"
              size="sm"
              disabled={selected.size === 0}
              onClick={() => onComplete()}
            >
              确认并下一题
              <ChevronRight />
            </Button>
          )}
        </div>
      </div>
    )
  }

  if (type === 'FILL_BLANK') {
    const blankCount = countBlanks(question.stem)
    const values = parseFillContent(content, blankCount)
    const update = (idx: number, v: string) => {
      const next = [...values]
      next[idx] = v
      onChange(JSON.stringify(next))
    }
    const tryComplete = (nextValues: string[]) => {
      if (nextValues.every((v) => v.trim().length > 0)) {
        onComplete?.()
      }
    }
    return (
      <div className="space-y-3">
        {values.map((v, i) => (
          <label key={i} className="block space-y-1.5">
            <span className="text-[13px] text-muted-foreground">第 {i + 1} 空</span>
            <input
              value={v}
              onChange={(e) => update(i, e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return
                e.preventDefault()
                const next = [...values]
                next[i] = (e.target as HTMLInputElement).value
                onChange(JSON.stringify(next))
                if (i < blankCount - 1) {
                  const el = (e.target as HTMLInputElement)
                    .closest('div.space-y-3')
                    ?.querySelectorAll('input')[i + 1] as HTMLInputElement | undefined
                  el?.focus()
                } else {
                  tryComplete(next)
                }
              }}
              className={cn(
                'h-10 w-full rounded-xl border border-border bg-white/55 px-3.5 text-sm outline-none',
                'focus:border-primary/45 focus:ring-4 focus:ring-ring/20 dark:bg-white/8',
              )}
              placeholder={`填写第 ${i + 1} 空${i === blankCount - 1 ? '，回车跳转下一题' : '，回车到下一空'}`}
            />
          </label>
        ))}
      </div>
    )
  }

  // SHORT_ANSWER / SYSTEM_DESIGN
  return (
    <Tabs defaultValue="edit">
      <TabsList>
        <TabsTrigger value="edit">编辑</TabsTrigger>
        <TabsTrigger value="preview">预览</TabsTrigger>
      </TabsList>
      <TabsContent value="edit">
        <Textarea
          value={content}
          onChange={(e) => onChange(e.target.value)}
          className="min-h-48 font-mono text-[13px] leading-relaxed"
          placeholder="用 Markdown 作答…"
        />
      </TabsContent>
      <TabsContent value="preview">
        <div className="min-h-48 rounded-xl border border-border bg-white/35 p-4 dark:bg-white/6">
          {content.trim() ? (
            <Markdown>{content}</Markdown>
          ) : (
            <p className="text-sm text-muted-foreground">尚未作答</p>
          )}
        </div>
      </TabsContent>
    </Tabs>
  )
}

export function FlagToggle({
  flagged,
  onChange,
  id = 'flag-pending',
}: {
  flagged: boolean
  onChange: (v: boolean) => void
  /** 整卷滚动时多题并存，需唯一 id */
  id?: string
}) {
  return (
    <div className="flex items-center gap-2.5">
      <Switch id={id} checked={flagged} onCheckedChange={onChange} />
      <label htmlFor={id} className="text-sm text-muted-foreground">
        标记待定
      </label>
    </div>
  )
}
