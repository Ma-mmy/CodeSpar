import { useCallback, useEffect, useState } from 'react'

export type Theme = 'light' | 'dark' | 'paper'

const STORAGE_KEY = 'codespar-theme'

function readStoredTheme(): Theme {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (raw === 'light' || raw === 'dark' || raw === 'paper') return raw
  // 旧版「跟随系统」并入浅色，避免选中态对不上第三个按钮
  return 'light'
}

function apply(theme: Theme) {
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
  root.classList.toggle('paper', theme === 'paper')
}

/**
 * 主题切换。深色靠根元素 .dark，纸质靠 .paper；
 * 不依赖 prefers-color-scheme 媒体查询。
 */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme)

  useEffect(() => {
    apply(theme)
  }, [theme])

  const setTheme = useCallback((next: Theme) => {
    localStorage.setItem(STORAGE_KEY, next)
    setThemeState(next)
  }, [])

  return { theme, setTheme }
}
