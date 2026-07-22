import type { GoalPlan } from '../kernel/engine'
import { pilotCards } from '../kernel/engine'
import type { Rules, SafeBreakdown } from '../kernel/types'
import { dateReady, dateShort, kr } from '../kernel/format'
import { NumberTicker } from '../components/NumberTicker'
import { ScoreRing } from '../components/ScoreRing'

const todayFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long' })

export function Today({
  safe,
  rules,
  score,
  goalPlans,
  discreet,
  onWhy,
  onScore,
  onSimulate,
  onToggleDiscreet,
  onToggleTheme,
  onToast,
}: {
  safe: SafeBreakdown
  rules: Rules
  score: number
  goalPlans: GoalPlan[]
  discreet: boolean
  onWhy: () => void
  onScore: () => void
  onSimulate: () => void
  onToggleDiscreet: () => void
  onToggleTheme: () => void
  onToast: (m: string) => void
}) {
  const card = pilotCards(rules)[0]
  const tight = safe.total < 1500

  return (
    <div className="screen">
      <div className="header">
        <span className="date">{todayFmt.format(new Date())}</span>
        <div className="header-actions">
          <button className="icon-btn" onClick={onToggleDiscreet} aria-label="Discreet mode" title="Discreet mode">
            {discreet ? '◌' : '◉'}
          </button>
          <button className="icon-btn" onClick={onToggleTheme} aria-label="Theme" title="Light / dark">
            ◐
          </button>
          <ScoreRing score={score} onClick={onScore} />
        </div>
      </div>

      <div className="hero-label">Safe to spend</div>
      <div
        className={`hero-number${tight ? ' tight' : ''}`}
        onClick={onWhy}
        role="button"
        tabIndex={0}
        aria-label={`Safe to spend ${kr(safe.total)} kroner. Tap to see why.`}
      >
        <NumberTicker value={safe.total} />
        <span className="cur">kr</span>
      </div>
      <div className="hero-sub">
        until payday · {safe.daysToPayday} {safe.daysToPayday === 1 ? 'day' : 'days'} · tap the number to see why
      </div>

      <div className="row" style={{ marginTop: 18 }}>
        <div>
          <div className="name">Today’s share</div>
          <div className="meta">an even pace to {dateShort(safe.paydayDate)}</div>
        </div>
        <div className="amt num">{kr(safe.todayShare)} kr</div>
      </div>
      <div className="row">
        <div>
          <div className="name">What if I buy…</div>
          <div className="meta">simulate anything before you spend</div>
        </div>
        <button className="btn subtle" onClick={onSimulate}>
          Simulate
        </button>
      </div>

      <div className="section">
        <span className="label">Up next</span>
        {safe.billItems.slice(0, 4).map((b) => (
          <div className="row" key={b.name}>
            <div>
              <div className="name">{b.name}</div>
              <div className="meta">{dateShort(b.date)}</div>
            </div>
            <div className="amt num">
              {b.predicted && <span className="approx">~</span>}
              {kr(b.amount)} kr
            </div>
          </div>
        ))}
        {safe.billItems.length === 0 && (
          <div className="meta" style={{ padding: '10px 0' }}>
            Nothing due before payday. The month is already handled.
          </div>
        )}
      </div>

      <div className="section">
        <span className="label">Plans</span>
        {goalPlans.slice(0, 2).map((p) => (
          <div key={p.goal.id} style={{ padding: '10px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14.5, fontWeight: 600 }}>
              <span>
                {p.goal.emoji} {p.goal.name}
              </span>
              <span className="meta">{p.readyDate ? `ready ${dateReady(p.readyDate)}` : 'on hold'}</span>
            </div>
            <div className="pace">
              <div className="fill" style={{ width: `${Math.min(100, (p.goal.saved / p.goal.target) * 100)}%` }} />
              <div className="notch" style={{ left: '62%' }} />
            </div>
          </div>
        ))}
      </div>

      {card && (
        <div className="section">
          <div className="pilot-card">
            <p>✦ {card.text}</p>
            <div className="actions">
              <button className="btn subtle" onClick={() => onToast('Moved. Japan just got closer.')}>
                {card.action}
              </button>
              <button className="btn ghost" onClick={() => onToast('Okay — Pilot stays quiet.')}>
                Not now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
