import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Minus, Plus, Sparkles, Wand2 } from 'lucide-react'
import {
  Alert,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  GlassCard,
  Input,
  OptionCard,
  PageContainer,
  PageHeader,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Switch,
  Textarea,
  Tooltip,
  useToast,
} from '@/components/ui'
import { api } from '@/api/client'
import { modelsApi } from '@/api/models'
import {
  DEDUP_STRENGTHS,
  DIFFICULTIES,
  QUESTION_TYPES,
  QUESTION_TYPE_ORDER,
  generationApi,
  type DedupStrength,
  type Difficulty,
  type GenerateRequest,
  type QuestionType,
} from '@/api/generation'
import { categoriesApi } from '@/api/categories'
import { presetsApi, type PromptPreset } from '@/api/presets'
import { TagInput } from './TagInput'

const DIFFICULTY_ORDER: Difficulty[] = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT']

export type GeneratePrefillState = {
  articleId?: number
  articleTitle?: string
  prompt?: string
  category?: string
  summaryStale?: boolean
  counts?: Partial<Record<QuestionType, number>>
  difficulty?: Difficulty
  tags?: string[]
  modelProfileId?: number
  language?: 'zh' | 'en'
  dedupStrength?: DedupStrength
  autoOptimize?: boolean
  /** 从出题预览「返回修改」带回时带上任务 id，用于提示文案 */
  fromJobId?: number
}

export function GeneratePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()
  const qc = useQueryClient()

  const { data: models, isLoading: modelsLoading } = useQuery({
    queryKey: ['models'],
    queryFn: modelsApi.list,
  })
  const { data: tagNames } = useQuery({
    queryKey: ['tags'],
    queryFn: () => api.get<string[]>('/tags'),
  })
  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: categoriesApi.list,
  })
  const { data: presets } = useQuery({
    queryKey: ['presets'],
    queryFn: presetsApi.list,
  })

  const generateModels = useMemo(
    () => (models ?? []).filter((m) => m.canGenerate && m.enabled),
    [models],
  )
  const defaultModel = generateModels.find((m) => m.isDefaultGenerate) ?? generateModels[0]

  const [prompt, setPrompt] = useState('')
  const [articleId, setArticleId] = useState<number | undefined>()
  const [articleTitle, setArticleTitle] = useState<string | undefined>()
  const [counts, setCounts] = useState<Partial<Record<QuestionType, number>>>({})
  const [difficulty, setDifficulty] = useState<Difficulty>('INTERMEDIATE')
  const [tags, setTags] = useState<string[]>([])
  const [category, setCategory] = useState<string>('')
  const [modelId, setModelId] = useState<number | undefined>()
  const [language, setLanguage] = useState<'zh' | 'en'>('zh')
  const [dedupStrength, setDedupStrength] = useState<DedupStrength>('STANDARD')
  /** 生成试卷时是否自动优化提示词；默认开。点「优化描述」后会关掉。 */
  const [autoOptimize, setAutoOptimize] = useState(true)
  const [loadedPresetId, setLoadedPresetId] = useState<number | undefined>()
  const [saveOpen, setSaveOpen] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [deleteOpen, setDeleteOpen] = useState(false)

  // 预填（文章开卷 / 预览返回修改）：location.state，只消费一次
  useEffect(() => {
    const state = location.state as GeneratePrefillState | null
    if (!state) return
    const hasPrefill =
      state.articleId != null ||
      state.prompt != null ||
      state.counts != null ||
      state.difficulty != null ||
      state.tags != null ||
      state.category != null ||
      state.modelProfileId != null ||
      state.language != null ||
      state.dedupStrength != null ||
      state.autoOptimize != null ||
      state.fromJobId != null
    if (!hasPrefill) return

    if (state.articleId != null) {
      setArticleId(state.articleId)
      setArticleTitle(state.articleTitle)
    }
    if (state.prompt != null) setPrompt(state.prompt)
    if (state.category != null) setCategory(state.category)
    if (state.counts) setCounts(state.counts)
    if (state.difficulty) setDifficulty(state.difficulty)
    if (state.tags) setTags(state.tags)
    if (state.modelProfileId != null) setModelId(state.modelProfileId)
    if (state.language === 'zh' || state.language === 'en') setLanguage(state.language)
    if (state.dedupStrength) setDedupStrength(state.dedupStrength)
    if (state.autoOptimize != null) setAutoOptimize(state.autoOptimize)

    if (state.summaryStale) {
      toast('考点摘要已过期，仍可出题；建议回到文章页重新提炼', { variant: 'warning', duration: 8000 })
    } else if (state.fromJobId != null) {
      toast('已带回上次出题参数，可修改后重新生成', { variant: 'success' })
    } else if (state.articleId != null) {
      toast(`已关联文章「${state.articleTitle ?? state.articleId}」`, { variant: 'success' })
    } else if (state.tags && state.tags.length > 0) {
      toast(`已预填薄弱项「${state.tags.join('、')}」，可改参数后生成`, { variant: 'success' })
    }
    navigate(location.pathname, { replace: true, state: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const total = QUESTION_TYPE_ORDER.reduce((s, t) => s + (counts[t] ?? 0), 0)
  const selectedModelId = modelId ?? defaultModel?.id
  const loadedPreset = (presets ?? []).find((p) => p.id === loadedPresetId)
  const builtinPresets = (presets ?? []).filter((p) => p.builtin)
  const customPresets = (presets ?? []).filter((p) => !p.builtin)

  function applyPreset(p: PromptPreset) {
    setLoadedPresetId(p.id)
    setPrompt(p.prompt)
    const nextCounts: Partial<Record<QuestionType, number>> = {}
    for (const t of QUESTION_TYPE_ORDER) {
      const n = p.params.counts?.[t] ?? 0
      if (n > 0) nextCounts[t] = n
    }
    setCounts(nextCounts)
    if (p.params.difficulty) setDifficulty(p.params.difficulty)
    setTags(p.params.tags ?? [])
    setCategory(p.params.category ?? '')
    if (p.params.language === 'en' || p.params.language === 'zh') setLanguage(p.params.language)
    if (p.params.dedupStrength) setDedupStrength(p.params.dedupStrength)
    toast(`已载入「${p.name}」`, { variant: 'success' })
  }

  const savePreset = useMutation({
    mutationFn: () =>
      presetsApi.create({
        name: saveName.trim(),
        prompt: prompt.trim(),
        params: {
          counts: Object.fromEntries(
            QUESTION_TYPE_ORDER.filter((t) => (counts[t] ?? 0) > 0).map((t) => [t, counts[t]]),
          ),
          difficulty,
          tags: tags.map((t) => t.trim()).filter(Boolean),
          category: category || undefined,
          language,
          dedupStrength,
        },
      }),
    onSuccess: (p) => {
      setSaveOpen(false)
      setSaveName('')
      setLoadedPresetId(p.id)
      qc.invalidateQueries({ queryKey: ['presets'] })
      toast('已保存为预设', { variant: 'success' })
    },
    onError: (e) =>
      toast('保存失败', { variant: 'danger', description: (e as Error).message, duration: 8000 }),
  })

  const deletePreset = useMutation({
    mutationFn: (id: number) => presetsApi.remove(id),
    onSuccess: () => {
      setDeleteOpen(false)
      setLoadedPresetId(undefined)
      qc.invalidateQueries({ queryKey: ['presets'] })
      toast('已删除预设', { variant: 'success' })
    },
    onError: (e) => toast('删除失败', { variant: 'danger', description: (e as Error).message }),
  })

  const create = useMutation({
    mutationFn: (body: GenerateRequest) => generationApi.create(body),
    onSuccess: (res) => navigate(`/generate/${res.id}`),
    onError: (e) =>
      toast('创建出题任务失败', { variant: 'danger', description: (e as Error).message, duration: 10000 }),
  })

  const optimize = useMutation({
    mutationFn: () => {
      if (!selectedModelId) throw new Error('请先选择出题模型')
      const countsBody = Object.fromEntries(
        QUESTION_TYPE_ORDER.filter((t) => (counts[t] ?? 0) > 0).map((t) => [t, counts[t]]),
      )
      return generationApi.optimize({
        prompt: prompt.trim(),
        articleId,
        counts: countsBody as Partial<Record<QuestionType, number>>,
        difficulty,
        tags: tags.map((t) => t.trim()).filter(Boolean),
        category: category || undefined,
        modelProfileId: selectedModelId,
        language,
      })
    },
    onSuccess: (res) => {
      setPrompt(res.optimizedPrompt)
      setAutoOptimize(false)
      toast('描述已优化并回填；已关闭自动优化', { variant: 'success' })
    },
    onError: (e) =>
      toast('优化失败', { variant: 'danger', description: (e as Error).message, duration: 10000 }),
  })

  const canSubmit =
    prompt.trim().length > 0 && total > 0 && !!selectedModelId && !create.isPending && !optimize.isPending

  const canOptimize =
    prompt.trim().length > 0 && !!selectedModelId && !optimize.isPending && !create.isPending

  function setCount(type: QuestionType, v: number) {
    const clamped = Math.max(0, Math.min(30, v))
    setCounts((prev) => {
      const next = { ...prev }
      if (clamped === 0) delete next[type]
      else next[type] = clamped
      return next
    })
  }

  function submit() {
    if (!canSubmit) return
    const countsBody = Object.fromEntries(
      QUESTION_TYPE_ORDER.filter((t) => (counts[t] ?? 0) > 0).map((t) => [t, counts[t]]),
    )
    create.mutate({
      prompt: prompt.trim(),
      articleId,
      counts: countsBody as Record<QuestionType, number>,
      difficulty,
      tags: tags.map((t) => t.trim()).filter(Boolean),
      category: category || undefined,
      modelProfileId: selectedModelId!,
      language,
      dedupStrength,
      autoOptimize,
    })
  }

  return (
    <PageContainer>
      <PageHeader
        title="出题"
        description="写一段出题要求描述想考什么，指定题型与数量，让模型现场生成一套卷子。"
      />

      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={loadedPresetId != null ? String(loadedPresetId) : undefined}
            onValueChange={(v) => {
              const p = (presets ?? []).find((x) => x.id === Number(v))
              if (p) applyPreset(p)
            }}
            disabled={!presets || presets.length === 0}
          >
            <SelectTrigger className="w-56">
              <SelectValue placeholder="载入预设" />
            </SelectTrigger>
            <SelectContent>
              {builtinPresets.length > 0 && (
                <SelectGroup>
                  <SelectLabel>内置</SelectLabel>
                  {builtinPresets.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}
              {customPresets.length > 0 && (
                <SelectGroup>
                  <SelectLabel>我的</SelectLabel>
                  {customPresets.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}
            </SelectContent>
          </Select>
          {loadedPreset?.builtin && <Badge variant="neutral">内置</Badge>}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!prompt.trim()}
            onClick={() => {
              setSaveName(loadedPreset && !loadedPreset.builtin ? loadedPreset.name : '')
              setSaveOpen(true)
            }}
          >
            另存为
          </Button>
          {loadedPreset && !loadedPreset.builtin && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setDeleteOpen(true)}>
              删除预设
            </Button>
          )}
        </div>

        {articleId != null && (
          <Alert variant="info" title="已关联文章">
            将基于「{articleTitle ?? articleId}」的考点摘要出题（摘要由服务端注入，无需粘贴全文）。
            <button
              type="button"
              className="ml-2 underline"
              onClick={() => {
                setArticleId(undefined)
                setArticleTitle(undefined)
              }}
            >
              取消关联
            </button>
          </Alert>
        )}
        <GlassCard>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-medium">出题要求</h2>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                <Switch
                  checked={autoOptimize}
                  onCheckedChange={setAutoOptimize}
                  aria-label="自动优化"
                />
                <span>自动优化{autoOptimize ? '（开）' : '（关）'}</span>
              </label>
              <Button
                type="button"
                size="sm"
                variant="primary"
                loading={optimize.isPending}
                disabled={!canOptimize}
                onClick={() => optimize.mutate()}
                title={!selectedModelId ? '请先选择出题模型' : '使用设置中的优化提示词改写描述'}
              >
                {!optimize.isPending && <Wand2 className="size-3.5" />}
                优化描述
              </Button>
            </div>
          </div>
          <Field
            required
            description={
              autoOptimize
                ? '描述考察范围与出题倾向。开启「自动优化」时，点生成会先用设置里的优化提示词改写再出题。'
                : '已关闭自动优化：点生成将直接使用描述出题。可点「优化描述」手动改写并回填。'
            }
          >
            {(id) => (
              <Textarea
                id={id}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="想考什么？描述得越具体，题越贴合。"
                className="min-h-32"
              />
            )}
          </Field>
        </GlassCard>

        {/* 题型与数量 */}
        <GlassCard>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium">题型与数量</h2>
            <span
              className={`rounded-lg px-2 py-0.5 text-xs font-medium ${
                total === 0 || total > 30 ? 'bg-destructive/12 text-destructive' : 'bg-primary/12 text-primary'
              }`}
            >
              共 {total} 题{total > 0 && total <= 30 && '（上限 30）'}
            </span>
          </div>
          <div className="divide-y divide-border">
            {QUESTION_TYPE_ORDER.map((t) => (
              <div key={t} className="flex items-center justify-between gap-3 py-2.5">
                <span className="text-sm">{QUESTION_TYPES[t]}</span>
                <div className="flex items-center gap-2">
                  <Button
                    size="icon-sm"
                    variant="outline"
                    aria-label={`减少${QUESTION_TYPES[t]}`}
                    disabled={(counts[t] ?? 0) <= 0}
                    onClick={() => setCount(t, (counts[t] ?? 0) - 1)}
                  >
                    <Minus />
                  </Button>
                  <span className="w-8 text-center text-sm tabular-nums">{counts[t] ?? 0}</span>
                  <Button
                    size="icon-sm"
                    variant="outline"
                    aria-label={`增加${QUESTION_TYPES[t]}`}
                    disabled={(counts[t] ?? 0) >= 30}
                    onClick={() => setCount(t, (counts[t] ?? 0) + 1)}
                  >
                    <Plus />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </GlassCard>

        {/* 难度 */}
        <GlassCard>
          <h2 className="mb-3 text-sm font-medium">难度</h2>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {DIFFICULTY_ORDER.map((d) => (
              <OptionCard key={d} selected={difficulty === d} onClick={() => setDifficulty(d)}>
                <span className="flex-1">{DIFFICULTIES[d]}</span>
              </OptionCard>
            ))}
          </div>
        </GlassCard>

        {/* 标签 / 模型 / 语言 / 去重 */}
        <GlassCard>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="知识点标签" description="留空则由模型自动为每题打标，用于后续弱项统计。">
                {(id) => (
                  <div id={id}>
                    <TagInput value={tags} onChange={setTags} suggestions={tagNames ?? []} />
                  </div>
                )}
              </Field>
            </div>

            <Field
              label="主分类"
              description="可选。不选时由模型根据描述从已有分类中判断，必要时会新建（也可在设置里管理）。"
            >
              {() => (
                <Select
                  value={category || '__auto'}
                  onValueChange={(v) => setCategory(v === '__auto' ? '' : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="自动判断" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__auto">自动判断</SelectItem>
                    {(categories ?? []).map((c) => (
                      <SelectItem key={c.code} value={c.code}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>

            <Field label="出题模型" required>
              {() =>
                modelsLoading ? (
                  <Skeleton className="h-10 w-full" />
                ) : generateModels.length === 0 ? (
                  <Alert variant="warning" title="还没有可出题的模型">
                    请先到
                    <Button variant="ghost" size="sm" className="mx-1 px-1" onClick={() => navigate('/settings/models')}>
                      模型管理
                    </Button>
                    配置一个「可用于出题」的模型。
                  </Alert>
                ) : (
                  <Select
                    value={selectedModelId ? String(selectedModelId) : undefined}
                    onValueChange={(v) => setModelId(Number(v))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="选择模型" />
                    </SelectTrigger>
                    <SelectContent>
                      {generateModels.map((m) => (
                        <SelectItem key={m.id} value={String(m.id)}>
                          {m.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )
              }
            </Field>

            <Field label="语言">
              {() => (
                <Select value={language} onValueChange={(v) => setLanguage(v as 'zh' | 'en')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="zh">中文</SelectItem>
                    <SelectItem value="en">英文</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </Field>

            <Field label="去重强度" description="把相关历史题干注入提示词，提示模型避开已出过的题。">
              {() => (
                <Select
                  value={dedupStrength}
                  onValueChange={(v) => setDedupStrength(v as DedupStrength)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(DEDUP_STRENGTHS) as DedupStrength[]).map((k) => (
                      <SelectItem key={k} value={k}>
                        {DEDUP_STRENGTHS[k]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>
          </div>
        </GlassCard>

        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
          {total === 0 ? (
            <Tooltip content="请至少选择一种题型且数量大于 0">
              <span className="inline-flex w-full sm:w-auto">
                <Button
                  variant="primary"
                  size="lg"
                  className="w-full sm:w-auto"
                  loading={create.isPending}
                  disabled={!canSubmit}
                  onClick={submit}
                >
                  {!create.isPending && <Sparkles />}
                  生成试卷
                </Button>
              </span>
            </Tooltip>
          ) : (
            <Button
              variant="primary"
              size="lg"
              loading={create.isPending}
              disabled={!canSubmit}
              onClick={submit}
            >
              {!create.isPending && <Sparkles />}
              生成试卷
            </Button>
          )}
        </div>
      </div>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>另存为预设</DialogTitle>
            <DialogDescription>保存当前提示词、题型数量、难度、标签、分类、语言与去重。</DialogDescription>
          </DialogHeader>
          <Field label="名称" required>
            {(id) => (
              <Input
                id={id}
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="例如：RAG 故障排查专项"
                maxLength={80}
              />
            )}
          </Field>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setSaveOpen(false)}>
              取消
            </Button>
            <Button
              variant="primary"
              loading={savePreset.isPending}
              disabled={!saveName.trim() || !prompt.trim()}
              onClick={() => savePreset.mutate()}
            >
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>删除这个预设？</DialogTitle>
            <DialogDescription>
              {loadedPreset ? `将删除「${loadedPreset.name}」。表单内容仍保留。` : '将删除当前载入的用户预设。'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDeleteOpen(false)}>
              取消
            </Button>
            <Button
              variant="outline"
              loading={deletePreset.isPending}
              onClick={() => loadedPreset && deletePreset.mutate(loadedPreset.id)}
            >
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  )
}
