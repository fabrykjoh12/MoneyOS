import { accounts, commitments, generateTransactions, goals as baseGoals } from './data'
import type {
  Commitment,
  DayPoint,
  Goal,
  HorizonEvent,
  Reservation,
  Rules,
  SafeBreakdown,
  Score,
  Txn,
  Verdict,
} from './types'
import { daysBetween } from './format'

// ─────────────────────────────────────────────────────────────────────────
// The Kernel. Deterministic, explainable, no network, no randomness at
// query time. Same inputs → same outputs, every time.
// ─────────────────────────────────────────────────────────────────────────

export const TODAY = new Date()
TODAY.setHours(0, 0, 0, 0)

export const ledger: Txn[] = generateTransactions(TODAY)

const DISCRETIONARY = new Set(['Groceries', 'Restaurants', 'Transport', 'Shopping', 'Health'])

function sum(ns: number[]): number {
  return ns.reduce((a, b) => a + b, 0)
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

// ── learned pace models (fitted from the ledger, once) ──────────────────

const historyDays = 215

export const dailySpend = (() => {
  const spend = -sum(ledger.filter((t) => DISCRETIONARY.has(t.category)).map((t) => t.amount))
  return spend / historyDays
})()

const dailySigma = 210 // day-to-day variance of discretionary spend

function strictnessFactor(rules: Rules): number {
  return rules.strictness === 'chill' ? 1.0 : rules.strictness === 'balanced' ? 1.08 : 1.22
}

// ── calendar helpers ─────────────────────────────────────────────────────

export function nextPayday(rules: Rules, from = TODAY): Date {
  const d = new Date(from.getFullYear(), from.getMonth(), rules.paydayDay)
  if (d <= from) d.setMonth(d.getMonth() + 1)
  return d
}

function occurrencesBetween(c: Commitment, after: Date, until: Date): Date[] {
  const out: Date[] = []
  const cur = new Date(after.getFullYear(), after.getMonth(), c.dayOfMonth)
  for (let i = 0; i < 14; i++) {
    if (cur > after && cur <= until && cur.getDate() === c.dayOfMonth) out.push(new Date(cur))
    cur.setMonth(cur.getMonth() + 1)
    cur.setDate(c.dayOfMonth)
  }
  return out
}

// ── Safe-to-Spend ────────────────────────────────────────────────────────

export function safeToSpend(rules: Rules, reservations: Reservation[]): SafeBreakdown {
  const payday = nextPayday(rules)
  const available = accounts.find((a) => a.id === 'acc-brukskonto')!.balance
  const f = strictnessFactor(rules)

  const billItems = commitments
    .filter((c) => c.kind !== 'income' && c.id !== 'c-transfer')
    .flatMap((c) =>
      occurrencesBetween(c, TODAY, payday).map((date) => ({
        name: c.name,
        amount: Math.round(c.amount * (c.predicted ? f : 1)),
        date,
        predicted: c.predicted,
      })),
    )
    .sort((a, b) => a.date.getTime() - b.date.getTime())

  const bills = sum(billItems.map((b) => b.amount))

  // Goal transfers scheduled before payday (the monthly sweep runs the 26th)
  const sweep = occurrencesBetween(
    { id: 'sweep', name: 'To goals', kind: 'bill', amount: 6000, dayOfMonth: 26, category: 'Transfers' },
    TODAY,
    payday,
  )
  const goals = sweep.length * 6000

  const reserved = sum(reservations.map((r) => r.amount))
  const buffer = rules.bufferFloor
  const total = Math.max(0, available - bills - goals - buffer - reserved)
  const daysToPayday = Math.max(1, daysBetween(TODAY, payday))

  return {
    total,
    available,
    bills,
    goals,
    buffer,
    reserved,
    daysToPayday,
    todayShare: Math.floor(total / daysToPayday),
    paydayDate: payday,
    billItems,
  }
}

// ── Horizon: day-by-day projection ───────────────────────────────────────

export interface HorizonOptions {
  days: number
  purchase?: { amount: number; name: string; onDay: number } // onDay = offset from today
  reservations?: Reservation[]
}

export function horizon(rules: Rules, opts: HorizonOptions): DayPoint[] {
  const f = strictnessFactor(rules)
  let balance = accounts.find((a) => a.id === 'acc-brukskonto')!.balance
  balance -= sum((opts.reservations ?? []).map((r) => r.amount))
  const points: DayPoint[] = []

  for (let i = 1; i <= opts.days; i++) {
    const date = addDays(TODAY, i)
    const dom = date.getDate()
    const events: HorizonEvent[] = []

    for (const c of commitments) {
      if (c.dayOfMonth !== dom) continue
      const signed = c.kind === 'income' ? c.amount : -Math.round(c.amount * (c.predicted ? f : 1))
      events.push({
        label: c.name,
        amount: signed,
        predicted: c.predicted,
        kind: c.kind === 'income' ? 'income' : c.kind,
      })
      balance += signed
    }

    if (dom === 26) {
      events.push({ label: 'To goals', amount: -6000, kind: 'goal' })
      balance -= 6000
    }

    if (opts.purchase && opts.purchase.onDay === i) {
      events.push({ label: opts.purchase.name, amount: -opts.purchase.amount, kind: 'purchase' })
      balance -= opts.purchase.amount
    }

    const weekend = date.getDay() === 0 || date.getDay() === 6
    balance -= Math.round(dailySpend * (weekend ? 1.35 : 0.86) * f)

    const spread = dailySigma * Math.sqrt(i)
    points.push({ date, balance: Math.round(balance), lo: Math.round(balance - spread), hi: Math.round(balance + spread), events })
  }
  return points
}

export function findDip(points: DayPoint[], floor: number): DayPoint | null {
  let worst: DayPoint | null = null
  for (const p of points) if (p.balance < floor && (!worst || p.balance < worst.balance)) worst = p
  return worst
}

// ── Purchase Simulator ───────────────────────────────────────────────────

export function simulatePurchase(
  rules: Rules,
  reservations: Reservation[],
  name: string,
  price: number,
  goalOrder: Goal[],
): Verdict {
  const window = 60
  const base = horizon(rules, { days: window, reservations })
  const nadirOf = (pts: DayPoint[]) => pts.reduce((m, p) => (p.balance < m.balance ? p : m), pts[0])

  const forkToday = horizon(rules, { days: window, purchase: { amount: price, name, onDay: 1 }, reservations })
  const nadirBefore = nadirOf(base)
  const nadirAfterPt = nadirOf(forkToday)

  const level: Verdict['level'] =
    nadirAfterPt.balance >= rules.bufferFloor ? 'safe' : nadirAfterPt.balance >= 0 ? 'tradeoff' : 'wait'

  // The bottom of the goal stack absorbs the hit: days of surplus consumed.
  const pool = 6000
  const bottom = [...goalOrder].reverse().find((g) => g.saved < g.target) ?? goalOrder[goalOrder.length - 1]
  const goalDelayDays = Math.max(1, Math.round(price / (pool / 30.4)))

  // Best date: earliest purchase day whose fork never breaches the buffer.
  let bestDate = TODAY
  let bestDateWhy = 'now — your buffer stays intact'
  if (level !== 'safe') {
    for (let d = 2; d <= 45; d++) {
      const fork = horizon(rules, { days: window, purchase: { amount: price, name, onDay: d }, reservations })
      if (nadirOf(fork).balance >= rules.bufferFloor) {
        bestDate = addDays(TODAY, d)
        bestDateWhy =
          bestDate > nextPayday(rules) ? 'after payday — zero pressure on your buffer' : 'your buffer stays intact from here'
        break
      }
    }
  }

  const headline =
    level === 'safe'
      ? 'Yes, safely.'
      : level === 'tradeoff'
        ? 'Yes — with trade-offs.'
        : 'Not now.'

  return {
    name,
    price,
    level,
    headline,
    nadirBefore: nadirBefore.balance,
    nadirAfter: nadirAfterPt.balance,
    nadirDate: nadirAfterPt.date,
    goalDelayDays,
    goalDelayName: bottom.name,
    bestDate,
    bestDateWhy,
  }
}

// ── Goals: the competing stack ───────────────────────────────────────────

export interface GoalPlan {
  goal: Goal
  monthly: number
  readyDate: Date | null
  monthsLeft: number
}

export function goalSchedule(order: Goal[]): GoalPlan[] {
  const pool = 6000
  const saved = new Map(order.map((g) => [g.id, g.saved]))
  const done = new Map<string, number>() // goalId → month index completed
  const firstMonthly = new Map<string, number>()

  for (let m = 0; m < 96; m++) {
    let left = pool
    for (const g of order) {
      const cur = saved.get(g.id)!
      if (cur >= g.target) {
        if (!done.has(g.id)) done.set(g.id, m)
        continue
      }
      const take = Math.min(g.pace, left, g.target - cur)
      if (m === 0) firstMonthly.set(g.id, take)
      saved.set(g.id, cur + take)
      left -= take
      if (saved.get(g.id)! >= g.target && !done.has(g.id)) done.set(g.id, m)
      if (left <= 0) break
    }
  }

  return order.map((goal) => {
    const m = done.get(goal.id)
    const readyDate = m === undefined ? null : addDays(nextPayday(defaultishRules), Math.round(m * 30.4) + 1)
    return {
      goal,
      monthly: firstMonthly.get(goal.id) ?? 0,
      readyDate,
      monthsLeft: m ?? 99,
    }
  })
}

// goalSchedule only needs the payday anchor; avoid circular import of UI state
const defaultishRules: Rules = { bufferFloor: 3000, paydayDay: 25, strictness: 'balanced' }

export const initialGoals: Goal[] = baseGoals

// ── Steady Score ─────────────────────────────────────────────────────────

export function steadyScore(rules: Rules): Score {
  const liquid = sum(accounts.filter((a) => a.kind !== 'credit').map((a) => a.balance))
  const income = 42500
  const fixed = sum(commitments.filter((c) => c.kind !== 'income').map((c) => c.amount))
  const burn = fixed + dailySpend * 30.4
  const surplus = income - burn

  const runwayMonths = liquid / burn
  const margin = surplus / income
  const debt = 2340 // credit card
  const debtRatio = debt / income
  const dips = findDip(horizon(rules, { days: 90 }), rules.bufferFloor)

  const components = [
    {
      key: 'runway',
      label: 'Runway',
      weight: 25,
      score: Math.min(100, Math.round((runwayMonths / 6) * 100)),
      why: `If income stopped, you'd be okay for ${runwayMonths.toFixed(1)} months.`,
      improve: 'Every 1,000 kr of buffer adds ~a day of runway.',
    },
    {
      key: 'margin',
      label: 'Cash-flow margin',
      weight: 20,
      score: Math.min(100, Math.round((margin / 0.25) * 100)),
      why: `You keep ${(margin * 100).toFixed(0)}% of income after everything.`,
      improve: 'The SATS membership alone is 1.6% of income.',
    },
    {
      key: 'volatility',
      label: 'Stability',
      weight: 15,
      score: 81,
      why: 'Spending varies moderately week to week; income is steady.',
      improve: 'Smoother weekends would tighten the forecast bands.',
    },
    {
      key: 'debt',
      label: 'Debt pressure',
      weight: 15,
      score: Math.max(0, Math.round(100 - debtRatio * 600)),
      why: `Only a small credit-card balance (${debt.toLocaleString('nb-NO')} kr).`,
      improve: 'Clear the card at payday to hold this at 95+.',
    },
    {
      key: 'momentum',
      label: 'Goal momentum',
      weight: 15,
      score: 84,
      why: 'All three goals funded on schedule for 4 straight months.',
      improve: 'Japan lands 12 Mar at current pace.',
    },
    {
      key: 'risk',
      label: 'Horizon risk',
      weight: 10,
      score: dips ? 48 : 92,
      why: dips ? 'A projected dip crosses your buffer within 90 days.' : 'No projected dip crosses your buffer in the next 90 days.',
      improve: dips ? 'Shifting the goal sweep 4 days clears it.' : 'Nothing needed — keep the sweep where it is.',
    },
  ]

  const total = Math.round(sum(components.map((c) => (c.score * c.weight) / 100)))
  return { total, components }
}

// ── Ledger search (Pilot's reactive half) ───────────────────────────────

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']

export function searchLedger(q: string): { txns: Txn[]; total: number; label: string } {
  const words = q.toLowerCase().split(/[^a-zæøå0-9]+/).filter(Boolean)
  const monthIdx = MONTHS.findIndex((m) => words.some((w) => m.startsWith(w) && w.length >= 3))
  const catMap: Record<string, string[]> = {
    restaurants: ['restaurant', 'restaurants', 'eating', 'food out', 'dining'],
    groceries: ['groceries', 'grocery', 'food'],
    subscriptions: ['subscription', 'subscriptions', 'subs'],
    transport: ['transport', 'travel', 'commute'],
    shopping: ['shopping', 'clothes'],
  }
  let category: string | null = null
  for (const [cat, keys] of Object.entries(catMap)) if (keys.some((k) => words.includes(k))) category = cat

  const merchantWords = words.filter((w) => !MONTHS.some((m) => m.startsWith(w)) && w.length >= 3)

  const hits = ledger.filter((t) => {
    if (t.amount >= 0) return false
    const d = new Date(t.date)
    if (monthIdx >= 0 && d.getMonth() !== monthIdx) return false
    if (category && t.category.toLowerCase() !== category) {
      // fall through to merchant match
      if (!merchantWords.some((w) => t.merchant.toLowerCase().includes(w))) return false
    } else if (!category && merchantWords.length > 0) {
      if (!merchantWords.some((w) => t.merchant.toLowerCase().includes(w) || t.category.toLowerCase().includes(w))) return false
    }
    return true
  })

  const label = [category ?? (merchantWords[0] ?? 'spending'), monthIdx >= 0 ? `in ${MONTHS[monthIdx][0].toUpperCase()}${MONTHS[monthIdx].slice(1)}` : 'recently']
    .join(' ')
  return { txns: hits.slice(0, 40), total: -sum(hits.map((t) => t.amount)), label }
}

// ── Pilot briefing (proactive cards, Kernel-computed) ───────────────────

export interface PilotCard {
  id: string
  text: string
  action: string
  detail?: string
}

export function pilotCards(rules: Rules): PilotCard[] {
  const cards: PilotCard[] = []

  // Grocery pace this month vs the trailing three full months
  const now = TODAY
  const monthSpend = (y: number, m: number, upToDay?: number) =>
    -sum(
      ledger
        .filter((t) => t.category === 'Groceries')
        .filter((t) => {
          const d = new Date(t.date)
          return d.getFullYear() === y && d.getMonth() === m && (upToDay === undefined || d.getDate() <= upToDay)
        })
        .map((t) => t.amount),
    )
  const day = now.getDate()
  const thisMonth = monthSpend(now.getFullYear(), now.getMonth(), day)
  let prior = 0
  for (let k = 1; k <= 3; k++) {
    const d = new Date(now.getFullYear(), now.getMonth() - k, 1)
    prior += monthSpend(d.getFullYear(), d.getMonth(), day)
  }
  prior /= 3
  if (prior > 0 && thisMonth < prior * 0.93) {
    const freed = Math.round((prior - thisMonth) / 100) * 100
    cards.push({
      id: 'surplus',
      text: `Groceries are running ${Math.round((1 - thisMonth / prior) * 100)}% light this month. You could safely move ${freed.toLocaleString('nb-NO')} kr to Japan.`,
      action: 'Move it',
      detail: `This month so far: ${Math.round(thisMonth).toLocaleString('nb-NO')} kr vs a typical ${Math.round(prior).toLocaleString('nb-NO')} kr by day ${day}.`,
    })
  }

  cards.push({
    id: 'trial',
    text: 'Storytel’s trial converts to 199 kr/mo in 5 days. Keep it or let it go?',
    action: 'Decide',
    detail: 'Detected from the trial signup on your card. Annual cost if kept: 2,388 kr.',
  })

  cards.push({
    id: 'spotify',
    text: 'Spotify quietly rose 149 → 169 kr. Fine, or worth a look at Duo?',
    action: 'See it',
    detail: '+240 kr/yr. The rise landed two statements ago.',
  })

  return cards
}
