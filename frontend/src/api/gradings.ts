import { api } from './client'
import type { Difficulty, Option, QuestionType, RubricPoint } from './generation'

export type GradingStatus = 'RUNNING' | 'SUCCESS' | 'PARTIAL' | 'FAILED'

export const GRADING_STATUS_LABEL: Record<GradingStatus, string> = {
  RUNNING: '阅卷中',
  SUCCESS: '已完成',
  PARTIAL: '部分完成',
  FAILED: '失败',
}

export type RubricHitStatus = 'HIT' | 'PARTIAL' | 'MISS'

export interface RubricHit {
  point: string
  maxScore: number
  status: RubricHitStatus
  score: number
  reason?: string
}

export interface GradingView {
  id: number
  examId: number
  modelProfileId?: number
  modelSnapshot?: string
  status: GradingStatus
  totalScore: number
  fullScore: number
  scoreRate: number
  gradedCount: number
  questionCount: number
  promptTokens: number
  completionTokens: number
  costMs: number
  errorMsg?: string
  createdAt: string
  updatedAt: string
}

export interface TagScore {
  tag: string
  earned: number
  full: number
  rate: number
  questionCount: number
}

export interface TypeScore {
  type: QuestionType
  earned: number
  full: number
  rate: number
  questionCount: number
}

export interface QuestionReport {
  questionId: number
  seq: number
  type: QuestionType
  difficulty: Difficulty
  stem: string
  options?: Option[]
  correctAnswer?: string
  acceptedAnswers?: string[]
  referenceAnswer?: string
  explanation?: string
  rubric?: RubricPoint[]
  tags: string[]
  fullScore: number
  userAnswer?: string
  flagged?: boolean
  score?: number
  comment?: string
  gradedBy?: 'LOCAL' | 'MODEL'
  manualOverride?: boolean
  overrideReason?: string
  errorMsg?: string
  rubricResult?: RubricHit[]
  inWrongBook?: boolean
}

export interface ReportView {
  examId: number
  examName: string
  examStatus: string
  questionCount: number
  fullScore: number
  durationSec?: number
  startedAt?: string
  submittedAt?: string
  originExamId?: number
  originTotalScore?: number
  originScoreRate?: number
  grading?: GradingView
  tagScores: TagScore[]
  typeScores: TypeScore[]
  questions: QuestionReport[]
}

export const gradingsApi = {
  get: (id: number) => api.get<GradingView>(`/gradings/${id}`),
  report: (examId: number) => api.get<ReportView>(`/exams/${examId}/report`),
  start: (examId: number, gradingModelId?: number) =>
    api.post<{ gradingId: number }>(`/exams/${examId}/grade`, { gradingModelId }),
  retryQuestion: (gradingId: number, questionId: number) =>
    api.post<void>(`/gradings/${gradingId}/questions/${questionId}/retry`),
  override: (gradingId: number, questionId: number, body: { score: number; reason?: string }) =>
    api.patch<QuestionReport>(`/gradings/${gradingId}/questions/${questionId}`, body),
}

const SSE_EVENT_TYPES = ['progress', 'question_done', 'done'] as const

export type GradingSseEvent =
  | { type: 'progress'; data: Record<string, unknown> }
  | { type: 'question_done'; data: Record<string, unknown> }
  | { type: 'done'; data: Record<string, unknown> }

/** 订阅阅卷 SSE 进度，返回关闭函数。 */
export function openGradingStream(id: number, onEvent: (e: GradingSseEvent) => void): () => void {
  const es = new EventSource(`/api/gradings/${id}/stream`)
  for (const type of SSE_EVENT_TYPES) {
    es.addEventListener(type, (ev) => {
      const message = ev as MessageEvent
      try {
        onEvent({ type, data: JSON.parse(message.data) })
      } catch {
        // ignore
      }
    })
  }
  return () => es.close()
}
