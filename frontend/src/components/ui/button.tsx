import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { Loader2 } from 'lucide-react'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  [
    'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap',
    'rounded-xl text-sm font-medium',
    'transition-all duration-200',
    'disabled:pointer-events-none disabled:opacity-45',
    "[&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4",
    'active:scale-[0.98]',
  ],
  {
    variants: {
      variant: {
        /** 主操作：出题、交卷、保存 */
        primary:
          'bg-primary text-primary-foreground shadow-md shadow-primary/25 hover:brightness-110',
        /** 次操作：取消、返回 */
        secondary:
          'bg-white/60 text-foreground shadow-sm hover:bg-white/80 dark:bg-white/10 dark:hover:bg-white/16',
        /** 描边：与玻璃背景搭配 */
        outline:
          'border border-border bg-transparent hover:bg-white/50 dark:hover:bg-white/10',
        /** 无背景：图标按钮、列表内联操作 */
        ghost: 'hover:bg-white/50 dark:hover:bg-white/10',
        /** 危险：删除模型、清空题库 */
        destructive:
          'bg-destructive text-destructive-foreground shadow-md shadow-destructive/25 hover:brightness-110',
      },
      size: {
        sm: 'h-8 px-3 text-[13px]',
        md: 'h-10 px-4',
        lg: 'h-11 px-6 text-[15px]',
        icon: 'size-10',
        'icon-sm': 'size-8',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
)

export interface ButtonProps
  extends ComponentProps<'button'>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  loading?: boolean
}

export function Button({
  className,
  variant,
  size,
  asChild = false,
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const classNames = cn(buttonVariants({ variant, size }), className)

  // asChild 时 Slot 只能有一个 React 元素子节点；不能再拼 loading spinner
  if (asChild) {
    return (
      <Slot className={classNames} {...props}>
        {children}
      </Slot>
    )
  }

  return (
    <button
      className={classNames}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  )
}

export { buttonVariants }
