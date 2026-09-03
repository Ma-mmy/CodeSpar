import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bookmark, Save, Sparkles, Wand2 } from 'lucide-react'
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
  Label,
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
  Slider,
  Switch,
  Textarea,
  Tooltip,
  useToast,
} from '@/components/ui'
import { api } from '@/api/client'
import { modelsApi } from '@/api/models'
import {
  DIFFICULTIES,
  QUESTION_TYPES,
  QUESTION_TYPE_ORDER,
  generationApi,
  type Difficulty,
  type GenerateRequest,
  type QuestionType,
} from '@/api/generation'
import { categoriesApi } from '@/api/categories'
import { presetsApi, type PromptPreset } from '@/api/presets'
import { TagInput } from './TagInput'
import {
  DEFAULT_COUNT_PRESET,
  MAX_QUESTIONS_PER_TYPE,
  clampCounts,
  clearLegacyLocalPreset,
  countsEqual,
  peekLegacyLocalPreset,
  resolvedCountPreset,
} from './countPreset'

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
  autoOptimize?: boolean
  /** 从出题预览「返回修改」带回时带上任务 id，用于提示文案 */
  fromJobId?: number
}

function articleIdFromSearch(search: string): number | undefined {
  const raw = new URLSearchParams(search).get('articleId')
  if (!raw) return undefined
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : undefined
}

export function GeneratePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
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
  const { data: countPresetView } = useQuery({
    queryKey: ['generation-count-preset'],
    queryFn: generationApi.getCountPreset,
  })

  const generateModels = useMemo(
    () => (models ?? []).filter((m) => m.canGenerate && m.enabled),
    [models],
  )
  const defaultModel = generateModels.find((m) => m.isDefaultGenerate) ?? generateModels[0]

  const [prefill] = useState<GeneratePrefillState>(() => {
    const state = (location.state as GeneratePrefillState | null) ?? {}
    return {
      ...state,
      articleId: state.articleId ?? articleIdFromSearch(location.search),
    }
  })
  const [prompt, setPrompt] = useState(prefill.prompt ?? '')
  const [articleId, setArticleId] = useState<number | undefined>(prefill.articleId)
  const [articleTitle, setArticleTitle] = useState<string | undefined>(prefill.articleTitle)
  const [counts, setCounts] = useState<Partial<Record<QuestionType, number>>>(() =>
    prefill.counts ? clampCounts(prefill.counts) : { ...DEFAULT_COUNT_PRESET },
  )
  const [countsTouched, setCountsTouched] = useState(false)
  const migratedLegacy = useRef(false)
  const toastedPrefill = useRef(false)
  const [difficulty, setDifficulty] = useState<Difficulty>(prefill.difficulty ?? 'ADVANCED')
  const [tags, setTags] = useState<string[]>(prefill.tags ?? [])
  const [category, setCategory] = useState<string>(prefill.category ?? '')
  const [modelId, setModelId] = useState<number | undefined>(prefill.modelProfileId)
  const [language, setLanguage] = useState<'zh' | 'en'>(
    prefill.language === 'en' || prefill.language === 'zh' ? prefill.language : 'zh',
  )
  /** 生成试卷时是否自动优化提示词；默认开。点「优化描述」后会关掉。 */
  const [autoOptimize, setAutoOptimize] = useState(prefill.autoOptimize ?? true)
  const [loadedPresetId, setLoadedPresetId] = useState<number | undefined>()
  const [saveOpen, setSaveOpen] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [deleteOpen, setDeleteOpen] = useState(false)

  // 预填提示只打一次。articleId 同时写在 query 上，避免仅靠 location.state 丢失后组卷挂不上文章。
  useEffect(() => {
    if (toastedPrefill.current) return
    const state = prefill
    const hasPrefill =
      state.articleId != null ||
      state.prompt != null ||
      state.counts != null ||
      state.difficulty != null ||
      state.tags != null ||
      state.category != null ||
      state.modelProfileId != null ||
      state.language != null ||
      state.autoOptimize != null ||
      state.fromJobId != null
    if (!hasPrefill) return
    toastedPrefill.current = true

    if (state.summaryStale) {
      toast('考点摘要已过期，仍可出题；建议回到文章页重新提炼', { variant: 'warning', duration: 8000 })
    } else if (state.fromJobId != null) {
      toast('已带回上次出题参数，可修改后重新生成', { variant: 'success' })
    } else if (state.articleId != null) {
      toast(`已关联文章「${state.articleTitle ?? state.articleId}」`, { variant: 'success' })
    } else if (state.tags && state.tags.length > 0) {
      toast(`已预填薄弱项「${state.tags.join('、')}」，可改参数后生成`, { variant: 'success' })
    }
    if (state.articleId != null && searchParams.get('articleId') !== String(state.articleId)) {
      const next = new URLSearchParams(searchParams)
      next.set('articleId', String(state.articleId))
      setSearchParams(next, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const countPreset = useMemo(
    () => resolvedCountPreset(countPresetView?.counts),
    [countPresetView],
  )
  // 无预填、未手改、未载入提示词预设时，用服务端题型预设（或内置默认）填入。
  useEffect(() => {
    if (prefill.counts) return
    if (countsTouched) return
    if (loadedPresetId != null) return
    if (!countPresetView) return
    setCounts((prev) => (countsEqual(prev, countPreset) ? prev : { ...countPreset }))
  }, [countPreset, countPresetView, countsTouched, loadedPresetId, prefill.counts])
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
    setCounts(clampCounts(nextCounts))
    if (p.params.difficulty) setDifficulty(p.params.difficulty)
    setTags(p.params.tags ?? [])
    setCategory(p.params.category ?? '')
    if (p.params.language === 'en' || p.params.language === 'zh') setLanguage(p.params.language)
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

  const saveCountPresetMut = useMutation({
    mutationFn: (body: Partial<Record<QuestionType, number>>) => generationApi.saveCountPreset(body),
    onSuccess: (view) => {
      qc.setQueryData(['generation-count-preset'], view)
      clearLegacyLocalPreset()
      setCountsTouched(false)
    },
    onError: (e) =>
      toast('保存失败', { variant: 'danger', description: (e as Error).message, duration: 8000 }),
  })

  useEffect(() => {
    if (!countPresetView || migratedLegacy.current) return
    migratedLegacy.current = true
    const legacy = peekLegacyLocalPreset()
    if (!legacy) return
    if (countPresetView.saved) {
      clearLegacyLocalPreset()
      return
    }
    saveCountPresetMut.mutate(legacy)
    // 仅在首次拿到服务端结果时迁一次旧 localStorage
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countPresetView])

  const canSubmit =
    prompt.trim().length > 0 &&
    total > 0 &&
    !!selectedModelId &&
    !create.isPending &&
    !optimize.isPending
  const showSaveCountPreset = countsTouched && !countsEqual(counts, countPreset)

  const canOptimize =
    prompt.trim().length > 0 && !!selectedModelId && !optimize.isPending && !create.isPending

  function setCount(type: QuestionType, v: number) {
    setCounts((prev) => {
      const clamped = Math.max(0, Math.min(MAX_QUESTIONS_PER_TYPE, v))
      const next = { ...prev }
      if (clamped === 0) delete next[type]
      else next[type] = clamped
      return next
    })
    setCountsTouched(true)
  }

  function applyCountPreset() {
    setCounts({ ...countPreset })
    setCountsTouched(false)
    toast('已套用题型预设', { variant: 'success' })
  }

  function saveCountPreset() {
    if (total === 0 || saveCountPresetMut.isPending) return
    saveCountPresetMut.mutate(counts, {
      onSuccess: () => toast('已保存为题型预设', { variant: 'success' }),
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
                if (searchParams.has('articleId')) {
                  const next = new URLSearchParams(searchParams)
                  next.delete('articleId')
                  setSearchParams(next, { replace: true })
                }
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
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Switch
                  id="generate-auto-optimize"
                  checked={autoOptimize}
                  onCheckedChange={setAutoOptimize}
                />
                <Label htmlFor="generate-auto-optimize" className="cursor-pointer text-xs font-normal text-muted-foreground">
                  自动优化{autoOptimize ? '（开）' : '（关）'}
                </Label>
              </div>
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
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-medium">题型与数量</h2>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {showSaveCountPreset ? (
                total === 0 ? (
                  <Tooltip content="请先设置题型数量">
                    <span className="inline-flex">
                      <Button type="button" size="sm" variant="primary" disabled>
                        <Save className="size-3.5" />
                        保存预设
                      </Button>
                    </span>
                  </Tooltip>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="primary"
                    loading={saveCountPresetMut.isPending}
                    onClick={saveCountPreset}
                    title="把当前题型数量保存到本机数据库"
                  >
                    {!saveCountPresetMut.isPending && <Save className="size-3.5" />}
                    保存预设
                  </Button>
                )
              ) : (
                <Button type="button" size="sm" variant="primary" onClick={applyCountPreset}>
                  <Bookmark className="size-3.5" />
                  使用预设
                </Button>
              )}
              <span
                className={`rounded-lg px-2 py-0.5 text-xs font-medium tabular-nums ${
                  total === 0 ? 'bg-destructive/12 text-destructive' : 'bg-primary/12 text-primary'
                }`}
              >
                {total}
              </span>
            </div>
          </div>
          <div className="divide-y divide-border">
            {QUESTION_TYPE_ORDER.map((t) => {
              const n = counts[t] ?? 0
              return (
                <div key={t} className="flex items-center gap-3 py-3.5">
                  <span className="w-20 shrink-0 text-sm">{QUESTION_TYPES[t]}</span>
                  <Slider
                    className="min-w-0 flex-1"
                    min={0}
                    max={MAX_QUESTIONS_PER_TYPE}
                    step={1}
                    value={[n]}
                    onValueChange={(v) => setCount(t, v[0] ?? 0)}
                    aria-label={`${QUESTION_TYPES[t]}数量`}
                  />
                  <span
                    className={`w-8 shrink-0 text-right text-sm tabular-nums ${
                      n > 0 ? 'font-medium text-primary' : 'text-muted-foreground'
                    }`}
                  >
                    {n}
                  </span>
                </div>
              )
            })}
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

        {/* 分类 / 模型 / 语言 / 标签 */}
        <GlassCard>
          <div className="grid gap-5 sm:grid-cols-2">
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

            <Field label="知识点标签" description="留空则由模型自动为每题打标，用于后续弱项统计。">
              {(id) => (
                <div id={id}>
                  <TagInput value={tags} onChange={setTags} suggestions={tagNames ?? []} />
                </div>
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
            <DialogDescription>保存当前提示词、题型数量、难度、标签、分类与语言。</DialogDescription>
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
