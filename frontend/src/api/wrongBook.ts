import { api } from './client'
import type { ExamDetail } from './exams'
import type { Difficulty, QuestionType } from './generation'

export type WrongStatus = 'ACTIVE' | 'MASTERED'

export interface WrongItem {
  id: number
  questionId: number
  type: QuestionType
  difficulty: Difficulty
  stem: string
  referenceAnswer?: string
  correctAnswer?: string
  explanation?: string
  fullScore: number
  tags: string[]
  wrongCount: number
  passStreak: number
  lastScoreRate?: number
  lastScore?: number
  lastComment?: string
  lastAnswer?: string
  lastWrongAt?: string
  status: WrongStatus
  manualAdded: boolean
  createdAt: string
}

export interface WrongListView {
  items: WrongItem[]
  tags: string[]
}

export interface ComposeRequest {
  questionIds?: number[]
  tag?: string
  includeMastered?: boolean
  limit?: number
}

export const wrongBookApi = {
  list: (params?: { status?: 'ACTIVE' | 'MASTERED' | 'ALL'; tag?: string }) => {
    const q = new URLSearchParams()
    if (params?.status) q.set('status', params.status)
    if (params?.tag) q.set('tag', params.tag)
    const qs = q.toString()
    return api.get<WrongListView>(`/wrong-questions${qs ? `?${qs}` : ''}`)
  },
  add: (questionId: number) => api.post<WrongItem>('/wrong-questions', { questionId }),
  remove: (id: number) => api.delete<void>(`/wrong-questions/${id}`),
  removeByQuestion: (questionId: number) => api.delete<void>(`/wrong-questions/question/${questionId}`),
  compose: (body: ComposeRequest) => api.post<ExamDetail>('/wrong-questions/compose', body),
}
