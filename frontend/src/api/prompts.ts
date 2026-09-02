import { api } from './client'

export interface PromptSlotMeta {
  key: string
  label: string
  description?: string
  defaultValue: string
}

export interface PromptMeta {
  key: string
  label: string
  description: string
  slots: PromptSlotMeta[]
  values: Record<string, string>
  overridden: Record<string, boolean>
}

export const promptsApi = {
  list: () => api.get<PromptMeta[]>('/settings/prompts'),
  get: (key: string) => api.get<PromptMeta>(`/settings/prompts/${key}`),
  save: (body: { promptKey: string; slots: Record<string, string> }) =>
    api.put<PromptMeta>('/settings/prompts', body),
  reset: (body: { promptKey: string; slotKey?: string }) =>
    api.post<PromptMeta>('/settings/prompts/reset', body),
}
