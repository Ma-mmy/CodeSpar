import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  LayoutDashboard,
  Sparkles,
  FileText,
  History,
  Settings2,
  BookOpen,
  BookMarked,
  Zap,
  Sun,
  Moon,
  Newspaper,
  Menu,
  X,
  Lock,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useHideOnScroll } from '@/hooks/useHideOnScroll'
import { useTheme, type Theme } from '@/hooks/useTheme'
import { authApi } from '@/api/auth'

const NAV = [
  { to: '/', label: '仪表盘', icon: LayoutDashboard, end: true },
  { to: '/generate', label: '出题', icon: Sparkles },
  { to: '/articles', label: '文章', icon: BookOpen },
  { to: '/exams', label: '我的试卷', icon: FileText },
  { to: '/wrong-book', label: '错题本', icon: BookMarked },
  { to: '/history/generations', label: '出题历史', icon: History },
  { to: '/history/gradings', label: '阅卷历史', icon: History },
  { to: '/settings', label: '设置', icon: Settings2 },
]

const THEMES: { value: Theme; icon: typeof Sun; label: string }[] = [
  { value: 'light', icon: Sun, label: '浅色' },
  { value: 'dark', icon: Moon, label: '深色' },
  { value: 'paper', icon: Newspaper, label: '纸质' },
]

function LockButton() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const statusQ = useQuery({
    queryKey: ['auth-status'],
    queryFn: authApi.status,
    retry: false,
    staleTime: Infinity,
  })
  if (!statusQ.data?.enabled) return null

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await authApi.logout()
        } catch {
          // 网络失败也回到解锁页
        }
        qc.setQueryData(['auth-status'], (prev: { enabled?: boolean; managedByConfig?: boolean } | undefined) => ({
          enabled: prev?.enabled ?? true,
          unlocked: false,
          managedByConfig: prev?.managedByConfig ?? false,
        }))
        navigate('/unlock')
      }}
      className="mb-2 flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-white/50 hover:text-foreground dark:hover:bg-white/10"
    >
      <Lock className="size-4" />
      锁定
    </button>
  )
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  return (
    <div className="flex gap-1 rounded-xl bg-black/5 p-1 dark:bg-white/5">
      {THEMES.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          type="button"
          title={label}
          aria-label={label}
          aria-pressed={theme === value}
          onClick={() => setTheme(value)}
          className={cn(
            'flex flex-1 items-center justify-center rounded-lg py-1.5 transition-all duration-200',
            theme === value
              ? 'bg-white/80 text-foreground shadow-sm dark:bg-white/15 paper:bg-[color-mix(in_oklch,var(--foreground)_8%,var(--background))]'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Icon className="size-4" />
        </button>
      ))}
    </div>
  )
}

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-1">
      {NAV.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-200',
              isActive
                ? 'bg-white/70 font-medium text-foreground shadow-sm dark:bg-white/12'
                : 'text-muted-foreground hover:bg-white/40 hover:text-foreground dark:hover:bg-white/8',
            )
          }
        >
          {({ isActive }) => (
            <>
              {/* 选中态的左侧指示条 */}
              <span
                className={cn(
                  'absolute left-0 h-5 w-1 rounded-r-full bg-primary transition-all duration-200',
                  isActive ? 'opacity-100' : 'scale-y-0 opacity-0',
                )}
              />
              <Icon className="size-[18px] shrink-0" />
              <span className="truncate">{label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-chart-3 shadow-md shadow-primary/25">
        <Zap className="size-[18px] text-white" />
      </div>
      <div className="min-w-0">
        <div className="truncate text-[15px] font-semibold tracking-tight">CodeSpar</div>
        <div className="truncate text-[11px] text-muted-foreground">轻松练·智能出题</div>
      </div>
    </div>
  )
}

export function AppLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const { pathname } = useLocation()
  const headerHidden = useHideOnScroll({ resetKey: pathname, enabled: !drawerOpen })

  // 路由变化自动关抽屉
  useEffect(() => setDrawerOpen(false), [pathname])

  // 抽屉打开时锁定背景滚动
  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [drawerOpen])

  return (
    <div className="min-h-svh">
      {/* ---------- 桌面端侧边栏 ---------- */}
      <aside className="glass-strong fixed inset-y-3 left-3 z-30 hidden w-60 flex-col rounded-2xl px-3.5 py-4 md:flex">
        <div className="px-1.5">
          <Brand />
        </div>
        <div className="mt-6 flex-1 overflow-y-auto">
          <NavItems />
        </div>
        <div className="pt-3">
          <LockButton />
          <ThemeToggle />
        </div>
      </aside>

      {/* ---------- 移动端顶栏：悬浮圆角条，上滑收起、下滑带回 ---------- */}
      <header
        className={cn(
          'glass-strong sticky top-3 z-30 mx-3 mt-3 flex items-center justify-between gap-3 rounded-2xl px-4 py-3 md:hidden',
          'translate-y-0 transition-[translate] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]',
          headerHidden && 'pointer-events-none -translate-y-[calc(100%+0.75rem)]',
        )}
        aria-hidden={headerHidden}
        inert={headerHidden}
      >
        <Brand />
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="打开菜单"
          aria-expanded={drawerOpen}
          className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/50 text-foreground transition-colors active:bg-white/70 dark:bg-white/10 dark:active:bg-white/20"
        >
          <Menu className="size-5" />
        </button>
      </header>

      {/* ---------- 移动端抽屉 ---------- */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="关闭菜单"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
          />
          <div className="glass-strong absolute inset-y-0 right-0 flex w-[min(19rem,85vw)] flex-col rounded-l-2xl px-4 py-4 animate-in slide-in-from-right duration-300">
            <div className="flex items-center justify-between">
              <Brand />
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="关闭菜单"
                className="flex size-9 items-center justify-center rounded-xl text-muted-foreground transition-colors active:bg-white/40 dark:active:bg-white/10"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="mt-6 flex-1 overflow-y-auto">
              <NavItems onNavigate={() => setDrawerOpen(false)} />
            </div>
            <div className="pt-3">
              <LockButton />
              <ThemeToggle />
            </div>
          </div>
        </div>
      )}

      {/* ---------- 主内容区 ---------- */}
      <main className="min-w-0 md:pl-[15.75rem]">
        <Outlet />
      </main>
    </div>
  )
}
