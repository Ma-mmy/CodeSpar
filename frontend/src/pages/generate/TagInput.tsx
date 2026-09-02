import { useState } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

/** 标签输入：回车/逗号加标签，点已有标签快速添加，chip 可删。 */
export function TagInput({
  value,
  onChange,
  suggestions = [],
  className,
}: {
  value: string[]
  onChange: (tags: string[]) => void
  suggestions?: string[]
  className?: string
}) {
  const [text, setText] = useState('')

  const add = (raw: string) => {
    const t = raw.trim().replace(/^#/, '')
    if (!t) return
    if (!value.includes(t)) onChange([...value, t])
    setText('')
  }

  const remove = (t: string) => onChange(value.filter((x) => x !== t))
  const remaining = suggestions.filter((s) => !value.includes(s))

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-border bg-white/55 px-2.5 py-2 dark:bg-white/8">
        {value.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1 rounded-lg bg-primary/12 px-2 py-0.5 text-xs font-medium text-primary dark:bg-primary/20"
          >
            {t}
            <button
              type="button"
              onClick={() => remove(t)}
              aria-label={`移除标签 ${t}`}
              className="text-primary/70 transition-colors hover:text-primary"
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault()
              add(text)
            }
          }}
          onBlur={() => {
            if (text.trim()) add(text)
          }}
          placeholder={value.length === 0 ? '输入标签后回车，如 RAG、Function Calling' : ''}
          className="min-w-28 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
        />
      </div>
      {remaining.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {remaining.slice(0, 12).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => add(s)}
              className="rounded-lg border border-border px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-white/50 hover:text-foreground dark:hover:bg-white/10"
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
