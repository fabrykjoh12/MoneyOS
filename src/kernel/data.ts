import type { Account, Commitment, Goal, Rules, Scenario, SubscriptionInsight, Txn } from './types'

// Deterministic demo ledger: ~7 months of history generated relative to
// "today" with a seeded PRNG, so the app always opens onto a coherent life.

function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const accounts: Account[] = [
  { id: 'acc-brukskonto', name: 'Brukskonto', bank: 'DNB', kind: 'checking', balance: 18930 },
  { id: 'acc-sparekonto', name: 'Sparekonto', bank: 'DNB', kind: 'savings', balance: 96400 },
  { id: 'acc-kredittkort', name: 'Mastercard', bank: 'DNB', kind: 'credit', balance: -2340 },
]

export const commitments: Commitment[] = [
  { id: 'c-salary', name: 'Salary — Aker Studio', kind: 'income', amount: 42500, dayOfMonth: 25, category: 'Income' },
  { id: 'c-rent', name: 'Rent', kind: 'bill', amount: 12400, dayOfMonth: 1, category: 'Home' },
  { id: 'c-electricity', name: 'Electricity — Tibber', kind: 'bill', amount: 1150, dayOfMonth: 4, category: 'Utilities', predicted: true },
  { id: 'c-phone', name: 'Telenor', kind: 'bill', amount: 429, dayOfMonth: 15, category: 'Utilities' },
  { id: 'c-insurance', name: 'Home insurance — Fremtind', kind: 'bill', amount: 385, dayOfMonth: 12, category: 'Home' },
  { id: 'c-spotify', name: 'Spotify', kind: 'subscription', amount: 169, dayOfMonth: 28, category: 'Subscriptions' },
  { id: 'c-netflix', name: 'Netflix', kind: 'subscription', amount: 139, dayOfMonth: 24, category: 'Subscriptions' },
  { id: 'c-icloud', name: 'iCloud+ 200 GB', kind: 'subscription', amount: 39, dayOfMonth: 8, category: 'Subscriptions' },
  { id: 'c-googleone', name: 'Google One 200 GB', kind: 'subscription', amount: 29, dayOfMonth: 19, category: 'Subscriptions' },
  { id: 'c-sats', name: 'SATS membership', kind: 'subscription', amount: 699, dayOfMonth: 5, category: 'Subscriptions' },
  { id: 'c-storytel', name: 'Storytel (trial)', kind: 'subscription', amount: 199, dayOfMonth: 27, category: 'Subscriptions' },
]

export const goals: Goal[] = [
  { id: 'g-buffer', name: 'Emergency buffer', emoji: '⛰', target: 50000, saved: 30000, pace: 2500 },
  { id: 'g-japan', name: 'Japan', emoji: '🗾', target: 45000, saved: 32000, pace: 3000 },
  { id: 'g-computer', name: 'New computer', emoji: '▦', target: 25000, saved: 4000, pace: 2000 },
]

export const defaultRules: Rules = {
  bufferFloor: 3000,
  paydayDay: 25,
  strictness: 'balanced',
}

export const defaultScenarios: Scenario[] = [
  { id: 's-oslo', name: 'Move to Oslo sentrum', incomeDelta: 0, recurringDelta: 3400 },
  { id: 's-80', name: 'Drop to 80% hours', incomeDelta: -8500, recurringDelta: 0 },
  { id: 's-stop', name: 'If income stopped today', incomeDelta: -42500, recurringDelta: 0 },
]

export const subscriptionInsights: SubscriptionInsight[] = [
  { kind: 'price-rise', commitmentId: 'c-spotify', text: 'Rose 149 → 169 kr two months ago (+13%).' },
  { kind: 'duplicate', commitmentId: 'c-googleone', text: 'Overlaps iCloud+ — both are 200 GB cloud storage.' },
  { kind: 'unused', commitmentId: 'c-sats', text: 'No visits detected in 9 weeks. 8,388 kr/yr.' },
  { kind: 'trial-ends', commitmentId: 'c-storytel', text: 'Trial converts to 199 kr/mo in 5 days.' },
]

const GROCERS = ['Rema 1000', 'Kiwi', 'Meny', 'Coop Extra']
const RESTAURANTS = ['Peloton Café', 'Munchies', 'Sabi Sushi', 'Kverneriet', 'Espresso House']
const SHOPS = ['NetOnNet', 'Clas Ohlson', 'Zara', 'Vinmonopolet', 'Normal', 'Ark Bokhandel']
const TRANSPORT = ['Ruter', 'Bysykkel', 'Flytoget']

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function seasonalElectricity(month: number, rnd: () => number): number {
  // month 0–11; Nordic winters bite
  const base = [1780, 1650, 1380, 1050, 820, 690, 640, 700, 880, 1150, 1440, 1720][month]
  return Math.round(base * (0.9 + rnd() * 0.2))
}

export function generateTransactions(today: Date): Txn[] {
  const rnd = mulberry32(42)
  const txns: Txn[] = []
  let n = 0
  const push = (date: Date, merchant: string, category: Txn['category'], amount: number) => {
    txns.push({ id: `t${n++}`, date: iso(date), merchant, category, amount: Math.round(amount), accountId: 'acc-brukskonto' })
  }

  const DAYS = 215
  for (let i = DAYS; i >= 1; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const dom = d.getDate()
    const dow = d.getDay()
    const monthsAgo = (today.getFullYear() - d.getFullYear()) * 12 + (today.getMonth() - d.getMonth())

    // recurring
    if (dom === 25) push(d, 'Aker Studio AS — Lønn', 'Income', 42500)
    if (dom === 1) push(d, 'Rent — Obos Sameie', 'Home', -12400)
    if (dom === 4) push(d, 'Tibber', 'Utilities', -seasonalElectricity(d.getMonth(), rnd))
    if (dom === 15) push(d, 'Telenor', 'Utilities', -429)
    if (dom === 12) push(d, 'Fremtind Forsikring', 'Home', -385)
    if (dom === 28) push(d, 'Spotify', 'Subscriptions', monthsAgo >= 2 ? -149 : -169)
    if (dom === 24) push(d, 'Netflix', 'Subscriptions', -139)
    if (dom === 8) push(d, 'iCloud+', 'Subscriptions', -39)
    if (dom === 19) push(d, 'Google One', 'Subscriptions', -29)
    if (dom === 5) push(d, 'SATS', 'Subscriptions', -699)
    if (dom === 26) push(d, 'To savings — goals', 'Transfers', -6000)

    // everyday life
    if (rnd() < 0.55) push(d, GROCERS[Math.floor(rnd() * GROCERS.length)], 'Groceries', -(140 + rnd() * 420))
    if ((dow === 5 || dow === 6) && rnd() < 0.6) push(d, RESTAURANTS[Math.floor(rnd() * RESTAURANTS.length)], 'Restaurants', -(180 + rnd() * 520))
    else if (rnd() < 0.14) push(d, RESTAURANTS[Math.floor(rnd() * RESTAURANTS.length)], 'Restaurants', -(90 + rnd() * 240))
    if (dow === 1 && rnd() < 0.85) push(d, TRANSPORT[0], 'Transport', -platformTicket(rnd))
    if (rnd() < 0.09) push(d, SHOPS[Math.floor(rnd() * SHOPS.length)], 'Shopping', -(120 + rnd() * 900))
    if (rnd() < 0.03) push(d, 'Apotek 1', 'Health', -(80 + rnd() * 350))
  }

  return txns.reverse() // newest first
}

function platformTicket(rnd: () => number): number {
  return rnd() < 0.8 ? 853 : 42 // monthly Ruter pass, sometimes a single
}
