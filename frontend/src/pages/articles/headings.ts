import type { ArticleSummaryStructured } from '@/api/articles'

export type TocHeading = {
  id: string
  level: 1 | 2 | 3
  text: string
}

/** 考点摘要大纲锚点，与 SummaryPanel 的 id 对齐。 */
export const SUMMARY_TOC = {
  sections: 'cs-summary-sections',
  section: (i: number) => `cs-summary-section-${i}`,
  keypoints: 'cs-summary-keypoints',
  keypoint: (i: number) => `cs-summary-keypoint-${i}`,
  questions: 'cs-summary-questions',
  question: (i: number) => `cs-summary-question-${i}`,
  markdown: 'cs-summary-markdown',
  mdPrefix: 'smd-',
} as const

function slugify(text: string): string {
  const s = text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\p{Letter}\p{Number}-]+/gu, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return s || 'section'
}

function plainText(raw: string): string {
  return raw
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_`~]/g, '')
    .trim()
}

/** 从 Markdown 抽 ATX 标题（跳过围栏代码块），id 与 ArticleMarkdown 注入顺序一致。 */
export function extractHeadings(md: string, idPrefix = ''): TocHeading[] {
  const out: TocHeading[] = []
  const used = new Map<string, number>()
  let inFence = false
  for (const line of md.split('\n')) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    const m = /^(#{1,3})\s+(.+?)\s*#*\s*$/.exec(line)
    if (!m) continue
    const text = plainText(m[2])
    if (!text) continue
    const base = slugify(text)
    const n = used.get(base) ?? 0
    used.set(base, n + 1)
    out.push({
      id: `${idPrefix}${n === 0 ? base : `${base}-${n}`}`,
      level: m[1].length as 1 | 2 | 3,
      text,
    })
  }
  return out
}

export function parseSummaryStructured(raw: unknown): ArticleSummaryStructured | null {
  if (!raw) return null
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as ArticleSummaryStructured
    } catch {
      return null
    }
  }
  if (typeof raw === 'object') return raw as ArticleSummaryStructured
  return null
}

function clip(text: string, max = 36): string {
  const t = text.trim()
  return t.length > max ? `${t.slice(0, max)}…` : t
}

/** 考点摘要大纲：优先结构化切片/考点/问题，否则退回 summaryMd 标题。 */
export function extractSummaryHeadings(summaryMd: string | undefined, summaryJson: unknown): TocHeading[] {
  const structured = parseSummaryStructured(summaryJson)
  const out: TocHeading[] = []
  const sections = structured?.sections ?? []
  const keypoints = structured?.keypoints ?? []
  const questions = structured?.classicQuestions ?? []
  const md = summaryMd?.trim() ?? ''

  if (sections.length > 0) {
    out.push({ id: SUMMARY_TOC.sections, level: 2, text: '章节切片' })
    sections.forEach((s, i) => {
      out.push({
        id: SUMMARY_TOC.section(i),
        level: 3,
        text: (s.title ?? '').trim() || `切片 ${i + 1}`,
      })
    })
  }
  if (keypoints.length > 0) {
    out.push({ id: SUMMARY_TOC.keypoints, level: 2, text: '高频考点' })
    keypoints.forEach((k, i) => {
      out.push({
        id: SUMMARY_TOC.keypoint(i),
        level: 3,
        text: (k.title ?? '').trim() || `考点 ${i + 1}`,
      })
    })
  }
  if (questions.length > 0) {
    out.push({ id: SUMMARY_TOC.questions, level: 2, text: '经典问题' })
    questions.forEach((q, i) => {
      const raw = (q.question ?? '').trim() || `问题 ${i + 1}`
      out.push({ id: SUMMARY_TOC.question(i), level: 3, text: clip(raw) })
    })
  }

  if (out.length === 0 && md) {
    const mdHeadings = extractHeadings(md, SUMMARY_TOC.mdPrefix)
    if (mdHeadings.length > 0) return mdHeadings
    return [{ id: SUMMARY_TOC.markdown, level: 2, text: '完整 Markdown' }]
  }

  if (md) {
    out.push({ id: SUMMARY_TOC.markdown, level: 2, text: '完整 Markdown' })
  }
  return out
}
