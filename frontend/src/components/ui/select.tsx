import * as SelectPrimitive from '@radix-ui/react-select'
import { Check, ChevronDown } from 'lucide-react'
import { useLayoutEffect, useState, type ComponentProps } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

export const Select = SelectPrimitive.Root
export const SelectGroup = SelectPrimitive.Group
export const SelectValue = SelectPrimitive.Value

export function SelectTrigger({
  className,
  children,
  invalid,
  ...props
}: ComponentProps<typeof SelectPrimitive.Trigger> & { invalid?: boolean }) {
  return (
    <SelectPrimitive.Trigger
      aria-invalid={invalid || undefined}
      className={cn(
        'flex h-10 w-full items-center justify-between gap-2 rounded-xl px-3.5 text-sm',
        'bg-white/55 dark:bg-white/8',
        'border border-border',
        'transition-all duration-200 outline-none',
        'focus:border-primary/45 focus:ring-4 focus:ring-ring/20',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'data-[placeholder]:text-muted-foreground/70',
        invalid && 'border-destructive/60 focus:border-destructive focus:ring-destructive/20',
        className,
      )}
      {...props}
    >
      <span className="truncate text-left">{children}</span>
      <SelectPrimitive.Icon asChild>
        <ChevronDown className="size-4 shrink-0 opacity-50" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}

/**
 * Radix popper 用 transform 定位，backdrop-filter 写在菜单上糊不到页面。
 * 这块毛玻璃层 portal 到 body，按菜单矩形铺开，专门糊掉底下的字。
 */
function SelectFrost({
  anchor,
}: {
  anchor: HTMLElement | null
}) {
  const [box, setBox] = useState<{ top: number; left: number; width: number; height: number } | null>(
    null,
  )

  useLayoutEffect(() => {
    if (!anchor) return
    let raf = 0
    const update = () => {
      const r = anchor.getBoundingClientRect()
      setBox((prev) => {
        if (
          prev &&
          prev.top === r.top &&
          prev.left === r.left &&
          prev.width === r.width &&
          prev.height === r.height
        ) {
          return prev
        }
        return { top: r.top, left: r.left, width: r.width, height: r.height }
      })
      raf = requestAnimationFrame(update)
    }
    update()
    return () => cancelAnimationFrame(raf)
  }, [anchor])

  if (!box || box.width <= 0 || box.height <= 0 || typeof document === 'undefined') return null

  return createPortal(
    <div
      aria-hidden
      className="select-frost"
      style={{ top: box.top, left: box.left, width: box.width, height: box.height }}
    />,
    document.body,
  )
}

export function SelectContent({
  className,
  children,
  position = 'popper',
  ...props
}: ComponentProps<typeof SelectPrimitive.Content>) {
  const [contentEl, setContentEl] = useState<HTMLDivElement | null>(null)

  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        position={position}
        sideOffset={6}
        className={cn(
          'glass-strong relative z-[51] max-h-72 min-w-[8rem] overflow-hidden rounded-xl p-1',
          'data-[state=open]:animate-in data-[state=open]:fade-in-0',
          'data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
          position === 'popper' && 'w-[var(--radix-select-trigger-width)]',
          className,
        )}
        {...props}
        ref={setContentEl}
        data-slot="select-content"
      >
        <SelectFrost anchor={contentEl} />
        <SelectPrimitive.Viewport className="p-0">{children}</SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  )
}

export function SelectItem({
  className,
  children,
  ...props
}: ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      className={cn(
        'relative flex cursor-pointer select-none items-center gap-2 rounded-lg py-2 pl-3 pr-8 text-sm outline-none',
        'transition-colors',
        'data-[highlighted]:bg-white/60 dark:data-[highlighted]:bg-white/12',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <span className="absolute right-2.5 flex size-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <Check className="size-4 text-primary" />
        </SelectPrimitive.ItemIndicator>
      </span>
    </SelectPrimitive.Item>
  )
}

export function SelectLabel({
  className,
  ...props
}: ComponentProps<typeof SelectPrimitive.Label>) {
  return (
    <SelectPrimitive.Label
      className={cn('px-3 py-1.5 text-xs font-medium text-muted-foreground', className)}
      {...props}
    />
  )
}
