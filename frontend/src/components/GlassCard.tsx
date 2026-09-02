import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'

/** 玻璃面板。可交互时传 to，会自动加悬停抬升效果。 */
export function GlassCard({
  children,
  className,
  to,
}: {
  children: ReactNode
  className?: string
  to?: string
}) {
  const cls = cn('glass rounded-2xl p-5 sm:p-6', to && 'glass-hover block', className)
  return to ? (
    <Link to={to} className={cls}>
      {children}
    </Link>
  ) : (
    <div className={cls}>{children}</div>
  )
}

/** 页面容器：统一最大宽度与移动端内边距。 */
export function PageContainer({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8 md:py-10', className)}>
      {children}
    </div>
  )
}

/** 页面标题区。 */
export function PageHeader({ title, description }: { title: string; description?: string }) {
  return (
    <header className="mb-6 sm:mb-8">
      <h1 className="text-[22px] font-semibold tracking-tight sm:text-3xl">{title}</h1>
      {description && (
        <p className="mt-1.5 text-sm text-muted-foreground sm:text-[15px]">{description}</p>
      )}
    </header>
  )
}
