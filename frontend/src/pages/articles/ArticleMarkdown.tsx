import { useMemo, useRef, useState, type ComponentPropsWithoutRef } from 'react'
import ReactMarkdown, { type ExtraProps } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui'
import { extractHeadings } from './headings'

type HeadingTag = 'h1' | 'h2' | 'h3'

/** 文章阅读用 Markdown：给 H1–H3 注入与 TOC 一致的 id。不改共用 Markdown。 */
export function ArticleMarkdown({
  children,
  idPrefix = '',
  articleId,
}: {
  children: string
  idPrefix?: string
  articleId?: number
}) {
  const headings = useMemo(() => extractHeadings(children, idPrefix), [children, idPrefix])
  const cursor = useRef(0)
  const [preview, setPreview] = useState<{ src: string; alt: string } | null>(null)
  cursor.current = 0

  const components = useMemo(() => {
    const wrap = (Tag: HeadingTag) =>
      function Heading({
        node: _node,
        children: headingChildren,
        ...props
      }: ComponentPropsWithoutRef<HeadingTag> & ExtraProps) {
        const item = headings[cursor.current++]
        return (
          <Tag id={item?.id} {...props}>
            {headingChildren}
          </Tag>
        )
      }
    return {
      h1: wrap('h1'),
      h2: wrap('h2'),
      h3: wrap('h3'),
      img: (props: ComponentPropsWithoutRef<'img'> & ExtraProps) => (
        <ArticleImage {...props} articleId={articleId} onPreview={(src, alt) => setPreview({ src, alt })} />
      ),
    }
  }, [headings, articleId])

  return (
    <>
      <div className="markdown-body min-w-0 max-w-full">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
          {children}
        </ReactMarkdown>
      </div>
      <Dialog open={preview != null} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent
          className="flex h-[calc(100svh-1rem)] w-[calc(100vw-1rem)] max-w-none items-center justify-center overflow-hidden border-0 bg-black/90 p-3 shadow-none sm:h-[calc(100svh-2rem)] sm:w-[calc(100vw-2rem)] sm:p-6"
        >
          <DialogTitle className="sr-only">{preview?.alt || '图片预览'}</DialogTitle>
          {preview && (
            <img
              src={preview.src}
              alt={preview.alt}
              className="max-h-full max-w-full object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

/** http(s)/data/blob 才交给浏览器加载；相对路径（如镜像知识库的 access/*.png）没有随 .md 入库。 */
function isLoadableSrc(src: string | Blob | undefined): boolean {
  return typeof src === 'string' && /^(https?:|data:|blob:)/i.test(src)
}

function ArticleImage({
  node: _node,
  src,
  alt,
  articleId,
  onPreview,
  ...props
}: ComponentPropsWithoutRef<'img'> & ExtraProps & { articleId?: number; onPreview: (src: string, alt: string) => void }) {
  const resolvedSrc = typeof src === 'string' && isLoadableSrc(src)
    ? src
    : articleId != null && typeof src === 'string' && src.trim()
      ? `/api/articles/${articleId}/assets?path=${encodeURIComponent(src)}`
      : null
  if (resolvedSrc) {
    return (
      <button
        type="button"
        className="block max-w-full cursor-zoom-in rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`放大查看${alt ? `：${alt}` : '图片'}`}
        onClick={() => onPreview(resolvedSrc, alt ?? '')}
      >
        <img src={resolvedSrc} alt={alt ?? ''} {...props} />
      </button>
    )
  }
  const label = alt?.trim() || '图片未随文章导入'
  return (
    <span
      className="inline-flex max-w-full items-start rounded-md border border-dashed border-border bg-black/[0.03] px-2 py-1 text-[0.8em] leading-snug text-muted-foreground dark:bg-white/[0.04]"
      role="img"
      aria-label={label}
      title={typeof src === 'string' ? src : undefined}
    >
      {label}
    </span>
  )
}
