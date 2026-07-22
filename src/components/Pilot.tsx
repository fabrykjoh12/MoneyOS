import { useState } from 'react'
import type { Rules } from '../kernel/types'
import { pilotCards, searchLedger } from '../kernel/engine'
import { dateShort, krFull } from '../kernel/format'
import { Sheet } from './Sheet'

const STARTERS = [
  'What did I spend on restaurants in March?',
  'Why is my Safe number lower this week?',
  'What did groceries cost in June?',
]

export function PilotSheet({ rules, onClose, onToast }: { rules: Rules; onClose: () => void; onToast: (m: string) => void }) {
  const [q, setQ] = useState('')
  const [answer, setAnswer] = useState<{ text: string; rows?: { m: string; a: string }[] } | null>(null)
  const cards = pilotCards(rules)

  const ask = (query: string) => {
    setQ(query)
    if (/why.*safe/i.test(query)) {
      setAnswer({
        text: 'Your Safe number is carrying two predicted bills this cycle — Tibber (~1,242 kr at your “balanced” strictness) and the Storytel trial converting in 5 days. Both sit in the derivation; tap the big number any time to see the receipt.',
      })
      return
    }
    const r = searchLedger(query)
    if (r.txns.length === 0) {
      setAnswer({ text: `I looked through the ledger and found nothing matching “${query}”. Try a merchant, a category, or a month.` })
      return
    }
    setAnswer({
      text: `${r.label[0].toUpperCase()}${r.label.slice(1)}: ${krFull(r.total)} across ${r.txns.length} transactions.`,
      rows: r.txns.slice(0, 5).map((t) => ({ m: `${t.merchant} · ${dateShort(new Date(t.date))}`, a: krFull(-t.amount) })),
    })
  }

  return (
    <Sheet onClose={onClose}>
      <h2>Pilot</h2>
      <p className="sub">Proactive when it matters, quiet otherwise. Every figure comes from the Kernel — never a guess.</p>

      <span className="label" style={{ display: 'block', marginBottom: 10 }}>
        Briefing
      </span>
      {cards.map((c) => (
        <div className="pilot-card" style={{ marginBottom: 10 }} key={c.id}>
          <p>{c.text}</p>
          {c.detail && <p style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>{c.detail}</p>}
          <div className="actions">
            <button className="btn subtle" onClick={() => onToast('Done — the Kernel has applied it.')}>
              {c.action}
            </button>
            <button className="btn ghost" onClick={() => onToast('Dismissed. Pilot won’t repeat itself.')}>
              Not now
            </button>
          </div>
        </div>
      ))}

      <span className="label" style={{ display: 'block', margin: '20px 0 10px' }}>
        Ask your ledger
      </span>
      {STARTERS.map((s) => (
        <button className="pilot-q" key={s} onClick={() => ask(s)}>
          {s}
        </button>
      ))}
      <div className="pilot-input">
        <input
          placeholder="Ask anything about your money…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && q.trim() && ask(q)}
        />
        <button className="btn" onClick={() => q.trim() && ask(q)}>
          Ask
        </button>
      </div>

      {answer && (
        <div className="pilot-answer">
          {answer.text}
          {answer.rows && (
            <div style={{ marginTop: 10 }}>
              {answer.rows.map((r) => (
                <div className="drow" key={r.m} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 13 }}>
                  <span style={{ color: 'var(--ink-2)' }}>{r.m}</span>
                  <span className="num">{r.a}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Sheet>
  )
}
