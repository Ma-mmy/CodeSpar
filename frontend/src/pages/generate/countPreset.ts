import { QUESTION_TYPE_ORDER, type QuestionType } from '@/api/generation'

/** 每种题型独立上限；整卷不再共用 20 的总数预算。 */
export const MAX_QUESTIONS_PER_TYPE = 20

/** 须与 GenerationCountPresetService.defaults 一致。 */
export const DEFAULT_COUNT_PRESET: Partial<Record<QuestionType, number>> = {
  SINGLE_CHOICE: 10,
  TRUE_FALSE: 2,
  FILL_BLANK: 3,
}

const LEGACY_STORAGE_KEY = 'codespar.generate.count-preset'

export function clampCounts(
  raw: Partial<Record<QuestionType, number>> | null | undefined,
): Partial<Record<QuestionType, number>> {
  const next: Partial<Record<QuestionType, number>> = {}
  if (!raw) return next
  for (const t of QUESTION_TYPE_ORDER) {
    const n = Math.floor(Number(raw[t]))
    const allowed = Math.max(0, Math.min(MAX_QUESTIONS_PER_TYPE, Number.isFinite(n) ? n : 0))
    if (allowed > 0) next[t] = allowed
  }
  return next
}

export function countsEqual(
  a: Partial<Record<QuestionType, number>>,
  b: Partial<Record<QuestionType, number>>,
): boolean {
  return QUESTION_TYPE_ORDER.every((t) => (a[t] ?? 0) === (b[t] ?? 0))
}

export function resolvedCountPreset(
  raw: Partial<Record<QuestionType, number>> | null | undefined,
): Partial<Record<QuestionType, number>> {
  const next = clampCounts(raw)
  return Object.keys(next).length > 0 ? next : { ...DEFAULT_COUNT_PRESET }
}

/** 升级前写在 localStorage 的旧预设；读出后由调用方决定是否迁到后端。 */
export function peekLegacyLocalPreset(): Partial<Record<QuestionType, number>> | null {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY)
    if (!raw) return null
    const next = clampCounts(JSON.parse(raw) as Partial<Record<QuestionType, number>>)
    return Object.keys(next).length > 0 ? next : null
  } catch {
    return null
  }
}

export function clearLegacyLocalPreset() {
  try {
    localStorage.removeItem(LEGACY_STORAGE_KEY)
  } catch {
    // 隐私模式等忽略
  }
}
