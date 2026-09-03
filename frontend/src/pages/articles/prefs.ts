const PREFIX = 'codespar.article.'

export const FONT_MIN = 12
export const FONT_MAX = 20
export const FONT_DEFAULT = 16
export const LH_MIN = 1.4
export const LH_MAX = 2.2
export const LH_DEFAULT = 1.8

export function readArticlePref(key: string): string | null {
  try {
    return localStorage.getItem(PREFIX + key)
  } catch {
    return null
  }
}

export function writeArticlePref(key: string, value: string) {
  try {
    localStorage.setItem(PREFIX + key, value)
  } catch {
    // 隐私模式 / 配额
  }
}

export function readBoolPref(key: string): boolean | null {
  const v = readArticlePref(key)
  if (v === '1') return true
  if (v === '0') return false
  return null
}

export function writeBoolPref(key: string, value: boolean) {
  writeArticlePref(key, value ? '1' : '0')
}

export function readNumberPref(key: string, fallback: number, min: number, max: number): number {
  const raw = readArticlePref(key)
  if (raw == null) return fallback
  const n = Number(raw)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}
