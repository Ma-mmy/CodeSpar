import type { AnswerView } from '@/api/exams'

export interface DraftAnswer {
  content: string
  flagged: boolean
  /** 本地写入时间，用于与后端 updatedAt 比较 */
  updatedAt: number
}

export type DraftMap = Record<number, DraftAnswer>

interface DraftPayload {
  answers: DraftMap
  savedAt: number
}

function key(examId: number) {
  return `codespar:exam:${examId}:draft`
}

export function loadDraft(examId: number): DraftMap {
  try {
    const raw = localStorage.getItem(key(examId))
    if (!raw) return {}
    const parsed = JSON.parse(raw) as DraftPayload
    return parsed.answers ?? {}
  } catch {
    return {}
  }
}

export function saveDraft(examId: number, answers: DraftMap) {
  const payload: DraftPayload = { answers, savedAt: Date.now() }
  localStorage.setItem(key(examId), JSON.stringify(payload))
}

export function clearDraft(examId: number) {
  localStorage.removeItem(key(examId))
}

/** 合并后端答案与本地草稿：同题取更新时间较新的一侧。 */
export function mergeAnswers(server: AnswerView[], local: DraftMap): DraftMap {
  const merged: DraftMap = { ...local }
  for (const a of server) {
    const serverTs = a.updatedAt ? Date.parse(a.updatedAt) : 0
    const localEntry = merged[a.questionId]
    if (!localEntry || serverTs >= localEntry.updatedAt) {
      merged[a.questionId] = {
        content: a.content ?? '',
        flagged: !!a.flagged,
        updatedAt: serverTs || Date.now(),
      }
    }
  }
  return merged
}

export function isAnswered(content?: string) {
  return !!content && content.trim().length > 0
}

/**
 * 答题页展示方式（全局偏好，跨试卷记住）：
 * - pager：一题一页 + 侧边题号（原「题号」）
 * - scroll：整卷纵向滚动，像浏览网页一样往下做
 */
export type NavMode = 'pager' | 'scroll'

const NAV_MODE_KEY = 'codespar:exam-nav-mode'

export function loadNavMode(): NavMode {
  try {
    const v = localStorage.getItem(NAV_MODE_KEY)
    // 兼容误用过的 dropdown / grid 旧值
    if (v === 'scroll' || v === 'dropdown') return 'scroll'
    return 'pager'
  } catch {
    return 'pager'
  }
}

export function saveNavMode(mode: NavMode) {
  try {
    localStorage.setItem(NAV_MODE_KEY, mode)
  } catch {
    // ignore
  }
}
