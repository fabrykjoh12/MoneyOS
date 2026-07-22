const nb = new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 })
const dShort = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' })
const dLong = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })

export function kr(n: number): string {
  const v = Math.round(n)
  // nb-NO groups with narrow no-break space; normalize to regular thin space
  return nb.format(v).replace(/ | /g, ' ')
}

export function krFull(n: number): string {
  return `${kr(n)} kr`
}

export function signedKr(n: number): string {
  const s = n > 0 ? '+' : n < 0 ? '−' : ''
  return `${s}${kr(Math.abs(n))}`
}

export function dateShort(d: Date): string {
  return dShort.format(d)
}

// "25 Aug ’26" once the date leaves the current year — ready-dates must sort visually
export function dateReady(d: Date): string {
  const s = dShort.format(d)
  return d.getFullYear() === new Date().getFullYear() ? s : `${s} ’${String(d.getFullYear()).slice(2)}`
}

export function dateLong(d: Date): string {
  return dLong.format(d)
}

export function daysBetween(a: Date, b: Date): number {
  const A = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime()
  const B = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime()
  return Math.round((B - A) / 86400000)
}
