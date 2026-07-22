import { useEffect, useMemo, useState } from 'react'
import { initialGoals, safeToSpend, steadyScore, goalSchedule } from './kernel/engine'
import { defaultRules, defaultScenarios } from './kernel/data'
import { loadState, saveState } from './kernel/persist'
import type { Goal, Reservation, Scenario } from './kernel/types'
import { Today } from './screens/Today'
import { HorizonView } from './screens/HorizonView'
import { Plans } from './screens/Plans'
import { Money } from './screens/Money'
import { Onboarding } from './screens/Onboarding'
import { PilotSheet } from './components/Pilot'
import { DerivationSheet } from './components/Derivation'
import { SimulatorSheet } from './components/Simulator'
import { ScoreSheet } from './components/ScoreSheet'
import { ScenarioSheet } from './components/ScenarioSheet'

type Tab = 'today' | 'horizon' | 'plans' | 'money'
type SheetKind = null | 'why' | 'simulator' | 'pilot' | 'score' | 'scenario'

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

function orderGoals(order: string[]): Goal[] {
  if (order.length === 0) return initialGoals
  const byId = new Map(initialGoals.map((g) => [g.id, g]))
  const ordered = order.map((id) => byId.get(id)).filter((g): g is Goal => !!g)
  const missing = initialGoals.filter((g) => !order.includes(g.id))
  return [...ordered, ...missing]
}

export default function App() {
  const initial = useMemo(() => loadState(), [])

  const [onboardingDone, setOnboardingDone] = useState(initial.onboardingDone)
  const [tab, setTab] = useState<Tab>('today')
  const [sheet, setSheet] = useState<SheetKind>(null)
  const [goals, setGoals] = useState<Goal[]>(() => orderGoals(initial.goalOrder))
  const [reservations, setReservations] = useState<Reservation[]>(initial.reservations)
  const [scenarios, setScenarios] = useState<Scenario[]>(initial.scenarios ?? defaultScenarios)
  const [scenarioEditingId, setScenarioEditingId] = useState<string | null>(null)
  const [bufferFloor, setBufferFloor] = useState(initial.bufferFloor)
  const [discreet, setDiscreet] = useState(initial.discreet)
  const [dark, setDark] = useState(() => initial.theme === 'dark' || (initial.theme === null && window.matchMedia('(prefers-color-scheme: dark)').matches))
  const [toast, setToast] = useState<string | null>(null)

  const rules = useMemo(() => ({ ...defaultRules, bufferFloor }), [bufferFloor])

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  }, [dark])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2600)
    return () => clearTimeout(t)
  }, [toast])

  // Persist on every change that matters — this is the whole of "sync" for now.
  useEffect(() => {
    saveState({
      onboardingDone,
      bufferFloor,
      goalOrder: goals.map((g) => g.id),
      reservations,
      scenarios,
      discreet,
      theme: dark ? 'dark' : 'light',
    })
  }, [onboardingDone, bufferFloor, goals, reservations, scenarios, discreet, dark])

  const safe = useMemo(() => safeToSpend(rules, reservations), [rules, reservations])
  const score = useMemo(() => steadyScore(rules), [rules])
  const plans = useMemo(() => goalSchedule(goals), [goals])

  const reserve = (name: string, amount: number) => {
    setReservations((r) => [...r, { id: `${Date.now()}`, name, amount }])
    setToast(`Reserved — your Safe number already knows.`)
  }

  if (!onboardingDone) {
    return (
      <div className="phone">
        <Onboarding
          onComplete={(floor, stressChoice) => {
            setBufferFloor(floor)
            saveState({ stressChoice })
            setOnboardingDone(true)
          }}
        />
      </div>
    )
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
      {tab === 'plans' && (
        <Plans
          goals={goals}
          scenarios={scenarios}
          onReorder={setGoals}
          onOpenScenario={(id) => {
            setScenarioEditingId(id)
            setSheet('scenario')
          }}
          onNewScenario={() => {
            setScenarioEditingId(null)
            setSheet('scenario')
          }}
        />
      )}
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
      {sheet === 'scenario' && (
        <ScenarioSheet
          goals={goals}
          existing={scenarioEditingId ? scenarios.find((s) => s.id === scenarioEditingId) ?? null : null}
          onSave={(s) => {
            setScenarios((prev) => (prev.some((p) => p.id === s.id) ? prev.map((p) => (p.id === s.id ? s : p)) : [...prev, s]))
            setSheet(null)
            setToast(scenarioEditingId ? 'Scenario updated.' : 'Scenario saved — it stays live as your numbers change.')
          }}
          onDelete={(id) => {
            setScenarios((prev) => prev.filter((p) => p.id !== id))
            setSheet(null)
            setToast('Scenario removed.')
          }}
          onClose={() => setSheet(null)}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
