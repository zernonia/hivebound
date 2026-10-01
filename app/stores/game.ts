import { defineStore } from 'pinia'
import { track } from '~/utils/analytics'
import { markRaw } from 'vue'
import {
  type Direction,
  type Hex,
  DIRECTION_LIST,
  compassWord,
  directionBetween,
  directionName,
  findPath,
  hexDistance,
  hexKey,
  hexesInRange,
  neighbor,
} from '~/utils/hex'
import { appI18n } from '~/utils/i18n'
import { useColony } from './colony'
import { HIVE_DOOR, QUEEN_CELL, useHive } from './hive'
import { useQueen } from './queen'
import { useSettings } from './settings'
import { UNLOCK_CELL_COST, resourceLower, resourceSome, tileSource } from '~/utils/resources'
import { KEEPSAKE_BY_POI, keepsakeName, type KeepsakeId, type KeepsakeSlot } from '~/utils/keepsakes'
import { SPECIES, speciesBefriend, type SpeciesId } from '~/utils/species'
import { DOORSTEP, HOME, type PoiId, REVEAL_RADIUS, type Terrain, poiAt, poiName, poiThe, terrainAt, terrainLabel, useWorldData } from '~/utils/world'

export type JournalIcon = 'hive' | 'poi' | 'terrain'

export interface JournalEntry {
  id: string
  /**
   * Message keys, so entries re-render whenever the language changes. Params stay
   * language-neutral (ids and numbers); the message does all the wording.
   */
  titleKey?: string
  bodyKey?: string
  params?: Record<string, string | number>
  /**
   * Raw text, kept only so entries written by saves made before translations still show.
   * Their keys are re-derived from the id at render time (see journalKeysFor), so even
   * they follow the language; this is the last resort if the id isn't one we know.
   */
  title?: string
  body?: string
  icon: JournalIcon
  /** POI or terrain the entry is about, for the illustration. */
  subject?: string
  day: number
  unread: boolean
}

/**
 * Every journal entry ever written has one of a handful of stable ids, so the keys an
 * entry would have been written with can be re-derived from its id — which un-translates
 * entries from saves made before translations existed, whatever the language being played.
 */
function journalKeysFor(e: JournalEntry): { title: string, body: string, params?: Record<string, string | number> } | null {
  if (e.id.startsWith('poi:')) {
    const id = e.id.slice(4)
    return { title: `pois.${id}.journalTitle`, body: `pois.${id}.journalBody` }
  }
  if (e.id.startsWith('terrain:')) {
    const t = e.id.slice(8)
    return { title: `journal.terrain.${t}.title`, body: `journal.terrain.${t}.body` }
  }
  if (e.id.startsWith('bee:')) {
    const species = e.id.slice(4)
    if (!Object.hasOwn(SPECIES, species)) return null
    return { title: `species.${species}.journalTitle`, body: `species.${species}.journalBody`, params: { name: beeNameFor(species as SpeciesId) } }
  }
  if (e.id.startsWith('queen:')) {
    const id = e.id.slice(6)
    return { title: `requests.${id}.title`, body: `requests.${id}.thanksBody` }
  }
  switch (e.id) {
    case 'intro': return { title: 'journal.intro.title', body: 'journal.intro.body' }
    case 'inside-hive': return { title: 'journal.insideHive.title', body: 'journal.insideHive.body' }
    case 'first-gather': return { title: 'journal.firstGather.title', body: 'journal.firstGather.body' }
    case 'first-golden': return { title: 'journal.firstGolden.title', body: 'journal.firstGolden.body' }
    case 'first-honey': return { title: 'journal.firstHoney.title', body: 'journal.firstHoney.body' }
    case 'first-night': return { title: 'journal.firstNight.title', body: 'journal.firstNight.body' }
    case 'mist-lifts': return { title: 'journal.mistLifts.title', body: 'journal.mistLifts.body' }
    case 'the-end': return { title: 'journal.theEnd.title', body: 'journal.theEnd.body' }
    default: return null
  }
}

/** The name of the first bee of a species (home or released), for legacy bee entries. */
function beeNameFor(species: SpeciesId): string {
  const colony = useColony()
  return colony.bees.find(b => b.species === species)?.name
    ?? colony.released.find(r => r.species === species)?.name
    ?? ''
}

/**
 * An entry's title, translated now: keyed entries re-render, legacy ones get their keys
 * re-derived from the id, and only a truly unknown id keeps its raw text.
 */
export function journalTitle(e: JournalEntry): string {
  if (e.titleKey) return appI18n().t(e.titleKey, { ...e.params })
  const keys = journalKeysFor(e)
  if (keys) return appI18n().t(keys.title, { ...keys.params })
  return e.title ?? ''
}

export function journalBody(e: JournalEntry): string {
  if (e.bodyKey) return appI18n().t(e.bodyKey, { ...e.params })
  const keys = journalKeysFor(e)
  if (keys) return appI18n().t(keys.body, { ...keys.params })
  return e.body ?? ''
}

export type ActionId = 'enter' | 'leave' | 'collect' | 'unseal' | 'befriend' | 'queen'

export interface Toast {
  id: number
  text: string
}

/** Terrains that get a first-visit note; the text lives in journal.terrain.<t>.*. */
const TERRAIN_NOTES: Partial<Record<Terrain, true>> = {
  meadow: true,
  flowers: true,
  forest: true,
  water: true,
  lavender: true,
  amber: true,
}

const SAVE_KEY = 'hivebound:save:v1'

interface SaveData {
  pos: Hex
  discovered: string[]
  visitedPois: PoiId[]
  seenTerrain: Terrain[]
  journal: JournalEntry[]
  steps: number
  keepsakes?: KeepsakeId[]
  wearing?: Partial<Record<KeepsakeSlot, KeepsakeId>>
}

/** Toasts on screen at once; more wait their turn. */
const MAX_TOASTS = 2
/** Toasts waiting to show; in a flood the oldest waiting ones are dropped. */
const MAX_WAITING = 4
let toastSeq = 0
const toastQueue: string[] = []

export const useGame = defineStore('game', {
  state: () => ({
    pos: { ...DOORSTEP } as Hex,
    facing: 'S' as Direction,
    /** Hexes still to fly through, in order. */
    queue: [] as Hex[],
    moving: false,
    /** Revealed tile keys. Kept non-reactive; `revealTick` signals changes. */
    discovered: markRaw(new Set<string>()),
    revealTick: 0,
    /** Keys revealed in the most recent reveal, for the pop-in animation. */
    freshlyRevealed: [] as string[],
    visitedPois: [] as PoiId[],
    seenTerrain: [] as Terrain[],
    journal: [] as JournalEntry[],
    steps: 0,
    /** Keepsakes found, and which one is worn in each slot. */
    keepsakes: [] as KeepsakeId[],
    wearing: {} as Partial<Record<KeepsakeSlot, KeepsakeId>>,
    hoverKey: null as string | null,
    announcement: '',
    announceTick: 0,
    toasts: [] as Toast[],
    journalOpen: false,
    settingsOpen: false,
    /** Quick build menu for the selected hive cell (B). */
    buildMenuOpen: false,
    /** Colony or Upgrades sheet in the hive (C / U), or none. */
    hiveSheet: null as null | 'colony' | 'upgrades',
    /** Alternates NW/SW (or NE/SE) so holding ← / → travels in a straight line. */
    lateralFlip: false,
    loaded: false,
    /** Which scene the bee is in. */
    scene: 'world' as 'world' | 'hive',
    /** Flying into / out of the hive; the scene drives the animation and clears this. */
    transition: null as null | 'enter' | 'exit',
    /** Colour wipe used to hide the scene swap during a transition. */
    irisClosed: false,
    /** Go inside as soon as the bee reaches the doorstep. */
    enterOnArrival: false,
  }),

  getters: {
    currentTile(s) {
      return useWorldData().byKey.get(hexKey(s.pos))
    },
    unreadCount(s) {
      return s.journal.filter(e => e.unread).length
    },
    day(s) {
      return 1 + Math.floor(s.steps / 60)
    },
    /**
     * The one thing F (or the floating prompt) does right now, if anything:
     * go in at the doorstep; inside, collect / unseal the selected cell or leave by the door.
     */
    primaryAction(s): { id: ActionId, label: string } | null {
      if (s.transition) return null
      if (s.scene === 'world') {
        if (s.queue.length) return null
        const colony = useColony()
        if (colony.dance) return null
        // A wild bee here comes first: they wander off, the hive doesn't.
        void colony.rev
        const wild = colony.wildBeeAt(useWorldData().byKey.get(hexKey(s.pos)))
        if (wild) return { id: 'befriend', label: appI18n().t(`species.${wild}.befriend`) }
        return hexDistance(s.pos, HOME) === 1 ? { id: 'enter', label: appI18n().t('actions.enter') } : null
      }
      const hive = useHive()
      const key = hive.selected
      if (!key) return null
      if (key === HIVE_DOOR) return { id: 'leave', label: appI18n().t('actions.leave') }
      if (key === QUEEN_CELL) {
        void hive.rev
        return { id: 'queen', label: appI18n().t(useQueen().ready() ? 'actions.give' : 'actions.talk') }
      }
      const output = hive.cells[key]?.output ?? 0
      if (output > 0) return { id: 'collect', label: appI18n().t('actions.collect', { n: output }) }
      if (hive.canUnlock(key) && hive.has(UNLOCK_CELL_COST)) return { id: 'unseal', label: appI18n().t('actions.unseal') }
      return null
    },
    /** The final destination of the current route, if any. */
    destination(s): Hex | null {
      return s.queue.length ? s.queue[s.queue.length - 1]! : null
    },
  },

  actions: {
    // ---------- persistence ----------
    load() {
      const world = useWorldData()
      try {
        const raw = localStorage.getItem(SAVE_KEY)
        if (raw) {
          const data = JSON.parse(raw) as SaveData
          if (world.byKey.has(hexKey(data.pos))) this.pos = data.pos
          this.discovered = markRaw(new Set(data.discovered))
          this.visitedPois = data.visitedPois ?? []
          this.seenTerrain = data.seenTerrain ?? []
          this.journal = data.journal ?? []
          this.steps = data.steps ?? 0
          this.keepsakes = data.keepsakes ?? []
          this.wearing = data.wearing ?? {}
        }
      }
      catch { /* corrupt or unavailable storage: start fresh */ }

      if (!this.journal.length) {
        this.addJournal({
          id: 'intro',
          titleKey: 'journal.intro.title',
          bodyKey: 'journal.intro.body',
          icon: 'hive',
          subject: 'hive',
        }, false)
      }
      // Places visited before keepsakes existed still hand theirs over.
      for (const id of this.visitedPois) {
        const k = KEEPSAKE_BY_POI[id]
        if (k && !this.keepsakes.includes(k)) this.keepsakes.push(k)
      }
      this.reveal(this.pos, true)
      this.loaded = true
    },

    save() {
      const data: SaveData = {
        pos: this.pos,
        discovered: [...this.discovered],
        visitedPois: this.visitedPois,
        seenTerrain: this.seenTerrain,
        journal: this.journal,
        steps: this.steps,
        keepsakes: this.keepsakes,
        wearing: this.wearing,
      }
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(data))
      }
      catch { /* ignore */ }
    },

    resetProgress() {
      try {
        localStorage.removeItem(SAVE_KEY)
      }
      catch { /* ignore */ }
      this.pos = { ...DOORSTEP }
      this.queue = []
      this.moving = false
      this.discovered = markRaw(new Set())
      this.visitedPois = []
      this.seenTerrain = []
      this.journal = []
      this.steps = 0
      this.keepsakes = []
      this.wearing = {}
      this.scene = 'world'
      this.transition = null
      this.irisClosed = false
      this.enterOnArrival = false
      useHive().reset()
      useColony().reset()
      this.load()
      useQueen().reset()
      this.announce(appI18n().t('game.resetDone'))
    },

    // ---------- fog of war ----------
    reveal(center: Hex, silent = false) {
      const world = useWorldData()
      const fresh: string[] = []
      for (const h of hexesInRange(center, REVEAL_RADIUS)) {
        const k = hexKey(h)
        // Nothing beyond the mist is seen until it lifts.
        if (world.byKey.get(k)?.beyond && !useQueen().mistLifted) continue
        if (world.byKey.has(k) && !this.discovered.has(k)) {
          this.discovered.add(k)
          fresh.push(k)
        }
      }
      if (fresh.length) {
        this.freshlyRevealed = silent ? [] : fresh
        this.revealTick++
      }
      return fresh
    },

    isDiscovered(h: Hex) {
      return this.discovered.has(hexKey(h))
    },

    // ---------- movement ----------
    isWalkable(h: Hex) {
      const tile = useWorldData().byKey.get(hexKey(h))
      if (!tile) return false
      // The mist ring and the land beyond open only once chapter one lifts the mist.
      if (tile.gate || tile.beyond) return useQueen().mistLifted && (tile.gate || tile.walkable)
      return tile.walkable
    },

    /** Queue a route to any tile. */
    travelTo(target: Hex): boolean {
      // A new destination cancels a pending "go inside".
      this.enterOnArrival = false
      const from = this.moving && this.queue.length ? this.queue[0]! : this.pos
      const tile = useWorldData().byKey.get(hexKey(target))
      if (!tile) return false
      if (!tile.walkable) {
        if (tile.terrain === 'hive') return this.enterHive()
        this.announce(appI18n().t('game.mistTooThick'))
        return false
      }
      const path = findPath(from, target, h => this.isWalkable(h))
      if (!path.length) return false
      // If mid-flight, keep the leg in progress and replace the rest.
      this.queue = this.moving && this.queue.length ? [this.queue[0]!, ...path] : path
      if (this.settingsNarration()) {
        const d = hexDistance(this.pos, target)
        this.announce(appI18n().t('narration.flyingTo', { compass: compassWord(this.pos, target), tile: this.describeTile(target) }, d))
      }
      return true
    },

    /** Fly one hex in a direction (keyboard / gamepad). */
    step(dir: Direction) {
      // Only buffer one extra hex so held keys don't overshoot.
      if (this.queue.length > 1) return false
      const from = this.queue.length ? this.queue[0]! : this.pos
      const next = neighbor(from, dir)
      if (!this.isWalkable(next)) {
        this.facing = dir
        const tile = useWorldData().byKey.get(hexKey(next))
        this.announce(appI18n().t(tile?.terrain === 'hive' ? 'game.thatIsHive' : tile ? 'game.mistThatWay' : 'game.noFlyDir', { dir: directionName(dir) }))
        return false
      }
      this.queue.push(next)
      return true
    },

    /** ← / → map to alternating diagonals so holding the key goes straight. */
    stepLateral(side: 'W' | 'E') {
      const [a, b] = side === 'W' ? (['NW', 'SW'] as const) : (['NE', 'SE'] as const)
      const dir = this.lateralFlip ? b : a
      if (this.step(dir)) this.lateralFlip = !this.lateralFlip
      else if (this.step(this.lateralFlip ? a : b)) { /* fallback diagonal worked */ }
    },

    cancelRoute() {
      this.queue = this.moving ? this.queue.slice(0, 1) : []
      this.enterOnArrival = false
    },

    // ---------- the hive ----------
    /** On one of the six tiles round the hive, not flying anywhere. */
    besideHive() {
      return hexDistance(this.pos, HOME) === 1 && !this.queue.length
    },

    /** The walkable tile next to the hive that's the shortest flight from `from`. */
    nearestHiveSide(start?: Hex): Hex {
      const from = start ?? this.pos
      const sides = DIRECTION_LIST.map(d => neighbor(HOME, d)).filter(h => this.isWalkable(h))
      let best = DOORSTEP
      let bestLen = Infinity
      for (const h of sides) {
        const len = hexDistance(from, h) === 0 ? 0 : findPath(from, h, t => this.isWalkable(t)).length || Infinity
        if (len < bestLen) {
          bestLen = len
          best = h
        }
      }
      return best
    },

    /** Home button / H: fly to whichever side of the hive is closest. */
    flyHome() {
      if (this.scene !== 'world') return false
      const side = this.nearestHiveSide(this.moving && this.queue.length ? this.queue[0]! : this.pos)
      return this.travelTo(side)
    },

    /** Flies home if needed, then goes inside. */
    enterHive() {
      if (this.scene !== 'world' || this.transition) return false
      if (this.besideHive()) {
        useHive().deposit()
        this.transition = 'enter'
        this.announce(appI18n().t('game.flyingIn'))
        return true
      }
      if (!this.travelTo(this.nearestHiveSide(this.moving && this.queue.length ? this.queue[0]! : this.pos))) return false
      this.enterOnArrival = true
      return true
    },

    /** Runs the current primary action (F key / prompt button). */
    doAction() {
      const a = this.primaryAction
      if (!a) return false
      const hive = useHive()
      switch (a.id) {
        case 'enter': return this.enterHive()
        case 'leave': return this.leaveHive()
        case 'collect': return hive.collect(hive.selected!) > 0
        case 'unseal': return hive.unlock(hive.selected!)
        case 'befriend': return useColony().startDance(hexKey(this.pos))
        case 'queen': return useQueen().talk()
      }
    },

    /** Out the way you came in: only from the doorway, so the bee never flies itself there. */
    leaveHive() {
      if (this.scene !== 'hive' || this.transition) return false
      if (useHive().selected !== HIVE_DOOR) return false
      this.transition = 'exit'
      this.announce(appI18n().t('game.flyingOut'))
      return true
    },

    /** Called by the scene at the moment the iris is fully closed. */
    swapScene() {
      this.scene = this.transition === 'enter' ? 'hive' : 'world'
      if (this.scene === 'world') {
        // Out through the door onto the doorstep, whichever side the bee came in from.
        this.pos = { ...DOORSTEP }
        this.queue = []
        this.moving = false
        this.save()
      }
      if (this.scene === 'hive') {
        const hive = useHive()
        // Every visit starts just inside the doorway; the bee goes wherever you steer it from there.
        hive.selected = HIVE_DOOR
        hive.tick()
        if (hive.first('inside')) {
          this.addJournal({
            id: 'inside-hive',
            titleKey: 'journal.insideHive.title',
            bodyKey: 'journal.insideHive.body',
            icon: 'hive',
            subject: 'hive',
          })
        }
      }
    },

    endTransition() {
      this.transition = null
      if (this.scene === 'hive') this.announce(appI18n().t('game.insideDoorway'))
      else if (this.settingsNarration()) this.announce(this.describeHere())
    },

    /** Called by the scene when a leg (one hex of flight) starts. */
    beginLeg() {
      const next = this.queue[0]
      if (!next) return null
      const dir = directionBetween(this.pos, next)
      if (dir) this.facing = dir
      this.moving = true
      return next
    },

    /** Called by the scene when a leg reaches its hex. */
    arrive() {
      const next = this.queue.shift()
      if (!next) {
        this.moving = false
        return
      }
      this.pos = next
      this.steps++
      this.reveal(next)
      const tile = this.currentTile
      if (tile) {
        if (tile.poi && !this.visitedPois.includes(tile.poi)) this.visitPoi(tile.poi)
        else if (!this.seenTerrain.includes(tile.terrain)) this.firstTerrain(tile.terrain)
      }
      // Golden pollen is picked up just by flying over it.
      if (tile) useHive().pickGolden(tile)
      const besideHome = hexDistance(next, HOME) === 1
      if (besideHome) useHive().deposit()
      if (!this.queue.length) {
        this.moving = false
        if (this.enterOnArrival) {
          this.enterOnArrival = false
          if (besideHome) {
            this.save()
            this.enterHive()
            return
          }
        }
        if (this.settingsNarration()) this.announce(this.describeHere())
        this.save()
      }
      // Long routes still checkpoint now and then, so closing the tab mid-flight loses little.
      else if (this.steps % 5 === 0) this.save()
    },

    visitPoi(id: PoiId) {
      this.visitedPois.push(id)
      track('place_visited', { place: id, places: this.visitedPois.length, day: this.day })
      this.addJournal({ id: `poi:${id}`, titleKey: `pois.${id}.journalTitle`, bodyKey: `pois.${id}.journalBody`, icon: 'poi', subject: id })
      const k = KEEPSAKE_BY_POI[id]
      if (k) this.giveKeepsake(k)
    },

    // ---------- keepsakes ----------
    giveKeepsake(id: KeepsakeId) {
      if (this.keepsakes.includes(id)) return
      this.keepsakes.push(id)
      this.toast(appI18n().t('game.keepsakeFound', { name: keepsakeName(id) }))
      this.announce(appI18n().t('game.keepsakeFoundAnnounce', { name: keepsakeName(id) }))
      this.save()
    },

    /** Puts a keepsake on (replacing whatever is in its slot), or takes it off if worn. */
    toggleWear(id: KeepsakeId) {
      if (!this.keepsakes.includes(id)) return
      const slot = KEEPSAKES[id].slot
      if (this.wearing[slot] === id) delete this.wearing[slot]
      else this.wearing[slot] = id
      this.save()
    },

    firstTerrain(t: Terrain) {
      this.seenTerrain.push(t)
      if (TERRAIN_NOTES[t]) this.addJournal({ id: `terrain:${t}`, titleKey: `journal.terrain.${t}.title`, bodyKey: `journal.terrain.${t}.body`, icon: 'terrain', subject: t })
    },

    // ---------- journal ----------
    addJournal(e: Omit<JournalEntry, 'day' | 'unread'>, notify = true) {
      if (this.journal.some(j => j.id === e.id)) return
      this.journal.push({ ...e, day: this.day, unread: true })
      if (notify) {
        const title = journalTitle(this.journal[this.journal.length - 1]!)
        this.toast(appI18n().t('game.newEntryToast', { title }))
        this.announce(appI18n().t('game.newEntryAnnounce', { title }))
      }
      this.save()
    },

    markJournalRead() {
      for (const e of this.journal) e.unread = false
      this.save()
    },

    // ---------- narration & UI ----------
    /**
     * A short visual note (the announcer covers screen readers). At most two are on screen;
     * the rest wait in a short queue and appear as earlier ones leave, so a burst never fills
     * the screen. The same message is never shown or queued twice, and longer notes stay up a
     * little longer so there's time to read them.
     */
    toast(text: string) {
      if (this.toasts.some(t => t.text === text) || toastQueue.includes(text)) return
      if (this.toasts.length >= MAX_TOASTS) {
        toastQueue.push(text)
        if (toastQueue.length > MAX_WAITING) toastQueue.shift()
        return
      }
      this.showToast(text)
    },
    showToast(text: string) {
      const id = ++toastSeq
      this.toasts = [...this.toasts, { id, text }]
      const ms = Math.min(7000, 3500 + text.length * 35)
      setTimeout(() => {
        this.toasts = this.toasts.filter(t => t.id !== id)
        const next = toastQueue.shift()
        // A short breath between one leaving and the next arriving.
        if (next) setTimeout(() => this.showToast(next), 250)
      }, ms)
    },

    announce(msg: string) {
      this.announcement = msg
      this.announceTick++
    },

    settingsNarration() {
      return useSettings().narration
    },

    describeTile(h: Hex) {
      const tile = useWorldData().byKey.get(hexKey(h))
      if (!tile) return appI18n().t('narration.nowhere')
      if (tile.poi && this.isDiscovered(h)) return poiName(tile.poi)
      if (!this.isDiscovered(h)) return appI18n().t('narration.unexplored')
      return terrainLabel(tile.terrain)
    },

    /** Same, with the preposition baked in ("at the Quiet Pond" / « à l'Étang Tranquille »). */
    describeTileAt(h: Hex) {
      const tile = useWorldData().byKey.get(hexKey(h))
      if (!tile) return appI18n().t('narration.nowhere')
      if (tile.poi && this.isDiscovered(h)) return poiAt(tile.poi)
      if (!this.isDiscovered(h)) return appI18n().t('narration.unexplored')
      return terrainAt(tile.terrain)
    },

    /** Full description of the current spot and surroundings (the "Look around" action). */
    describeHere() {
      const t = appI18n().t
      const world = useWorldData()
      const here = this.describeTileAt(this.pos)
      const around = DIRECTION_LIST.map((d) => {
        const n = neighbor(this.pos, d)
        const tile = world.byKey.get(hexKey(n))
        if (!tile) return null
        return t('narration.aroundEntry', { dir: directionName(d), what: tile.walkable ? this.describeTile(n) : t('narration.thickMist') })
      }).filter(Boolean)
      // Nearest discovered but unvisited point of interest.
      let hint = ''
      let best = Infinity
      for (const p of world.pois) {
        if (this.visitedPois.includes(p.id) || !this.isDiscovered(p.hex)) continue
        const d = hexDistance(this.pos, p.hex)
        if (d < best) {
          best = d
          hint = ` ${t('narration.interesting', { the: poiThe(p.id), compass: compassWord(this.pos, p.hex) }, d)}`
        }
      }
      // What can be gathered right here.
      let gather = ''
      const tile = world.byKey.get(hexKey(this.pos))
      const src = tileSource(tile)
      if (tile && src) {
        const left = useHive().tileAmount(tile)
        gather = left > 0
          ? ` ${t('narration.gatherHere', { some: resourceSome(src.resource), left })}`
          : ` ${t('narration.gatheredBack', { some: resourceSome(src.resource), name: resourceLower(src.resource) })}`
      }
      return `${t('narration.youAreAt', { at: here })}.${gather} ${t('narration.aroundYou', { around: around.join('; ') })}.${hint}`
    },
  },
})
