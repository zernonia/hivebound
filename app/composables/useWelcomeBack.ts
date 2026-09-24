import { useColony } from '~/stores/colony'
import { useHive } from '~/stores/hive'
import { ALL_RESOURCES, type Amounts, BUILDINGS, OFFLINE_CAP_MS, type Resource } from '~/utils/resources'

/*
 * "While you were away…": snapshot what the hive holds (store + building trays) when the
 * player leaves, compare once the hive has caught up, and show a little card if real time
 * passed and something came in.
 */

const LAST_SEEN_KEY = 'hivebound:last-seen'
/** Shorter gaps than this aren't worth a card. */
const MIN_AWAY_MS = 2 * 60 * 1000

export interface AwaySummary {
  awayMs: number
  /** Hit the offline cap: helpers and buildings stopped part-way through. */
  capped: boolean
  gains: Amounts
  /** Names of the helpers who were working. */
  helpers: string[]
}

const summary = ref<AwaySummary | null>(null)

function holdings(): Record<Resource, number> {
  const hive = useHive()
  const out = { ...hive.stock }
  for (const c of Object.values(hive.cells)) {
    const recipe = c.building ? BUILDINGS[c.building].recipe : undefined
    if (recipe && c.output) {
      const r = Object.keys(recipe.out)[0] as Resource
      out[r] += c.output
    }
  }
  return out
}

function readLastSeen() {
  try {
    const v = Number(localStorage.getItem(LAST_SEEN_KEY))
    return Number.isFinite(v) && v > 0 ? v : null
  }
  catch {
    return null
  }
}

export function markSeen(now = Date.now()) {
  try {
    localStorage.setItem(LAST_SEEN_KEY, String(now))
  }
  catch { /* ignore */ }
}

let pending: { since: number | null, before: Record<Resource, number> } | null = null

/**
 * Call when the player leaves (the tab is hidden) or, on load, before the catch-up tick:
 * remembers what the hive holds and since when.
 */
export function beginAway(since: number | null = readLastSeen()) {
  pending = { since, before: holdings() }
}

/** Call once the hive has caught up to now: shows the card if enough time passed. */
export function endAway() {
  const p = pending
  pending = null
  const now = Date.now()
  markSeen(now)
  if (!p || p.since == null) return
  const awayMs = now - p.since
  if (awayMs < MIN_AWAY_MS) return
  const after = holdings()
  const gains: Amounts = {}
  for (const r of ALL_RESOURCES) {
    const d = after[r] - p.before[r]
    if (d > 0) gains[r] = d
  }
  if (!Object.keys(gains).length) return
  const helpers = useColony().bees.filter(b => b.job).map(b => b.name)
  summary.value = { awayMs, capped: awayMs > OFFLINE_CAP_MS, gains, helpers }
}

export function useWelcomeBack() {
  return {
    summary,
    dismiss: () => (summary.value = null),
  }
}
