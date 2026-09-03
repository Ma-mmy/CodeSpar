import { useEffect, useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { BookOpen, Loader2, Pencil } from 'lucide-react'
import {
  Badge,
  Button,
  EmptyState,
  Field,
  GlassCard,
  Input,
  Textarea,
  useToast,
} from '@/components/ui'
import {
  articlesApi,
  type ArticleDetail,
} from '@/api/articles'
import { ArticleMarkdown } from './ArticleMarkdown'
import { parseSummaryStructured, SUMMARY_TOC } from './headings'

export function SummaryPanel({
  article,
  onUpdated,
}: {
  article: ArticleDetail
  onUpdated: (a: ArticleDetail) => void
}) {
  const toast = useToast()
  const structured = useMemo(() => parseSummaryStructured(article.summaryJson), [article.summaryJson])
  const [editing, setEditing] = useState(false)
  const [md, setMd] = useState(article.summaryMd ?? '')
  const [sections, setSections] = useState(structured?.sections ?? [])
  const [keypoints, setKeypoints] = useState(structured?.keypoints ?? [])
  const [questions, setQuestions] = useState(structured?.classicQuestions ?? [])

  useEffect(() => {
    if (!editing) {
      setMd(article.summaryMd ?? '')
      const s = parseSummaryStructured(article.summaryJson)
      setSections(s?.sections ?? [])
      setKeypoints(s?.keypoints ?? [])
      setQuestions(s?.classicQuestions ?? [])
    }
  }, [article, editing])

  const save = useMutation({
    mutationFn: () =>
      articlesApi.updateSummary(article.id, {
        summaryMd: md,
        summaryJson: {
          sections,
          keypoints,
          classicQuestions: questions,
          summaryMarkdown: md,
        },
      }),
    onSuccess: (a) => {
      setEditing(false)
      onUpdated(a)
      toast('考点摘要已保存', { variant: 'success' })
    },
    onError: (e) => toast('保存失败', { variant: 'danger', description: (e as Error).message }),
  })

  const hasContent =
    !!(article.summaryMd && article.summaryMd.trim()) ||
    !!(structured &&
      ((structured.sections?.length ?? 0) > 0 ||
        (structured.keypoints?.length ?? 0) > 0 ||
        (structured.classicQuestions?.length ?? 0) > 0))

  if (!hasContent && !editing) {
    return (
      <EmptyState
        icon={BookOpen}
        title="尚无考点摘要"
        description="点击「开卷」后会在首次开卷时自动提炼；也可在开卷弹窗中选择重新提炼。"
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">考点摘要</h3>
        {!editing ? (
          <Button type="button" size="sm" variant="secondary" onClick={() => setEditing(true)}>
            <Pencil className="size-3.5" /> 编辑摘要
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="primary" loading={save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
              保存摘要
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
              取消
            </Button>
          </div>
        )}
      </div>

      {editing ? (
        <div className="space-y-4">
          <div id={SUMMARY_TOC.markdown} className="scroll-mt-4">
            <Field label="可读 Markdown">
              {(id) => (
                <Textarea
                  id={id}
                  value={md}
                  onChange={(e) => setMd(e.target.value)}
                  className="min-h-[180px] font-mono text-sm"
                />
              )}
            </Field>
          </div>

          <div id={SUMMARY_TOC.sections} className="scroll-mt-4">
            <StructuredEditor
              title="章节切片"
              items={sections}
              onChange={setSections}
              fields={[
                { key: 'title', label: '标题' },
                { key: 'summary', label: '要点', multiline: true },
              ]}
              onAdd={() => setSections((s) => [...s, { title: '', summary: '' }])}
            />
          </div>
          <div id={SUMMARY_TOC.keypoints} className="scroll-mt-4">
            <StructuredEditor
              title="高频考点"
              items={keypoints}
              onChange={setKeypoints}
              fields={[
                { key: 'title', label: '考点' },
                { key: 'detail', label: '说明', multiline: true },
                { key: 'importance', label: '重要度' },
              ]}
              onAdd={() => setKeypoints((s) => [...s, { title: '', detail: '', importance: 'MEDIUM' }])}
            />
          </div>
          <div id={SUMMARY_TOC.questions} className="scroll-mt-4">
            <StructuredEditor
              title="经典问题"
              items={questions}
              onChange={setQuestions}
              fields={[
                { key: 'question', label: '问题', multiline: true },
                { key: 'angle', label: '角度' },
                { key: 'hint', label: '提示' },
              ]}
              onAdd={() => setQuestions((s) => [...s, { question: '', angle: '', hint: '' }])}
            />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {(structured?.sections?.length ?? 0) > 0 && (
            <section id={SUMMARY_TOC.sections} className="scroll-mt-4 space-y-2">
              <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">章节切片</h4>
              <div className="grid gap-2 sm:grid-cols-2">
                {structured!.sections!.map((s, i) => (
                  <div key={i} id={SUMMARY_TOC.section(i)} className="scroll-mt-4">
                    <GlassCard className="!p-3">
                      <div className="text-sm font-medium">{s.title || `切片 ${i + 1}`}</div>
                      {s.summary && <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{s.summary}</p>}
                    </GlassCard>
                  </div>
                ))}
              </div>
            </section>
          )}

          {(structured?.keypoints?.length ?? 0) > 0 && (
            <section id={SUMMARY_TOC.keypoints} className="scroll-mt-4 space-y-2">
              <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">高频考点</h4>
              <div className="space-y-2">
                {structured!.keypoints!.map((k, i) => (
                  <div key={i} id={SUMMARY_TOC.keypoint(i)} className="scroll-mt-4">
                    <GlassCard className="!p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{k.title || `考点 ${i + 1}`}</span>
                        {k.importance && <Badge variant="neutral">{k.importance}</Badge>}
                      </div>
                      {k.detail && <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{k.detail}</p>}
                    </GlassCard>
                  </div>
                ))}
              </div>
            </section>
          )}

          {(structured?.classicQuestions?.length ?? 0) > 0 && (
            <section id={SUMMARY_TOC.questions} className="scroll-mt-4 space-y-2">
              <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">经典问题</h4>
              <ol className="space-y-2">
                {structured!.classicQuestions!.map((q, i) => (
                  <li key={i} id={SUMMARY_TOC.question(i)} className="scroll-mt-4">
                    <GlassCard className="!p-3">
                      <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        <span className="text-muted-foreground">{i + 1}.</span>
                        <span>{q.question}</span>
                        {q.angle && <Badge variant="primary">{q.angle}</Badge>}
                      </div>
                      {q.hint && <p className="mt-1 text-[13px] text-muted-foreground">提示：{q.hint}</p>}
                    </GlassCard>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {article.summaryMd && (
            <section id={SUMMARY_TOC.markdown} className="scroll-mt-4 space-y-2">
              <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">完整 Markdown</h4>
              <GlassCard className="!p-4">
                <ArticleMarkdown articleId={article.id} idPrefix={SUMMARY_TOC.mdPrefix}>{article.summaryMd}</ArticleMarkdown>
              </GlassCard>
            </section>
          )}
        </div>
      )}
    </div>
  )
}

function StructuredEditor<T extends Record<string, string | undefined>>({
  title,
  items,
  onChange,
  fields,
  onAdd,
}: {
  title: string
  items: T[]
  onChange: (next: T[]) => void
  fields: { key: keyof T & string; label: string; multiline?: boolean }[]
  onAdd: () => void
}) {
  return (
    <div className="space-y-2 rounded-xl border border-border p-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">{title}</h4>
        <Button type="button" size="sm" variant="ghost" onClick={onAdd}>
          添加
        </Button>
      </div>
      {items.length === 0 && <p className="text-xs text-muted-foreground">暂无条目</p>}
      {items.map((item, idx) => (
        <div key={idx} className="space-y-2 rounded-lg bg-black/[0.03] p-2 dark:bg-white/[0.04]">
          {fields.map((f) =>
            f.multiline ? (
              <Field key={f.key} label={f.label}>
                {(id) => (
                  <Textarea
                    id={id}
                    value={String(item[f.key] ?? '')}
                    onChange={(e) => {
                      const next = [...items]
                      next[idx] = { ...item, [f.key]: e.target.value }
                      onChange(next)
                    }}
                    className="min-h-[64px] text-sm"
                  />
                )}
              </Field>
            ) : (
              <Field key={f.key} label={f.label}>
                {(id) => (
                  <Input
                    id={id}
                    value={String(item[f.key] ?? '')}
                    onChange={(e) => {
                      const next = [...items]
                      next[idx] = { ...item, [f.key]: e.target.value }
                      onChange(next)
                    }}
                  />
                )}
              </Field>
            ),
          )}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => onChange(items.filter((_, i) => i !== idx))}
          >
            删除本条
          </Button>
        </div>
      ))}
    </div>
  )
}
