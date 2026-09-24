import { defineStore } from 'pinia'
import { markRaw } from 'vue'
import {
  type Direction,
  type Hex,
  DIRECTION_LIST,
  DIRECTION_NAMES,
  compassWord,
  directionBetween,
  findPath,
  hexDistance,
  hexKey,
  hexesInRange,
  neighbor,
} from '~/utils/hex'
import { useColony } from './colony'
import { HIVE_DOOR, QUEEN_CELL, useHive } from './hive'
import { useQueen } from './queen'
import { useSettings } from './settings'
import { RESOURCE_INFO, UNLOCK_CELL_COST, tileSource } from '~/utils/resources'
import { KEEPSAKES, KEEPSAKE_BY_POI, type KeepsakeId, type KeepsakeSlot } from '~/utils/keepsakes'
import { SPECIES } from '~/utils/species'
import { DOORSTEP, HOME, POI_BY_ID, type PoiId, REVEAL_RADIUS, TERRAIN_LABEL, type Terrain, useWorldData } from '~/utils/world'

export type JournalIcon = 'hive' | 'poi' | 'terrain'

export interface JournalEntry {
  id: string
  title: string
  body: string
  icon: JournalIcon
  /** POI or terrain the entry is about, for the illustration. */
  subject?: string
  day: number
  unread: boolean
}

export type ActionId = 'enter' | 'leave' | 'collect' | 'unseal' | 'befriend' | 'queen'

export interface Toast {
  id: number
  text: string
}

const TERRAIN_NOTES: Partial<Record<Terrain, { title: string, body: string }>> = {
  meadow: {
    title: 'Sunny meadow',
    body: 'The grass is taller here and the sun is warmer. Everything smells a little bit like honey already.',
  },
  flowers: {
    title: 'So many flowers',
    body: 'Pink ones, white ones, ones that wiggle when I land. I should bring a basket next time. Do bees have baskets?',
  },
  forest: {
    title: 'Whispering woods',
    body: 'Big round trees that sway even when there is no wind. It is shady and cool. I flew a bit quieter, just to be polite.',
  },
  water: {
    title: 'Lily water',
    body: 'Cool air rises off the water. My reflection looked brave. I looked back at it bravely.',
  },
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

let toastSeq = 0

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
        if (wild) return { id: 'befriend', label: `Befriend ${SPECIES[wild].name}` }
        return hexDistance(s.pos, HOME) === 1 ? { id: 'enter', label: 'Enter hive' } : null
      }
      const hive = useHive()
      const key = hive.selected
      if (!key) return null
      if (key === HIVE_DOOR) return { id: 'leave', label: 'Leave hive' }
      if (key === QUEEN_CELL) {
        void hive.rev
        return { id: 'queen', label: useQueen().ready() ? 'Give to the Queen' : 'Talk to the Queen' }
      }
      const output = hive.cells[key]?.output ?? 0
      if (output > 0) return { id: 'collect', label: `Collect ${output}` }
      if (hive.canUnlock(key) && hive.has(UNLOCK_CELL_COST)) return { id: 'unseal', label: 'Unseal' }
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
          title: 'Off I go!',
          body: 'The Queen says bees used to live far beyond our meadow, a long time ago. Nobody remembers where. She gave me an empty journal and a honey snack and said: "Go and see." So I am going to see.',
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
      this.announce('Progress reset. You are back at the Home Hive.')
    },

    // ---------- fog of war ----------
    reveal(center: Hex, silent = false) {
      const world = useWorldData()
      const fresh: string[] = []
      for (const h of hexesInRange(center, REVEAL_RADIUS)) {
        const k = hexKey(h)
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
      return !!useWorldData().byKey.get(hexKey(h))?.walkable
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
        this.announce('The mist is too thick to fly into. Not yet.')
        return false
      }
      const path = findPath(from, target, h => this.isWalkable(h))
      if (!path.length) return false
      // If mid-flight, keep the leg in progress and replace the rest.
      this.queue = this.moving && this.queue.length ? [this.queue[0]!, ...path] : path
      if (this.settingsNarration()) {
        const d = hexDistance(this.pos, target)
        this.announce(`Flying ${compassWord(this.pos, target)}, ${d} ${d === 1 ? 'hex' : 'hexes'} to ${this.describeTile(target)}.`)
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
        this.announce(tile?.terrain === 'hive' ? 'That is the Home Hive. Cozy, but no time for naps yet.' : tile ? 'The mist is too thick that way.' : `You can't fly ${DIRECTION_NAMES[dir]} from here.`)
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
        this.announce('Flying into the Home Hive.')
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
      this.announce('Flying back out to the meadow.')
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
            title: 'Home, inside',
            body: 'Warm, golden and humming. The Queen waved at me from her cushion. There is space here to build things, if I bring back enough to build with.',
            icon: 'hive',
            subject: 'hive',
          })
        }
      }
    },

    endTransition() {
      this.transition = null
      if (this.scene === 'hive') this.announce('Inside the Home Hive, at the doorway. Fly to a cell to build on, collect from, or unseal; come back to the doorway to leave.')
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
      const def = POI_BY_ID[id]
      this.addJournal({ id: `poi:${id}`, ...def.journal, icon: 'poi', subject: id })
      const k = KEEPSAKE_BY_POI[id]
      if (k) this.giveKeepsake(k)
    },

    // ---------- keepsakes ----------
    giveKeepsake(id: KeepsakeId) {
      if (this.keepsakes.includes(id)) return
      this.keepsakes.push(id)
      const def = KEEPSAKES[id]
      this.toast(`Keepsake found: ${def.name}!`)
      this.announce(`You found a keepsake: ${def.name}. Wear it from the Keepsakes page in your journal.`)
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
      const note = TERRAIN_NOTES[t]
      if (note) this.addJournal({ id: `terrain:${t}`, ...note, icon: 'terrain', subject: t })
    },

    // ---------- journal ----------
    addJournal(e: Omit<JournalEntry, 'day' | 'unread'>, notify = true) {
      if (this.journal.some(j => j.id === e.id)) return
      this.journal.push({ ...e, day: this.day, unread: true })
      if (notify) {
        this.toast(`New journal entry: ${e.title}`)
        this.announce(`New journal entry: ${e.title}. Press J to read it.`)
      }
      this.save()
    },

    markJournalRead() {
      for (const e of this.journal) e.unread = false
      this.save()
    },

    // ---------- narration & UI ----------
    toast(text: string) {
      const id = ++toastSeq
      this.toasts.push({ id, text })
      setTimeout(() => {
        this.toasts = this.toasts.filter(t => t.id !== id)
      }, 3800)
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
      if (!tile) return 'nowhere'
      if (tile.poi && this.isDiscovered(h)) return POI_BY_ID[tile.poi].name
      if (!this.isDiscovered(h)) return 'an unexplored spot'
      return TERRAIN_LABEL[tile.terrain]
    },

    /** Full description of the current spot and surroundings (the "Look around" action). */
    describeHere() {
      const world = useWorldData()
      const here = this.describeTile(this.pos)
      const around = DIRECTION_LIST.map((d) => {
        const n = neighbor(this.pos, d)
        const t = world.byKey.get(hexKey(n))
        if (!t) return null
        return `${DIRECTION_NAMES[d]}: ${t.walkable ? this.describeTile(n) : 'thick mist'}`
      }).filter(Boolean)
      // Nearest discovered but unvisited point of interest.
      let hint = ''
      let best = Infinity
      for (const p of world.pois) {
        if (this.visitedPois.includes(p.id) || !this.isDiscovered(p.hex)) continue
        const d = hexDistance(this.pos, p.hex)
        if (d < best) {
          best = d
          hint = ` Something interesting, ${POI_BY_ID[p.id].name}, is ${d} ${d === 1 ? 'hex' : 'hexes'} ${compassWord(this.pos, p.hex)}.`
        }
      }
      // What can be gathered right here.
      let gather = ''
      const tile = world.byKey.get(hexKey(this.pos))
      const src = tileSource(tile)
      if (tile && src) {
        const left = useHive().tileAmount(tile)
        const name = RESOURCE_INFO[src.resource].name.toLowerCase()
        gather = left > 0 ? ` You can gather ${name} here, ${left} left.` : ` The ${name} here has been gathered; it is growing back.`
      }
      return `You are at ${here}.${gather} Around you, ${around.join('; ')}.${hint}`
    },
  },
})
