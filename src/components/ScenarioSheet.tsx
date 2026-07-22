import { useState } from 'react'
import type { Goal, Scenario } from '../kernel/types'
import { describeScenario } from '../kernel/engine'
import { dateReady, kr } from '../kernel/format'
import { KernelChip, Sheet } from './Sheet'

const PRESETS: { label: string; incomeDelta: number; recurringDelta: number; name: string }[] = [
  { label: 'Move city', incomeDelta: 0, recurringDelta: 3400, name: 'Move to a pricier place' },
  { label: 'Drop to 80%', incomeDelta: -8500, recurringDelta: 0, name: 'Drop to 80% hours' },
  { label: 'Job loss', incomeDelta: -42500, recurringDelta: 0, name: 'If income stopped today' },
]

export function ScenarioSheet({
  goals,
  existing,
  onSave,
  onDelete,
  onClose,
}: {
  goals: Goal[]
  existing: Scenario | null
  onSave: (s: Scenario) => void
  onDelete?: (id: string) => void
  onClose: () => void
}) {
  const [name, setName] = useState(existing?.name ?? '')
  const [incomeDelta, setIncomeDelta] = useState(existing?.incomeDelta ?? 0)
  const [recurringDelta, setRecurringDelta] = useState(existing?.recurringDelta ?? 0)

  const draft: Scenario = {
    id: existing?.id ?? `s-${Date.now()}`,
    name: name.trim() || 'Untitled what-if',
    incomeDelta,
    recurringDelta,
  }
  const { headline, detail, impact } = describeScenario(goals, draft)

  return (
    <Sheet onClose={onClose}>
      <h2>{existing ? existing.name : 'New what-if'}</h2>
      <p className="sub">A saved world in your Twin — it stays live as your real numbers change.</p>

      {!existing && (
        <>
          <input className="scenario-name" placeholder="Name this scenario" value={name} onChange={(e) => setName(e.target.value)} />
          <div className="sim-suggest" style={{ marginTop: 10 }}>
            {PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => {
                  setIncomeDelta(p.incomeDelta)
                  setRecurringDelta(p.recurringDelta)
                  if (!name.trim()) setName(p.name)
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="scenario-field">
            <span>Income changes by</span>
            <input type="number" step={100} className="num" value={incomeDelta} onChange={(e) => setIncomeDelta(Number(e.target.value) || 0)} />
          </div>
          <div className="scenario-field">
            <span>Costs change by</span>
            <input type="number" step={100} className="num" value={recurringDelta} onChange={(e) => setRecurringDelta(Number(e.target.value) || 0)} />
          </div>
        </>
      )}

      <div className="verdict-rows derivation" style={{ marginTop: 18 }}>
        <div className="drow">
          <span className="k">Monthly surplus</span>
          <span className="num">
            {kr(impact.monthlySurplusBefore)} → {kr(impact.monthlySurplusAfter)} kr
          </span>
        </div>
        {impact.isIncomeStop ? (
          <div className="drow">
            <span className="k">Runway</span>
            <span>
              {impact.runwayMonths!.toFixed(1)} months — until {dateReady(impact.runwayDate!)}
            </span>
          </div>
        ) : (
          impact.goalPlans.map((p) => (
            <div className="drow" key={p.goal.id}>
              <span className="k">
                {p.goal.emoji} {p.goal.name}
              </span>
              <span>{p.readyDate ? dateReady(p.readyDate) : 'on hold'}</span>
            </div>
          ))
        )}
      </div>
      <div className="meta" style={{ padding: '10px 2px 4px' }}>
        {headline}
        {detail ? ` · ${detail}` : ''}
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
        <button className="btn" onClick={() => onSave(draft)}>
          {existing ? 'Save changes' : 'Save scenario'}
        </button>
        {existing && onDelete && (
          <button className="btn ghost" onClick={() => onDelete(existing.id)}>
            Remove
          </button>
        )}
      </div>
      <KernelChip />
    </Sheet>
  )
}
