import { Code, Columns2, Eye } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { CategoryItem } from '@/api/categories'
import { ArticleMarkdown } from './ArticleMarkdown'
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  Tooltip,
} from '@/components/ui'
import { cn } from '@/lib/utils'

export type EditorView = 'split' | 'source' | 'preview'

const VIEW_BTNS: { id: EditorView; label: string; icon: typeof Columns2 }[] = [
  { id: 'source', label: '全屏源码', icon: Code },
  { id: 'split', label: '分栏', icon: Columns2 },
  { id: 'preview', label: '全屏预览', icon: Eye },
]

export function ArticleEditorDialog({
  open,
  onOpenChange,
  mode,
  title,
  onTitleChange,
  category,
  onCategoryChange,
  body,
  onBodyChange,
  folderId,
  onFolderIdChange,
  folderOptions,
  categories,
  onSubmit,
  submitting,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'create' | 'edit'
  title: string
  onTitleChange: (v: string) => void
  category: string
  onCategoryChange: (v: string) => void
  body: string
  onBodyChange: (v: string) => void
  folderId?: number | null
  onFolderIdChange?: (v: number | null) => void
  folderOptions: { id: number; label: string }[]
  categories: CategoryItem[]
  onSubmit: () => void
  submitting: boolean
}) {
  const [view, setView] = useState<EditorView>('split')
  const canSubmit = !!title.trim() && !!body.trim() && !submitting

  useEffect(() => {
    if (open) setView('split')
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[min(90svh,52rem)] max-w-[min(96vw,72rem)] flex-col overflow-hidden overflow-y-hidden p-4 sm:p-5"
        showClose
      >
        <div className="absolute right-12 top-3.5 z-10 flex rounded-lg bg-black/5 p-0.5 dark:bg-white/8">
          {VIEW_BTNS.map(({ id, label, icon: Icon }) => (
            <Tooltip key={id} content={label}>
              <button
                type="button"
                aria-label={label}
                aria-pressed={view === id}
                onClick={() => setView(id)}
                className={cn(
                  'flex size-8 items-center justify-center rounded-md text-muted-foreground transition',
                  view === id
                    ? 'bg-white/90 text-foreground shadow-sm dark:bg-white/15'
                    : 'hover:text-foreground',
                )}
              >
                <Icon className="size-3.5" />
              </button>
            </Tooltip>
          ))}
        </div>

        <DialogHeader className="mb-3 shrink-0 pr-28">
          <DialogTitle>{mode === 'create' ? '新建文章' : '编辑文章'}</DialogTitle>
        </DialogHeader>

        <div className="grid shrink-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="标题" required>
            {(id) => <Input id={id} value={title} onChange={(e) => onTitleChange(e.target.value)} />}
          </Field>
          {mode === 'create' && onFolderIdChange && (
            <Field label="文件夹">
              {(id) => (
                <Select
                  value={folderId == null ? 'root' : String(folderId)}
                  onValueChange={(v) => onFolderIdChange(v === 'root' ? null : Number(v))}
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
          )}
          <Field label="主分类">
            {(id) => (
              <Select value={category || '__none'} onValueChange={(v) => onCategoryChange(v === '__none' ? '' : v)}>
                <SelectTrigger id={id}>
                  <SelectValue placeholder="可选" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">不指定</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>
        </div>

        <div
          className={cn(
            'mt-3 grid min-h-0 flex-1 gap-3 overflow-hidden',
            view === 'split' && 'grid-rows-2 md:grid-rows-1 md:grid-cols-2',
            view !== 'split' && 'grid-cols-1',
          )}
        >
          {view !== 'preview' && (
            <div className="relative min-h-0">
              <Textarea
                value={body}
                onChange={(e) => onBodyChange(e.target.value)}
                spellCheck={false}
                className="absolute inset-0 h-full min-h-0 resize-none font-mono text-[13px] leading-relaxed"
              />
            </div>
          )}
          {view !== 'source' && (
            <div className="article-reader min-h-0 overflow-y-auto rounded-xl border border-border bg-black/[0.02] p-4 dark:bg-white/[0.03]">
              {body.trim() ? (
                <ArticleMarkdown>{body}</ArticleMarkdown>
              ) : (
                <p className="text-sm text-muted-foreground">预览将显示在这里</p>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="mt-3 shrink-0">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="button" variant="primary" disabled={!canSubmit} loading={submitting} onClick={onSubmit}>
            {mode === 'create' ? '创建' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
