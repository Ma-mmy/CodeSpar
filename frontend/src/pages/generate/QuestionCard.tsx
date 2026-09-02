import { Check, RefreshCw, Trash2 } from 'lucide-react'
import { Badge, Button } from '@/components/ui'
import { Markdown } from '@/components/Markdown'
import { DIFFICULTIES, QUESTION_TYPES, type QuestionView } from '@/api/generation'

const TYPE_VARIANT: Record<QuestionView['type'], 'primary' | 'success' | 'warning' | 'neutral' | 'danger' | 'outline'> = {
  SINGLE_CHOICE: 'primary',
  MULTI_CHOICE: 'success',
  TRUE_FALSE: 'warning',
  FILL_BLANK: 'neutral',
  SHORT_ANSWER: 'outline',
  SYSTEM_DESIGN: 'danger',
}

function Collapsible({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-xl border border-border bg-white/35 dark:bg-white/6">
      <summary className="flex cursor-pointer items-center justify-between gap-3 px-3.5 py-2.5 text-sm font-medium text-muted-foreground transition-colors select-none hover:text-foreground">
        {title}
        <span className="text-[11px] font-normal text-muted-foreground/70 transition-transform group-open:rotate-180">
          ▼
        </span>
      </summary>
      <div className="border-t border-border px-3.5 py-3">{children}</div>
    </details>
  )
}

export function QuestionCard({
  question,
  onRegenerate,
  onDelete,
}: {
  question: QuestionView
  onRegenerate: () => void
  onDelete: () => void
}) {
  return (
    <div className="glass rounded-2xl p-5 sm:p-6">
      {/* 头部信息 */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant={TYPE_VARIANT[question.type]}>{QUESTION_TYPES[question.type]}</Badge>
        <Badge variant="outline">{DIFFICULTIES[question.difficulty]}</Badge>
        <Badge variant="outline">{question.fullScore} 分</Badge>
        {question.tags.map((t) => (
          <Badge key={t} variant="neutral">
            {t}
          </Badge>
        ))}
        {question.editedByUser && <Badge variant="warning">已编辑</Badge>}
      </div>

      {/* 题干 */}
      <div className="mt-3.5">
        <Markdown>{question.stem}</Markdown>
      </div>

      {/* 客观题选项（不暴露对错） */}
      {question.options && question.options.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {question.options.map((o) => (
            <div
              key={o.key}
              className="flex items-start gap-2 rounded-lg px-2.5 py-1.5 text-sm text-muted-foreground"
            >
              <span className="shrink-0 font-mono text-xs">{o.key}.</span>
              <span className="min-w-0">{o.text}</span>
            </div>
          ))}
        </div>
      )}

      {/* 折叠详情：正确答案藏在「参考答案」里，点击后再显示 */}
      <div className="mt-4 space-y-2">
        {(question.correctAnswer ||
          (question.acceptedAnswers && question.acceptedAnswers.length > 0) ||
          question.referenceAnswer) && (
          <Collapsible title="参考答案">
            <div className="space-y-3">
              {question.correctAnswer && (
                <p className="flex items-center gap-1.5 text-[13px] text-success">
                  <Check className="size-3.5 shrink-0" />
                  正确答案：{question.correctAnswer}
                </p>
              )}
              {question.acceptedAnswers && question.acceptedAnswers.length > 0 && (
                <p className="flex items-center gap-1.5 text-[13px] text-success">
                  <Check className="size-3.5 shrink-0" />
                  标准答案：{question.acceptedAnswers.join(' / ')}
                </p>
              )}
              {question.referenceAnswer && <Markdown>{question.referenceAnswer}</Markdown>}
            </div>
          </Collapsible>
        )}
        {question.rubric && question.rubric.length > 0 && (
          <Collapsible title={`评分要点（${question.rubric.reduce((s, r) => s + (r.score ?? 0), 0)}/${question.fullScore}）`}>
            <ul className="space-y-1.5">
              {question.rubric.map((r, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="mt-px shrink-0 rounded bg-primary/10 px-1.5 py-px text-xs font-medium text-primary">
                    {r.score} 分
                  </span>
                  <span className="min-w-0">{r.point}</span>
                </li>
              ))}
            </ul>
          </Collapsible>
        )}
        {question.explanation && (
          <Collapsible title="答案解析">
            <Markdown>{question.explanation}</Markdown>
          </Collapsible>
        )}
      </div>

      {/* 操作 */}
      <div className="mt-4 flex items-center gap-2 border-t border-border pt-3.5">
        <Button variant="outline" size="sm" onClick={onRegenerate}>
          <RefreshCw />
          重新生成
        </Button>
        <Button variant="ghost" size="sm" className="text-destructive" onClick={onDelete}>
          <Trash2 />
          删除
        </Button>
      </div>
    </div>
  )
}
