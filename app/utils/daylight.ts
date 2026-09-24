/*
 * A slow, gentle day: one full day and night every 24 real minutes, on the real clock (so
 * it carries on while the game is closed). Nights are about a quarter of the cycle, with a
 * soft dusk and dawn either side. Everyone sees the same time of day.
 */

export const DAY_MS = 24 * 60 * 1000

/** Where in the day we are: 0 = sunrise, 0.5 = afternoon, ~0.7 = dusk, ~0.95 = dawn. */
export function dayPhase(now = Date.now()) {
  return (now % DAY_MS) / DAY_MS
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** 0 in full day, 1 in deep night, easing through dusk (0.62–0.72) and dawn (0.9–1). */
export function nightAmount(now = Date.now()) {
  const p = dayPhase(now)
  return smooth(0.62, 0.72, p) * (1 - smooth(0.9, 1, p))
}

export function isNight(now = Date.now()) {
  return nightAmount(now) > 0.5
}

export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night'

export function timeOfDay(now = Date.now()): TimeOfDay {
  const p = dayPhase(now)
  if (p < 0.3) return 'morning'
  if (p < 0.6) return 'afternoon'
  if (isNight(now)) return 'night'
  return p < 0.8 ? 'evening' : 'morning'
}

/** Minutes until night falls (or until morning, at night). */
export function minutesUntilChange(now = Date.now()) {
  const p = dayPhase(now)
  const target = isNight(now) ? 0.95 : p < 0.67 ? 0.67 : 1.67
  return Math.max(1, Math.round(((target - p) * DAY_MS) / 60000))
}
