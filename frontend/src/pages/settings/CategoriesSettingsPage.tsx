import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Trash2 } from 'lucide-react'
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
  Skeleton,
  Switch,
  useToast,
} from '@/components/ui'
import { categoriesApi, type CategoryItem } from '@/api/categories'

export function CategoriesSettingsPage() {
  const toast = useToast()
  const qc = useQueryClient()
  const listQ = useQuery({ queryKey: ['categories', 'all'], queryFn: categoriesApi.listAll })

  const [editor, setEditor] = useState<CategoryItem | 'new' | null>(null)
  const [label, setLabel] = useState('')
  const [code, setCode] = useState('')
  const [enabled, setEnabled] = useState(true)
  const [pendingDelete, setPendingDelete] = useState<CategoryItem | null>(null)

  function openNew() {
    setEditor('new')
    setLabel('')
    setCode('')
    setEnabled(true)
  }

  function openEdit(c: CategoryItem) {
    setEditor(c)
    setLabel(c.label)
    setCode(c.code)
    setEnabled(c.enabled !== false)
  }

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        label: label.trim(),
        code: code.trim() || undefined,
        enabled,
      }
      if (editor === 'new') return categoriesApi.create(body)
      if (editor && typeof editor === 'object' && editor.id != null) {
        return categoriesApi.update(editor.id, body)
      }
      throw new Error('无效编辑状态')
    },
    onSuccess: () => {
      setEditor(null)
      qc.invalidateQueries({ queryKey: ['categories'] })
      toast('已保存分类', { variant: 'success' })
    },
    onError: (e) => toast('保存失败', { variant: 'danger', description: (e as Error).message }),
  })

  const remove = useMutation({
    mutationFn: (id: number) => categoriesApi.remove(id),
    onSuccess: () => {
      setPendingDelete(null)
      qc.invalidateQueries({ queryKey: ['categories'] })
      toast('已删除', { variant: 'success' })
    },
    onError: (e) => toast('删除失败', { variant: 'danger', description: (e as Error).message }),
  })

  if (listQ.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    )
  }

  if (listQ.isError) {
    return <Alert variant="danger">加载失败：{(listQ.error as Error).message}</Alert>
  }

  const items = listQ.data ?? []

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          出题时可选手动指定；未指定时由模型从启用分类中选择，必要时会自动新建。
        </p>
        <Button type="button" variant="primary" size="sm" onClick={openNew}>
          <Plus className="size-4" /> 新建分类
        </Button>
      </div>

      {items.length === 0 ? (
        <GlassCard>
          <EmptyState icon={Plus} title="还没有分类" description="先建几个粗粒度分类，方便试卷筛选。" />
        </GlassCard>
      ) : (
        <div className="space-y-2">
          {items.map((c) => (
            <GlassCard key={c.id ?? c.code} className="!p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{c.label}</span>
                    <Badge variant="neutral">{c.code}</Badge>
                    {c.builtin && <Badge variant="primary">内置</Badge>}
                    {c.enabled === false && <Badge variant="warning">已禁用</Badge>}
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <Button type="button" size="sm" variant="ghost" onClick={() => openEdit(c)}>
                    <Pencil className="size-3.5" /> 编辑
                  </Button>
                  {!c.builtin && c.id != null && (
                    <Button type="button" size="sm" variant="ghost" onClick={() => setPendingDelete(c)}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            </GlassCard>
          ))}
        </div>
      )}

      <Dialog open={editor != null} onOpenChange={(o) => !o && setEditor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editor === 'new' ? '新建分类' : '编辑分类'}</DialogTitle>
            <DialogDescription>编码可选；留空则按名称自动生成。内置分类不可改编码、不可删。</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Field label="名称" required>
              {(id) => <Input id={id} value={label} onChange={(e) => setLabel(e.target.value)} />}
            </Field>
            <Field label="编码" description="英文大写+下划线，如 VECTOR_DB">
              {(id) => (
                <Input
                  id={id}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  disabled={typeof editor === 'object' && editor?.builtin}
                  placeholder="可选"
                />
              )}
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={enabled} onCheckedChange={setEnabled} />
              启用（出题下拉与模型推断只会用启用项）
            </label>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setEditor(null)}>
              取消
            </Button>
            <Button
              type="button"
              variant="primary"
              disabled={!label.trim() || save.isPending}
              loading={save.isPending}
              onClick={() => save.mutate()}
            >
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除「{pendingDelete?.label}」？</DialogTitle>
            <DialogDescription>已有试卷上的分类字段不会自动清空，仅从可选列表移除。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setPendingDelete(null)}>
              取消
            </Button>
            <Button
              type="button"
              variant="destructive"
              loading={remove.isPending}
              onClick={() => pendingDelete?.id != null && remove.mutate(pendingDelete.id)}
            >
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
