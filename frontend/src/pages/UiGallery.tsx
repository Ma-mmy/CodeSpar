import { useState } from 'react'
import { Inbox, Trash2, Plug, Sparkles } from 'lucide-react'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Alert,
  Badge,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  EmptyState,
  Field,
  GlassCard,
  Input,
  Label,
  OptionCard,
  PageContainer,
  PageHeader,
  Progress,
  RadioGroup,
  RadioGroupItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Skeleton,
  Slider,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  Tooltip,
  useToast,
} from '@/components/ui'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-3 text-sm font-medium text-muted-foreground">{title}</h2>
      <GlassCard>{children}</GlassCard>
    </section>
  )
}

/**
 * 组件总览页（/_ui）。
 * 所有组件的各种状态集中展示，改动设计 token 时一眼看到全局影响。
 * 浅色 / 深色 / 纸质都要检查 —— 用左侧栏底部的主题切换器。
 */
export function UiGallery() {
  const toast = useToast()
  const [progress, setProgress] = useState(42)
  const [slider, setSlider] = useState(8)

  return (
    <PageContainer>
      <PageHeader
        title="组件总览"
        description="所有 UI 组件的状态清单。改设计 token 后先来这页看全局影响，浅色、深色、纸质都要过一遍。"
      />

      <Section title="Button">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary">主操作</Button>
            <Button variant="secondary">次操作</Button>
            <Button variant="outline">描边</Button>
            <Button variant="ghost">无背景</Button>
            <Button variant="destructive">
              <Trash2 />
              删除
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm">小</Button>
            <Button size="md">中</Button>
            <Button size="lg">大</Button>
            <Button size="icon" variant="outline" aria-label="示例">
              <Sparkles />
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" loading>
              生成中
            </Button>
            <Button variant="primary" disabled>
              禁用
            </Button>
            <Button variant="outline" disabled>
              禁用描边
            </Button>
          </div>
        </div>
      </Section>

      <Section title="表单">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="模型名称" required description="用于在下拉里识别，如 DeepSeek-V3">
            {(id) => <Input id={id} placeholder="DeepSeek-V3" />}
          </Field>
          <Field label="baseURL" error="URL 必须以 http:// 或 https:// 开头">
            {(id) => <Input id={id} defaultValue="api.deepseek.com" invalid />}
          </Field>
          <Field label="厂商模板">
            {(id) => (
              <Select defaultValue="deepseek">
                <SelectTrigger id={id}>
                  <SelectValue placeholder="选择模板" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="deepseek">DeepSeek</SelectItem>
                  <SelectItem value="dashscope">通义千问 / DashScope</SelectItem>
                  <SelectItem value="custom">自定义</SelectItem>
                </SelectContent>
              </Select>
            )}
          </Field>
          <Field label="禁用态">{(id) => <Input id={id} disabled value="不可编辑" />}</Field>
          <Field
            label="出题要求"
            description="描述想考什么，越具体题目质量越高"
            className="sm:col-span-2"
          >
            {(id) => (
              <Textarea
                id={id}
                rows={3}
                placeholder="围绕生产级 RAG 的检索质量优化出题，贴近真实故障排查场景…"
              />
            )}
          </Field>
        </div>

        <Separator className="my-6" />

        <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
          <div className="flex items-center gap-2.5">
            <Switch id="g-sw" defaultChecked />
            <Label htmlFor="g-sw">可用于阅卷</Label>
          </div>
          <div className="flex items-center gap-2.5">
            <Switch id="g-sw2" />
            <Label htmlFor="g-sw2">JSON 模式</Label>
          </div>
          <div className="flex items-center gap-2.5">
            <Checkbox id="g-cb" defaultChecked />
            <Label htmlFor="g-cb">加入错题本</Label>
          </div>
          <div className="flex items-center gap-2.5">
            <Checkbox id="g-cb2" disabled />
            <Label htmlFor="g-cb2">禁用</Label>
          </div>
        </div>

        <Separator className="my-6" />

        <RadioGroup defaultValue="mid" className="sm:grid-cols-2">
          {[
            { v: 'easy', t: '初级', d: '概念辨析为主' },
            { v: 'mid', t: '中级', d: '结合场景的权衡' },
          ].map(({ v, t, d }) => (
            <OptionCard key={v} as="label" selected={false}>
              <RadioGroupItem value={v} id={`g-r-${v}`} className="mt-0.5" />
              <div className="min-w-0">
                <Label htmlFor={`g-r-${v}`} className="cursor-pointer">
                  {t}
                </Label>
                <p className="mt-0.5 text-[13px] text-muted-foreground">{d}</p>
              </div>
            </OptionCard>
          ))}
        </RadioGroup>
      </Section>

      <Section title="Badge / Alert">
        <div className="flex flex-wrap gap-2">
          <Badge>默认</Badge>
          <Badge variant="primary">RAG</Badge>
          <Badge variant="success">已阅卷</Badge>
          <Badge variant="warning">部分成功</Badge>
          <Badge variant="danger">失败</Badge>
          <Badge variant="outline">草稿</Badge>
        </div>
        <div className="mt-5 space-y-2.5">
          <Alert variant="info" title="出题中">
            已完成 3/4 批，累计消耗 2,140 tokens。
          </Alert>
          <Alert variant="success" title="连接成功">
            延迟 320ms，返回 “pong”。
          </Alert>
          <Alert variant="warning" title="疑似重复">
            有 2 道题与题库中同标签题目高度相似。
          </Alert>
          <Alert variant="danger" title="调用失败">
            401 Unauthorized — Invalid API key provided.
          </Alert>
        </div>
      </Section>

      <Section title="进度 / 滑块 / 骨架屏 / 空状态">
        <div className="space-y-3">
          <Progress value={progress} />
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setProgress((p) => Math.max(0, p - 20))}>
              −20
            </Button>
            <Button size="sm" variant="outline" onClick={() => setProgress((p) => Math.min(100, p + 20))}>
              +20
            </Button>
          </div>
        </div>
        <div className="mt-5 flex items-center gap-3">
          <Slider
            className="flex-1"
            min={0}
            max={30}
            step={1}
            value={[slider]}
            onValueChange={(v) => setSlider(v[0] ?? 0)}
            aria-label="示例数量"
          />
          <span className="w-8 text-right text-sm tabular-nums">{slider}</span>
        </div>
        <div className="mt-5 space-y-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
        <Separator className="my-2" />
        <EmptyState
          icon={Inbox}
          title="还没有试卷"
          description="去出题页写一段提示词，让模型给你出一套。"
          action={
            <Button variant="primary" size="sm">
              <Sparkles />
              开始出题
            </Button>
          }
        />
      </Section>

      <Section title="Tabs / Accordion / Tooltip / Dialog / Toast">
        <Tabs defaultValue="a">
          <TabsList>
            <TabsTrigger value="a">全部</TabsTrigger>
            <TabsTrigger value="b">进行中</TabsTrigger>
            <TabsTrigger value="c">已完成</TabsTrigger>
          </TabsList>
          <TabsContent value="a" className="text-sm text-muted-foreground">
            全部内容
          </TabsContent>
          <TabsContent value="b" className="text-sm text-muted-foreground">
            进行中内容
          </TabsContent>
          <TabsContent value="c" className="text-sm text-muted-foreground">
            已完成内容
          </TabsContent>
        </Tabs>

        <Separator className="my-5" />

        <Accordion type="single" collapsible>
          <AccordionItem value="q1">
            <AccordionTrigger>第 1 题 · 系统设计 · 得分 7/10</AccordionTrigger>
            <AccordionContent className="text-muted-foreground">
              命中「分层检索」「延迟取舍」，遗漏「失败降级」。
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="q2">
            <AccordionTrigger>第 2 题 · 概念问答 · 得分 9/10</AccordionTrigger>
            <AccordionContent className="text-muted-foreground">回答完整。</AccordionContent>
          </AccordionItem>
        </Accordion>

        <Separator className="my-5" />

        <div className="flex flex-wrap gap-2">
          <Tooltip content="测试该模型是否可用，约需 1–8 秒">
            <Button variant="outline" size="sm">
              <Plug />
              测试连接
            </Button>
          </Tooltip>

          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                打开对话框
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>删除模型配置</DialogTitle>
                <DialogDescription>
                  删除后，历史记录中的模型名会保留，但无法再用它出题或阅卷。
                </DialogDescription>
              </DialogHeader>
              <Field label="确认输入模型名">{(id) => <Input id={id} placeholder="DeepSeek-V3" />}</Field>
              <DialogFooter>
                <Button variant="secondary">取消</Button>
                <Button variant="destructive">确认删除</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              toast('模型连接成功', { variant: 'success', description: '延迟 320ms · 12 tokens' })
            }
          >
            成功 Toast
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              toast('调用失败', {
                variant: 'danger',
                description: '401 Unauthorized — Invalid API key provided.',
                duration: 8000,
              })
            }
          >
            错误 Toast
          </Button>
        </div>
      </Section>

      <Section title="Table">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>名称</TableHead>
              <TableHead>模型</TableHead>
              <TableHead>用途</TableHead>
              <TableHead>状态</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="font-medium">DeepSeek-V3</TableCell>
              <TableCell className="text-muted-foreground">deepseek-chat</TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Badge variant="primary">出题</Badge>
                  <Badge variant="primary">阅卷</Badge>
                </div>
              </TableCell>
              <TableCell>
                <Badge variant="success">可用</Badge>
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">通义千问</TableCell>
              <TableCell className="text-muted-foreground">qwen-max</TableCell>
              <TableCell>
                <Badge variant="primary">阅卷</Badge>
              </TableCell>
              <TableCell>
                <Badge variant="danger">未测试</Badge>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Section>
    </PageContainer>
  )
}
