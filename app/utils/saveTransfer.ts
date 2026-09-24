/*
 * Save export / import: bundle every piece of game state from localStorage into one copyable
 * code, so a journey can move to another browser or device (or be kept safe as a file).
 *
 * The code is `HIVEBOUND1:` + base64 of `{ v: 1, at, data: { key: rawString } }`. Raw strings
 * are kept exactly as each store wrote them, so the stores' own load() (with its migrations)
 * does all the real parsing after the reload.
 */

/** Everything that makes up a journey. The dev perf overlay pref (`hivebound:perf`) stays out. */
export const SAVE_KEYS = [
  'hivebound:save:v1',
  'hivebound:hive:v1',
  'hivebound:colony:v1',
  'hivebound:queen:v1',
  'hivebound:settings:v1',
  'hivebound:last-seen',
] as const

type SaveKey = typeof SAVE_KEYS[number]

const PREFIX = 'HIVEBOUND1:'
/** Holds an import across the reload (see applyPendingImport). */
const PENDING_KEY = 'hivebound:pending-import'

interface SavePayload {
  v: 1
  at: number
  data: Partial<Record<SaveKey, string>>
}

export type ParseResult =
  | { ok: true, payload: SavePayload }
  | { ok: false, error: string }

export type ImportResult =
  | { ok: true, at: number }
  | { ok: false, error: string }

// btoa/atob only speak Latin-1, so go through UTF-8 bytes to keep any unicode (bee names!) safe.
function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

function fromBase64(b64: string): string {
  const bin = atob(b64)
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0))
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
}

/** A copyable code holding the whole journey. */
export function exportSave(): string {
  const data: SavePayload['data'] = {}
  for (const key of SAVE_KEYS) {
    try {
      const raw = localStorage.getItem(key)
      if (raw !== null) data[key] = raw
    }
    catch { /* storage unavailable: export what we can */ }
  }
  const payload: SavePayload = { v: 1, at: Date.now(), data }
  return PREFIX + toBase64(JSON.stringify(payload))
}

/** Check a pasted code without touching the current game. */
export function parseSave(text: string): ParseResult {
  // Codes survive being wrapped across lines in chats and notes apps.
  const code = text.replace(/\s+/g, '')
  if (!code) return { ok: false, error: 'Paste a save code first.' }
  if (!code.startsWith(PREFIX)) return { ok: false, error: 'That doesn\'t look like a Hivebound save code. It should start with HIVEBOUND1:' }

  let payload: unknown
  try {
    payload = JSON.parse(fromBase64(code.slice(PREFIX.length)))
  }
  catch {
    return { ok: false, error: 'This save code seems to be cut short or mixed up. Try copying it again.' }
  }

  const p = payload as Partial<SavePayload> | null
  if (!p || typeof p !== 'object' || typeof p.data !== 'object' || !p.data) {
    return { ok: false, error: 'This save code seems to be cut short or mixed up. Try copying it again.' }
  }
  if (p.v !== 1) return { ok: false, error: 'This save comes from a newer Hivebound. Refresh the page and try again.' }

  // Keep only keys we know, and only if they hold what the stores expect to read back.
  const data: SavePayload['data'] = {}
  for (const key of SAVE_KEYS) {
    const raw = (p.data as Record<string, unknown>)[key]
    if (raw === undefined) continue
    if (typeof raw !== 'string') return { ok: false, error: 'Part of this save is damaged, so it can\'t be loaded.' }
    if (key !== 'hivebound:last-seen') {
      try {
        JSON.parse(raw)
      }
      catch {
        return { ok: false, error: 'Part of this save is damaged, so it can\'t be loaded.' }
      }
    }
    data[key] = raw
  }
  if (!Object.keys(data).length) return { ok: false, error: 'This save code is empty. There\'s no journey in it yet.' }

  return { ok: true, payload: { v: 1, at: typeof p.at === 'number' ? p.at : Date.now(), data } }
}

function writeKeys(data: SavePayload['data']) {
  for (const key of SAVE_KEYS) {
    const raw = data[key]
    // Keys missing from the save are cleared, so nothing from the old journey leaks in.
    if (raw === undefined) localStorage.removeItem(key)
    else localStorage.setItem(key, raw)
  }
}

/**
 * Replace the current game with a save code. Call `location.reload()` after a successful
 * import so every store reads its state afresh.
 */
export function importSave(text: string): ImportResult {
  const parsed = parseSave(text)
  if (!parsed.ok) return parsed
  const { payload } = parsed
  try {
    writeKeys(payload.data)
  }
  catch {
    return { ok: false, error: 'Your browser wouldn\'t let us save here (private mode or full storage?).' }
  }
  // The page saves the old game on its way out (pagehide), which would undo the import.
  // Stash the save for this tab too, and put it back first thing after the reload.
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(payload.data))
  }
  catch { /* no session storage: the direct write above is our best effort */ }
  return { ok: true, at: payload.at }
}

/** Finish an import started before a reload. Runs before any store loads. */
export function applyPendingImport() {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY)
    if (!raw) return
    sessionStorage.removeItem(PENDING_KEY)
    writeKeys(JSON.parse(raw) as SavePayload['data'])
  }
  catch { /* nothing pending, or storage unavailable */ }
}

/** `hivebound-save-YYYY-MM-DD.txt`, using the player's local date. */
export function saveFileName(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `hivebound-save-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.txt`
}
