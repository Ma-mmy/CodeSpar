import { api } from './client'
import type { ExamListItem } from './exams'
import type { QuestionType } from './generation'

export interface DashboardTotals {
  gradedExamCount: number
  openExamCount: number
  submittedExamCount: number
  gradedQuestionCount: number
  generationTokens: number
  gradingTokens: number
  tokenTotal: number
  wrongQuestionCount: number
  overallScoreRate: number
  earned: number
  full: number
}

export interface TagStat {
  tag: string
  earned: number
  full: number
  rate: number
  questionCount: number
  sampleInsufficient: boolean
}

export interface TypeStat {
  type: QuestionType
  earned: number
  full: number
  rate: number
  questionCount: number
}

export interface TrendPoint {
  day: string
  examCount: number
  questionCount: number
  earned: number
  full: number
  rate: number
}

export interface TagTrend {
  tag: string
  points: TrendPoint[]
}

export interface DashboardView {
  totals: DashboardTotals
  weakTags: TagStat[]
  allTags: TagStat[]
  typeScores: TypeStat[]
  trend: TrendPoint[]
  tagTrends: TagTrend[]
  recentExams: ExamListItem[]
  minTagSample: number
}

export const dashboardApi = {
  get: () => api.get<DashboardView>('/dashboard'),
}
