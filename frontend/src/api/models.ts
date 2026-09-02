import { api } from './client'

export type ProviderType = 'OPENAI_COMPATIBLE' | 'DASHSCOPE'

export interface ModelProfile {
  id: number
  name: string
  providerType: ProviderType
  baseUrl?: string
  apiKeyMask: string
  modelName: string
  canGenerate: boolean
  canGrade: boolean
  isDefaultGenerate: boolean
  isDefaultGrade: boolean
  temperature?: number
  maxTokens?: number
  supportsJsonMode: boolean
  enabled: boolean
  remark?: string
  createdAt: string
  updatedAt: string
}

export interface ModelProfileUpsert {
  name: string
  providerType: ProviderType
  baseUrl?: string
  /** 明文；编辑时留空表示不修改 */
  apiKey?: string
  modelName: string
  canGenerate: boolean
  canGrade: boolean
  temperature?: number
  maxTokens?: number
  supportsJsonMode: boolean
  enabled: boolean
  remark?: string
}

export interface TestResult {
  success: boolean
  latencyMs: number
  reply?: string
  promptTokens?: number
  completionTokens?: number
  /** 失败时的原始错误原文 */
  error?: string
}

export const modelsApi = {
  list: () => api.get<ModelProfile[]>('/models'),
  create: (body: ModelProfileUpsert) => api.post<ModelProfile>('/models', body),
  update: (id: number, body: ModelProfileUpsert) => api.put<ModelProfile>(`/models/${id}`, body),
  remove: (id: number) => api.delete<void>(`/models/${id}`),
  setDefault: (id: number, role: 'generate' | 'grade') =>
    api.post<void>(`/models/${id}/default/${role}`),
  test: (id: number) => api.post<TestResult>(`/models/${id}/test`),
  testDraft: (body: {
    providerType: ProviderType
    baseUrl?: string
    apiKey: string
    modelName: string
  }) => api.post<TestResult>('/models/test', body),
}

/**
 * 厂商模板。**这不是白名单** —— 只是帮你自动填 baseURL 的快捷方式，
 * 选「自定义」后三个字段全可手填，任何 OpenAI 兼容端点都能接。
 * 想加新模板，往这个数组里加一条即可。
 */
export interface VendorTemplate {
  key: string
  label: string
  providerType: ProviderType
  baseUrl?: string
  modelPlaceholder: string
  hint?: string
}

export const VENDOR_TEMPLATES: VendorTemplate[] = [
  {
    key: 'deepseek',
    label: 'DeepSeek',
    providerType: 'OPENAI_COMPATIBLE',
    baseUrl: 'https://api.deepseek.com/v1',
    modelPlaceholder: 'deepseek-chat',
    hint: '便宜、中文好、推理强，适合当主力出题模型',
  },
  {
    key: 'dashscope-native',
    label: '通义千问（DashScope 原生）',
    providerType: 'DASHSCOPE',
    modelPlaceholder: 'qwen-max',
    hint: '走 Spring AI Alibaba 的原生 starter，无需填 baseURL',
  },
  {
    key: 'dashscope-compatible',
    label: '通义千问（OpenAI 兼容模式）',
    providerType: 'OPENAI_COMPATIBLE',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    modelPlaceholder: 'qwen-max',
  },
  {
    key: 'custom',
    label: '自定义',
    providerType: 'OPENAI_COMPATIBLE',
    modelPlaceholder: 'model-name',
    hint: '任何 OpenAI 兼容端点：Kimi、智谱、硅基流动、OpenRouter、本地 Ollama、内网网关…',
  },
]
