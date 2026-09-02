import { Construction } from 'lucide-react'
import { GlassCard, PageContainer, PageHeader } from '@/components/GlassCard'

/** 尚未实现页面的占位；各功能页在 P2–P6 逐步替换。 */
export function Placeholder({
  title,
  phase,
  hint,
}: {
  title: string
  phase: string
  hint?: string
}) {
  return (
    <PageContainer>
      <PageHeader title={title} />
      <GlassCard className="flex flex-col items-center gap-3 py-12 text-center sm:py-16">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-white/50 dark:bg-white/10">
          <Construction className="size-5 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">
          {hint ?? `此页面将在 ${phase} 阶段实现`}
        </p>
      </GlassCard>
    </PageContainer>
  )
}
