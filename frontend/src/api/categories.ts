import { api } from './client'

export interface CategoryItem {
  id?: number
  code: string
  label: string
  builtin?: boolean
  enabled?: boolean
  sortOrder?: number
  updatedAt?: string
}

export interface CategoryUpsert {
  code?: string
  label: string
  enabled?: boolean
  sortOrder?: number
}

export const categoriesApi = {
  /** 出题/筛选：仅启用项 */
  list: () => api.get<CategoryItem[]>('/categories'),
  /** 设置页：全部 */
  listAll: () => api.get<CategoryItem[]>('/categories?all=true'),
  create: (body: CategoryUpsert) => api.post<CategoryItem>('/categories', body),
  update: (id: number, body: CategoryUpsert) => api.put<CategoryItem>(`/categories/${id}`, body),
  remove: (id: number) => api.delete<void>(`/categories/${id}`),
}
