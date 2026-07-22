import { useEffect, useRef, useState } from 'react'
import { kr } from '../kernel/format'

// A number that settles into place — change is perceived, not discovered.
export function NumberTicker({ value, duration = 500 }: { value: number; duration?: number }) {
  const [shown, setShown] = useState(value)
  const prev = useRef(value)

  useEffect(() => {
    const from = prev.current
    prev.current = value
    if (from === value) return
    const t0 = performance.now()
    let raf = 0
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      setShown(Math.round(from + (value - from) * eased))
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [value, duration])

  return <span className="num">{kr(shown)}</span>
}
