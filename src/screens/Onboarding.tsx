import { useEffect, useMemo, useState } from 'react'
import { revealLines, safeToSpend, suggestedBufferFloor } from '../kernel/engine'
import { defaultRules } from '../kernel/data'
import { kr } from '../kernel/format'
import { NumberTicker } from '../components/NumberTicker'

type Step = 'stress' | 'connect' | 'connecting' | 'reveal' | 'buffer' | 'notify'
const DOTS: Step[] = ['stress', 'connect', 'reveal', 'buffer', 'notify']

const STRESS_OPTIONS = [
  { id: 'runway', emoji: '⏳', title: 'Running out before payday', sub: 'The last week always feels tight' },
  { id: 'goals', emoji: '🗺', title: 'Big goals feel impossible', sub: 'Hard to see how you’d ever get there' },
  { id: 'unknown', emoji: '◌', title: 'Just not knowing', sub: 'You’re probably fine — but you can’t tell' },
]

const BANKS = ['DNB', 'Nordea', 'Sparebank 1', 'Handelsbanken', 'Danske Bank']

export function Onboarding({ onComplete }: { onComplete: (bufferFloor: number, stressChoice: string | null) => void }) {
  const [step, setStep] = useState<Step>('stress')
  const [stressChoice, setStressChoice] = useState<string | null>(null)
  const [bank, setBank] = useState<string | null>(null)
  const [bufferFloor, setBufferFloor] = useState(() => suggestedBufferFloor())
  const [revealDone, setRevealDone] = useState(false)

  const lines = useMemo(() => revealLines(), [])
  const safePreview = useMemo(() => safeToSpend({ ...defaultRules, bufferFloor }, []), [bufferFloor])

  useEffect(() => {
    if (step !== 'connecting') return
    const t = setTimeout(() => setStep('reveal'), 2100)
    return () => clearTimeout(t)
  }, [step])

  useEffect(() => {
    if (step !== 'reveal') return
    setRevealDone(false)
    const t = setTimeout(() => setRevealDone(true), lines.length * 160 + 500)
    return () => clearTimeout(t)
  }, [step, lines.length])

  const dotIndex = DOTS.indexOf(step === 'connecting' ? 'connect' : step)

  return (
    <div className="screen onboard">
      <div className="onboard-progress" aria-hidden="true">
        {DOTS.map((_, i) => (
          <span key={i} className={i === dotIndex ? 'on' : i < dotIndex ? 'done' : ''} />
        ))}
      </div>

      {step === 'stress' && (
        <>
          <h1 className="title" style={{ marginTop: 28, lineHeight: 1.15 }}>
            What does money stress
            <br />
            feel like for you?
          </h1>
          <p className="sub" style={{ marginTop: 8, marginBottom: 22 }}>
            This tunes how Pilot talks to you. Change it anytime.
          </p>
          {STRESS_OPTIONS.map((o) => (
            <button
              key={o.id}
              className="stress-card"
              onClick={() => {
                setStressChoice(o.id)
                setStep('connect')
              }}
            >
              <span className="emoji">{o.emoji}</span>
              <span>
                <span className="stress-title">{o.title}</span>
                <span className="stress-sub">{o.sub}</span>
              </span>
            </button>
          ))}
          <button className="btn ghost" style={{ marginTop: 'auto', alignSelf: 'center' }} onClick={() => setStep('connect')}>
            Skip
          </button>
        </>
      )}

      {step === 'connect' && (
        <>
          <h1 className="title" style={{ marginTop: 28 }}>
            Connect a bank
          </h1>
          <p className="sub" style={{ marginTop: 8, marginBottom: 22 }}>
            Read-only, via Open Banking. MoneyOS never holds your bank password, and can't move money.
          </p>
          {BANKS.map((b) => (
            <button
              key={b}
              className="bank-row"
              onClick={() => {
                setBank(b)
                setStep('connecting')
              }}
            >
              <span className="bank-mark">{b[0]}</span>
              {b}
              <span className="chev">›</span>
            </button>
          ))}
          <button className="btn ghost" style={{ marginTop: 'auto', alignSelf: 'center' }} onClick={() => setStep('connecting')}>
            I'll add accounts later
          </button>
        </>
      )}

      {step === 'connecting' && (
        <div className="connecting">
          <div className="spinner" />
          <p className="connecting-line" style={{ animationDelay: '0ms' }}>
            {bank ? `Talking to ${bank}…` : 'Reading your last 12 months…'}
          </p>
          <p className="connecting-line" style={{ animationDelay: '700ms' }}>
            The Ledger records what happened.
          </p>
          <p className="connecting-line" style={{ animationDelay: '1400ms' }}>
            The Kernel is about to project what's next.
          </p>
        </div>
      )}

      {step === 'reveal' && (
        <>
          <h1 className="title" style={{ marginTop: 20 }}>
            Built from your last 12 months
          </h1>
          <div className="reveal-lines">
            {lines.map((l, i) => (
              <div className="reveal-line" style={{ animationDelay: `${i * 160}ms` }} key={l.label}>
                <span className="rl-label">{l.label}</span>
                <span className="rl-detail">{l.detail}</span>
              </div>
            ))}
          </div>
          <div className={`reveal-total${revealDone ? ' shown' : ''}`}>
            <div className="hero-label">Safe to spend, right now</div>
            <div className="hero-number">
              <NumberTicker value={revealDone ? safePreview.total : 0} duration={700} />
              <span className="cur">kr</span>
            </div>
          </div>
          {revealDone && (
            <button className="btn" style={{ marginTop: 24 }} onClick={() => setStep('buffer')}>
              Continue
            </button>
          )}
        </>
      )}

      {step === 'buffer' && (
        <>
          <h1 className="title" style={{ marginTop: 28 }}>
            Your safety floor
          </h1>
          <p className="sub" style={{ marginTop: 8, marginBottom: 28 }}>
            The Kernel will never call money "safe to spend" below this line. Suggested from your bills — adjust if you'd like.
          </p>
          <div className="buffer-preview num">{kr(bufferFloor)} kr</div>
          <input
            className="buffer-slider"
            type="range"
            min={1000}
            max={8000}
            step={250}
            value={bufferFloor}
            onChange={(e) => setBufferFloor(Number(e.target.value))}
            aria-label="Buffer floor in kroner"
          />
          <div className="meta" style={{ textAlign: 'center', marginTop: 14 }}>
            With this floor, you'd be safe to spend <strong className="num">{kr(safePreview.total)} kr</strong> right now.
          </div>
          <button className="btn" style={{ marginTop: 'auto' }} onClick={() => setStep('notify')}>
            Confirm
          </button>
        </>
      )}

      {step === 'notify' && (
        <>
          <div style={{ flex: 1 }} />
          <div className="notify-icon">✦</div>
          <h1 className="title" style={{ textAlign: 'center', marginTop: 18 }}>
            We'll only speak up
            <br />
            when it matters
          </h1>
          <p className="sub" style={{ textAlign: 'center', marginTop: 8 }}>
            A few times a month, usually — only when your future actually changes.
          </p>
          <div style={{ flex: 1 }} />
          <button className="btn" onClick={() => onComplete(bufferFloor, stressChoice)}>
            Enable notifications
          </button>
          <button className="btn ghost" style={{ alignSelf: 'center', marginTop: 6 }} onClick={() => onComplete(bufferFloor, stressChoice)}>
            Not now
          </button>
        </>
      )}
    </div>
  )
}
