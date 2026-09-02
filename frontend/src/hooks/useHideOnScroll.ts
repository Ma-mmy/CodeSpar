import { useEffect, useState } from 'react'

const MOBILE_MQ = '(max-width: 767px)'
const OFFSET = 48
const TOLERANCE = 8

/** 手机端根据滚动方向隐藏顶栏：上滑收起，下滑带回。桌面端始终展开。 */
export function useHideOnScroll({
  resetKey,
  enabled = true,
}: {
  resetKey?: string
  enabled?: boolean
} = {}) {
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    setHidden(false)
    if (!enabled) return

    const mq = window.matchMedia(MOBILE_MQ)
    if (!mq.matches) return

    let lastY = window.scrollY
    let ticking = false
    let current = false

    const apply = (next: boolean) => {
      if (next === current) return
      current = next
      setHidden(next)
    }

    const update = () => {
      ticking = false
      const y = Math.max(0, window.scrollY)
      if (y <= OFFSET) apply(false)
      else if (y > lastY + TOLERANCE) apply(true)
      else if (y < lastY - TOLERANCE) apply(false)
      lastY = y
    }

    const onScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(update)
    }

    const onMq = () => {
      if (!mq.matches) apply(false)
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    mq.addEventListener('change', onMq)
    return () => {
      window.removeEventListener('scroll', onScroll)
      mq.removeEventListener('change', onMq)
    }
  }, [resetKey, enabled])

  return hidden
}
