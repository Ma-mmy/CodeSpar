import * as LabelPrimitive from '@radix-ui/react-label'
import type { ComponentProps, ReactNode } from 'react'
import { useId } from 'react'
import { AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

/** 表单控件的共用外观：玻璃底 + 聚焦环 + 错误态 */
const controlBase = [
  'w-full rounded-xl px-3.5 text-sm',
  'bg-white/55 dark:bg-white/8',
  'border border-border',
  'placeholder:text-muted-foreground/70',
  'transition-all duration-200 outline-none',
  'focus:border-primary/45 focus:bg-white/75 focus:ring-4 focus:ring-ring/20 dark:focus:bg-white/12',
  'disabled:cursor-not-allowed disabled:opacity-50',
]

export function Label({ className, ...props }: ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      className={cn(
        'text-sm font-medium leading-none select-none',
        'peer-disabled:cursor-not-allowed peer-disabled:opacity-60',
        className,
      )}
      {...props}
    />
  )
}

export function Input({
  className,
  invalid,
  ...props
}: ComponentProps<'input'> & { invalid?: boolean }) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={cn(
        controlBase,
        'h-10',
        invalid && 'border-destructive/60 focus:border-destructive focus:ring-destructive/20',
        className,
      )}
      {...props}
    />
  )
}

export function Textarea({
  className,
  invalid,
  ...props
}: ComponentProps<'textarea'> & { invalid?: boolean }) {
  return (
    <textarea
      aria-invalid={invalid || undefined}
      className={cn(
        controlBase,
        'min-h-24 resize-y py-2.5 leading-relaxed',
        invalid && 'border-destructive/60 focus:border-destructive focus:ring-destructive/20',
        className,
      )}
      {...props}
    />
  )
}

/**
 * 表单字段包装：标签 + 控件 + 描述/错误。
 * 自动接线 htmlFor / id / aria-describedby，页面里不用手写这些。
 */
export function Field({
  label,
  description,
  error,
  required,
  children,
  className,
}: {
  label?: string
  description?: string
  error?: string
  required?: boolean
  /** 接收自动生成的 id，绑到实际控件上 */
  children: (id: string) => ReactNode
  className?: string
}) {
  const id = useId()
  const descId = `${id}-desc`

  return (
    <div className={cn('space-y-2', className)}>
      {label && (
        <Label htmlFor={id}>
          {label}
          {required && <span className="ml-0.5 text-destructive">*</span>}
        </Label>
      )}
      {children(id)}
      {error ? (
        <p id={descId} className="flex items-start gap-1.5 text-[13px] text-destructive">
          <AlertCircle className="mt-px size-3.5 shrink-0" />
          {error}
        </p>
      ) : description ? (
        <p id={descId} className="text-[13px] leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}
    </div>
  )
}

export { controlBase }
