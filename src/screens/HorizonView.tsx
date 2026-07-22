import { useMemo, useRef, useState } from 'react'
import { horizon, findDip } from '../kernel/engine'
import type { DayPoint, Reservation, Rules } from '../kernel/types'
import { dateLong, dateShort, kr, signedKr } from '../kernel/format'

const RANGES = [30, 60, 90, 180, 365]
const W = 354
const H = 190

function path(points: DayPoint[], pick: (p: DayPoint) => number, x: (i: number) => number, y: (v: number) => number): string {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(pick(p)).toFixed(1)}`).join(' ')
}

export function HorizonView({
  rules,
  reservations,
  onSimulate,
  onToast,
}: {
  rules: Rules
  reservations: Reservation[]
  onSimulate: () => void
  onToast: (m: string) => void
}) {
  const [range, setRange] = useState(90)
  const points = useMemo(() => horizon(rules, { days: range, reservations }), [rules, reservations, range])
  const [idx, setIdx] = useState(Math.min(21, range - 1))
  const svgRef = useRef<SVGSVGElement>(null)

  const lo = Math.min(...points.map((p) => p.lo)) - 1500
  const hi = Math.max(...points.map((p) => p.hi)) + 1500
  const x = (i: number) => (i / (points.length - 1)) * W
  const y = (v: number) => H - ((v - lo) / (hi - lo)) * H

  const sel = points[Math.min(idx, points.length - 1)]
  const dip = findDip(points.slice(0, 90), rules.bufferFloor)

  const scrub = (clientX: number) => {
    const rect = svgRef.current!.getBoundingClientRect()
    const rel = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    setIdx(Math.round(rel * (points.length - 1)))
  }

  const weekEvents = points
    .slice(Math.max(0, idx - 3), Math.min(points.length, idx + 4))
    .flatMap((p) => p.events.map((e) => ({ ...e, date: p.date })))

  const band = `${path(points, (p) => p.hi, x, y)} ${points
    .slice()
    .reverse()
    .map((p, i) => `L${x(points.length - 1 - i).toFixed(1)},${y(p.lo).toFixed(1)}`)
    .join(' ')} Z`

  return (
    <div className="screen">
      <div className="header">
        <h1 className="title">Horizon</h1>
      </div>

      <div className="range-picker" role="tablist">
        {RANGES.map((r) => (
          <button key={r} className={r === range ? 'on' : ''} onClick={() => { setRange(r); setIdx(Math.min(idx, r - 1)) }}>
            {r}d
          </button>
        ))}
      </div>

      <div className="chart-wrap">
        <svg
          ref={svgRef}
          width="100%"
          viewBox={`0 0 ${W} ${H + 18}`}
          onPointerDown={(e) => { (e.target as Element).setPointerCapture?.(e.pointerId); scrub(e.clientX) }}
          onPointerMove={(e) => e.buttons > 0 && scrub(e.clientX)}
          aria-label={`Projected balance over the next ${range} days. ${dip ? `Dips below your buffer around ${dateShort(dip.date)}.` : 'Stays above your buffer the whole way.'}`}
        >
          <path d={band} fill="var(--accent)" opacity="0.08" />
          {/* buffer floor */}
          <line x1="0" x2={W} y1={y(rules.bufferFloor)} y2={y(rules.bufferFloor)} stroke="var(--line)" strokeDasharray="3 4" />
          {/* zero line */}
          {lo < 0 && <line x1="0" x2={W} y1={y(0)} y2={y(0)} stroke="var(--risk)" strokeDasharray="2 4" opacity="0.5" />}
          <path d={path(points, (p) => p.balance, x, y)} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" />
          {/* event markers */}
          {points.map((p, i) =>
            p.events.length > 0 ? (
              <circle
                key={i}
                cx={x(i)}
                cy={H + 12}
                r="2.2"
                fill={p.events.some((e) => e.kind === 'income') ? 'var(--good)' : 'var(--ink-3)'}
                opacity={p.events.some((e) => e.predicted) ? 0.5 : 1}
              />
            ) : null,
          )}
          {/* scrubber */}
          <line x1={x(idx)} x2={x(idx)} y1="0" y2={H} stroke="var(--ink)" strokeWidth="1" opacity="0.6" />
          <circle cx={x(idx)} cy={y(sel.balance)} r="4.5" fill="var(--ink)" stroke="var(--paper)" strokeWidth="2" />
        </svg>
      </div>

      <div className="readout">
        <span className="label">● {dateLong(sel.date)}</span>
        <div className="big num" style={{ marginTop: 6 }}>
          {kr(sel.balance)} kr
        </div>
        <div className="conf num">
          ± {kr(Math.round((sel.hi - sel.lo) / 2))} · 80% confident · hollow marks are predictions
        </div>
        <div className="week">
          {weekEvents.length > 0 ? (
            <>
              That week:{' '}
              {weekEvents
                .slice(0, 4)
                .map((e) => `${e.label.split('—')[0].trim()} ${signedKr(e.amount)}`)
                .join(' · ')}
            </>
          ) : (
            'A quiet week — just everyday spending.'
          )}
        </div>
      </div>

      {dip ? (
        <div className="section">
          <div className="pilot-card">
            <p>
              ✦ Dips to {kr(dip.balance)} kr around {dateShort(dip.date)} — below your {kr(rules.bufferFloor)} kr buffer. Moving the goal
              sweep 4 days later clears it.
            </p>
            <div className="actions">
              <button className="btn subtle" onClick={() => onToast('Sweep moved. The dip is gone.')}>
                Fix it
              </button>
              <button className="btn ghost" onClick={() => onToast('Left as is — Horizon keeps watching.')}>
                Leave it
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="section">
          <div className="meta" style={{ color: 'var(--ink-2)', fontSize: 13.5, lineHeight: 1.5 }}>
            No day in this range crosses your buffer. Predictions render hollow and the band widens with distance — an honest future, not
            a precise-looking guess.
          </div>
        </div>
      )}

      <div className="section">
        <button className="btn" onClick={onSimulate}>
          ＋ What if…
        </button>
      </div>
    </div>
  )
}
