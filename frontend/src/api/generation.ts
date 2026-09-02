import { api } from './client'

export type QuestionType =
  | 'SINGLE_CHOICE'
  | 'MULTI_CHOICE'
  | 'TRUE_FALSE'
  | 'FILL_BLANK'
  | 'SHORT_ANSWER'
  | 'SYSTEM_DESIGN'

export type Difficulty = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'EXPERT'
export type JobStatus = 'RUNNING' | 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'CANCELLED'
export type DedupStrength = 'OFF' | 'STANDARD' | 'STRICT'

export const QUESTION_TYPES: Record<QuestionType, string> = {
  SINGLE_CHOICE: '单选',
  MULTI_CHOICE: '多选',
  TRUE_FALSE: '判断',
  FILL_BLANK: '填空',
  SHORT_ANSWER: '概念问答',
  SYSTEM_DESIGN: '系统设计',
}

export const QUESTION_TYPE_ORDER: QuestionType[] = [
  'SINGLE_CHOICE',
  'MULTI_CHOICE',
  'TRUE_FALSE',
  'FILL_BLANK',
  'SHORT_ANSWER',
  'SYSTEM_DESIGN',
]

export const DIFFICULTIES: Record<Difficulty, string> = {
  BEGINNER: '初级',
  INTERMEDIATE: '中级',
  ADVANCED: '高级',
  EXPERT: '专家',
}

export const DEDUP_STRENGTHS: Record<DedupStrength, string> = {
  OFF: '关闭',
  STANDARD: '标准',
  STRICT: '严格',
}

export interface Option {
  key: string
  text: string
}

export interface RubricPoint {
  point: string
  score: number
}

export interface GenerateRequest {
  prompt: string
  /** 基于文章考点摘要出题时传入 */
  articleId?: number
  counts: Partial<Record<QuestionType, number>>
  difficulty: Difficulty
  tags: string[]
  /** 主分类 code，可选；空则模型自动判断 */
  category?: string
  modelProfileId: number
  language: 'zh' | 'en'
  dedupStrength: DedupStrength
  /** 出题前是否自动优化提示词；默认 true */
  autoOptimize?: boolean
}

export interface OptimizeRequest {
  prompt: string
  articleId?: number
  counts?: Partial<Record<QuestionType, number>>
  difficulty?: Difficulty
  tags?: string[]
  category?: string
  modelProfileId: number
  language?: 'zh' | 'en'
}

export interface OptimizeResult {
  optimizedPrompt: string
  promptTokens: number
  completionTokens: number
  costMs: number
}

export interface QuestionView {
  id: number
  type: QuestionType
  difficulty: Difficulty
  stem: string
  options?: Option[]
  correctAnswer?: string
  acceptedAnswers?: string[]
  referenceAnswer?: string
  rubric?: RubricPoint[]
  fullScore: number
  explanation?: string
  tags: string[]
  editedByUser: boolean
  status: string
}

export interface GenerateParams {
  counts?: Partial<Record<QuestionType, number>>
  difficulty?: Difficulty
  tags?: string[]
  category?: string
  modelProfileId?: number
  language?: string
  dedupStrength?: DedupStrength
  /** null / true = 自动优化；false = 跳过 */
  autoOptimize?: boolean
}

export interface GenerationView {
  id: number
  /** 用户原文 */
  prompt: string
  /** 优化后用于出题的指令 */
  optimizedPrompt?: string
  category?: string
  categoryLabel?: string
  /** 来源文章 */
  articleId?: number
  modelProfileId?: number
  modelSnapshot?: string
  status: JobStatus
  requestedCount: number
  generatedCount: number
  promptTokens: number
  completionTokens: number
  costMs: number
  errorMsg?: string
  rawOutput?: string
  params?: GenerateParams
  createdAt: string
}

export interface BatchResultView {
  type: QuestionType
  status: 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CANCELLED'
  requestedCount: number
  generatedCount: number
  errorMsg?: string
  rawOutput?: string
}

export interface SseEvent {
  type: string
  data: Record<string, unknown>
}

export interface CountPresetView {
  counts: Partial<Record<QuestionType, number>>
  /** false：库里还没有用户保存过，返回内置默认值 */
  saved: boolean
}

export const generationApi = {
  create: (body: GenerateRequest) => api.post<{ id: number }>('/generations', body),
  /** 仅优化出题描述，回填表单 */
  optimize: (body: OptimizeRequest) => api.post<OptimizeResult>('/generations/optimize', body),
  getCountPreset: () => api.get<CountPresetView>('/generations/count-preset'),
  saveCountPreset: (counts: Partial<Record<QuestionType, number>>) =>
    api.put<CountPresetView>('/generations/count-preset', { counts }),
  list: () => api.get<GenerationView[]>('/generations'),
  get: (id: number) => api.get<GenerationView>(`/generations/${id}`),
  questions: (id: number) => api.get<QuestionView[]>(`/generations/${id}/questions`),
  batches: (id: number) => api.get<BatchResultView[]>(`/generations/${id}/batches`),
  cancel: (id: number) => api.post<void>(`/generations/${id}/cancel`),
  confirm: (id: number) => api.post<{ examId: number }>(`/generations/${id}/confirm`),
  /** 相同参数再来一次（自动带去重） */
  rerun: (id: number) => api.post<{ id: number }>(`/generations/${id}/rerun`),
  /** 删除出题历史 */
  remove: (id: number) => api.delete<void>(`/generations/${id}`),
  retryBatch: (id: number, type: QuestionType) =>
    api.post<void>(`/generations/${id}/batches/${type}/retry`),
  deleteQuestion: (questionId: number) => api.delete<void>(`/questions/${questionId}`),
  regenerateQuestion: (questionId: number, feedback?: string) =>
    api.post<QuestionView>(`/questions/${questionId}/regenerate`, { feedback }),
}

const SSE_EVENT_TYPES = [
  'optimize_started',
  'optimize_done',
  'batch_started',
  'batch_done',
  'batch_failed',
  'progress',
  'done',
] as const

/**
 * 订阅出题任务的 SSE 进度流，返回关闭函数。
 * EventSource 只支持 GET —— 创建任务用 POST 返回 jobId，进度走这个 GET 流。
 * 断线时会回调 type=stream_error，由页面侧轮询兜底，避免一直卡在「生成中」。
 */
export function openGenerationStream(id: number, onEvent: (e: SseEvent) => void): () => void {
  const es = new EventSource(`/api/generations/${id}/stream`)
  for (const type of SSE_EVENT_TYPES) {
    es.addEventListener(type, (ev) => {
      const message = ev as MessageEvent
      try {
        onEvent({ type, data: JSON.parse(message.data) })
      } catch {
        // 无法解析的数据忽略
      }
    })
  }
  es.onerror = () => {
    onEvent({ type: 'stream_error', data: {} })
  }
  return () => {
    es.onerror = null
    es.close()
  }
}
