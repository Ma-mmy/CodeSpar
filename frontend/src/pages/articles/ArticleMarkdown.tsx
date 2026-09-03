import { useMemo, useRef, type ComponentPropsWithoutRef } from 'react'
import ReactMarkdown, { type ExtraProps } from 'react-markdown'
import remarkGfm from 'remark-gfm'
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
    return { h1: wrap('h1'), h2: wrap('h2'), h3: wrap('h3'), img: (props: ComponentPropsWithoutRef<'img'> & ExtraProps) => <ArticleImage {...props} articleId={articleId} /> }
  }, [headings, articleId])

  return (
    <div className="markdown-body min-w-0 max-w-full">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
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
  ...props
}: ComponentPropsWithoutRef<'img'> & ExtraProps & { articleId?: number }) {
  if (typeof src === 'string' && isLoadableSrc(src)) {
    return <img src={src} alt={alt ?? ''} {...props} />
  }
  if (articleId != null && typeof src === 'string' && src.trim()) {
    return <img src={`/api/articles/${articleId}/assets?path=${encodeURIComponent(src)}`} alt={alt ?? ''} {...props} />
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
