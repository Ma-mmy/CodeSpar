import { useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import {
  BookOpen,
  FilePlus2,
  FolderInput,
  FolderPlus,
  Loader2,
  Pencil,
  Trash2,
  Upload,
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
import { FolderTree, type DragPayload } from './FolderTree'
import { extractHeadings, extractSummaryHeadings } from './headings'

type Tab = 'body' | 'summary'
type EditorMode = 'create' | 'edit'

export function ArticlesPage() {
  const toast = useToast()
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [searchParams, setSearchParams] = useSearchParams()

  const selectedId = parseId(searchParams.get('id'))

  const treeQ = useQuery({ queryKey: ['articles', 'tree'], queryFn: articlesApi.tree })
  const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: categoriesApi.list })

  const [tab, setTab] = useState<Tab>('body')
  const [openExam, setOpenExam] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set())

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

  const moveFolderMut = useMutation({
    mutationFn: ({ id, parentId }: { id: number; parentId: number | null }) =>
      articlesApi.moveFolder(id, parentId),
    onSuccess: () => {
      invalidateTree()
      toast('文件夹已移动', { variant: 'success' })
    },
    onError: (e) => toast('移动失败', { variant: 'danger', description: (e as Error).message }),
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

  const folderOptions = useMemo(() => flattenFolders(treeQ.data), [treeQ.data])
  const article = detailQ.data
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

  function handleDropOnFolder(targetFolderId: number | null, payload: DragPayload) {
    if (payload.kind === 'article') {
      moveArticleMut.mutate({ id: payload.id, folderId: targetFolderId })
      return
    }
    if (payload.kind === 'folder') {
      if (targetFolderId === payload.id) return
      moveFolderMut.mutate({ id: payload.id, parentId: targetFolderId })
    }
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
    <div className="flex flex-wrap gap-1">
      <Tooltip content="新增文件夹">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-label="新增文件夹"
          onClick={() => {
            setFolderName('')
            setFolderDialog({ mode: 'create', parentId: null })
          }}
        >
          <FolderPlus className="size-3.5" />
        </Button>
      </Tooltip>
      <Tooltip content="新建文章">
        <Button type="button" size="sm" variant="ghost" aria-label="新建文章" onClick={openCreate}>
          <FilePlus2 className="size-3.5" />
        </Button>
      </Tooltip>
      <Tooltip content="上传 .md">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-label="上传 Markdown"
          disabled={upload.isPending}
          onClick={() => fileRef.current?.click()}
        >
          {upload.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
        </Button>
      </Tooltip>
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
              node={treeQ.data!}
              depth={0}
              collapsed={collapsed}
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
              onDropOnFolder={handleDropOnFolder}
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
                <Button type="button" variant="secondary" size="sm" onClick={openEdit}>
                  <Pencil className="size-4" /> 编辑
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setMoveFolderId(article.folderId == null ? 'root' : String(article.folderId))
                    setMoveOpen(true)
                  }}
                >
                  <FolderInput className="size-4" /> 移动
                </Button>
                <Button type="button" variant="primary" size="sm" onClick={() => setOpenExam(true)}>
                  <BookOpen className="size-4" /> 开卷
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (confirm('删除文章将同时删除其未交卷；已交卷会保留但断联来源。确认？')) {
                      removeArticle.mutate(article.id)
                    }
                  }}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">文章不存在</div>
          )
        }
        body={
          selectedId == null ? (
            <EmptyState
              icon={BookOpen}
              title="选择或创建一篇文章"
              description="左侧目录树选择文章；可拖拽文章/文件夹到目标目录。"
            />
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
                  <ArticleMarkdown>{article.bodyMd}</ArticleMarkdown>
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
            <DialogDescription>非空文件夹不可删除；最多嵌套 5 层。可拖拽调整归属。</DialogDescription>
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
