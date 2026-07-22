import { useMemo, useState } from 'react'
import { accounts, commitments, subscriptionInsights } from '../kernel/data'
import { ledger } from '../kernel/engine'
import { dateShort, kr, signedKr } from '../kernel/format'

type Sub = 'accounts' | 'activity' | 'subscriptions'

const FLAG_CLASS: Record<string, string> = { 'price-rise': 'rise', duplicate: 'dup', unused: 'unused', 'trial-ends': 'trial', annual: 'trial' }
const FLAG_TEXT: Record<string, string> = {
  'price-rise': 'Price rise',
  duplicate: 'Duplicate',
  unused: 'Unused?',
  'trial-ends': 'Trial ending',
  annual: 'Annual renewal',
}

export function Money({ onSimulate, onToast }: { onSimulate: () => void; onToast: (m: string) => void }) {
  const [sub, setSub] = useState<Sub>('accounts')
  const net = accounts.reduce((a, b) => a + b.balance, 0)

  const days = useMemo(() => {
    const byDay = new Map<string, typeof ledger>()
    for (const t of ledger.slice(0, 60)) {
      const arr = byDay.get(t.date) ?? []
      arr.push(t)
      byDay.set(t.date, arr)
    }
    return [...byDay.entries()]
  }, [])

  const subs = commitments.filter((c) => c.kind === 'subscription')
  const yearTotal = subs.reduce((a, s) => a + s.amount * 12, 0)

  return (
    <div className="screen">
      <div className="header">
        <h1 className="title">Money</h1>
      </div>

      <span className="label">Net worth</span>
      <div className="networth num" style={{ marginTop: 6 }}>
        {kr(net)} kr
      </div>

      <div className="seg" role="tablist">
        {(['accounts', 'activity', 'subscriptions'] as Sub[]).map((s) => (
          <button key={s} className={sub === s ? 'on' : ''} onClick={() => setSub(s)}>
            {s === 'subscriptions' ? 'Subs' : s[0].toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {sub === 'accounts' &&
        accounts.map((a) => (
          <div className="row account-row" key={a.id}>
            <div>
              <div className="name">{a.name}</div>
              <div className="meta">
                {a.bank} · {a.kind}
                {a.kind === 'checking' && <span className="split"> · 15,930 committed / 3,000 buffer</span>}
              </div>
            </div>
            <div className="amt num">{signedKr(a.balance)} kr</div>
          </div>
        ))}

      {sub === 'activity' &&
        days.map(([date, txns]) => (
          <div className="day-group" key={date}>
            <span className="label">{dateShort(new Date(date))}</span>
            {txns.map((t) => (
              <div className="row" key={t.id}>
                <div>
                  <div className="name">{t.merchant}</div>
                  <div className="meta">{t.category} · auto-categorized — tap to correct</div>
                </div>
                <div className={`amt num${t.amount > 0 ? ' in' : ''}`}>{signedKr(t.amount)} kr</div>
              </div>
            ))}
          </div>
        ))}

      {sub === 'subscriptions' && (
        <>
          <div className="meta" style={{ padding: '4px 0 8px', fontSize: 13 }}>
            {subs.length} recurring · <span className="num">{kr(yearTotal)}</span> kr/yr — the yearly number is the honest one.
          </div>
          {subs.map((s) => {
            const insight = subscriptionInsights.find((i) => i.commitmentId === s.id)
            return (
              <div className="row" key={s.id}>
                <div>
                  <div className="name">{s.name}</div>
                  <div className="meta num">
                    {kr(s.amount)} kr/mo · {kr(s.amount * 12)} kr/yr · day {s.dayOfMonth}
                  </div>
                  {insight && (
                    <>
                      <span className={`flag ${FLAG_CLASS[insight.kind]}`}>{FLAG_TEXT[insight.kind]}</span>
                      <div className="meta" style={{ marginTop: 3 }}>{insight.text}</div>
                    </>
                  )}
                </div>
                <button className="btn ghost" style={{ fontSize: 12.5 }} onClick={onSimulate}>
                  What if I cancel
                </button>
              </div>
            )
          })}
          <div className="section">
            <div className="meta" style={{ fontSize: 13, lineHeight: 1.5 }}>
              MoneyOS never takes a cut of what you save. Cancelling help is help, not a business model.
            </div>
          </div>
        </>
      )}
    </div>
  )
}
