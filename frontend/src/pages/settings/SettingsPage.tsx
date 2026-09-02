import { NavLink, Outlet } from 'react-router-dom'
import { Cpu, MessageSquareText, Tags } from 'lucide-react'
import { PageContainer, PageHeader } from '@/components/ui'
import { cn } from '@/lib/utils'

const TABS = [
  { to: '/settings/models', label: '模型管理', icon: Cpu, end: true },
  { to: '/settings/prompts', label: '系统提示词', icon: MessageSquareText },
  { to: '/settings/categories', label: '主分类', icon: Tags },
]

export function SettingsLayout() {
  return (
    <PageContainer>
      <PageHeader title="设置" description="管理模型、系统提示词与试卷主分类。" />
      <div className="mb-5 flex flex-wrap gap-1 rounded-xl bg-black/5 p-1 dark:bg-white/5">
        {TABS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition',
                isActive
                  ? 'bg-white/80 font-medium shadow-sm dark:bg-white/15'
                  : 'text-muted-foreground hover:text-foreground',
              )
            }
          >
            <Icon className="size-4" />
            {label}
          </NavLink>
        ))}
      </div>
      <Outlet />
    </PageContainer>
  )
}
