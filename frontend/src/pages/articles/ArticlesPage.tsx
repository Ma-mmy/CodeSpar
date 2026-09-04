import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import {
  ArrowDownAZ,
  ArrowUpZA,
  BookOpen,
  CalendarArrowDown,
  CalendarArrowUp,
  Filter,
  FilePlus2,
  FolderInput,
  FolderPlus,
  Loader2,
  MoreHorizontal,
  Pencil,
  Trash2,
  Upload,
  RefreshCw,
  Search,
  type LucideIcon,
} from 'lucide-react'
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
  Field,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Tabs,
  TabsList,
  TabsTrigger,
  Tooltip,
  useToast,
} from '@/components/ui'
import { categoriesApi } from '@/api/categories'
import {
  articlesApi,
  SUMMARY_STATUS_LABEL,
  type FolderView,
  type SummaryStatus,
} from '@/api/articles'
import { OpenExamDialog } from './OpenExamDialog'
import { SummaryPanel } from './SummaryPanel'
import { ArticleEditorDialog } from './ArticleEditorDialog'
import { ArticleMarkdown } from './ArticleMarkdown'
import { ArticleToc } from './ArticleToc'
import { ArticleWorkspace } from './ArticleWorkspace'
import { FolderTree } from './FolderTree'
import { extractHeadings, extractSummaryHeadings } from './headings'
import { readArticlePref, writeArticlePref } from './prefs'
import { cn } from '@/lib/utils'

type Tab = 'body' | 'summary'
type EditorMode = 'create' | 'edit'
type ArticleSort = 'updated-desc' | 'updated-asc' | 'title-asc' | 'title-desc'

const ARTICLE_SORTS: { value: ArticleSort; label: string; icon: LucideIcon }[] = [
  { value: 'updated-desc', label: '更新时间：新到旧', icon: CalendarArrowDown },
  { value: 'updated-asc', label: '更新时间：旧到新', icon: CalendarArrowUp },
  { value: 'title-asc', label: '标题：数字从小到大，字母 A 到 Z', icon: ArrowDownAZ },
  { value: 'title-desc', label: '标题：数字从大到小，字母 Z 到 A', icon: ArrowUpZA },
]

const ARTICLE_SORT_PREF = 'sort'

function readArticleSort(): ArticleSort {
  const stored = readArticlePref(ARTICLE_SORT_PREF)
  return ARTICLE_SORTS.some(({ value }) => value === stored)
    ? stored as ArticleSort
    : 'updated-desc'
}

export function ArticlesPage() {
  const toast = useToast()
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const autoSyncStarted = useRef(false)
  const [searchParams, setSearchParams] = useSearchParams()

  const selectedId = parseId(searchParams.get('id'))

  const treeQ = useQuery({ queryKey: ['articles', 'tree'], queryFn: articlesApi.tree })
  const metaQ = useQuery({ queryKey: ['articles', 'meta'], queryFn: articlesApi.meta })
  const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: categoriesApi.list })

  const [tab, setTab] = useState<Tab>('body')
  const [openExam, setOpenExam] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set())
  const [articleSort, setArticleSort] = useState<ArticleSort>(readArticleSort)
  const [sortOpen, setSortOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [rootFilterId, setRootFilterId] = useState<number | null>(null)
  const [filterOpen, setFilterOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const controlsRef = useRef<HTMLDivElement>(null)

  const [folderDialog, setFolderDialog] = useState<
    { mode: 'create'; parentId: number | null } | { mode: 'rename'; id: number; name: string } | null
  >(null)
  const [folderName, setFolderName] = useState('')
  const [moveOpen, setMoveOpen] = useState(false)
  const [moveFolderId, setMoveFolderId] = useState('root')

  const [editorOpen, setEditorOpen] = useState(false)
  const [editorMode, setEditorMode] = useState<EditorMode>('create')
  const [draftTitle, setDraftTitle] = useState('')
  const [draftCategory, setDraftCategory] = useState('')
  const [draftBody, setDraftBody] = useState('')
  const [draftFolderId, setDraftFolderId] = useState<number | null>(null)

  const detailQ = useQuery({
    queryKey: ['articles', selectedId],
    queryFn: () => articlesApi.get(selectedId!),
    enabled: selectedId != null,
  })

  const invalidateTree = () => qc.invalidateQueries({ queryKey: ['articles', 'tree'] })

  function selectArticle(id: number | null) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (id == null) next.delete('id')
        else next.set('id', String(id))
        return next
      },
      { replace: true },
    )
    setTab('body')
  }

  const createFolder = useMutation({
    mutationFn: () =>
      articlesApi.createFolder({
        parentId: folderDialog?.mode === 'create' ? folderDialog.parentId : null,
        name: folderName.trim(),
      }),
    onSuccess: () => {
      setFolderDialog(null)
      setFolderName('')
      invalidateTree()
      toast('已创建文件夹', { variant: 'success' })
    },
    onError: (e) => toast('创建失败', { variant: 'danger', description: (e as Error).message }),
  })

  const renameFolder = useMutation({
    mutationFn: () => {
      if (folderDialog?.mode !== 'rename') throw new Error('无效状态')
      return articlesApi.renameFolder(folderDialog.id, folderName.trim())
    },
    onSuccess: () => {
      setFolderDialog(null)
      setFolderName('')
      invalidateTree()
      toast('已重命名', { variant: 'success' })
    },
    onError: (e) => toast('重命名失败', { variant: 'danger', description: (e as Error).message }),
  })

  const moveArticleMut = useMutation({
    mutationFn: ({ id, folderId }: { id: number; folderId: number | null }) =>
      articlesApi.move(id, folderId),
    onSuccess: (a) => {
      qc.setQueryData(['articles', a.id], a)
      invalidateTree()
      setMoveOpen(false)
      toast('文章已移动', { variant: 'success' })
    },
    onError: (e) => toast('移动失败', { variant: 'danger', description: (e as Error).message }),
  })

  const createArticle = useMutation({
    mutationFn: () =>
      articlesApi.create({
        folderId: draftFolderId,
        title: draftTitle.trim(),
        category: draftCategory || undefined,
        bodyMd: draftBody,
      }),
    onSuccess: (a) => {
      setEditorOpen(false)
      setDraftTitle('')
      setDraftBody('')
      setDraftCategory('')
      invalidateTree()
      selectArticle(a.id)
      toast('已创建文章', { variant: 'success' })
    },
    onError: (e) => toast('创建失败', { variant: 'danger', description: (e as Error).message }),
  })

  const saveArticle = useMutation({
    mutationFn: () =>
      articlesApi.update(selectedId!, {
        folderId: detailQ.data?.folderId ?? null,
        title: draftTitle.trim(),
        category: draftCategory || undefined,
        bodyMd: draftBody,
      }),
    onSuccess: (a) => {
      setEditorOpen(false)
      qc.setQueryData(['articles', a.id], a)
      invalidateTree()
      toast('已保存', { variant: 'success' })
    },
    onError: (e) => toast('保存失败', { variant: 'danger', description: (e as Error).message }),
  })

  const removeArticle = useMutation({
    mutationFn: (id: number) => articlesApi.remove(id),
    onSuccess: () => {
      selectArticle(null)
      invalidateTree()
      toast('已删除文章', { variant: 'success' })
    },
    onError: (e) => toast('删除失败', { variant: 'danger', description: (e as Error).message }),
  })

  const removeFolder = useMutation({
    mutationFn: (id: number) => articlesApi.removeFolder(id),
    onSuccess: () => {
      invalidateTree()
      toast('已删除文件夹', { variant: 'success' })
    },
    onError: (e) => toast('删除失败', { variant: 'danger', description: (e as Error).message }),
  })

  const upload = useMutation({
    mutationFn: (file: File) => articlesApi.upload(file, detailQ.data?.folderId ?? null),
    onSuccess: (a) => {
      invalidateTree()
      selectArticle(a.id)
      toast('上传成功', { variant: 'success' })
    },
    onError: (e) => toast('上传失败', { variant: 'danger', description: (e as Error).message }),
  })

  const sync = useMutation({
    mutationFn: articlesApi.sync,
    onSuccess: () => {
      invalidateTree()
    },
    onError: (e) => toast('同步失败', { variant: 'danger', description: (e as Error).message }),
  })
  const runSync = sync.mutate

  useEffect(() => {
    if (autoSyncStarted.current) return
    autoSyncStarted.current = true
    runSync()
  }, [runSync])

  useEffect(() => {
    function closeSortMenu(event: MouseEvent) {
      if (!controlsRef.current?.contains(event.target as Node)) {
        setSortOpen(false)
        setFilterOpen(false)
        setMoreOpen(false)
        setSearchOpen(false)
      }
    }
    document.addEventListener('mousedown', closeSortMenu)
    return () => document.removeEventListener('mousedown', closeSortMenu)
  }, [])

  const folderOptions = useMemo(() => flattenFolders(treeQ.data), [treeQ.data])
  const sortedTree = useMemo(() => sortFolderTree(treeQ.data, articleSort), [treeQ.data, articleSort])
  const rootFilterOptions = sortedTree?.children ?? []
  const visibleTree = useMemo(
    () => filterArticleTree(filterRootTree(sortedTree, rootFilterId), searchQuery),
    [sortedTree, rootFilterId, searchQuery],
  )
  const article = detailQ.data
  const activeSort = ARTICLE_SORTS.find((item) => item.value === articleSort) ?? ARTICLE_SORTS[0]
  const ActiveSortIcon = activeSort.icon
  const activeRootFilter = rootFilterOptions.find((folder) => folder.id === rootFilterId)
  const headings = useMemo(() => {
    if (!article) return []
    if (tab === 'summary') return extractSummaryHeadings(article.summaryMd, article.summaryJson)
    return extractHeadings(article.bodyMd)
  }, [article, tab])

  function toggleFolder(id: number) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function openCreate() {
    setEditorMode('create')
    setDraftTitle('')
    setDraftCategory('')
    setDraftBody('# 新文章\n\n')
    setDraftFolderId(null)
    setEditorOpen(true)
  }

  function openEdit() {
    if (!article) return
    setEditorMode('edit')
    setDraftTitle(article.title)
    setDraftCategory(article.category ?? '')
    setDraftBody(article.bodyMd)
    setEditorOpen(true)
  }

  const treeHeader = (
    <div ref={controlsRef} className="relative flex min-w-0 items-center justify-between gap-2">
      <span className="min-w-0 truncate text-xs font-medium text-muted-foreground">文章目录</span>
      <div className="flex shrink-0 items-center gap-0.5">
        <Tooltip content="搜索文章">
          <Button
            type="button"
            size="icon-sm"
            variant={searchOpen || searchQuery ? 'secondary' : 'ghost'}
            aria-label="搜索文章"
            aria-expanded={searchOpen}
            onClick={() => {
              setSearchOpen((open) => !open)
              setSortOpen(false)
              setFilterOpen(false)
              setMoreOpen(false)
            }}
          >
            <Search className="size-4" />
          </Button>
        </Tooltip>
        <Tooltip content={activeRootFilter ? `筛选：${activeRootFilter.name}` : '筛选：全部根目录'}>
          <Button
            type="button"
            size="icon-sm"
            variant={filterOpen || rootFilterId != null ? 'secondary' : 'ghost'}
            aria-label={activeRootFilter ? `筛选：${activeRootFilter.name}` : '筛选：全部根目录'}
            aria-expanded={filterOpen}
            onClick={() => {
              setFilterOpen((open) => !open)
              setSortOpen(false)
              setMoreOpen(false)
              setSearchOpen(false)
            }}
          >
            <Filter className="size-4" />
          </Button>
        </Tooltip>
        <span className="mx-0.5 h-5 w-px bg-border" aria-hidden />
        <Tooltip content="更多操作">
          <Button
            type="button"
            size="icon-sm"
            variant={moreOpen ? 'secondary' : 'ghost'}
            aria-label="更多操作"
            aria-expanded={moreOpen}
            onClick={() => {
              setMoreOpen((open) => !open)
              setSortOpen(false)
              setFilterOpen(false)
              setSearchOpen(false)
            }}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </Tooltip>
      </div>
      {searchOpen && (
        <div className="glass-strong absolute top-10 left-0 right-0 z-30 rounded-xl border border-border p-1.5 shadow-xl">
          <Input
            autoFocus
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="搜索文章标题"
            aria-label="搜索文章标题"
            className="h-8 text-xs"
          />
        </div>
      )}
      {sortOpen && (
        <div className="glass-strong absolute top-10 right-12 z-30 flex gap-1 rounded-xl border border-border p-1.5 shadow-xl">
          {ARTICLE_SORTS.map(({ value, label, icon: Icon }) => (
            <Tooltip key={value} content={label} side="bottom">
              <button
                type="button"
                aria-label={label}
                aria-pressed={articleSort === value}
                onClick={() => {
                  setArticleSort(value)
                  writeArticlePref(ARTICLE_SORT_PREF, value)
                  setSortOpen(false)
                }}
                className={cn(
                  'flex size-8 items-center justify-center rounded-lg transition-colors',
                  articleSort === value
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
        <div className="glass-strong absolute top-10 right-12 z-30 min-w-44 rounded-xl border border-border p-1.5 shadow-xl">
          <button
            type="button"
            aria-pressed={rootFilterId == null}
            onClick={() => {
              setRootFilterId(null)
              setFilterOpen(false)
            }}
            className={cn(
              'flex w-full items-center rounded-lg px-3 py-2 text-left text-xs transition-colors',
              rootFilterId == null
                ? 'bg-primary/12 font-medium text-primary'
                : 'text-muted-foreground hover:bg-white/60 hover:text-foreground dark:hover:bg-white/10',
            )}
          >
            全部根目录
          </button>
          {rootFilterOptions.map((folder) => (
            <button
              key={folder.id}
              type="button"
              aria-pressed={rootFilterId === folder.id}
              onClick={() => {
                setRootFilterId(folder.id ?? null)
                setFilterOpen(false)
              }}
              className={cn(
                'flex w-full items-center rounded-lg px-3 py-2 text-left text-xs transition-colors',
                rootFilterId === folder.id
                  ? 'bg-primary/12 font-medium text-primary'
                  : 'text-muted-foreground hover:bg-white/60 hover:text-foreground dark:hover:bg-white/10',
              )}
            >
              {folder.name}
            </button>
          ))}
          {rootFilterOptions.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted-foreground">暂无根文件夹</p>
          )}
        </div>
      )}
      {moreOpen && (
        <div className="glass-strong absolute top-10 right-0 z-30 w-44 rounded-xl border border-border p-1.5 shadow-xl">
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-white/60 hover:text-foreground dark:hover:bg-white/10"
            onClick={() => {
              setSortOpen(true)
              setMoreOpen(false)
            }}
          >
            <ActiveSortIcon className="size-4" />
            排序：{activeSort.label}
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-white/60 hover:text-foreground dark:hover:bg-white/10"
            onClick={() => {
              setFolderName('')
              setFolderDialog({ mode: 'create', parentId: null })
              setMoreOpen(false)
            }}
          >
            <FolderPlus className="size-4" />
            新增文件夹
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-white/60 hover:text-foreground dark:hover:bg-white/10"
            onClick={() => {
              openCreate()
              setMoreOpen(false)
            }}
          >
            <FilePlus2 className="size-4" />
            新建文章
          </button>
          <button
            type="button"
            disabled={upload.isPending}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-white/60 hover:text-foreground disabled:pointer-events-none disabled:opacity-45 dark:hover:bg-white/10"
            onClick={() => {
              fileRef.current?.click()
              setMoreOpen(false)
            }}
          >
            {upload.isPending ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            上传 Markdown
          </button>
          <button
            type="button"
            disabled={sync.isPending}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-white/60 hover:text-foreground disabled:pointer-events-none disabled:opacity-45 dark:hover:bg-white/10"
            onClick={() => {
              runSync()
              setMoreOpen(false)
            }}
          >
            <RefreshCw className={`size-4 ${sync.isPending ? 'animate-spin' : ''}`} />
            同步目录
          </button>
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept=".md,text/markdown"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) upload.mutate(f)
        }}
      />
    </div>
  )

  return (
    <>
      <ArticleWorkspace
        treeHeader={treeHeader}
        tree={
          treeQ.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-4/5" />
            </div>
          ) : treeQ.isError ? (
            <Alert variant="danger">加载目录失败：{(treeQ.error as Error).message}</Alert>
          ) : (
            <FolderTree
              node={visibleTree!}
              depth={0}
              collapsed={searchQuery.trim() ? new Set<number>() : collapsed}
              selectedId={selectedId}
              onToggle={toggleFolder}
              onSelectArticle={selectArticle}
              onNewFolder={(parentId) => {
                setFolderName('')
                setFolderDialog({ mode: 'create', parentId })
              }}
              onRenameFolder={(id, name) => {
                setFolderName(name)
                setFolderDialog({ mode: 'rename', id, name })
              }}
              onDeleteFolder={(id) => {
                if (confirm('确认删除该空文件夹？')) removeFolder.mutate(id)
              }}
            />
          )
        }
        topBar={
          selectedId == null ? (
            <div className="text-sm text-muted-foreground">选择或创建一篇文章</div>
          ) : detailQ.isLoading ? (
            <Skeleton className="h-7 w-1/2" />
          ) : detailQ.isError ? (
            <Alert variant="danger">加载失败：{(detailQ.error as Error).message}</Alert>
          ) : article ? (
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <h2 className="truncate text-lg font-semibold">{article.title}</h2>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="neutral">{SUMMARY_STATUS_LABEL[article.summaryStatus as SummaryStatus]}</Badge>
                  {article.categoryLabel && <Badge variant="primary">{article.categoryLabel}</Badge>}
                  {article.summaryModelSnap && <span>摘要模型：{article.summaryModelSnap}</span>}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="primary" size="sm" onClick={() => setOpenExam(true)}>
                  <BookOpen className="size-4" /> 开卷
                </Button>
                <Tooltip content="编辑文章">
                  <Button type="button" variant="secondary" size="icon-sm" aria-label="编辑文章" onClick={openEdit}>
                    <Pencil className="size-4" />
                  </Button>
                </Tooltip>
                <Tooltip content="移动文章">
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon-sm"
                    aria-label="移动文章"
                    onClick={() => {
                      setMoveFolderId(article.folderId == null ? 'root' : String(article.folderId))
                      setMoveOpen(true)
                    }}
                  >
                    <FolderInput className="size-4" />
                  </Button>
                </Tooltip>
                <Tooltip content="删除文章">
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon-sm"
                    aria-label="删除文章"
                    onClick={() => {
                      if (confirm('删除文章将同时删除其未交卷；已交卷会保留但断联来源。确认？')) {
                        removeArticle.mutate(article.id)
                      }
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </Tooltip>
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">文章不存在</div>
          )
        }
        body={
          selectedId == null ? (
            <div
              data-open-directory
              role="button"
              tabIndex={0}
              className="cursor-pointer rounded-xl outline-none transition-colors hover:bg-black/[0.03] focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-white/[0.03]"
              aria-label="打开文章目录"
            >
              <EmptyState
                icon={BookOpen}
                title="选择或创建一篇文章"
                description={treeQ.data && treeQ.data.children.length === 0 && treeQ.data.articles.length === 0 && metaQ.data ? `把资料拷到 ${metaQ.data.notesDir} 后点同步目录。` : '从左侧目录树选择文章。'}
              />
            </div>
          ) : detailQ.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-8 w-1/2" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : article ? (
            <div className="flex min-h-full flex-col">
              {article.summaryStatus === 'FAILED' && article.summaryError && (
                <Alert variant="danger" className="mb-3">
                  摘要失败：{article.summaryError}
                </Alert>
              )}
              {article.summaryStatus === 'STALE' && (
                <Alert variant="warning" className="mb-3">
                  原文已变更，考点摘要已过期，建议「重新提炼后开卷」。
                </Alert>
              )}
              <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
                <TabsList>
                  <TabsTrigger value="body">原文</TabsTrigger>
                  <TabsTrigger value="summary">考点摘要</TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="mt-4 min-w-0 flex-1">
                {tab === 'body' ? (
                  article.missing ? <Alert variant="danger">磁盘上的 Markdown 文件已缺失，请恢复文件后同步目录。</Alert> : <ArticleMarkdown articleId={article.id}>{article.bodyMd}</ArticleMarkdown>
                ) : (
                  <SummaryPanel
                    article={article}
                    onUpdated={(a) => {
                      qc.setQueryData(['articles', a.id], a)
                      invalidateTree()
                    }}
                  />
                )}
              </div>
            </div>
          ) : null
        }
        toc={(scrollRoot) => (
          <ArticleToc
            headings={headings}
            scrollRoot={scrollRoot}
            emptyHint={tab === 'summary' ? '摘要没有标题' : '正文没有标题'}
          />
        )}
        showToc={!!article}
        showDock={!!article}
      />

      {article && (
        <OpenExamDialog
          article={article}
          open={openExam}
          onOpenChange={setOpenExam}
          onArticleUpdated={(a) => qc.setQueryData(['articles', a.id], a)}
        />
      )}

      <ArticleEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        mode={editorMode}
        title={draftTitle}
        onTitleChange={setDraftTitle}
        category={draftCategory}
        onCategoryChange={setDraftCategory}
        body={draftBody}
        onBodyChange={setDraftBody}
        folderId={draftFolderId}
        onFolderIdChange={setDraftFolderId}
        folderOptions={folderOptions}
        categories={categories ?? []}
        submitting={editorMode === 'create' ? createArticle.isPending : saveArticle.isPending}
        articleId={editorMode === 'edit' ? article?.id : undefined}
        onSubmit={() => {
          if (editorMode === 'create') createArticle.mutate()
          else saveArticle.mutate()
        }}
      />

      <Dialog open={!!folderDialog} onOpenChange={(o) => !o && setFolderDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {folderDialog?.mode === 'rename'
                ? '重命名文件夹'
                : folderDialog?.mode === 'create' && folderDialog.parentId == null
                  ? '新增文件夹'
                  : '新建子文件夹'}
            </DialogTitle>
            <DialogDescription>非空文件夹不可删除；最多嵌套 5 层。</DialogDescription>
          </DialogHeader>
          <Field label="名称">
            {(id) => (
              <Input
                id={id}
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                placeholder="例如：RAG 精读"
              />
            )}
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setFolderDialog(null)}>
              取消
            </Button>
            <Button
              type="button"
              disabled={!folderName.trim() || createFolder.isPending || renameFolder.isPending}
              onClick={() => {
                if (folderDialog?.mode === 'rename') renameFolder.mutate()
                else createFolder.mutate()
              }}
            >
              {folderDialog?.mode === 'rename' ? '保存' : '创建'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={moveOpen} onOpenChange={setMoveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>移动文章到文件夹</DialogTitle>
            <DialogDescription>也可在左侧目录树中把文章拖到目标文件夹。</DialogDescription>
          </DialogHeader>
          <Field label="目标文件夹">
            {(id) => (
              <Select value={moveFolderId} onValueChange={setMoveFolderId}>
                <SelectTrigger id={id}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="root">不放入文件夹</SelectItem>
                  {folderOptions.map((f) => (
                    <SelectItem key={f.id} value={String(f.id)}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setMoveOpen(false)}>
              取消
            </Button>
            <Button
              type="button"
              variant="primary"
              loading={moveArticleMut.isPending}
              onClick={() => {
                if (selectedId == null) return
                moveArticleMut.mutate({
                  id: selectedId,
                  folderId: moveFolderId === 'root' ? null : Number(moveFolderId),
                })
              }}
            >
              移动
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function parseId(raw: string | null): number | null {
  if (raw == null || raw === '') return null
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : null
}

function flattenFolders(root?: FolderView | null): { id: number; label: string }[] {
  if (!root) return []
  const out: { id: number; label: string }[] = []
  function walk(nodes: FolderView[], prefix: string) {
    for (const n of nodes) {
      if (n.id == null) continue
      const label = prefix ? `${prefix} / ${n.name}` : n.name
      out.push({ id: n.id, label })
      walk(n.children ?? [], label)
    }
  }
  walk(root.children ?? [], '')
  return out
}

function sortFolderTree(root: FolderView | undefined, sort: ArticleSort): FolderView | undefined {
  if (!root) return undefined

  const compareNames = (left: string, right: string) =>
    left.localeCompare(right, 'zh-CN', { numeric: true, sensitivity: 'base' })
  const compareDates = (left?: string, right?: string) => {
    const leftTime = left ? Date.parse(left) : 0
    const rightTime = right ? Date.parse(right) : 0
    return (Number.isNaN(leftTime) ? 0 : leftTime) - (Number.isNaN(rightTime) ? 0 : rightTime)
  }
  const direction = sort.endsWith('asc') ? 1 : -1

  const compareArticles = (a: FolderView['articles'][number], b: FolderView['articles'][number]) => {
    if (sort === 'title-asc' || sort === 'title-desc') {
      return direction * (compareNames(a.title, b.title) || (a.id - b.id))
    }

    return direction * (compareDates(a.updatedAt, b.updatedAt) || (a.id - b.id))
  }

  const compareFolders = (a: FolderView, b: FolderView) => {
    if (sort === 'title-asc' || sort === 'title-desc') {
      return direction * (compareNames(a.name, b.name) || ((a.id ?? 0) - (b.id ?? 0)))
    }
    return direction * (compareDates(a.createdAt, b.createdAt) || ((a.id ?? 0) - (b.id ?? 0)))
  }

  const visit = (node: FolderView): FolderView => ({
    ...node,
    children: [...(node.children ?? [])].sort(compareFolders).map(visit),
    articles: [...(node.articles ?? [])].sort(compareArticles),
  })

  return visit(root)
}

function filterRootTree(root: FolderView | undefined, rootFolderId: number | null): FolderView | undefined {
  if (!root || rootFolderId == null) return root
  const rootFolder = root.children.find((folder) => folder.id === rootFolderId)
  if (!rootFolder) return root
  return { ...root, children: [rootFolder], articles: [] }
}

function filterArticleTree(root: FolderView | undefined, query: string): FolderView | undefined {
  if (!root) return undefined
  const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN')
  if (!normalizedQuery) return root

  const visit = (node: FolderView): FolderView | null => {
    const children = (node.children ?? [])
      .map(visit)
      .filter((child): child is FolderView => child != null)
    const articles = (node.articles ?? []).filter((article) =>
      article.title.toLocaleLowerCase('zh-CN').includes(normalizedQuery),
    )
    return node.id == null || children.length > 0 || articles.length > 0
      ? { ...node, children, articles }
      : null
  }

  return visit(root) ?? { ...root, children: [], articles: [] }
}
