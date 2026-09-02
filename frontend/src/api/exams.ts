import { api } from './client'
import type { Difficulty, Option, QuestionType } from './generation'

export type ExamStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'SUBMITTED' | 'GRADED'

export const EXAM_STATUS_LABEL: Record<ExamStatus, string> = {
  NOT_STARTED: '未开始',
  IN_PROGRESS: '作答中',
  SUBMITTED: '已交卷',
  GRADED: '已阅卷',
}

export interface ExamListItem {
  id: number
  name: string
  category?: string
  categoryLabel?: string
  source: string
  status: ExamStatus
  questionCount: number
  fullScore: number
  totalScore?: number
  scoreRate?: number
  timeLimitMin?: number
  originExamId?: number
  articleId?: number
  startedAt?: string
  submittedAt?: string
  durationSec?: number
  createdAt: string
}

export interface QuestionForTaking {
  id: number
  seq: number
  type: QuestionType
  difficulty: Difficulty
  stem: string
  options?: Option[]
  fullScore: number
}

export interface ExamDetail extends ExamListItem {
  questions: QuestionForTaking[]
}

export interface AnswerView {
  questionId: number
  content?: string
  flagged: boolean
  updatedAt?: string
}

export interface SubmitResult {
  examId: number
  status: ExamStatus
  unansweredCount: number
  durationSec?: number
  gradingId?: number
}

export const examsApi = {
  list: () => api.get<ExamListItem[]>('/exams'),
  get: (id: number) => api.get<ExamDetail>(`/exams/${id}`),
  answers: (id: number) => api.get<AnswerView[]>(`/exams/${id}/answers`),
  start: (id: number, body?: { timeLimitMin?: number }) =>
    api.post<ExamDetail>(`/exams/${id}/start`, body ?? {}),
  saveAnswer: (examId: number, questionId: number, body: { content?: string; flagged?: boolean }) =>
    api.put<AnswerView>(`/exams/${examId}/answers/${questionId}`, body),
  submit: (id: number, body?: { gradingModelId?: number }) =>
    api.post<SubmitResult>(`/exams/${id}/submit`, body ?? {}),
  /** 重刷此卷：同题新卷 */
  retake: (id: number) => api.post<ExamDetail>(`/exams/${id}/retake`),
  /** 清空答题记录：擦除作答与阅卷，回到未开始 */
  clearAnswers: (id: number) => api.post<ExamDetail>(`/exams/${id}/clear-answers`),
  /** 删除试卷（作答/阅卷一并删，题目保留） */
  remove: (id: number) => api.delete<void>(`/exams/${id}`),
}
