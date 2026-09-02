import * as ProgressPrimitive from '@radix-ui/react-progress'
import * as SeparatorPrimitive from '@radix-ui/react-separator'
import { cva, type VariantProps } from 'class-variance-authority'
import { AlertCircle, CheckCircle2, Info, Loader2, XCircle } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/utils'

/* -------------------------------------------------- Badge */

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-medium whitespace-nowrap',
  {
    variants: {
      variant: {
        neutral: 'bg-black/6 text-muted-foreground dark:bg-white/10',
        primary: 'bg-primary/12 text-primary dark:bg-primary/20',
        success: 'bg-success/12 text-success dark:bg-success/20',
        warning: 'bg-chart-4/15 text-chart-4 dark:bg-chart-4/22',
        danger: 'bg-destructive/12 text-destructive dark:bg-destructive/20',
        outline: 'border border-border text-muted-foreground',
      },
    },
    defaultVariants: { variant: 'neutral' },
  },
)

export function Badge({
  className,
  variant,
  ...props
}: ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}

/* -------------------------------------------------- Alert */

const ALERT_ICON = {
  info: Info,
  success: CheckCircle2,
  warning: AlertCircle,
  danger: XCircle,
} as const

export function Alert({
  variant = 'info',
  title,
  children,
  className,
}: {
  variant?: keyof typeof ALERT_ICON
  title?: string
  children?: ReactNode
  className?: string
}) {
  const Icon = ALERT_ICON[variant]
  const tone = {
    info: 'bg-primary/8 text-primary dark:bg-primary/12',
    success: 'bg-success/10 text-success dark:bg-success/14',
    warning: 'bg-chart-4/12 text-chart-4 dark:bg-chart-4/16',
    danger: 'bg-destructive/8 text-destructive dark:bg-destructive/14',
  }[variant]

  return (
    <div className={cn('flex gap-3 rounded-xl p-3.5 text-sm', tone, className)}>
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1">
        {title && <div className="font-medium">{title}</div>}
        {children && (
          <div className={cn('leading-relaxed break-words', title && 'mt-1 opacity-90')}>
            {children}
          </div>
        )}
      </div>
    </div>
  )
}

/* -------------------------------------------------- Progress */

export function Progress({
  value,
  className,
  ...props
}: ComponentProps<typeof ProgressPrimitive.Root>) {
  return (
    <ProgressPrimitive.Root
      className={cn(
        'relative h-2 w-full overflow-hidden rounded-full bg-black/8 dark:bg-white/12',
        className,
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className="size-full flex-1 rounded-full bg-gradient-to-r from-primary to-chart-3 transition-transform duration-500 ease-out"
        style={{ transform: `translateX(-${100 - (value ?? 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  )
}

/* -------------------------------------------------- Separator / Skeleton / Spinner */

export function Separator({
  className,
  ...props
}: ComponentProps<typeof SeparatorPrimitive.Root>) {
  return (
    <SeparatorPrimitive.Root
      className={cn(
        'shrink-0 bg-border data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px',
        className,
      )}
      {...props}
    />
  )
}

export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('animate-pulse rounded-lg bg-black/8 dark:bg-white/10', className)}
      {...props}
    />
  )
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('size-4 animate-spin', className)} />
}

/* -------------------------------------------------- EmptyState */

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn('flex flex-col items-center gap-3 px-6 py-14 text-center sm:py-16', className)}
    >
      <div className="flex size-12 items-center justify-center rounded-2xl bg-white/50 dark:bg-white/10">
        <Icon className="size-5 text-muted-foreground" />
      </div>
      <div>
        <p className="font-medium">{title}</p>
        {description && (
          <p className="mt-1 max-w-sm text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}

export { badgeVariants }
