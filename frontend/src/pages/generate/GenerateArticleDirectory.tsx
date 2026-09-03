import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowDownAZ,
  ArrowUpZA,
  BookOpen,
  CalendarArrowDown,
  CalendarArrowUp,
  Check,
  ChevronRight,
  FileText,
  Folder,
  ListFilter,
  Search,
  X,
  type LucideIcon,
} from 'lucide-react'
import {
  Badge,
  Button,
  Checkbox,
  EmptyState,
  GlassCard,
  Input,
  Skeleton,
  Tooltip,
} from '@/components/ui'
import {
  articlesApi,
  SUMMARY_STATUS_LABEL,
  type ArticleListItem,
  type FolderView,
  type SummaryStatus,
} from '@/api/articles'
import { cn } from '@/lib/utils'

type SortMode = 'created-desc' | 'created-asc' | 'name-asc' | 'name-desc'

const SORT_OPTIONS: { value: SortMode; label: string; icon: LucideIcon }[] = [
  { value: 'created-desc', label: '创建时间：新到旧', icon: CalendarArrowDown },
  { value: 'created-asc', label: '创建时间：旧到新', icon: CalendarArrowUp },
  { value: 'name-asc', label: '文件名：数字从小到大，字母 A 到 Z', icon: ArrowDownAZ },
  { value: 'name-desc', label: '文件名：数字从大到小，字母 Z 到 A', icon: ArrowUpZA },
]

const STATUS_VARIANT: Record<SummaryStatus, 'success' | 'warning' | 'danger' | 'neutral' | 'primary'> = {
  READY: 'success',
  STALE: 'warning',
  FAILED: 'danger',
  NONE: 'neutral',
  RUNNING: 'primary',
}

const nameCollator = new Intl.Collator(['zh-CN', 'en'], {
  numeric: true,
  sensitivity: 'base',
})

function fileName(article: ArticleListItem) {
  return article.sourcePath?.split('/').at(-1) || article.title
}

function createdAt(item: ArticleListItem | FolderView) {
  const timestamp = item.createdAt ? Date.parse(item.createdAt) : 0
  return Number.isFinite(timestamp) ? timestamp : 0
}

function compareEntries<T extends ArticleListItem | FolderView>(left: T, right: T, mode: SortMode) {
  if (mode.startsWith('created')) {
    const result = createdAt(left) - createdAt(right)
    return mode === 'created-asc' ? result : -result
  }
  const leftName = 'title' in left ? fileName(left) : left.name
  const rightName = 'title' in right ? fileName(right) : right.name
  const result = nameCollator.compare(leftName, rightName)
  return mode === 'name-asc' ? result : -result
}

function findFolder(root: FolderView, id: number | null): FolderView | undefined {
  if (id == null) return root
  for (const child of root.children) {
    if (child.id === id) return child
    const nested = findFolder(child, id)
    if (nested) return nested
  }
  return undefined
}

function folderTrail(root: FolderView, id: number | null): FolderView[] {
  if (id == null) return [root]
  for (const child of root.children) {
    const nested = folderTrail(child, id)
    if (nested.length > 0) return [root, ...nested]
  }
  return []
}

function findArticle(root: FolderView, id: number): ArticleListItem | undefined {
  const direct = root.articles.find((article) => article.id === id)
  if (direct) return direct
  for (const child of root.children) {
    const nested = findArticle(child, id)
    if (nested) return nested
  }
  return undefined
}

function articleTrail(root: FolderView, id: number): FolderView[] {
  if (root.articles.some((article) => article.id === id)) return [root]
  for (const child of root.children) {
    const nested = articleTrail(child, id)
    if (nested.length > 0) return [root, ...nested]
  }
  return []
}

function canSelect(article: ArticleListItem) {
  return !article.missing && (article.summaryStatus === 'READY' || article.summaryStatus === 'STALE')
}

function unavailableReason(article: ArticleListItem) {
  if (article.missing) return '磁盘文件已缺失，恢复文件并同步后才能选择'
  if (article.summaryStatus === 'RUNNING') return '考点摘要正在提炼'
  if (article.summaryStatus === 'FAILED') return '考点摘要提炼失败，请先重新提炼'
  return '请先完成考点摘要提炼'
}

export function GenerateArticleDirectory({
  value,
  fallbackTitle,
  onChange,
}: {
  value?: number
  fallbackTitle?: string
  onChange: (article?: ArticleListItem) => void
}) {
  const treeQ = useQuery({ queryKey: ['articles', 'tree'], queryFn: articlesApi.tree })
  const [folderId, setFolderId] = useState<number | null>(null)
  const [sortMode, setSortMode] = useState<SortMode>('created-desc')
  const [sortOpen, setSortOpen] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [categories, setCategories] = useState<Set<string>>(new Set())
  const [statuses, setStatuses] = useState<Set<SummaryStatus>>(new Set())
  const controlsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function closeMenus(event: MouseEvent) {
      if (!controlsRef.current?.contains(event.target as Node)) {
        setSortOpen(false)
        setFilterOpen(false)
      }
    }
    document.addEventListener('mousedown', closeMenus)
    return () => document.removeEventListener('mousedown', closeMenus)
  }, [])

  const root = treeQ.data
  const folder = root ? findFolder(root, folderId) ?? root : undefined
  const trail = root ? folderTrail(root, folder?.id ?? null) : []
  const selected = root && value != null ? findArticle(root, value) : undefined
  const selectedTrail = root && value != null ? articleTrail(root, value) : []

  const localCategories = useMemo(
    () => [...new Set((folder?.articles ?? []).map((article) => article.categoryLabel || article.category).filter(Boolean) as string[])].sort((a, b) => nameCollator.compare(a, b)),
    [folder],
  )
  const localStatuses = useMemo(
    () => [...new Set((folder?.articles ?? []).map((article) => article.summaryStatus))],
    [folder],
  )

  const visibleFolders = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    return [...(folder?.children ?? [])]
      .filter((item) => !needle || item.name.toLocaleLowerCase().includes(needle))
      .sort((left, right) => compareEntries(left, right, sortMode))
  }, [folder, query, sortMode])

  const visibleArticles = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    return [...(folder?.articles ?? [])]
      .filter((article) => {
        const category = article.categoryLabel || article.category
        return (
          (!needle || fileName(article).toLocaleLowerCase().includes(needle) || article.title.toLocaleLowerCase().includes(needle)) &&
          (categories.size === 0 || (category != null && categories.has(category))) &&
          (statuses.size === 0 || statuses.has(article.summaryStatus))
        )
      })
      .sort((left, right) => compareEntries(left, right, sortMode))
  }, [categories, folder, query, sortMode, statuses])

  const activeFilterCount = (query.trim() ? 1 : 0) + categories.size + statuses.size
  const activeSort = SORT_OPTIONS.find((option) => option.value === sortMode) ?? SORT_OPTIONS[0]
  const ActiveSortIcon = activeSort.icon

  function enterFolder(id: number | null) {
    setFolderId(id)
    setQuery('')
    setCategories(new Set())
    setStatuses(new Set())
    setSortOpen(false)
    setFilterOpen(false)
  }

  function resetFilters() {
    setQuery('')
    setCategories(new Set())
    setStatuses(new Set())
  }

  function toggleCategory(category: string, checked: boolean) {
    setCategories((current) => {
      const next = new Set(current)
      if (checked) next.add(category)
      else next.delete(category)
      return next
    })
  }

  function toggleStatus(status: SummaryStatus, checked: boolean) {
    setStatuses((current) => {
      const next = new Set(current)
      if (checked) next.add(status)
      else next.delete(status)
      return next
    })
  }

  return (
    <GlassCard className="p-0 sm:p-0">
      <div className="flex min-h-14 flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 sm:px-5">
        <div>
          <h2 className="text-sm font-medium">文章目录</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">选择一篇文章作为本次出题资料</p>
        </div>
        <Badge variant={selected ? 'success' : 'neutral'}>{selected ? '已选择' : '未选择'}</Badge>
      </div>

      <div className="grid min-h-[25rem] lg:grid-cols-[minmax(0,1.12fr)_minmax(17rem,.88fr)]">
        <div className="min-w-0 border-b border-border lg:border-r lg:border-b-0">
          <div className="flex min-h-12 items-center gap-2 border-b border-border px-3 py-2">
            <div className="flex min-w-0 flex-1 items-center overflow-hidden text-xs">
              {trail.map((item, index) => {
                const current = index === trail.length - 1
                return (
                  <span key={item.id ?? 'root'} className="flex min-w-0 items-center">
                    {index > 0 && <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/60" />}
                    <button
                      type="button"
                      disabled={current}
                      onClick={() => enterFolder(item.id ?? null)}
                      className={cn(
                        'min-w-0 truncate rounded-lg px-1.5 py-1 transition-colors',
                        current ? 'font-medium text-foreground' : 'text-muted-foreground hover:bg-white/50 hover:text-foreground dark:hover:bg-white/10',
                      )}
                    >
                      {item.id == null ? '全部文章' : item.name}
                    </button>
                  </span>
                )
              })}
            </div>

            <div ref={controlsRef} className="relative flex shrink-0 items-center gap-1">
              <Tooltip content={activeSort.label}>
                <Button
                  type="button"
                  variant={sortOpen ? 'secondary' : 'ghost'}
                  size="icon-sm"
                  aria-label={activeSort.label}
                  aria-expanded={sortOpen}
                  onClick={() => {
                    setSortOpen((open) => !open)
                    setFilterOpen(false)
                  }}
                >
                  <ActiveSortIcon className="size-4" />
                </Button>
              </Tooltip>
              <Tooltip content="筛选当前目录">
                <Button
                  type="button"
                  variant={filterOpen || activeFilterCount > 0 ? 'secondary' : 'ghost'}
                  size="icon-sm"
                  className="relative"
                  aria-label="筛选当前目录"
                  aria-expanded={filterOpen}
                  onClick={() => {
                    setFilterOpen((open) => !open)
                    setSortOpen(false)
                  }}
                >
                  <ListFilter className="size-4" />
                  {activeFilterCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full border-2 border-white bg-primary text-[9px] leading-none text-primary-foreground dark:border-card">
                      {activeFilterCount}
                    </span>
                  )}
                </Button>
              </Tooltip>

              {sortOpen && (
                <div className="glass-strong absolute top-10 right-0 z-30 flex gap-1 rounded-xl border border-border p-1.5 shadow-xl">
                  {SORT_OPTIONS.map(({ value: optionValue, label, icon: Icon }) => (
                    <Tooltip key={optionValue} content={label} side="bottom">
                      <button
                        type="button"
                        aria-label={label}
                        aria-pressed={sortMode === optionValue}
                        onClick={() => {
                          setSortMode(optionValue)
                          setSortOpen(false)
                        }}
                        className={cn(
                          'flex size-8 items-center justify-center rounded-lg transition-colors',
                          sortMode === optionValue
                            ? 'bg-primary/12 text-primary'
                            : 'text-muted-foreground hover:bg-white/60 hover:text-foreground dark:hover:bg-white/10',
                        )}
                      >
                        <Icon className="size-4" />
                      </button>
                    </Tooltip>
                  ))}
                </div>
              )}

              {filterOpen && (
                <div className="glass-strong absolute top-10 right-0 z-30 w-[min(19rem,calc(100vw-2rem))] rounded-xl border border-border p-3 shadow-xl">
                  <div className="relative">
                    <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" />
                    <Input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="筛选当前目录"
                      className="pl-9"
                      autoFocus
                    />
                  </div>
                  <FilterGroup title="当前目录的分类" empty={localCategories.length === 0}>
                    {localCategories.map((category) => (
                      <label key={category} className="flex cursor-pointer items-center gap-2 rounded-lg px-1 py-1 text-xs">
                        <Checkbox
                          className="size-4"
                          checked={categories.has(category)}
                          onCheckedChange={(checked) => toggleCategory(category, checked === true)}
                        />
                        <span>{category}</span>
                      </label>
                    ))}
                  </FilterGroup>
                  <FilterGroup title="提炼状态" empty={localStatuses.length === 0}>
                    {localStatuses.map((status) => (
                      <label key={status} className="flex cursor-pointer items-center gap-2 rounded-lg px-1 py-1 text-xs">
                        <Checkbox
                          className="size-4"
                          checked={statuses.has(status)}
                          onCheckedChange={(checked) => toggleStatus(status, checked === true)}
                        />
                        <span>{SUMMARY_STATUS_LABEL[status]}</span>
                      </label>
                    ))}
                  </FilterGroup>
                  <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
                    <span className="max-w-36 truncate text-[11px] text-muted-foreground">{folder?.id == null ? '全部文章' : folder?.name}</span>
                    <Tooltip content="清除筛选">
                      <Button type="button" variant="ghost" size="icon-sm" aria-label="清除筛选" disabled={activeFilterCount === 0} onClick={resetFilters}>
                        <X className="size-4" />
                      </Button>
                    </Tooltip>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between border-b border-border px-4 py-2 text-[11px] text-muted-foreground">
            <span>{visibleFolders.length} 个文件夹 · {visibleArticles.length} 篇文章</span>
            <span>目录优先</span>
          </div>

          <div className="min-h-72 p-1.5">
            {treeQ.isLoading ? (
              <div className="space-y-2 p-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-4/5" />
              </div>
            ) : treeQ.isError ? (
              <EmptyState icon={BookOpen} title="文章目录加载失败" description={(treeQ.error as Error).message} className="py-12 sm:py-12" />
            ) : visibleFolders.length === 0 && visibleArticles.length === 0 ? (
              <EmptyState
                icon={Search}
                title={activeFilterCount > 0 ? '没有匹配内容' : '当前目录为空'}
                description={activeFilterCount > 0 ? '清除筛选条件后再试。' : '可到文章页同步或创建资料。'}
                action={activeFilterCount > 0 ? <Button type="button" variant="ghost" size="sm" onClick={resetFilters}>清除筛选</Button> : undefined}
                className="py-12 sm:py-12"
              />
            ) : (
              <div>
                {visibleFolders.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => enterFolder(item.id ?? null)}
                    className="flex min-h-12 w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-white/55 dark:hover:bg-white/8"
                  >
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-chart-4/12 text-chart-4">
                      <Folder className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{item.name}</span>
                      <span className="text-[11px] text-muted-foreground">{formatDate(item.createdAt)}</span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                ))}
                {visibleArticles.map((article) => (
                  <ArticleRow
                    key={article.id}
                    article={article}
                    selected={value === article.id}
                    onSelect={() => onChange(article)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="min-w-0 p-5">
          {selected ? (
            <div>
              <p className="text-[11px] font-medium text-muted-foreground">本次出题资料</p>
              <h3 className="mt-1 truncate text-base font-semibold" title={fileName(selected)}>{fileName(selected)}</h3>
              {selected.title !== fileName(selected) && <p className="mt-1 truncate text-xs text-muted-foreground">{selected.title}</p>}
              <p className="mt-3 break-all font-mono text-[11px] leading-relaxed text-muted-foreground">
                {selectedTrail.map((item) => item.id == null ? '全部文章' : item.name).concat(fileName(selected)).join(' / ')}
              </p>
              <div className="my-5 grid grid-cols-2 gap-4 border-y border-border py-4 text-xs">
                <Detail label="主分类" value={selected.categoryLabel || selected.category || '未分类'} />
                <Detail label="摘要状态" value={SUMMARY_STATUS_LABEL[selected.summaryStatus]} />
                <Detail label="创建时间" value={formatDate(selected.createdAt)} />
                <Detail label="注入方式" value="考点摘要" />
              </div>
              <Tooltip content="取消选择">
                <Button type="button" variant="outline" size="icon-sm" aria-label="取消选择" onClick={() => onChange()}>
                  <X className="size-4" />
                </Button>
              </Tooltip>
            </div>
          ) : value != null ? (
            <div>
              <p className="text-[11px] font-medium text-muted-foreground">本次出题资料</p>
              <h3 className="mt-1 text-base font-semibold">{fallbackTitle ?? `文章 ${value}`}</h3>
              <p className="mt-3 text-xs text-muted-foreground">当前目录中未找到该文章，刷新目录后可重新确认。</p>
              <Tooltip content="取消选择">
                <Button type="button" className="mt-5" variant="outline" size="icon-sm" aria-label="取消选择" onClick={() => onChange()}>
                  <X className="size-4" />
                </Button>
              </Tooltip>
            </div>
          ) : (
            <EmptyState icon={FileText} title="选择一篇文章" description="出题时仅注入该文章的考点摘要。" className="h-full py-12 sm:py-12" />
          )}
        </div>
      </div>
    </GlassCard>
  )
}

function FilterGroup({ title, empty, children }: { title: string; empty: boolean; children: React.ReactNode }) {
  return (
    <div className="mt-3 border-t border-border pt-3">
      <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">{title}</p>
      {empty ? <p className="text-xs text-muted-foreground">没有可筛选的文章</p> : <div className="flex flex-wrap gap-x-3 gap-y-1">{children}</div>}
    </div>
  )
}

function ArticleRow({ article, selected, onSelect }: { article: ArticleListItem; selected: boolean; onSelect: () => void }) {
  const enabled = canSelect(article)
  const row = (
    <button
      type="button"
      disabled={!enabled}
      onClick={onSelect}
      className={cn(
        'flex min-h-12 w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-sm transition-colors',
        selected ? 'border-primary/35 bg-primary/8' : 'border-transparent hover:bg-white/55 dark:hover:bg-white/8',
        !enabled && 'cursor-not-allowed opacity-50',
      )}
    >
      <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-black/5 text-muted-foreground dark:bg-white/8">
        <FileText className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{fileName(article)}</span>
        <span className="block truncate text-[11px] text-muted-foreground">
          {article.categoryLabel || article.category || '未分类'} · {formatDate(article.createdAt)}
        </span>
      </span>
      {selected ? <Check className="size-4 shrink-0 text-primary" /> : <Badge variant={STATUS_VARIANT[article.summaryStatus]}>{SUMMARY_STATUS_LABEL[article.summaryStatus]}</Badge>}
    </button>
  )
  return enabled ? row : <Tooltip content={unavailableReason(article)}>{row}</Tooltip>
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><span className="block text-[11px] text-muted-foreground">{label}</span><strong className="mt-0.5 block truncate font-medium">{value}</strong></div>
}

function formatDate(value?: string) {
  if (!value) return '时间未知'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '时间未知'
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}
