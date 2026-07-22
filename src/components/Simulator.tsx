import { useState } from 'react'
import type { Goal, Reservation, Rules, Verdict } from '../kernel/types'
import { simulatePurchase } from '../kernel/engine'
import { dateShort, krFull, signedKr } from '../kernel/format'
import { KernelChip, Sheet } from './Sheet'

const SUGGESTIONS: [string, number][] = [
  ['PS5', 5990],
  ['Weekend in Bergen', 3200],
  ['New sofa', 14990],
  ['Concert tickets', 1180],
]

export function SimulatorSheet({
  rules,
  reservations,
  goalOrder,
  onReserve,
  onClose,
}: {
  rules: Rules
  reservations: Reservation[]
  goalOrder: Goal[]
  onReserve: (name: string, amount: number) => void
  onClose: () => void
}) {
  const [what, setWhat] = useState('')
  const [price, setPrice] = useState('')
  const [verdict, setVerdict] = useState<Verdict | null>(null)

  const run = (name: string, amount: number) => {
    if (!name || !amount) return
    setWhat(name)
    setPrice(String(amount))
    setVerdict(simulatePurchase(rules, reservations, name, amount, goalOrder))
  }

  return (
    <Sheet onClose={onClose}>
      <h2>What if I buy…</h2>
      <p className="sub">The Kernel forks your next 60 days and shows the difference. Nothing is spent.</p>

      <div className="sim-input">
        <input
          className="what"
          placeholder="A thing"
          value={what}
          onChange={(e) => setWhat(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && run(what, Number(price))}
        />
        <input
          className="price num"
          placeholder="kr"
          inputMode="numeric"
          value={price}
          onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, ''))}
          onKeyDown={(e) => e.key === 'Enter' && run(what, Number(price))}
        />
      </div>
      <div className="sim-suggest">
        {SUGGESTIONS.map(([n, p]) => (
          <button key={n} onClick={() => run(n, p)}>
            {n} · {p.toLocaleString('nb-NO')}
          </button>
        ))}
        {what && Number(price) > 0 && (
          <button style={{ color: 'var(--accent)', borderColor: 'var(--accent)' }} onClick={() => run(what, Number(price))}>
            Simulate →
          </button>
        )}
      </div>

      {verdict && (
        <div style={{ marginTop: 18 }}>
          <div className="verdict-head">
            <span className={`risk-dot ${verdict.level}`} />
            {verdict.headline}
          </div>
          <div className="verdict-rows derivation">
            <div className="drow">
              <span className="k">{verdict.name}</span>
              <span className="num">{signedKr(-verdict.price)}</span>
            </div>
            <div className="drow">
              <span className="k">Lowest point before recovery</span>
              <span className="num">
                {signedKr(verdict.nadirBefore)} → {signedKr(verdict.nadirAfter)}
              </span>
            </div>
            <div className="drow">
              <span className="k">{verdict.goalDelayName}</span>
              <span>+{verdict.goalDelayDays} days</span>
            </div>
            <div className="drow">
              <span className="k">Best day to buy</span>
              <span>
                {dateShort(verdict.bestDate)} — {verdict.bestDateWhy}
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
            <button
              className="btn"
              onClick={() => {
                onReserve(verdict.name, verdict.price)
                onClose()
              }}
            >
              Spend it — reserve {krFull(verdict.price)}
            </button>
            <button className="btn ghost" onClick={() => setVerdict(null)}>
              Clear
            </button>
          </div>
          <KernelChip />
        </div>
      )}
    </Sheet>
  )
}
