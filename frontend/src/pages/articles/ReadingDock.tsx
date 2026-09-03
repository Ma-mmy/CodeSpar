import { useEffect, useRef, useState } from 'react'
import { ArrowUp, Maximize2, Minimize2 } from 'lucide-react'
import { Slider, Tooltip } from '@/components/ui'
import { cn } from '@/lib/utils'
import { FONT_MAX, FONT_MIN, LH_MAX, LH_MIN } from './prefs'

export function ReadingDock({
  zen,
  onToggleZen,
  fontSize,
  lineHeight,
  onFontSize,
  onLineHeight,
  onScrollTop,
}: {
  zen: boolean
  onToggleZen: () => void
  fontSize: number
  lineHeight: number
  onFontSize: (n: number) => void
  onLineHeight: (n: number) => void
  onScrollTop: () => void
}) {
  const [typeOpen, setTypeOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!typeOpen) return
    const onDoc = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setTypeOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [typeOpen])

  useEffect(() => {
    if (zen) setTypeOpen(false)
  }, [zen])

  return (
    <div
      ref={boxRef}
      className={cn(
        'pointer-events-auto absolute bottom-5 right-5 z-20 flex flex-col items-end',
        'opacity-45 transition-opacity duration-300 hover:opacity-100',
        (typeOpen || zen) && 'opacity-100',
      )}
    >
      {typeOpen && (
        <div className="glass-strong mb-3 w-[260px] rounded-2xl p-4 shadow-lg">
          <div className="mb-3">
            <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>正文字号</span>
              <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary">
                {fontSize}px
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="text-xs font-bold text-muted-foreground hover:text-primary"
                onClick={() => onFontSize(Math.max(FONT_MIN, fontSize - 1))}
              >
                A
              </button>
              <Slider
                min={FONT_MIN}
                max={FONT_MAX}
                step={1}
                value={[fontSize]}
                onValueChange={(v) => onFontSize(v[0] ?? fontSize)}
              />
              <button
                type="button"
                className="text-[17px] font-bold text-muted-foreground hover:text-primary"
                onClick={() => onFontSize(Math.min(FONT_MAX, fontSize + 1))}
              >
                A
              </button>
            </div>
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>段落行距</span>
              <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary">
                {lineHeight.toFixed(1)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="text-[11px] font-bold text-muted-foreground hover:text-primary"
                onClick={() => onLineHeight(Math.max(LH_MIN, round1(lineHeight - 0.1)))}
              >
                ≡
              </button>
              <Slider
                min={LH_MIN}
                max={LH_MAX}
                step={0.1}
                value={[lineHeight]}
                onValueChange={(v) => onLineHeight(v[0] ?? lineHeight)}
              />
              <button
                type="button"
                className="text-base font-bold text-muted-foreground hover:text-primary"
                onClick={() => onLineHeight(Math.min(LH_MAX, round1(lineHeight + 0.1)))}
              >
                ≡
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="glass flex items-center gap-0.5 rounded-full px-2 py-1">
        <Tooltip content="沉浸模式 (Z)">
          <button
            type="button"
            aria-label="沉浸模式"
            aria-pressed={zen}
            onClick={onToggleZen}
            className={cn(
              'flex size-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10',
              zen && 'bg-primary/10 text-primary',
            )}
          >
            {zen ? <Minimize2 className="size-[15px]" /> : <Maximize2 className="size-[15px]" />}
          </button>
        </Tooltip>
        <span className="mx-0.5 h-3.5 w-px bg-border" />
        <Tooltip content="排版微调">
          <button
            type="button"
            aria-label="排版微调"
            aria-pressed={typeOpen}
            onClick={(e) => {
              e.stopPropagation()
              setTypeOpen((o) => !o)
            }}
            className={cn(
              'flex size-8 items-center justify-center rounded-full text-[13px] font-semibold text-muted-foreground transition hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10',
              typeOpen && 'bg-primary/10 text-primary',
            )}
          >
            Aa
          </button>
        </Tooltip>
        <span className="mx-0.5 h-3.5 w-px bg-border" />
        <Tooltip content="回到顶部">
          <button
            type="button"
            aria-label="回到顶部"
            onClick={onScrollTop}
            className="flex size-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
          >
            <ArrowUp className="size-[15px]" />
          </button>
        </Tooltip>
      </div>
    </div>
  )
}

function round1(n: number) {
  return Math.round(n * 10) / 10
}
