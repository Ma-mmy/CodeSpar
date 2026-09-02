import * as ToastPrimitive from '@radix-ui/react-toast'
import { AlertCircle, CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

type ToastVariant = 'info' | 'success' | 'warning' | 'danger'

interface ToastItem {
  id: number
  title: string
  description?: string
  variant: ToastVariant
  duration: number
}

const ICON = {
  info: Info,
  success: CheckCircle2,
  warning: AlertCircle,
  danger: XCircle,
} as const

const TONE = {
  info: 'text-primary',
  success: 'text-success',
  warning: 'text-chart-4',
  danger: 'text-destructive',
} as const

interface ToastOptions {
  description?: string
  variant?: ToastVariant
  /** 毫秒；出题/阅卷这类长任务的错误建议给长一点或设 Infinity */
  duration?: number
}

const ToastContext = createContext<((title: string, opts?: ToastOptions) => void) | null>(null)

/**
 * 全局 Toast。用法：
 *   const toast = useToast()
 *   toast('模型连接成功', { variant: 'success', description: '延迟 320ms' })
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])

  const toast = useCallback((title: string, opts: ToastOptions = {}) => {
    setItems((prev) => [
      ...prev,
      {
        id: Date.now() + Math.random(),
        title,
        description: opts.description,
        variant: opts.variant ?? 'info',
        duration: opts.duration ?? 4000,
      },
    ])
  }, [])

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const value = useMemo(() => toast, [toast])

  return (
    <ToastContext.Provider value={value}>
      <ToastPrimitive.Provider swipeDirection="right">
        {children}
        {items.map((t) => {
          const Icon = ICON[t.variant]
          return (
            <ToastPrimitive.Root
              key={t.id}
              duration={t.duration}
              onOpenChange={(open) => !open && dismiss(t.id)}
              className={cn(
                'glass-strong flex items-start gap-3 rounded-xl p-3.5 pr-10',
                'data-[state=open]:animate-in data-[state=open]:slide-in-from-right-full',
                'data-[state=closed]:animate-out data-[state=closed]:fade-out-80',
                'data-[swipe=end]:animate-out data-[swipe=end]:fade-out-80',
                'data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=move]:transition-none',
                'data-[swipe=cancel]:translate-x-0 data-[swipe=cancel]:transition-transform',
              )}
            >
              <Icon className={cn('mt-0.5 size-4 shrink-0', TONE[t.variant])} />
              <div className="min-w-0 flex-1">
                <ToastPrimitive.Title className="text-sm font-medium">
                  {t.title}
                </ToastPrimitive.Title>
                {t.description && (
                  <ToastPrimitive.Description className="mt-0.5 text-[13px] leading-relaxed break-words text-muted-foreground">
                    {t.description}
                  </ToastPrimitive.Description>
                )}
              </div>
              <ToastPrimitive.Close
                aria-label="关闭"
                className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground transition-colors hover:bg-white/50 dark:hover:bg-white/10"
              >
                <X className="size-3.5" />
              </ToastPrimitive.Close>
            </ToastPrimitive.Root>
          )
        })}
        {/* 移动端从底部升起，桌面端右下角，避开顶栏 */}
        <ToastPrimitive.Viewport
          className={cn(
            'fixed z-[100] flex max-h-svh w-full flex-col-reverse gap-2 p-4 outline-none',
            'bottom-0 left-0 sm:bottom-0 sm:right-0 sm:left-auto sm:w-96 sm:flex-col',
          )}
        />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast 必须在 ToastProvider 内使用')
  return ctx
}
