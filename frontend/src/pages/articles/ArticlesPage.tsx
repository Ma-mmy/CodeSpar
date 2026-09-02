import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
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
  Textarea,
  useToast,
} from '@/components/ui'
import { Markdown } from '@/components/Markdown'
import { categoriesApi } from '@/api/categories'
import {
  articlesApi,
  SUMMARY_STATUS_LABEL,
  type ArticleListItem,
  type FolderView,
  type SummaryStatus,
} from '@/api/articles'
import { OpenExamDialog } from './OpenExamDialog'
import { SummaryPanel } from './SummaryPanel'
import { cn } from '@/lib/utils'

type Tab = 'body' | 'summary'
type DragPayload =
  | { kind: 'article'; id: number }
  | { kind: 'folder'; id: number }

const DND_MIME = 'application/x-codespar-dnd'

export function ArticlesPage() {
  const toast = useToast()
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)

  const treeQ = useQuery({ queryKey: ['articles', 'tree'], queryFn: articlesApi.tree })
  const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: categoriesApi.list })

  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [expanded, setExpanded] = useState<Set<number | 'root'>>(new Set(['root']))
  const [tab, setTab] = useState<Tab>('body')
  const [editing, setEditing] = useState(false)
  const [openExam, setOpenExam] = useState(false)

  const [folderDialog, setFolderDialog] = useState<{ mode: 'create'; parentId: number | null } | { mode: 'rename'; id: number; name: string } | null>(null)
  const [folderName, setFolderName] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [draftTitle, setDraftTitle] = useState('')
  const [draftCategory, setDraftCategory] = useState('')
  const [draftBody, setDraftBody] = useState('')
  const [draftFolderId, setDraftFolderId] = useState<number | null>(null)
  const [moveOpen, setMoveOpen] = useState(false)
  const [moveFolderId, setMoveFolderId] = useState<string>('root')

  const detailQ = useQuery({
    queryKey: ['articles', selectedId],
    queryFn: () => articlesApi.get(selectedId!),
    enabled: selectedId != null,
  })

  const [editTitle, setEditTitle] = useState('')
  const [editCategory, setEditCategory] = useState('')
  const [editBody, setEditBody] = useState('')

  useEffect(() => {
    if (detailQ.data && !editing) {
      setEditTitle(detailQ.data.title)
      setEditCategory(detailQ.data.category ?? '')
      setEditBody(detailQ.data.bodyMd)
    }
  }, [detailQ.data, editing])

  const invalidateTree = () => qc.invalidateQueries({ queryKey: ['articles', 'tree'] })

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
      setCreateOpen(false)
      setDraftTitle('')
      setDraftBody('')
      setDraftCategory('')
      invalidateTree()
      setSelectedId(a.id)
      toast('已创建文章', { variant: 'success' })
    },
    onError: (e) => toast('创建失败', { variant: 'danger', description: (e as Error).message }),
  })

  const saveArticle = useMutation({
    mutationFn: () =>
      articlesApi.update(selectedId!, {
        folderId: detailQ.data?.folderId ?? null,
        title: editTitle.trim(),
        category: editCategory || undefined,
        bodyMd: editBody,
      }),
    onSuccess: (a) => {
      setEditing(false)
      qc.setQueryData(['articles', a.id], a)
      invalidateTree()
      toast('已保存', { variant: 'success' })
    },
    onError: (e) => toast('保存失败', { variant: 'danger', description: (e as Error).message }),
  })

  const removeArticle = useMutation({
    mutationFn: (id: number) => articlesApi.remove(id),
    onSuccess: () => {
      setSelectedId(null)
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
    mutationFn: (file: File) => articlesApi.upload(file, draftFolderId),
    onSuccess: (a) => {
      invalidateTree()
      setSelectedId(a.id)
      toast('上传成功', { variant: 'success' })
    },
    onError: (e) => toast('上传失败', { variant: 'danger', description: (e as Error).message }),
  })

  const folderOptions = useMemo(() => flattenFolders(treeQ.data), [treeQ.data])

  function toggleExpand(id: number | 'root') {
    setExpanded((prev) => {
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

  const article = detailQ.data

  return (
    <PageContainer className="max-w-6xl">
      <PageHeader
        title="文章"
        description="管理 Markdown 文档，提炼考点摘要后开卷出题；可拖拽归类，可复用历史卷。"
      />
      <div className="-mt-4 mb-5 flex flex-wrap gap-2 sm:-mt-6">
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            setFolderName('')
            setFolderDialog({ mode: 'create', parentId: null })
          }}
        >
          <FolderPlus className="size-4" /> 新增文件夹
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            setDraftFolderId(null)
            setDraftTitle('')
            setDraftCategory('')
            setDraftBody('# 新文章\n\n')
            setCreateOpen(true)
          }}
        >
          <FilePlus2 className="size-4" /> 新建文章
        </Button>
        <Button type="button" variant="secondary" onClick={() => fileRef.current?.click()} disabled={upload.isPending}>
          {upload.isPending ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          上传 .md
        </Button>
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

      <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <GlassCard className="max-h-[calc(100vh-12rem)] overflow-y-auto p-3">
          {treeQ.isLoading ? (
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
              expanded={expanded}
              selectedId={selectedId}
              onToggle={toggleExpand}
              onSelectArticle={setSelectedId}
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
          )}
        </GlassCard>

        <div className="min-w-0 space-y-4">
          {selectedId == null ? (
            <GlassCard>
              <EmptyState
                icon={BookOpen}
                title="选择或创建一篇文章"
                description="左侧目录树选择文章；可拖拽文章/文件夹到目标目录。"
              />
            </GlassCard>
          ) : detailQ.isLoading ? (
            <GlassCard className="space-y-3">
              <Skeleton className="h-8 w-1/2" />
              <Skeleton className="h-40 w-full" />
            </GlassCard>
          ) : detailQ.isError ? (
            <Alert variant="danger">加载失败：{(detailQ.error as Error).message}</Alert>
          ) : article ? (
            <>
              <GlassCard>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    {editing ? (
                      <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="max-w-md" />
                    ) : (
                      <h2 className="truncate text-lg font-semibold">{article.title}</h2>
                    )}
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="neutral">
                        {SUMMARY_STATUS_LABEL[article.summaryStatus as SummaryStatus]}
                      </Badge>
                      {article.categoryLabel && <Badge variant="primary">{article.categoryLabel}</Badge>}
                      {article.summaryModelSnap && <span>摘要模型：{article.summaryModelSnap}</span>}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {!editing ? (
                      <>
                        <Button type="button" variant="secondary" onClick={() => setEditing(true)}>
                          <Pencil className="size-4" /> 编辑
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => {
                            setMoveFolderId(article.folderId == null ? 'root' : String(article.folderId))
                            setMoveOpen(true)
                          }}
                        >
                          <FolderInput className="size-4" /> 移动到…
                        </Button>
                        <Button type="button" variant="primary" onClick={() => setOpenExam(true)}>
                          <BookOpen className="size-4" /> 开卷
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => {
                            if (confirm('删除文章将同时删除其未交卷；已交卷会保留但断联来源。确认？')) {
                              removeArticle.mutate(article.id)
                            }
                          }}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button type="button" onClick={() => saveArticle.mutate()} disabled={saveArticle.isPending}>
                          {saveArticle.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                          保存
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => {
                            setEditing(false)
                            setEditTitle(article.title)
                            setEditCategory(article.category ?? '')
                            setEditBody(article.bodyMd)
                          }}
                        >
                          取消
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                {editing && (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <Field label="主分类">
                      {(id) => (
                        <Select value={editCategory || '__none'} onValueChange={(v) => setEditCategory(v === '__none' ? '' : v)}>
                          <SelectTrigger id={id}>
                            <SelectValue placeholder="可选" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none">不指定</SelectItem>
                            {(categories ?? []).map((c) => (
                              <SelectItem key={c.code} value={c.code}>
                                {c.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </Field>
                  </div>
                )}

                {article.summaryStatus === 'FAILED' && article.summaryError && (
                  <Alert variant="danger" className="mt-3">
                    摘要失败：{article.summaryError}
                  </Alert>
                )}
                {article.summaryStatus === 'STALE' && (
                  <Alert variant="warning" className="mt-3">
                    原文已变更，考点摘要已过期，建议「重新提炼后开卷」。
                  </Alert>
                )}
              </GlassCard>

              <GlassCard>
                <div className="mb-3 flex gap-1 rounded-xl bg-black/5 p-1 dark:bg-white/5">
                  {(
                    [
                      ['body', '原文'],
                      ['summary', '考点摘要'],
                    ] as const
                  ).map(([k, label]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setTab(k)}
                      className={cn(
                        'flex-1 rounded-lg py-1.5 text-sm transition',
                        tab === k
                          ? 'bg-white/80 font-medium shadow-sm dark:bg-white/15'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {tab === 'body' ? (
                  editing ? (
                    <Textarea
                      value={editBody}
                      onChange={(e) => setEditBody(e.target.value)}
                      className="min-h-[420px] font-mono text-sm"
                    />
                  ) : (
                    <Markdown>{article.bodyMd}</Markdown>
                  )
                ) : (
                  <SummaryPanel
                    article={article}
                    onUpdated={(a) => {
                      qc.setQueryData(['articles', a.id], a)
                      invalidateTree()
                    }}
                  />
                )}
              </GlassCard>

              <OpenExamDialog
                article={article}
                open={openExam}
                onOpenChange={setOpenExam}
                onArticleUpdated={(a) => qc.setQueryData(['articles', a.id], a)}
              />
            </>
          ) : null}
        </div>
      </div>

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

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>新建文章</DialogTitle>
            <DialogDescription>单篇正文不超过 200KB；仅支持 Markdown。</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Field label="标题">
              {(id) => <Input id={id} value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} />}
            </Field>
            <Field label="文件夹">
              {(id) => (
                <Select
                  value={draftFolderId == null ? 'root' : String(draftFolderId)}
                  onValueChange={(v) => setDraftFolderId(v === 'root' ? null : Number(v))}
                >
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
            <Field label="主分类">
              {(id) => (
                <Select value={draftCategory || '__none'} onValueChange={(v) => setDraftCategory(v === '__none' ? '' : v)}>
                  <SelectTrigger id={id}>
                    <SelectValue placeholder="可选" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">不指定</SelectItem>
                    {(categories ?? []).map((c) => (
                      <SelectItem key={c.code} value={c.code}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>
            <Field label="正文">
              {(id) => (
                <Textarea
                  id={id}
                  value={draftBody}
                  onChange={(e) => setDraftBody(e.target.value)}
                  className="min-h-[200px] font-mono text-sm"
                />
              )}
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>
              取消
            </Button>
            <Button
              type="button"
              disabled={!draftTitle.trim() || !draftBody.trim() || createArticle.isPending}
              onClick={() => createArticle.mutate()}
            >
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  )
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

function readDragPayload(e: DragEvent): DragPayload | null {
  try {
    const raw = e.dataTransfer.getData(DND_MIME)
    if (!raw) return null
    return JSON.parse(raw) as DragPayload
  } catch {
    return null
  }
}

function FolderTree({
  node,
  depth,
  expanded,
  selectedId,
  onToggle,
  onSelectArticle,
  onNewFolder,
  onRenameFolder,
  onDeleteFolder,
  onDropOnFolder,
}: {
  node: FolderView
  depth: number
  expanded: Set<number | 'root'>
  selectedId: number | null
  onToggle: (id: number | 'root') => void
  onSelectArticle: (id: number) => void
  onNewFolder: (parentId: number | null) => void
  onRenameFolder: (id: number, name: string) => void
  onDeleteFolder: (id: number) => void
  onDropOnFolder: (folderId: number | null, payload: DragPayload) => void
}) {
  const key: number | 'root' = node.id == null ? 'root' : node.id
  const open = expanded.has(key)
  const hasKids = (node.children?.length ?? 0) > 0 || (node.articles?.length ?? 0) > 0
  const [dragOver, setDragOver] = useState(false)
  const isVirtualRoot = node.id == null

  const childrenList = (
    <>
      {(node.children ?? []).map((c) => (
        <FolderTree
          key={c.id}
          node={c}
          depth={isVirtualRoot ? depth : depth + 1}
          expanded={expanded}
          selectedId={selectedId}
          onToggle={onToggle}
          onSelectArticle={onSelectArticle}
          onNewFolder={onNewFolder}
          onRenameFolder={onRenameFolder}
          onDeleteFolder={onDeleteFolder}
          onDropOnFolder={onDropOnFolder}
        />
      ))}
      {(node.articles ?? []).map((a) => (
        <ArticleRow
          key={a.id}
          article={a}
          depth={isVirtualRoot ? depth : depth + 1}
          selected={selectedId === a.id}
          onSelect={() => onSelectArticle(a.id)}
        />
      ))}
    </>
  )

  // 虚拟根只是数据容器，不作为可删分类展示；空白处可拖回顶层
  if (isVirtualRoot) {
    return (
      <div
        className={cn('min-h-[6rem] rounded-lg', dragOver && 'bg-primary/15 ring-1 ring-primary/40')}
        onDragOver={(e) => {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'move'
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          const payload = readDragPayload(e)
          if (payload) onDropOnFolder(null, payload)
        }}
      >
        {hasKids ? (
          childrenList
        ) : (
          <p className="px-2 py-8 text-center text-xs text-muted-foreground">暂无文章或文件夹</p>
        )}
      </div>
    )
  }

  return (
    <div>
      <div
        className={cn(
          'group flex items-center gap-1 rounded-lg px-1.5 py-1 text-sm transition',
          dragOver ? 'bg-primary/15 ring-1 ring-primary/40' : 'hover:bg-black/5 dark:hover:bg-white/5',
        )}
        style={{ paddingLeft: 4 + depth * 12 }}
        draggable
        onDragStart={(e) => {
          const payload: DragPayload = { kind: 'folder', id: node.id! }
          e.dataTransfer.setData(DND_MIME, JSON.stringify(payload))
          e.dataTransfer.effectAllowed = 'move'
        }}
        onDragOver={(e) => {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'move'
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          const payload = readDragPayload(e)
          if (payload) onDropOnFolder(node.id ?? null, payload)
        }}
      >
        <button type="button" className="rounded p-0.5 text-muted-foreground" onClick={() => onToggle(key)}>
          {hasKids ? (
            open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />
          ) : (
            <span className="inline-block size-4" />
          )}
        </button>
        <span className="min-w-0 flex-1 truncate font-medium">{node.name}</span>
        <button
          type="button"
          title="新建子文件夹"
          className="rounded p-1 opacity-0 transition group-hover:opacity-100 hover:bg-black/10 dark:hover:bg-white/10"
          onClick={() => onNewFolder(node.id ?? null)}
        >
          <FolderPlus className="size-3.5" />
        </button>
        <button
          type="button"
          title="重命名"
          className="rounded p-1 opacity-0 transition group-hover:opacity-100 hover:bg-black/10 dark:hover:bg-white/10"
          onClick={() => onRenameFolder(node.id!, node.name)}
        >
          <Pencil className="size-3.5" />
        </button>
        <button
          type="button"
          title="删除空文件夹"
          className="rounded p-1 opacity-0 transition group-hover:opacity-100 hover:bg-black/10 dark:hover:bg-white/10"
          onClick={() => onDeleteFolder(node.id!)}
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
      {open && <div>{childrenList}</div>}
    </div>
  )
}

function ArticleRow({
  article,
  depth,
  selected,
  onSelect,
}: {
  article: ArticleListItem
  depth: number
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      draggable
      onDragStart={(e) => {
        const payload: DragPayload = { kind: 'article', id: article.id }
        e.dataTransfer.setData(DND_MIME, JSON.stringify(payload))
        e.dataTransfer.effectAllowed = 'move'
      }}
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left text-sm transition',
        selected
          ? 'bg-primary/10 font-medium text-foreground'
          : 'text-muted-foreground hover:bg-black/5 hover:text-foreground dark:hover:bg-white/5',
      )}
      style={{ paddingLeft: 20 + depth * 12 }}
    >
      <BookOpen className="size-3.5 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{article.title}</span>
      <span className="shrink-0 text-[10px] opacity-70">
        {SUMMARY_STATUS_LABEL[article.summaryStatus as SummaryStatus]?.[0] ?? '·'}
      </span>
    </button>
  )
}
