import type { Reservation } from './types'

// Local persistence. Nothing here talks to a network — the same boundary
// the architecture doc draws for the on-device Kernel: state lives with
// the user until a real sync layer exists.

const KEY = 'moneyos:v1'

export interface PersistedState {
  onboardingDone: boolean
  stressChoice: string | null
  bufferFloor: number
  goalOrder: string[]
  reservations: Reservation[]
  discreet: boolean
  theme: 'light' | 'dark' | null // null = follow system
}

const DEFAULTS: PersistedState = {
  onboardingDone: false,
  stressChoice: null,
  bufferFloor: 3000,
  goalOrder: [],
  reservations: [],
  discreet: false,
  theme: null,
}

export function loadState(): PersistedState {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULTS }
    return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveState(patch: Partial<PersistedState>) {
  try {
    const current = loadState()
    localStorage.setItem(KEY, JSON.stringify({ ...current, ...patch }))
  } catch {
    // storage unavailable (private mode, quota) — the app still works, it just won't remember
  }
}
