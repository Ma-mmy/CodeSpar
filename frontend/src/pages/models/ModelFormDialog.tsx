import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plug } from 'lucide-react'
import {
  Alert,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  useToast,
} from '@/components/ui'
import {
  modelsApi,
  VENDOR_TEMPLATES,
  type ModelProfile,
  type ModelProfileUpsert,
  type TestResult,
} from '@/api/models'
import { ApiError } from '@/api/client'

const EMPTY: ModelProfileUpsert = {
  name: '',
  providerType: 'OPENAI_COMPATIBLE',
  baseUrl: '',
  apiKey: '',
  modelName: '',
  canGenerate: true,
  canGrade: true,
  supportsJsonMode: false,
  enabled: true,
}

export function ModelFormDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 传入表示编辑，不传表示新增 */
  editing?: ModelProfile
}) {
  const toast = useToast()
  const qc = useQueryClient()
  const [form, setForm] = useState<ModelProfileUpsert>(EMPTY)
  const [templateKey, setTemplateKey] = useState('deepseek')
  const [testResult, setTestResult] = useState<TestResult | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const isEdit = !!editing

  useEffect(() => {
    if (!open) return
    setTestResult(null)
    setFieldErrors({})
    if (editing) {
      setForm({
        name: editing.name,
        providerType: editing.providerType,
        baseUrl: editing.baseUrl ?? '',
        apiKey: '', // 留空 = 不修改
        modelName: editing.modelName,
        canGenerate: editing.canGenerate,
        canGrade: editing.canGrade,
        temperature: editing.temperature,
        maxTokens: editing.maxTokens,
        supportsJsonMode: editing.supportsJsonMode,
        enabled: editing.enabled,
        remark: editing.remark,
      })
      setTemplateKey('custom')
    } else {
      const t = VENDOR_TEMPLATES[0]
      setForm({ ...EMPTY, providerType: t.providerType, baseUrl: t.baseUrl ?? '' })
      setTemplateKey(t.key)
    }
  }, [open, editing])

  const template = VENDOR_TEMPLATES.find((t) => t.key === templateKey)
  const needsBaseUrl = form.providerType === 'OPENAI_COMPATIBLE'

  function pickTemplate(key: string) {
    setTemplateKey(key)
    const t = VENDOR_TEMPLATES.find((x) => x.key === key)
    if (!t) return
    setForm((f) => ({
      ...f,
      providerType: t.providerType,
      // 模板只负责填一次，用户改完再切模板才会覆盖
      baseUrl: t.baseUrl ?? '',
    }))
  }

  const save = useMutation({
    mutationFn: (body: ModelProfileUpsert) =>
      isEdit ? modelsApi.update(editing!.id, body) : modelsApi.create(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['models'] })
      toast(isEdit ? '已保存' : '已添加', { variant: 'success' })
      onOpenChange(false)
    },
    onError: (e) => {
      if (e instanceof ApiError) {
        const detail = e.detail as { fields?: Record<string, string> } | undefined
        if (detail?.fields) setFieldErrors(detail.fields)
      }
      toast('保存失败', { variant: 'danger', description: (e as Error).message })
    },
  })

  const test = useMutation({
    mutationFn: () =>
      modelsApi.testDraft({
        providerType: form.providerType,
        baseUrl: form.baseUrl,
        apiKey: form.apiKey!,
        modelName: form.modelName,
      }),
    onSuccess: setTestResult,
    onError: (e) => setTestResult({ success: false, latencyMs: 0, error: (e as Error).message }),
  })

  const canTest =
    !!form.apiKey?.trim() && !!form.modelName.trim() && (!needsBaseUrl || !!form.baseUrl?.trim())

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? '编辑模型' : '添加模型'}</DialogTitle>
          <DialogDescription>
            厂商模板只是帮你自动填 baseURL，三个字段永远可以手改，任何 OpenAI 兼容端点都能接。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {!isEdit && (
            <Field label="厂商模板" description={template?.hint}>
              {(id) => (
                <Select value={templateKey} onValueChange={pickTemplate}>
                  <SelectTrigger id={id}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VENDOR_TEMPLATES.map((t) => (
                      <SelectItem key={t.key} value={t.key}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>
          )}

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="显示名称" required error={fieldErrors.name}>
              {(id) => (
                <Input
                  id={id}
                  value={form.name}
                  invalid={!!fieldErrors.name}
                  placeholder="DeepSeek-V3"
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              )}
            </Field>

            <Field label="模型名" required error={fieldErrors.modelName}>
              {(id) => (
                <Input
                  id={id}
                  value={form.modelName}
                  invalid={!!fieldErrors.modelName}
                  placeholder={template?.modelPlaceholder ?? 'model-name'}
                  onChange={(e) => setForm((f) => ({ ...f, modelName: e.target.value }))}
                />
              )}
            </Field>
          </div>

          {needsBaseUrl && (
            <Field label="baseURL" required error={fieldErrors.baseUrl}>
              {(id) => (
                <Input
                  id={id}
                  value={form.baseUrl}
                  invalid={!!fieldErrors.baseUrl}
                  placeholder="https://api.deepseek.com/v1"
                  onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))}
                />
              )}
            </Field>
          )}

          <Field
            label="apiKey"
            required={!isEdit}
            description={isEdit ? '留空表示不修改；填写则覆盖原有 key' : undefined}
            error={fieldErrors.apiKey}
          >
            {(id) => (
              <Input
                id={id}
                type="password"
                autoComplete="off"
                value={form.apiKey}
                invalid={!!fieldErrors.apiKey}
                placeholder={isEdit ? '不修改则留空' : 'sk-…'}
                onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
              />
            )}
          </Field>

          <div className="flex flex-wrap gap-x-8 gap-y-3">
            <div className="flex items-center gap-2.5">
              <Switch
                id="m-gen"
                checked={form.canGenerate}
                onCheckedChange={(v) => setForm((f) => ({ ...f, canGenerate: v }))}
              />
              <Label htmlFor="m-gen">可用于出题</Label>
            </div>
            <div className="flex items-center gap-2.5">
              <Switch
                id="m-grade"
                checked={form.canGrade}
                onCheckedChange={(v) => setForm((f) => ({ ...f, canGrade: v }))}
              />
              <Label htmlFor="m-grade">可用于阅卷</Label>
            </div>
            <div className="flex items-center gap-2.5">
              <Switch
                id="m-enabled"
                checked={form.enabled}
                onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v }))}
              />
              <Label htmlFor="m-enabled">启用</Label>
            </div>
          </div>

          <details className="group">
            <summary className="cursor-pointer text-sm text-muted-foreground transition-colors hover:text-foreground">
              高级选项
            </summary>
            <div className="mt-4 space-y-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="temperature" description="留空用厂商默认值">
                  {(id) => (
                    <Input
                      id={id}
                      type="number"
                      step="0.1"
                      min="0"
                      max="2"
                      value={form.temperature ?? ''}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          temperature: e.target.value === '' ? undefined : Number(e.target.value),
                        }))
                      }
                    />
                  )}
                </Field>
                <Field label="maxTokens" description="留空用厂商默认值">
                  {(id) => (
                    <Input
                      id={id}
                      type="number"
                      min="1"
                      value={form.maxTokens ?? ''}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          maxTokens: e.target.value === '' ? undefined : Number(e.target.value),
                        }))
                      }
                    />
                  )}
                </Field>
              </div>
              <div className="flex items-start gap-2.5">
                <Switch
                  id="m-json"
                  checked={form.supportsJsonMode}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, supportsJsonMode: v }))}
                />
                <div>
                  <Label htmlFor="m-json">下发 response_format</Label>
                  <p className="mt-0.5 text-[13px] text-muted-foreground">
                    很多兼容端点对 JSON 模式支持不全，默认关闭。出题时靠 prompt 注入 schema 也能正常工作。
                  </p>
                </div>
              </div>
            </div>
          </details>

          {/* 连通测试 */}
          <div className="space-y-3 border-t border-border pt-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                建议保存前先测一下，避免出题跑到一半才发现配置错了
              </p>
              <Button
                variant="outline"
                size="sm"
                disabled={!canTest}
                loading={test.isPending}
                onClick={() => test.mutate()}
              >
                <Plug />
                测试连接
              </Button>
            </div>

            {testResult && (
              <Alert
                variant={testResult.success ? 'success' : 'danger'}
                title={
                  testResult.success
                    ? `连接成功 · ${testResult.latencyMs}ms`
                    : `连接失败 · ${testResult.latencyMs}ms`
                }
              >
                {testResult.success ? (
                  <>
                    回复：{testResult.reply}
                    {testResult.promptTokens != null && (
                      <> · tokens {testResult.promptTokens}+{testResult.completionTokens}</>
                    )}
                  </>
                ) : (
                  <code className="text-xs break-all">{testResult.error}</code>
                )}
              </Alert>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button variant="primary" loading={save.isPending} onClick={() => save.mutate(form)}>
            {isEdit ? '保存' : '添加'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
