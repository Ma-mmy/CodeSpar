import { api } from './client'
import type { Difficulty, QuestionType } from './generation'

export interface PresetParams {
  counts?: Partial<Record<QuestionType, number>>
  difficulty?: Difficulty
  tags?: string[]
  category?: string
  language?: string
}

export interface PromptPreset {
  id: number
  name: string
  prompt: string
  params: PresetParams
  builtin: boolean
  createdAt: string
  updatedAt: string
}

export interface PromptPresetUpsert {
  name: string
  prompt: string
  params?: PresetParams
}

export const presetsApi = {
  list: () => api.get<PromptPreset[]>('/presets'),
  get: (id: number) => api.get<PromptPreset>(`/presets/${id}`),
  create: (body: PromptPresetUpsert) => api.post<PromptPreset>('/presets', body),
  update: (id: number, body: PromptPresetUpsert) => api.put<PromptPreset>(`/presets/${id}`, body),
  rename: (id: number, name: string) => api.put<PromptPreset>(`/presets/${id}/name`, { name }),
  remove: (id: number) => api.delete<void>(`/presets/${id}`),
}
