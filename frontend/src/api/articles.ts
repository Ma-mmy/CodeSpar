import { api, ApiError } from './client'
import type { ExamListItem } from './exams'

export type SummaryStatus = 'NONE' | 'RUNNING' | 'READY' | 'FAILED' | 'STALE'

export const SUMMARY_STATUS_LABEL: Record<SummaryStatus, string> = {
  NONE: '未提炼',
  RUNNING: '提炼中',
  READY: '已就绪',
  FAILED: '失败',
  STALE: '已过期',
}

export interface ArticleListItem {
  id: number
  folderId?: number | null
  title: string
  category?: string
  categoryLabel?: string
  summaryStatus: SummaryStatus
  updatedAt?: string
  createdAt?: string
}

export interface FolderView {
  id?: number | null
  parentId?: number | null
  name: string
  sortOrder?: number
  createdAt?: string
  children: FolderView[]
  articles: ArticleListItem[]
}

export interface ArticleDetail {
  id: number
  folderId?: number | null
  title: string
  category?: string
  categoryLabel?: string
  bodyMd: string
  summaryMd?: string
  summaryJson?: unknown
  summaryStatus: SummaryStatus
  summaryError?: string
  summaryModelId?: number
  summaryModelSnap?: string
  openPromptHint?: string
  createdAt?: string
  updatedAt?: string
}

export interface OpenContext {
  articleId: number
  title: string
  category?: string
  categoryLabel?: string
  summaryStatus: SummaryStatus
  prompt: string
  summaryMd: string
}

export interface UpsertArticleBody {
  folderId?: number | null
  title: string
  category?: string
  bodyMd: string
}

export interface ArticleSummaryStructured {
  sections?: { title?: string; summary?: string }[]
  keypoints?: { title?: string; detail?: string; importance?: string }[]
  classicQuestions?: { question?: string; angle?: string; hint?: string }[]
  summaryMarkdown?: string
}

export interface UpdateSummaryBody {
  summaryMd?: string
  summaryJson?: ArticleSummaryStructured | null
}

export const articlesApi = {
  tree: () => api.get<FolderView>('/articles/tree'),
  get: (id: number) => api.get<ArticleDetail>(`/articles/${id}`),
  create: (body: UpsertArticleBody) => api.post<ArticleDetail>('/articles', body),
  update: (id: number, body: UpsertArticleBody) => api.put<ArticleDetail>(`/articles/${id}`, body),
  remove: (id: number) => api.delete<void>(`/articles/${id}`),
  move: (id: number, folderId: number | null) =>
    api.post<ArticleDetail>(`/articles/${id}/move`, { folderId }),
  createFolder: (body: { parentId?: number | null; name: string }) =>
    api.post<FolderView>('/articles/folders', body),
  renameFolder: (id: number, name: string) =>
    api.put<FolderView>(`/articles/folders/${id}`, { name }),
  moveFolder: (id: number, parentId: number | null) =>
    api.post<FolderView>(`/articles/folders/${id}/move`, { parentId }),
  removeFolder: (id: number) => api.delete<void>(`/articles/folders/${id}`),
  refine: (id: number, body?: { modelProfileId?: number; force?: boolean }) =>
    api.post<ArticleDetail>(`/articles/${id}/refine`, body ?? {}),
  updateSummary: (id: number, body: UpdateSummaryBody) =>
    api.put<ArticleDetail>(`/articles/${id}/summary`, body),
  openContext: (id: number) => api.get<OpenContext>(`/articles/${id}/open-context`),
  exams: (id: number) => api.get<ExamListItem[]>(`/articles/${id}/exams`),

  async upload(file: File, folderId?: number | null, category?: string) {
    const form = new FormData()
    form.append('file', file)
    if (folderId != null) form.append('folderId', String(folderId))
    if (category) form.append('category', category)
    const res = await fetch('/api/articles/upload', { method: 'POST', body: form })
    if (!res.ok) {
      let message = `${res.status} ${res.statusText}`
      let detail: unknown
      try {
        detail = await res.json()
        if (detail && typeof detail === 'object' && 'message' in detail) {
          message = String((detail as { message: unknown }).message)
        }
      } catch {
        // ignore
      }
      throw new ApiError(message, res.status, detail)
    }
    return res.json() as Promise<ArticleDetail>
  },
}
