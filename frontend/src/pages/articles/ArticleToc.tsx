import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import type { TocHeading } from './headings'

export function ArticleToc({
  headings,
  scrollRoot,
  emptyHint = '没有可用标题',
}: {
  headings: TocHeading[]
  scrollRoot: HTMLElement | null
  emptyHint?: string
}) {
  const [activeId, setActiveId] = useState<string | null>(null)

  useEffect(() => {
    const root = scrollRoot
    if (!root || headings.length === 0) {
      setActiveId(null)
      return
    }

    const onScroll = () => {
      const threshold = root.getBoundingClientRect().top + 72
      let current = headings[0]?.id ?? null
      for (const h of headings) {
        const el = document.getElementById(h.id)
        if (!el) continue
        if (el.getBoundingClientRect().top <= threshold) current = h.id
      }
      setActiveId(current)
    }

    onScroll()
    root.addEventListener('scroll', onScroll, { passive: true })
    return () => root.removeEventListener('scroll', onScroll)
  }, [headings, scrollRoot])

  return (
    <nav className="flex min-h-0 flex-1 flex-col">
      <h3 className="mb-2 px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">大纲</h3>
      {headings.length === 0 ? (
        <p className="px-1 text-xs text-muted-foreground">{emptyHint}</p>
      ) : (
        <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
          {headings.map((h) => (
            <li key={h.id}>
              <a
                href={`#${h.id}`}
                onClick={(e) => {
                  e.preventDefault()
                  document.getElementById(h.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }}
                className={cn(
                  'block rounded-lg py-1 pr-1 text-[13px] leading-snug transition',
                  h.level === 1 && 'pl-1 font-medium',
                  h.level === 2 && 'pl-3',
                  h.level === 3 && 'pl-5 text-muted-foreground',
                  activeId === h.id
                    ? 'bg-primary/10 text-foreground'
                    : 'text-muted-foreground hover:bg-black/5 hover:text-foreground dark:hover:bg-white/5',
                )}
              >
                {h.text}
              </a>
            </li>
          ))}
        </ul>
      )}
    </nav>
  )
}
