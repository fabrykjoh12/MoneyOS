import type { Score } from '../kernel/types'
import { KernelChip, Sheet } from './Sheet'

export function ScoreSheet({ score, onClose }: { score: Score; onClose: () => void }) {
  return (
    <Sheet onClose={onClose}>
      <h2>
        Steady Score — <span className="num">{score.total}</span>
      </h2>
      <p className="sub">Six measurements, each explaining itself. It moves slowly by design — this is health, not a slot machine.</p>
      <div className="score-bars">
        {score.components.map((c) => (
          <div className="comp" key={c.key}>
            <div className="head">
              <span>{c.label}</span>
              <span className="num">
                {c.score} <span style={{ color: 'var(--ink-3)', fontWeight: 500 }}>· {c.weight}%</span>
              </span>
            </div>
            <div className="pace">
              <div className="fill" style={{ width: `${c.score}%` }} />
            </div>
            <div className="why">{c.why}</div>
            <div className="improve">→ {c.improve}</div>
          </div>
        ))}
      </div>
      <KernelChip />
    </Sheet>
  )
}
