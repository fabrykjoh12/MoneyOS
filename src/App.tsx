import { useEffect, useMemo, useState } from 'react'
import { initialGoals, safeToSpend, steadyScore, goalSchedule } from './kernel/engine'
import { defaultRules } from './kernel/data'
import type { Goal, Reservation } from './kernel/types'
import { Today } from './screens/Today'
import { HorizonView } from './screens/HorizonView'
import { Plans } from './screens/Plans'
import { Money } from './screens/Money'
import { PilotSheet } from './components/Pilot'
import { DerivationSheet } from './components/Derivation'
import { SimulatorSheet } from './components/Simulator'
import { ScoreSheet } from './components/ScoreSheet'

type Tab = 'today' | 'horizon' | 'plans' | 'money'
type SheetKind = null | 'why' | 'simulator' | 'pilot' | 'score'

const ICONS: Record<Tab, JSX.Element> = {
  today: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  ),
  horizon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
      <path d="M3 16.5c3.2 0 4.4-6.5 7.5-6.5s4 4.2 7 4.2c1.5 0 2.4-.7 3.5-1.7" />
      <path d="M3 20h18" opacity="0.45" />
    </svg>
  ),
  plans: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 21V4" />
      <path d="M6 5h11l-2.5 3.5L17 12H6" />
    </svg>
  ),
  money: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
      <rect x="3.5" y="6" width="17" height="12.5" rx="3" />
      <path d="M3.5 10.5h17" />
    </svg>
  ),
}

export default function App() {
  const [tab, setTab] = useState<Tab>('today')
  const [sheet, setSheet] = useState<SheetKind>(null)
  const [goals, setGoals] = useState<Goal[]>(initialGoals)
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [discreet, setDiscreet] = useState(false)
  const [dark, setDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
  const [toast, setToast] = useState<string | null>(null)
  const rules = defaultRules

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  }, [dark])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2600)
    return () => clearTimeout(t)
  }, [toast])

  const safe = useMemo(() => safeToSpend(rules, reservations), [rules, reservations])
  const score = useMemo(() => steadyScore(rules), [rules])
  const plans = useMemo(() => goalSchedule(goals), [goals])

  const reserve = (name: string, amount: number) => {
    setReservations((r) => [...r, { id: `${Date.now()}`, name, amount }])
    setToast(`Reserved — your Safe number already knows.`)
  }

  return (
    <div className={`phone${discreet ? ' discreet' : ''}`}>
      {tab === 'today' && (
        <Today
          safe={safe}
          rules={rules}
          score={score.total}
          goalPlans={plans}
          discreet={discreet}
          onWhy={() => setSheet('why')}
          onScore={() => setSheet('score')}
          onSimulate={() => setSheet('simulator')}
          onToggleDiscreet={() => setDiscreet((d) => !d)}
          onToggleTheme={() => setDark((d) => !d)}
          onToast={setToast}
        />
      )}
      {tab === 'horizon' && (
        <HorizonView rules={rules} reservations={reservations} onSimulate={() => setSheet('simulator')} onToast={setToast} />
      )}
      {tab === 'plans' && <Plans goals={goals} onReorder={setGoals} onSimulate={() => setSheet('simulator')} />}
      {tab === 'money' && <Money onSimulate={() => setSheet('simulator')} onToast={setToast} />}

      <button className="pilot-orb breathing" onClick={() => setSheet('pilot')} aria-label="Open Pilot">
        ✦
      </button>

      <nav className="tabbar">
        {(['today', 'horizon', 'plans', 'money'] as Tab[]).map((t) => (
          <button key={t} className={`tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
            {ICONS[t]}
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </nav>

      {sheet === 'why' && <DerivationSheet safe={safe} reservations={reservations} onClose={() => setSheet(null)} />}
      {sheet === 'simulator' && (
        <SimulatorSheet
          rules={rules}
          reservations={reservations}
          goalOrder={goals}
          onReserve={reserve}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === 'pilot' && <PilotSheet rules={rules} onClose={() => setSheet(null)} onToast={setToast} />}
      {sheet === 'score' && <ScoreSheet score={score} onClose={() => setSheet(null)} />}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
