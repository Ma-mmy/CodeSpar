import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ReadingDock } from './ReadingDock'
import {
  FONT_DEFAULT,
  FONT_MAX,
  FONT_MIN,
  LH_DEFAULT,
  LH_MAX,
  LH_MIN,
  readBoolPref,
  readNumberPref,
  writeArticlePref,
  writeBoolPref,
} from './prefs'

export function ArticleWorkspace({
  tree,
  treeHeader,
  topBar,
  body,
  toc,
  showToc,
  showDock,
}: {
  tree: ReactNode
  treeHeader: ReactNode
  topBar: ReactNode
  body: ReactNode
  toc: (scrollRoot: HTMLElement | null) => ReactNode
  showToc: boolean
  showDock: boolean
}) {
  const [isMd, setIsMd] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 768px)').matches : true,
  )
  const [treeCollapsed, setTreeCollapsed] = useState(() => {
    const stored = readBoolPref('treeCollapsed')
    if (stored != null) return stored
    return typeof window !== 'undefined' ? !window.matchMedia('(min-width: 768px)').matches : false
  })
  const [tocCollapsed, setTocCollapsed] = useState(() => {
    const stored = readBoolPref('tocCollapsed')
    if (stored != null) return stored
    return typeof window !== 'undefined' ? !window.matchMedia('(min-width: 768px)').matches : false
  })
  const [zen, setZen] = useState(false)
  const [scrollRoot, setScrollRoot] = useState<HTMLElement | null>(null)
  const [fontSize, setFontSize] = useState(() =>
    readNumberPref('fontSize', FONT_DEFAULT, FONT_MIN, FONT_MAX),
  )
  const [lineHeight, setLineHeight] = useState(() =>
    readNumberPref('lineHeight', LH_DEFAULT, LH_MIN, LH_MAX),
  )

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    const onChange = () => setIsMd(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const setTreeOpen = useCallback((open: boolean) => {
    setTreeCollapsed(!open)
    writeBoolPref('treeCollapsed', !open)
  }, [])

  const setTocOpen = useCallback((open: boolean) => {
    setTocCollapsed(!open)
    writeBoolPref('tocCollapsed', !open)
  }, [])

  const toggleZen = useCallback(() => {
    setZen((prev) => {
      const next = !prev
      if (next) {
        document.documentElement.requestFullscreen?.().catch(() => {})
      } else if (document.fullscreenElement) {
        document.exitFullscreen?.().catch(() => {})
      }
      return next
    })
  }, [])

  useEffect(() => {
    const onFs = () => {
      if (!document.fullscreenElement) setZen(false)
    }
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      const tag = el?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return
      if (e.key === 'z' || e.key === 'Z') {
        e.preventDefault()
        toggleZen()
      }
      if (e.key === 'Escape' && zen) {
        e.preventDefault()
        toggleZen()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [toggleZen, zen])

  const tocVisible = !zen && showToc && !tocCollapsed
  const showTreeHandle = !zen && isMd && treeCollapsed
  const showTocHandle = !zen && isMd && showToc && tocCollapsed

  const treePanel = (
    <aside
      className={cn(
        'glass flex min-h-0 flex-col rounded-2xl p-3.5',
        isMd ? 'h-full w-[250px] shrink-0' : 'h-full w-[min(19rem,85vw)]',
      )}
    >
      <div className="mb-2 flex items-center gap-1">
        <div className="min-w-0 flex-1">{treeHeader}</div>
        {isMd && (
          <button
            type="button"
            title="收起目录"
            className="shrink-0 rounded-lg p-1 text-muted-foreground hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
            onClick={() => setTreeOpen(false)}
          >
            <ChevronLeft className="size-3.5" />
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{tree}</div>
    </aside>
  )

  const tocPanel = (
    <aside className={cn('glass flex min-h-0 flex-col rounded-2xl p-3.5', isMd ? 'h-full w-[210px] shrink-0' : 'h-full w-[min(16rem,80vw)]')}>
      <div className="mb-1 flex items-center">
        {isMd && (
          <button
            type="button"
            title="收起大纲"
            className="rounded-lg p-1 text-muted-foreground hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
            onClick={() => setTocOpen(false)}
          >
            <ChevronRight className="size-3.5" />
          </button>
        )}
      </div>
      {toc(scrollRoot)}
    </aside>
  )

  return (
    <div
      className={cn(
        'article-workspace relative',
        zen
          ? 'fixed inset-0 z-40 flex overflow-hidden bg-background p-6'
          : 'flex h-[calc(100svh-5.5rem)] overflow-hidden p-3 md:h-svh',
      )}
      style={
        {
          '--article-font-size': `${fontSize}px`,
          '--article-line-height': String(lineHeight),
        } as CSSProperties
      }
    >
      {!zen && isMd && !treeCollapsed && <div className="h-full pr-3">{treePanel}</div>}

      {!zen && !isMd && !treeCollapsed && (
        <div className="fixed inset-0 z-30 md:hidden">
          <button
            type="button"
            aria-label="关闭目录"
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setTreeOpen(false)}
          />
          <div className="absolute inset-y-3 left-3">{treePanel}</div>
        </div>
      )}

      {showTreeHandle && (
        <button
          type="button"
          title="展开目录"
          className="glass absolute top-1/2 left-3 z-20 flex h-12 w-5 -translate-y-1/2 items-center justify-center rounded-r-lg rounded-l-none border-l-0"
          onClick={() => setTreeOpen(true)}
        >
          <ChevronRight className="size-3" />
        </button>
      )}

      {!zen && !isMd && treeCollapsed && (
        <button
          type="button"
          title="展开目录"
          className="glass absolute top-1/2 left-3 z-20 flex h-12 w-5 -translate-y-1/2 items-center justify-center rounded-r-lg rounded-l-none border-l-0 md:hidden"
          onClick={() => setTreeOpen(true)}
        >
          <ChevronRight className="size-3" />
        </button>
      )}

      <div
        className={cn(
          'relative flex min-w-0 flex-1 flex-col gap-3',
          zen && 'mx-auto h-full max-w-[860px]',
        )}
      >
        <section className={cn('glass shrink-0 rounded-2xl px-5 py-3.5', zen && 'bg-transparent shadow-none')}>
          {topBar}
        </section>
        <section
          ref={setScrollRoot}
          className={cn(
            'article-reader relative min-h-0 flex-1 overflow-y-auto rounded-2xl px-6 py-6 sm:px-9 sm:pb-20',
            zen ? 'bg-transparent' : 'glass',
          )}
        >
          {body}
        </section>
      </div>

      {!zen && isMd && tocVisible && <div className="h-full pl-3">{tocPanel}</div>}

      {!zen && !isMd && showToc && !tocCollapsed && (
        <div className="fixed inset-0 z-30 md:hidden">
          <button
            type="button"
            aria-label="关闭大纲"
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setTocOpen(false)}
          />
          <div className="absolute inset-y-3 right-3">{tocPanel}</div>
        </div>
      )}

      {showTocHandle && (
        <button
          type="button"
          title="展开大纲"
          className="glass absolute top-1/2 right-3 z-20 flex h-12 w-5 -translate-y-1/2 items-center justify-center rounded-l-lg rounded-r-none border-r-0"
          onClick={() => setTocOpen(true)}
        >
          <ChevronLeft className="size-3" />
        </button>
      )}

      {!zen && !isMd && showToc && tocCollapsed && (
        <button
          type="button"
          title="展开大纲"
          className="glass absolute top-1/2 right-3 z-20 flex h-12 w-5 -translate-y-1/2 items-center justify-center rounded-l-lg rounded-r-none border-r-0 md:hidden"
          onClick={() => setTocOpen(true)}
        >
          <ChevronLeft className="size-3" />
        </button>
      )}

      {showDock && (
        <ReadingDock
          zen={zen}
          onToggleZen={toggleZen}
          fontSize={fontSize}
          lineHeight={lineHeight}
          onFontSize={(n) => {
            setFontSize(n)
            writeArticlePref('fontSize', String(n))
          }}
          onLineHeight={(n) => {
            setLineHeight(n)
            writeArticlePref('lineHeight', String(n))
          }}
          onScrollTop={() => scrollRoot?.scrollTo({ top: 0, behavior: 'smooth' })}
        />
      )}
    </div>
  )
}
