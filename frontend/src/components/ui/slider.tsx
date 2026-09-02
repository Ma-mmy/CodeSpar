import * as SliderPrimitive from '@radix-ui/react-slider'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

/**
 * 可拖动滑条。轨道样式对齐 Progress：玻璃底 + 主色渐变填充。
 * `value` / `onValueChange` 走 Radix 的 number[]（单值传 `[n]`）。
 */
export function Slider({ className, ...props }: ComponentProps<typeof SliderPrimitive.Root>) {
  const count = props.value?.length ?? props.defaultValue?.length ?? 1

  return (
    <SliderPrimitive.Root
      className={cn(
        'relative flex w-full touch-none items-center select-none',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        className,
      )}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-black/8 dark:bg-white/12">
        <SliderPrimitive.Range className="absolute h-full rounded-full bg-gradient-to-r from-primary to-chart-3" />
      </SliderPrimitive.Track>
      {Array.from({ length: count }, (_, i) => (
        <SliderPrimitive.Thumb
          key={i}
          className={cn(
            'block size-5 shrink-0 rounded-full bg-white shadow-sm',
            'border border-primary/30',
            'cursor-pointer transition-shadow duration-200 outline-none',
            'hover:ring-4 hover:ring-ring/25',
            'focus-visible:ring-4 focus-visible:ring-ring/25',
          )}
        />
      ))}
    </SliderPrimitive.Root>
  )
}
