import type { Reservation, SafeBreakdown } from '../kernel/types'
import { dateShort, krFull, signedKr } from '../kernel/format'
import { KernelChip, Sheet } from './Sheet'

// The "Why?" sheet — every number in MoneyOS can explain itself.
export function DerivationSheet({
  safe,
  reservations,
  onClose,
}: {
  safe: SafeBreakdown
  reservations: Reservation[]
  onClose: () => void
}) {
  return (
    <Sheet onClose={onClose}>
      <h2>Why {krFull(safe.total)}?</h2>
      <p className="sub">Everything between now and payday on {dateShort(safe.paydayDate)}, already accounted for.</p>
      <div className="derivation">
        <div className="drow">
          <span className="k">Available on Brukskonto</span>
          <span className="num">{signedKr(safe.available)}</span>
        </div>
        <div className="drow">
          <span className="k">Bills before payday</span>
          <span className="num">{signedKr(-safe.bills)}</span>
        </div>
        {safe.billItems.map((b) => (
          <div className="drow indent" key={b.name + b.date.toISOString()}>
            <span className="k">
              {b.name} · {dateShort(b.date)}
              {b.predicted ? ' · predicted' : ''}
            </span>
            <span className="num">{signedKr(-b.amount)}</span>
          </div>
        ))}
        {safe.goals > 0 && (
          <div className="drow">
            <span className="k">Committed to goals</span>
            <span className="num">{signedKr(-safe.goals)}</span>
          </div>
        )}
        {safe.reserved > 0 && (
          <div className="drow">
            <span className="k">Reserved purchases</span>
            <span className="num">{signedKr(-safe.reserved)}</span>
          </div>
        )}
        {reservations.map((r) => (
          <div className="drow indent" key={r.id}>
            <span className="k">{r.name}</span>
            <span className="num">{signedKr(-r.amount)}</span>
          </div>
        ))}
        <div className="drow">
          <span className="k">Buffer floor — your rule</span>
          <span className="num">{signedKr(-safe.buffer)}</span>
        </div>
        <div className="drow total">
          <span className="k">Safe to spend</span>
          <span className="num">{krFull(safe.total)}</span>
        </div>
      </div>
      <KernelChip />
    </Sheet>
  )
}
