import { defineStore } from 'pinia'
import { type Direction, type Hex, hexKey, hexesInRange, hexDistance, neighbor, parseKey } from '~/utils/hex'
import {
  ALL_RESOURCES,
  type Amounts,
  BASE_STORAGE,
  BUILDINGS,
  type BuildingId,
  OFFLINE_CAP_MS,
  RAW_RESOURCES,
  RESOURCE_INFO,
  type RawResource,
  type Resource,
  TRAY_CAP,
  UNLOCK_CELL_COST,
  UPGRADES,
  type UpgradeId,
  formatAmounts,
  tileSource,
} from '~/utils/resources'
import { GOLDEN_REGROW_MS, isGoldenSpot } from '~/utils/golden'
import type { Tile } from '~/utils/world'
import { useColony } from './colony'
import { useGame } from './game'
import { useQueen } from './queen'

/* ------------------------------------------------------------------ */
/* Hive layout: a radius-2 honeycomb of cells around the Queen        */
/* ------------------------------------------------------------------ */

export const HIVE_CENTER: Hex = { q: 0, r: 0 }
export const HIVE_RADIUS = 3
export const HIVE_CELLS: Hex[] = hexesInRange(HIVE_CENTER, HIVE_RADIUS)
export const QUEEN_CELL = hexKey(HIVE_CENTER)
/** The press you start with. */
export const STARTER_CELL = hexKey({ q: 1, r: 0 })
/** The way out: a selectable spot just past the front cell of the comb. */
export const HIVE_DOOR = 'door'
const DOOR_FRONT_CELL = hexKey({ q: 0, r: HIVE_RADIUS })
/** Each helper working at a building shortens its batches: 1 helper = 1.5× as fast, 2 = 2×. */
const WORKER_SPEEDUP = 0.5
const STARTER_UNLOCKED = HIVE_CELLS.filter(h => hexDistance(h, HIVE_CENTER) === 1).map(hexKey)

export interface CellState {
  building?: BuildingId
  /** When the current batch started (ms epoch), or null when idle. */
  startedAt: number | null
  /** Finished goods waiting in the tray. */
  output: number
  /** Paused by the player: finishes the batch in progress but doesn't start another. */
  paused?: boolean
}

export type CellStatus =
  | { kind: 'queen' }
  | { kind: 'locked' }
  | { kind: 'empty' }
  | { kind: 'storage' }
  | { kind: 'working', remaining: number, progress: number }
  | { kind: 'waiting', missing: Amounts }
  | { kind: 'full' }
  | { kind: 'paused' }

const SAVE_KEY = 'hivebound:hive:v1'

interface SaveData {
  pouch: Partial<Record<RawResource, number>>
  stock: Partial<Record<Resource, number>>
  tiles: Record<string, { amount: number, at: number }>
  cells: Record<string, CellState>
  unlocked: string[]
  upgrades: Record<UpgradeId, number>
  firsts: string[]
  golden?: Record<string, number>
  bonusStorage?: number
}

const emptyAmounts = <K extends string>(keys: readonly K[]) =>
  Object.fromEntries(keys.map(k => [k, 0])) as Record<K, number>

function freshState() {
  return {
    pouch: emptyAmounts(RAW_RESOURCES),
    stock: emptyAmounts(ALL_RESOURCES),
    /** Tile supplies that have been dipped into. Missing = full. */
    tiles: {} as Record<string, { amount: number, at: number }>,
    cells: { [STARTER_CELL]: { building: 'press', startedAt: null, output: 0 } } as Record<string, CellState>,
    unlocked: [...STARTER_UNLOCKED],
    upgrades: { pouch: 0, wings: 0, gathering: 0 } as Record<UpgradeId, number>,
    /** One-off moments already celebrated in the journal. */
    firsts: [] as string[],
    /** Golden spots picked, and when (they sparkle again later). */
    golden: {} as Record<string, number>,
    /** Extra room in the store, from the Queen's thanks. */
    bonusStorage: 0,
  }
}

export const useHive = defineStore('hive', {
  state: () => ({
    ...freshState(),
    /** UI: the hive cell being looked at. Not saved. */
    selected: STARTER_CELL as string | null,
    /** Bumps whenever something in the hive changes, for views that redraw. */
    rev: 0,
    /** Alternates up/down when stepping sideways, so ← / → travel in a straight line. */
    lateralFlip: false,
  }),

  getters: {
    pouchCapacity(s) {
      return UPGRADES.pouch.values[s.upgrades.pouch]!
    },
    pouchTotal(s) {
      return RAW_RESOURCES.reduce((n, r) => n + s.pouch[r], 0)
    },
    pouchFull(): boolean {
      return this.pouchTotal >= this.pouchCapacity
    },
    wingBoost(s) {
      return UPGRADES.wings.values[s.upgrades.wings]!
    },
    secondsPerGather(s) {
      return UPGRADES.gathering.values[s.upgrades.gathering]!
    },
    storageCap(s) {
      const larders = Object.values(s.cells).filter(c => c.building === 'larder').length
      return BASE_STORAGE + larders * (BUILDINGS.larder.storage ?? 0) + s.bonusStorage
    },
  },

  actions: {
    /* ---------------- persistence ---------------- */
    load() {
      try {
        const raw = localStorage.getItem(SAVE_KEY)
        if (raw) {
          const d = JSON.parse(raw) as Partial<SaveData>
          const f = freshState()
          this.pouch = { ...f.pouch, ...d.pouch }
          this.stock = { ...f.stock, ...d.stock }
          this.tiles = d.tiles ?? {}
          this.cells = d.cells ?? f.cells
          this.unlocked = d.unlocked ?? f.unlocked
          this.upgrades = { ...f.upgrades, ...d.upgrades }
          this.firsts = d.firsts ?? []
          this.golden = d.golden ?? {}
          this.bonusStorage = d.bonusStorage ?? 0
        }
      }
      catch { /* corrupt or unavailable: start fresh */ }
      // No catch-up tick here: buildings run at the pace of their helpers, so the page ticks
      // once the colony has loaded too.
    },

    save() {
      const data: SaveData = {
        pouch: this.pouch,
        stock: this.stock,
        tiles: this.tiles,
        cells: this.cells,
        unlocked: this.unlocked,
        upgrades: this.upgrades,
        firsts: this.firsts,
        golden: this.golden,
        bonusStorage: this.bonusStorage,
      }
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(data))
      }
      catch { /* ignore */ }
    },

    reset() {
      try {
        localStorage.removeItem(SAVE_KEY)
      }
      catch { /* ignore */ }
      Object.assign(this, freshState())
      this.selected = STARTER_CELL
      this.rev++
    },

    /** Records a one-off moment; returns true the first time. */
    first(id: string) {
      if (this.firsts.includes(id)) return false
      this.firsts.push(id)
      return true
    },

    /* ---------------- selection ---------------- */
    /** Moves the selection to the neighbouring cell (or the doorway) in a hex direction. */
    moveSelection(dir: Direction) {
      const from = this.selected ?? STARTER_CELL
      if (from === HIVE_DOOR) {
        if (dir === 'N' || dir === 'NE' || dir === 'NW') this.selected = DOOR_FRONT_CELL
        return this.selected !== HIVE_DOOR
      }
      if (from === DOOR_FRONT_CELL && dir === 'S') {
        this.selected = HIVE_DOOR
        return true
      }
      const next = neighbor(parseKey(from), dir)
      if (hexDistance(next, HIVE_CENTER) > HIVE_RADIUS) return false
      this.selected = hexKey(next)
      return true
    },

    /** ← / →: alternate between the two diagonals on that side so the selection goes straight. */
    moveSelectionSideways(side: 'W' | 'E') {
      const [up, down] = side === 'W' ? (['NW', 'SW'] as const) : (['NE', 'SE'] as const)
      if (this.moveSelection(this.lateralFlip ? down : up)) this.lateralFlip = !this.lateralFlip
      else this.moveSelection(this.lateralFlip ? up : down)
    },

    /* ---------------- helpers ---------------- */
    has(cost: Amounts) {
      return ALL_RESOURCES.every(r => this.stock[r] >= (cost[r] ?? 0))
    },
    missing(cost: Amounts): Amounts {
      const m: Amounts = {}
      for (const r of ALL_RESOURCES) {
        const short = (cost[r] ?? 0) - this.stock[r]
        if (short > 0) m[r] = short
      }
      return m
    },
    pay(cost: Amounts) {
      for (const r of ALL_RESOURCES) this.stock[r] -= cost[r] ?? 0
    },

    /* ---------------- gathering (outside) ---------------- */
    /** Units left on a tile right now, including what has regrown. */
    tileAmount(tile: Tile, now = Date.now()) {
      const src = tileSource(tile)
      if (!src) return 0
      const rec = this.tiles[tile.key]
      if (!rec) return src.max
      const grown = Math.floor((now - rec.at) / (src.regen * 1000))
      return Math.min(src.max, rec.amount + grown)
    },

    /** Seconds until the next unit regrows on a tile (0 when full). */
    tileRegrowIn(tile: Tile, now = Date.now()) {
      const src = tileSource(tile)
      const rec = this.tiles[tile.key]
      if (!src || !rec || this.tileAmount(tile, now) >= src.max) return 0
      const ms = src.regen * 1000
      return Math.ceil((ms - ((now - rec.at) % ms)) / 1000)
    },

    /** Takes one unit from the tile into the pouch. Returns the resource, or null. */
    gather(tile: Tile, now = Date.now()): RawResource | null {
      const src = tileSource(tile)
      if (!src || this.pouchFull) return null
      const have = this.tileAmount(tile, now)
      if (have <= 0) return null
      const rec = this.tiles[tile.key]
      // Keep partial regrowth progress when the tile wasn't full.
      const ms = src.regen * 1000
      const at = !rec || have >= src.max ? now : rec.at + Math.floor((now - rec.at) / ms) * ms
      this.tiles[tile.key] = { amount: have - 1, at }
      this.pouch[src.resource]++
      if (this.first('gather')) {
        useGame().addJournal({
          id: 'first-gather',
          title: 'Sticky feet',
          body: 'I tried my first bit of gathering. It is harder than it looks and much stickier. My pouch has room for a little more, then I should fly it home.',
          icon: 'hive',
          subject: 'hive',
        })
      }
      return src.resource
    },

    /* ---------------- golden pollen ---------------- */
    /** Is there golden pollen sparkling on this tile right now? */
    goldenHere(tile: Tile | undefined, now = Date.now()) {
      if (!isGoldenSpot(tile)) return false
      const picked = this.golden[tile.key]
      return picked == null || now - picked >= GOLDEN_REGROW_MS
    },

    /** Picks up golden pollen (straight into the store). Returns true if some was taken. */
    pickGolden(tile: Tile, now = Date.now()) {
      if (!this.goldenHere(tile, now)) return false
      if (this.stock.golden >= this.storageCap) {
        useGame().announce('The store has no room for more golden pollen.')
        return false
      }
      this.golden[tile.key] = now
      this.stock.golden++
      const game = useGame()
      game.toast('Golden pollen! It went straight to the store.')
      game.announce('You found golden pollen. It went straight to the store.')
      if (this.first('golden')) {
        game.addJournal({
          id: 'first-golden',
          title: 'Something golden',
          body: 'Out here, far from home, some flowers sparkle. Their pollen is warm and glittery and hums a tiny tune. I tucked it safely away for the Queen.',
          icon: 'hive',
          subject: 'hive',
        }, false)
      }
      this.changed()
      return true
    },

    /**
     * Takes up to `n` units from a tile at time `at` (helper bees, including offline catch-up).
     * Returns how many were taken.
     */
    takeFromTile(tile: Tile, n: number, at: number) {
      const src = tileSource(tile)
      if (!src) return 0
      const have = this.tileAmount(tile, at)
      const take = Math.min(n, have)
      if (take <= 0) return 0
      const rec = this.tiles[tile.key]
      const ms = src.regen * 1000
      const since = rec ? Math.max(0, at - rec.at) : 0
      const keptAt = !rec || have >= src.max ? at : rec.at + Math.floor(since / ms) * ms
      this.tiles[tile.key] = { amount: have - take, at: keptAt }
      return take
    },

    /** Adds to the store as far as storage allows; returns how many fitted. */
    addStock(r: Resource, n: number) {
      const fit = Math.max(0, Math.min(n, this.storageCap - this.stock[r]))
      this.stock[r] += fit
      return fit
    },

    /** Empties the pouch into the hive store (as far as storage allows). */
    deposit() {
      const moved: Amounts = {}
      const shared: Amounts = {}
      for (const r of RAW_RESOURCES) {
        const have = this.pouch[r]
        if (!have) continue
        const n = Math.min(have, this.storageCap - this.stock[r])
        if (n > 0) {
          this.stock[r] += n
          moved[r] = n
        }
        // Whatever doesn't fit goes to the nursery, so a full store never leaves the pouch
        // stuck full (and the bee unable to gather anything else).
        if (have > n) shared[r] = have - n
        this.pouch[r] = 0
      }
      const any = Object.keys(moved).length > 0 || Object.keys(shared).length > 0
      if (any) {
        // Counts for "fly it home" requests either way: you did bring it.
        const brought: Amounts = { ...moved }
        for (const r of RAW_RESOURCES) if (shared[r]) brought[r] = (brought[r] ?? 0) + shared[r]!
        useQueen().noteBrought(brought)
        const game = useGame()
        const parts = []
        if (Object.keys(moved).length) parts.push(`Unloaded ${formatAmounts(moved)} into the hive.`)
        if (Object.keys(shared).length) parts.push(`The store was full, so ${formatAmounts(shared)} went to the nursery.`)
        const msg = parts.join(' ')
        game.toast(msg)
        game.announce(msg)
        this.tick()
        this.changed()
      }
      return any
    },

    /* ---------------- buildings (inside) ---------------- */
    status(key: string, now = Date.now()): CellStatus {
      if (key === QUEEN_CELL) return { kind: 'queen' }
      if (!this.unlocked.includes(key)) return { kind: 'locked' }
      const c = this.cells[key]
      if (!c?.building) return { kind: 'empty' }
      const def = BUILDINGS[c.building]
      if (!def.recipe) return { kind: 'storage' }
      if (c.startedAt != null) {
        const total = this.batchMs(key)
        const elapsed = Math.min(total, now - c.startedAt)
        return { kind: 'working', remaining: Math.ceil((total - elapsed) / 1000), progress: elapsed / total }
      }
      if (c.output >= TRAY_CAP) return { kind: 'full' }
      if (c.paused) return { kind: 'paused' }
      return { kind: 'waiting', missing: this.missing(def.recipe.in) }
    },

    /**
     * Advances every building to `now`: finishes batches, starts new ones while inputs last.
     * Batches chain back to back, so this also catches up after the game was closed.
     */
    tick(now = Date.now()) {
      let changed = false
      for (const key of Object.keys(this.cells)) {
        const c = this.cells[key]!
        const recipe = c.building ? BUILDINGS[c.building].recipe : undefined
        if (!recipe) continue
        const ms = this.batchMs(key)
        const tended = this.workersHere(key) > 0
        const product = Object.keys(recipe.out)[0] as Resource
        // A tray left waiting on a full store gets carried in once there's room.
        if (tended && c.output > 0 && this.storeOutput(c, product) > 0) changed = true
        if (c.startedAt != null && now - c.startedAt > OFFLINE_CAP_MS) c.startedAt = now - OFFLINE_CAP_MS
        let cursor = now
        for (let guard = 0; guard < 2000; guard++) {
          if (c.startedAt != null) {
            if (now - c.startedAt < ms) break
            c.output += Object.values(recipe.out)[0] ?? 1
            cursor = c.startedAt + ms
            c.startedAt = null
            changed = true
            // Helpers carry each batch straight to the store, so the tray never holds things up.
            if (tended) this.storeOutput(c, product)
          }
          if (c.paused || c.output >= TRAY_CAP || !this.has(recipe.in)) break
          this.pay(recipe.in)
          c.startedAt = cursor
          changed = true
        }
      }
      if (changed) this.changed()
      return changed
    },

    /** Helpers at this building who are home (a bee finishing a trip joins when it lands). */
    workersHere(key: string) {
      return useColony().workersAt(key).filter(b => !b.trip).length
    },

    /** How long one batch takes at this building right now. */
    batchMs(key: string) {
      const c = this.cells[key]
      const recipe = c?.building ? BUILDINGS[c.building].recipe : undefined
      if (!recipe) return Infinity
      return (recipe.seconds * 1000) / (1 + WORKER_SPEEDUP * this.workersHere(key))
    },

    /** Moves as much of a tray as fits into the store; returns how much moved. */
    storeOutput(c: CellState, product: Resource) {
      const n = Math.min(c.output, this.storageCap - this.stock[product])
      if (n <= 0) return 0
      c.output -= n
      this.stock[product] += n
      if (product === 'honey' && this.first('honey')) {
        useGame().addJournal({
          id: 'first-honey',
          title: 'Our very first honey',
          body: 'The press gave a happy little squeak and out came honey. Real honey! I licked the spoon. Then I licked it again, for science.',
          icon: 'hive',
          subject: 'hive',
        })
      }
      return n
    },

    /** Pause or resume a building (so it stops using up what you're saving). */
    togglePause(key: string) {
      const c = this.cells[key]
      if (!c?.building || !BUILDINGS[c.building].recipe) return
      c.paused = !c.paused
      const name = BUILDINGS[c.building].name
      useGame().announce(c.paused ? `${name} paused. It won't use any more of the store.` : `${name} is working again.`)
      this.tick()
      this.changed()
    },

    /** Moves a building's tray into the store. */
    collect(key: string) {
      const c = this.cells[key]
      const recipe = c?.building ? BUILDINGS[c.building].recipe : undefined
      if (!c || !recipe || c.output <= 0) return 0
      const product = Object.keys(recipe.out)[0] as Resource
      const n = this.storeOutput(c, product)
      if (n <= 0) {
        useGame().announce(`The store has no room for more ${RESOURCE_INFO[product].name}.`)
        return 0
      }
      useGame().announce(`Collected ${n} ${RESOURCE_INFO[product].name}.`)
      this.tick()
      this.changed()
      return n
    },

    collectAll() {
      let n = 0
      for (const key of Object.keys(this.cells)) n += this.collect(key)
      return n
    },

    build(key: string, id: BuildingId) {
      if (key === QUEEN_CELL || !this.unlocked.includes(key) || this.cells[key]?.building) return false
      const def = BUILDINGS[id]
      if (!this.has(def.cost)) return false
      this.pay(def.cost)
      this.cells[key] = { building: id, startedAt: null, output: 0 }
      useGame().announce(`Built a ${def.name}.`)
      this.tick()
      this.changed()
      return true
    },

    unlock(key: string) {
      if (this.unlocked.includes(key) || key === QUEEN_CELL) return false
      // Only cells next to an open one can be unsealed, so the hive grows outwards.
      const h = parseKey(key)
      const touching = this.unlocked.some(k => hexDistance(parseKey(k), h) === 1)
      if (!touching || !this.has(UNLOCK_CELL_COST)) return false
      this.pay(UNLOCK_CELL_COST)
      this.unlocked.push(key)
      useGame().announce('Unsealed a new cell. Room to build!')
      this.changed()
      return true
    },

    canUnlock(key: string) {
      if (this.unlocked.includes(key) || key === QUEEN_CELL) return false
      const h = parseKey(key)
      return this.unlocked.some(k => hexDistance(parseKey(k), h) === 1)
    },

    upgrade(id: UpgradeId) {
      const def = UPGRADES[id]
      const lvl = this.upgrades[id]
      const cost = def.costs[lvl]
      if (!cost || !this.has(cost)) return false
      this.pay(cost)
      this.upgrades[id] = lvl + 1
      useGame().announce(`${def.name}: ${def.describe(def.values[lvl + 1]!)}.`)
      this.changed()
      return true
    },

    changed() {
      this.rev++
      this.save()
    },
  },
})
