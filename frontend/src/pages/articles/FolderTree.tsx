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
}: {
  node: FolderView
  depth: number
  collapsed: Set<number>
  selectedId: number | null
  onToggle: (id: number) => void
  onSelectArticle: (id: number) => void
  onNewFolder: (parentId: number | null) => void
  onRenameFolder: (id: number, name: string) => void
  onDeleteFolder: (id: number, name: string) => void
}) {
  const isVirtualRoot = node.id == null
  const open = isVirtualRoot || !collapsed.has(node.id!)
  const hasKids = (node.children?.length ?? 0) > 0 || (node.articles?.length ?? 0) > 0
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
      <div className="min-h-[6rem] rounded-lg">
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
        className="group flex items-center gap-1 rounded-lg px-1.5 py-1 text-sm transition hover:bg-black/5 dark:hover:bg-white/5"
        style={{ paddingLeft: 4 + depth * 12 }}
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
          onClick={() => onDeleteFolder(node.id!, node.name)}
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
      data-article-row
      data-article-selected={selected ? 'true' : 'false'}
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left text-sm transition',
        article.missing && 'opacity-50',
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
