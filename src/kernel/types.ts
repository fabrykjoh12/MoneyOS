export type AccountKind = 'checking' | 'savings' | 'credit'

export interface Account {
  id: string
  name: string
  bank: string
  kind: AccountKind
  balance: number // whole NOK
}

export type Category =
  | 'Groceries'
  | 'Restaurants'
  | 'Transport'
  | 'Shopping'
  | 'Home'
  | 'Utilities'
  | 'Subscriptions'
  | 'Health'
  | 'Income'
  | 'Transfers'

export interface Txn {
  id: string
  date: string // ISO yyyy-mm-dd
  merchant: string
  category: Category
  amount: number // negative = money out
  accountId: string
}

export type CommitmentKind = 'income' | 'bill' | 'subscription'

export interface Commitment {
  id: string
  name: string
  kind: CommitmentKind
  amount: number // positive magnitude; sign applied by kind
  dayOfMonth: number
  category: Category
  predicted?: boolean // amount is a forecast, not fixed
  note?: string
}

export interface Goal {
  id: string
  name: string
  emoji: string
  target: number
  saved: number
  pace: number // desired monthly contribution when funds allow
}

export interface SubscriptionInsight {
  kind: 'price-rise' | 'duplicate' | 'unused' | 'trial-ends' | 'annual'
  commitmentId: string
  text: string
}

export interface Rules {
  bufferFloor: number
  paydayDay: number
  strictness: 'chill' | 'balanced' | 'strict'
}

export interface Reservation {
  id: string
  name: string
  amount: number
}

export interface Scenario {
  id: string
  name: string
  incomeDelta: number // monthly, signed
  recurringDelta: number // monthly, signed — new/changed recurring costs
}

export interface HorizonEvent {
  label: string
  amount: number // signed
  predicted?: boolean
  kind: 'income' | 'bill' | 'subscription' | 'goal' | 'purchase'
}

export interface DayPoint {
  date: Date
  balance: number
  lo: number
  hi: number
  events: HorizonEvent[]
}

export interface SafeBreakdown {
  total: number
  available: number
  bills: number
  goals: number
  buffer: number
  reserved: number
  daysToPayday: number
  todayShare: number
  paydayDate: Date
  billItems: { name: string; amount: number; date: Date; predicted?: boolean }[]
}

export interface Verdict {
  name: string
  price: number
  level: 'safe' | 'tradeoff' | 'wait'
  headline: string
  nadirBefore: number
  nadirAfter: number
  nadirDate: Date
  goalDelayDays: number
  goalDelayName: string
  bestDate: Date
  bestDateWhy: string
}

export interface ScoreComponent {
  key: string
  label: string
  weight: number
  score: number // 0–100
  why: string
  improve: string
}

export interface Score {
  total: number
  components: ScoreComponent[]
}
