/*
 * Saves for changes the game makes by itself (clock ticks, flight checkpoints). The first change
 * starts a short timer and everything until it fires goes out in one write. Player actions still
 * save at once, and a store's own save() drops its pending write.
 */

const DELAY_MS = 1500

const pending = new Map<string, { run: () => void, timer: ReturnType<typeof setTimeout> }>()

export function saveSoon(key: string, run: () => void) {
  if (pending.has(key)) return
  pending.set(key, {
    run,
    timer: setTimeout(() => {
      pending.delete(key)
      run()
    }, DELAY_MS),
  })
}

export function cancelSave(key: string) {
  const p = pending.get(key)
  if (!p) return
  clearTimeout(p.timer)
  pending.delete(key)
}

/** Write anything still waiting, now. */
export function flushSaves() {
  const runs = [...pending.values()].map((p) => {
    clearTimeout(p.timer)
    return p.run
  })
  pending.clear()
  for (const run of runs) run()
}

/** Forget anything still waiting (the saves are about to be wiped). */
export function cancelSaves() {
  for (const p of pending.values()) clearTimeout(p.timer)
  pending.clear()
}
