import * as SwitchPrimitive from '@radix-ui/react-switch'
import * as CheckboxPrimitive from '@radix-ui/react-checkbox'
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group'
import { Check, Minus } from 'lucide-react'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

export function Switch({ className, ...props }: ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        'peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full p-0.5',
        'transition-colors duration-200 outline-none',
        'focus-visible:ring-4 focus-visible:ring-ring/25',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'data-[state=checked]:bg-primary data-[state=unchecked]:bg-black/15 dark:data-[state=unchecked]:bg-white/20',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          'pointer-events-none block size-5 rounded-full bg-white shadow-sm',
          'transition-transform duration-200',
          'data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0',
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export function Checkbox({
  className,
  indeterminate,
  ...props
}: ComponentProps<typeof CheckboxPrimitive.Root> & { indeterminate?: boolean }) {
  return (
    <CheckboxPrimitive.Root
      className={cn(
        'peer size-5 shrink-0 rounded-md border border-border',
        'bg-white/55 dark:bg-white/8',
        'transition-all duration-200 outline-none',
        'focus-visible:ring-4 focus-visible:ring-ring/25',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'data-[state=checked]:border-primary data-[state=checked]:bg-primary',
        'data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center text-primary-foreground">
        {indeterminate ? <Minus className="size-3.5" /> : <Check className="size-3.5" />}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export const RadioGroup = ({
  className,
  ...props
}: ComponentProps<typeof RadioGroupPrimitive.Root>) => (
  <RadioGroupPrimitive.Root className={cn('grid gap-2.5', className)} {...props} />
)

export function RadioGroupItem({
  className,
  ...props
}: ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item
      className={cn(
        'peer size-5 shrink-0 rounded-full border border-border',
        'bg-white/55 dark:bg-white/8',
        'transition-all duration-200 outline-none',
        'focus-visible:ring-4 focus-visible:ring-ring/25',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'data-[state=checked]:border-primary data-[state=checked]:border-[6px]',
        className,
      )}
      {...props}
    />
  )
}

/**
 * 可点击的选项卡片（整块可点，不只是小圆点）。
 * 答题页的选择题、出题页的难度选择都用它 —— 手机上点击区域够大。
 */
export function OptionCard({
  selected,
  disabled,
  onClick,
  children,
  className,
  as = 'button',
}: {
  selected?: boolean
  disabled?: boolean
  onClick?: () => void
  children: React.ReactNode
  className?: string
  as?: 'button' | 'label'
}) {
  const Comp = as
  return (
    <Comp
      {...(as === 'button' ? { type: 'button' as const, onClick, disabled } : {})}
      className={cn(
        'flex w-full items-start gap-3 rounded-xl border p-3.5 text-left text-sm',
        'transition-all duration-200 outline-none',
        'focus-visible:ring-4 focus-visible:ring-ring/25',
        selected
          ? 'border-primary/50 bg-primary/8 shadow-sm dark:bg-primary/15'
          : 'border-border bg-white/40 hover:bg-white/65 dark:bg-white/6 dark:hover:bg-white/10',
        disabled && 'pointer-events-none opacity-50',
        className,
      )}
    >
      {children}
    </Comp>
  )
}
