import { useState, type DragEvent } from 'react'
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  FolderPlus,
  Pencil,
  Trash2,
} from 'lucide-react'
import { SUMMARY_STATUS_LABEL, type ArticleListItem, type FolderView, type SummaryStatus } from '@/api/articles'
import { cn } from '@/lib/utils'

export type DragPayload = { kind: 'article'; id: number } | { kind: 'folder'; id: number }

const DND_MIME = 'application/x-codespar-dnd'

function readDragPayload(e: DragEvent): DragPayload | null {
  try {
    const raw = e.dataTransfer.getData(DND_MIME)
    if (!raw) return null
    return JSON.parse(raw) as DragPayload
  } catch {
    return null
  }
}

export function FolderTree({
  node,
  depth,
  collapsed,
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
  collapsed: Set<number>
  selectedId: number | null
  onToggle: (id: number) => void
  onSelectArticle: (id: number) => void
  onNewFolder: (parentId: number | null) => void
  onRenameFolder: (id: number, name: string) => void
  onDeleteFolder: (id: number) => void
  onDropOnFolder: (folderId: number | null, payload: DragPayload) => void
}) {
  const isVirtualRoot = node.id == null
  const open = isVirtualRoot || !collapsed.has(node.id!)
  const hasKids = (node.children?.length ?? 0) > 0 || (node.articles?.length ?? 0) > 0
  const [dragOver, setDragOver] = useState(false)

  const childrenList = (
    <>
      {(node.children ?? []).map((c) => (
        <FolderTree
          key={c.id}
          node={c}
          depth={isVirtualRoot ? depth : depth + 1}
          collapsed={collapsed}
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
        <button type="button" className="rounded p-0.5 text-muted-foreground" onClick={() => onToggle(node.id!)}>
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
