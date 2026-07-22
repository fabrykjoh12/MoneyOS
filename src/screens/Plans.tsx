import { useRef, useState } from 'react'
import { describeScenario, goalSchedule } from '../kernel/engine'
import type { Goal, Scenario } from '../kernel/types'
import { dateReady, kr } from '../kernel/format'

const ROW = 96 // card height + gap, for drag math

export function Plans({
  goals,
  scenarios,
  onReorder,
  onOpenScenario,
  onNewScenario,
}: {
  goals: Goal[]
  scenarios: Scenario[]
  onReorder: (next: Goal[]) => void
  onOpenScenario: (id: string) => void
  onNewScenario: () => void
}) {
  const plans = goalSchedule(goals)
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dy, setDy] = useState(0)
  const startY = useRef(0)
  const [consequence, setConsequence] = useState<string | null>(null)

  const beginDrag = (i: number, clientY: number) => {
    setDragIdx(i)
    startY.current = clientY
    setDy(0)
  }

  const moveDrag = (clientY: number) => {
    if (dragIdx === null) return
    const delta = clientY - startY.current
    setDy(delta)
    const shift = Math.round(delta / ROW)
    const target = Math.max(0, Math.min(goals.length - 1, dragIdx + shift))
    if (target !== dragIdx) {
      const before = goalSchedule(goals)
      const next = [...goals]
      const [g] = next.splice(dragIdx, 1)
      next.splice(target, 0, g)
      onReorder(next)
      const after = goalSchedule(next)
      // narrate the biggest loser of the reshuffle
      let worst: { name: string; days: number } | null = null
      for (const a of after) {
        const b = before.find((p) => p.goal.id === a.goal.id)!
        if (a.readyDate && b.readyDate) {
          const days = Math.round((a.readyDate.getTime() - b.readyDate.getTime()) / 86400000)
          if (days > 0 && (!worst || days > worst.days)) worst = { name: a.goal.name, days }
        }
      }
      setConsequence(
        worst
          ? `${worst.name} slips ${worst.days >= 14 ? `${Math.round(worst.days / 7)} weeks` : `${worst.days} days`}. Every date below just recalculated.`
          : 'Every date just recalculated — nothing got slower.',
      )
      startY.current += (target - dragIdx) * ROW
      setDy(clientY - startY.current)
      setDragIdx(target)
    }
  }

  const endDrag = () => {
    setDragIdx(null)
    setDy(0)
  }

  return (
    <div className="screen" onPointerMove={(e) => moveDrag(e.clientY)} onPointerUp={endDrag} onPointerCancel={endDrag}>
      <div className="header">
        <h1 className="title">Plans</h1>
      </div>

      <div className="consequence" aria-live="polite">
        {consequence ?? 'Drag to reprioritize — goals compete for the same 6,000 kr monthly sweep, in this order.'}
      </div>

      {plans.map((p, i) => {
        const pct = Math.min(100, (p.goal.saved / p.goal.target) * 100)
        return (
          <div
            key={p.goal.id}
            className={`goal-card${dragIdx === i ? ' dragging' : ''}`}
            style={dragIdx === i ? { transform: `translateY(${dy}px) scale(1.03)`, transition: 'none' } : undefined}
          >
            <span
              className="grip"
              onPointerDown={(e) => {
                ;(e.target as Element).setPointerCapture?.(e.pointerId)
                beginDrag(i, e.clientY)
              }}
              role="button"
              aria-label={`Reorder ${p.goal.name}, currently priority ${i + 1}`}
            >
              ≡
            </span>
            <div className="body">
              <div className="top">
                <span className="gname">
                  {i + 1} · {p.goal.emoji} {p.goal.name}
                </span>
                <span className="ready">{p.readyDate ? `ready ${dateReady(p.readyDate)}` : 'waiting'}</span>
              </div>
              <div className="pace">
                <div className="fill" style={{ width: `${pct}%` }} />
              </div>
              <div className="nums num">
                {kr(p.goal.saved)} / {kr(p.goal.target)} kr
                {p.monthly > 0 ? ` · ${kr(p.monthly)} kr/mo` : ' · funded after the goals above'}
              </div>
            </div>
          </div>
        )
      })}

      <div className="section">
        <span className="label">Scenarios — your Twin</span>
        {scenarios.length === 0 && (
          <div className="meta" style={{ padding: '10px 0' }}>
            No saved worlds yet. Try "what if I moved?" or "what if I lost my job?"
          </div>
        )}
        {scenarios.map((s) => {
          const { headline, detail } = describeScenario(goals, s)
          return (
            <div
              className="row"
              key={s.id}
              onClick={() => onOpenScenario(s.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && onOpenScenario(s.id)}
              style={{ cursor: 'pointer' }}
            >
              <div>
                <div className="name">{s.name}</div>
                <div className="meta">
                  {headline} · {detail} — saved world, always current
                </div>
              </div>
              <span className="meta">›</span>
            </div>
          )
        })}
      </div>

      <div className="section">
        <button className="btn" onClick={onNewScenario}>
          ＋ New what-if
        </button>
      </div>
    </div>
  )
}
