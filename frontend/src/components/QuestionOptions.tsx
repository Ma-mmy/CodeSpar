import { Badge } from '@/components/ui'
import { cn } from '@/lib/utils'
import type { Option } from '@/api/generation'

/** 选择/判断题答案 key 集合。多选为逗号分隔，如 "A,C"。 */
function answerKeys(raw?: string | null): Set<string> {
  if (!raw) return new Set()
  return new Set(
    raw
      .split(/[,，]/)
      .map((s) => s.trim())
      .filter(Boolean),
  )
}

/** 客观题选项列表：标出作答与正确答案。成绩报告、错题本共用。 */
export function QuestionOptions({
  options,
  userAnswer,
  correctAnswer,
}: {
  options: Option[]
  userAnswer?: string
  correctAnswer?: string
}) {
  const picked = answerKeys(userAnswer)
  const correct = answerKeys(correctAnswer)
  return (
    <ul className="mt-3 space-y-1.5">
      {options.map((o) => {
        const isPicked = picked.has(o.key)
        const isCorrect = correct.has(o.key)
        return (
          <li
            key={o.key}
            className={cn(
              'flex items-start gap-2 rounded-xl border px-3 py-2 text-sm',
              isCorrect && isPicked && 'border-success/40 bg-success/8',
              isCorrect && !isPicked && 'border-success/25 bg-success/5',
              !isCorrect && isPicked && 'border-destructive/40 bg-destructive/8',
              !isCorrect && !isPicked && 'border-transparent bg-black/3 text-muted-foreground dark:bg-white/4',
            )}
          >
            <span className="mt-px shrink-0 font-mono text-xs">{o.key}.</span>
            <span className="min-w-0 flex-1 break-words">{o.text}</span>
            {(isPicked || isCorrect) && (
              <span className="flex shrink-0 flex-wrap justify-end gap-1">
                {isPicked && (
                  <Badge variant={isCorrect ? 'success' : 'danger'}>{isCorrect ? '选对' : '你的选择'}</Badge>
                )}
                {isCorrect && !isPicked && <Badge variant="success">正确答案</Badge>}
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}
