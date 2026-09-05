import { useEffect, useState } from 'react'

const MOBILE_MQ = '(max-width: 767px)'

/** 手机端仅在页面顶部展示顶栏；桌面端始终展开。 */
export function useHideOnScroll({
  resetKey,
  enabled = true,
}: {
  resetKey?: string
  enabled?: boolean
} = {}) {
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    if (!enabled) {
      setHidden(false)
      return
    }

    const mq = window.matchMedia(MOBILE_MQ)
    if (!mq.matches) {
      setHidden(false)
      return
    }

    let ticking = false
    let current = window.scrollY > 1

    const apply = (next: boolean) => {
      if (next === current) return
      current = next
      setHidden(next)
    }

    const update = () => {
      ticking = false
      apply(window.scrollY > 1)
    }

    const onScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(update)
    }

    const onMq = () => {
      if (!mq.matches) apply(false)
      else update()
    }

    apply(current)
    window.addEventListener('scroll', onScroll, { passive: true })
    mq.addEventListener('change', onMq)
    return () => {
      window.removeEventListener('scroll', onScroll)
      mq.removeEventListener('change', onMq)
    }
  }, [resetKey, enabled])

  return hidden
}
