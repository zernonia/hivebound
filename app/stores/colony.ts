import { defineStore } from 'pinia'
import { type Hex, hexDistance, hexKey, parseKey } from '~/utils/hex'
import { hash2 } from '~/utils/noise'
import { BUILDINGS, OFFLINE_CAP_MS, RESOURCE_INFO, type RawResource, tileSource } from '~/utils/resources'
import { SPECIES, SPECIES_BY_HABITAT, type SpeciesId, pickName } from '~/utils/species'
import { HOME, type Tile, WORLD_SEED, useWorldData } from '~/utils/world'
import { useGame } from './game'
import { useHive } from './hive'
import { useSettings } from './settings'
import { isNight } from '~/utils/daylight'

/*
 * Helper bees: meeting wild bees, befriending them with a little timing dance, giving them a
 * home, and the gathering trips they fly for the hive (which also run while the game is closed).
 */

/** Wild bees move to new tiles every this often. */
const ENCOUNTER_WINDOW_MS = 8 * 60 * 1000
/** Share of habitat tiles with a wild bee on them at any time. */
const WILD_RATE = 0.05
/** Helper bees only fly to tiles this close to the hive. */
const GATHER_RANGE = 10
/** Rooms for helpers before any Bee Room is built, and the most the hive can ever hold. */
const BASE_HOUSING = 2
export const MAX_COLONY = 20
const DANCE_TRIES = 3
/** A little rest at home between trips (they potter about the hive meanwhile). */
const REST_BETWEEN_TRIPS_MS = 8000
const SAVE_KEY = 'hivebound:colony:v1'
/** Gathering time multiplier when a helper is on its favourite job. */
export const FAVOURITE_GATHER = 0.6

/** Gather a resource, work at a building in a hive cell (`cell:<key>`), or rest (null). */
export type BeeJob = RawResource | `cell:${string}` | null

/** Most helpers that can work at one building at once. */
export const MAX_WORKERS = 2

/** The resource a gathering job fetches, or null for any other job. */
export const gatherJob = (job: BeeJob): RawResource | null => (job && !job.startsWith('cell:') ? job as RawResource : null)
/** The hive cell a building job works at, or null. */
export const workCell = (job: BeeJob): string | null => (job?.startsWith('cell:') ? job.slice(5) : null)

export interface Trip {
  tile: string
  resource: RawResource
  /** ms epoch the bee left the hive. */
  startAt: number
  outMs: number
  gatherMs: number
  backMs: number
  carry: number
}

export interface ColonyBee {
  id: number
  species: SpeciesId
  name: string
  /** What it gathers or where it works; null = resting in the hive. */
  job: BeeJob
  trip: Trip | null
  /** When an idle-but-employed bee next tries to find work (nothing nearby, store full…). */
  retryAt: number | null
  /** Carried units that didn't fit in the store yet, and what they are. */
  holding: number
  holdingRes: RawResource | null
  /** Why the last attempt to work failed, for the status line. */
  blocked: 'no-tiles' | 'store-full' | null
  joinedAt: number
}

export interface Dance {
  tileKey: string
  species: SpeciesId
  /** performance.now() when the marker started. */
  startedAt: number
  /** Start of the green arc, degrees clockwise from the top. */
  zoneStart: number
  zoneSize: number
  /** Full turns per second. */
  turns: number
  misses: number
  /** Last result, for the flash; cleared when a new try starts. */
  result: 'hit' | 'miss' | 'fled' | null
}

interface SaveData {
  bees: ColonyBee[]
  used: string[]
  nextId: number
}

const encounterKey = (tileKey: string, at: number) => `${Math.floor(at / ENCOUNTER_WINDOW_MS)}:${tileKey}`

export const useColony = defineStore('colony', {
  state: () => ({
    bees: [] as ColonyBee[],
    /** Encounters already befriended or that flew off, as "window:tile". */
    used: [] as string[],
    nextId: 1,
    dance: null as Dance | null,
    /** Bumps on any change, for views. */
    rev: 0,
  }),

  getters: {
    capacity(): number {
      const hive = useHive()
      const rooms = Object.values(hive.cells).filter(c => c.building === 'room').length
      return Math.min(MAX_COLONY, BASE_HOUSING + rooms * (BUILDINGS.room.housing ?? 0))
    },
    hasRoom(): boolean {
      return this.bees.length < this.capacity
    },
  },

  actions: {
    /* ---------------- persistence ---------------- */
    load() {
      try {
        const raw = localStorage.getItem(SAVE_KEY)
        if (raw) {
          const d = JSON.parse(raw) as Partial<SaveData>
          this.bees = d.bees ?? []
          this.used = d.used ?? []
          this.nextId = d.nextId ?? this.bees.length + 1
        }
      }
      catch { /* start fresh */ }
      this.tick()
    },
    save() {
      const data: SaveData = { bees: this.bees, used: this.used, nextId: this.nextId }
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
      this.bees = []
      this.used = []
      this.nextId = 1
      this.dance = null
      this.rev++
    },
    changed() {
      this.rev++
      this.save()
    },

    /* ---------------- wild bees ---------------- */
    /** The wild bee on a tile right now, if any (tile must be discovered to be met). */
    wildBeeAt(tile: Tile | undefined, now = Date.now()): SpeciesId | null {
      if (!tile || !tile.walkable) return null
      const game = useGame()
      if (!game.discovered.has(tile.key)) return null
      if (this.used.includes(encounterKey(tile.key, now))) return null
      // The Wild Nest always has a friendly Bumble waiting, until the first friend joins.
      if (tile.poi === 'nest' && !this.bees.length) return 'bumble'
      const species = SPECIES_BY_HABITAT[tile.terrain]
      if (!species) return null
      // Night bees only show up after dark (always, if day and night are switched off).
      if (SPECIES[species].nightOnly && useSettings().dayNight && !isNight(now)) return null
      const window = Math.floor(now / ENCOUNTER_WINDOW_MS)
      return hash2(tile.q * 7 + window, tile.r * 13 - window, WORLD_SEED + 404) < WILD_RATE ? species : null
    },

    /* ---------------- the befriending dance ---------------- */
    startDance(tileKey: string) {
      const game = useGame()
      const tile = useWorldData().byKey.get(tileKey)
      const species = this.wildBeeAt(tile)
      if (!species || this.dance) return false
      if (!this.hasRoom) {
        const msg = this.capacity >= MAX_COLONY
          ? 'The hive is as full as it can be. What a big family!'
          : 'There is no room at home yet. Build a Bee Room in the hive first.'
        game.toast(msg)
        game.announce(msg)
        return false
      }
      const def = SPECIES[species].dance
      const easy = useSettings().easyBefriend
      this.dance = {
        tileKey,
        species,
        startedAt: performance.now(),
        zoneStart: 40 + Math.random() * 280,
        zoneSize: easy ? Math.min(150, def.arc * 1.7) : def.arc,
        turns: easy ? def.turns * 0.6 : def.turns,
        misses: 0,
        result: null,
      }
      game.announce(`A wild ${SPECIES[species].name}! Press F when the marker is in the green.`)
      return true
    },

    /** Marker angle in degrees (0 = top, clockwise). */
    danceAngle(at = performance.now()) {
      const d = this.dance
      if (!d) return 0
      return (((at - d.startedAt) / 1000) * d.turns * 360) % 360
    },

    inZone(angle: number) {
      const d = this.dance
      if (!d) return false
      const rel = (angle - d.zoneStart + 360) % 360
      return rel <= d.zoneSize
    },

    /** F during the dance. */
    danceHit(at = performance.now()) {
      const d = this.dance
      if (!d || d.result === 'hit' || d.result === 'fled') return
      const game = useGame()
      const name = SPECIES[d.species].name
      if (this.inZone(this.danceAngle(at))) {
        d.result = 'hit'
        this.befriend(d.species, d.tileKey)
        return
      }
      d.misses++
      if (d.misses >= DANCE_TRIES) {
        d.result = 'fled'
        this.used.push(encounterKey(d.tileKey, Date.now()))
        game.announce(`The ${name} got shy and flew off. You'll meet another one.`)
        this.changed()
        return
      }
      d.result = 'miss'
      // New spot for the green arc, same rhythm.
      d.zoneStart = (d.zoneStart + 110 + Math.random() * 140) % 360
      game.announce(`Almost! ${DANCE_TRIES - d.misses} ${DANCE_TRIES - d.misses === 1 ? 'try' : 'tries'} left.`)
    },

    endDance() {
      this.dance = null
    },

    befriend(species: SpeciesId, tileKey: string) {
      const game = useGame()
      const now = Date.now()
      const name = pickName(this.bees.map(b => b.name), this.nextId * 7 + now)
      const def = SPECIES[species]
      this.bees.push({
        id: this.nextId++,
        species,
        name,
        job: def.favourite,
        trip: null,
        retryAt: now + 2000,
        holding: 0,
        holdingRes: null,
        blocked: null,
        joinedAt: now,
      })
      this.used.push(encounterKey(tileKey, now))
      // Forget encounters from old windows so the list stays small.
      const current = Math.floor(now / ENCOUNTER_WINDOW_MS)
      this.used = this.used.filter(k => Number(k.split(':')[0]) >= current - 1)
      const msg = `${name} the ${def.name} is your friend! They'll help gather ${RESOURCE_INFO[def.favourite].name.toLowerCase()}.`
      game.toast(msg)
      game.announce(msg)
      game.addJournal({
        id: `bee:${species}`,
        title: `A new friend: ${def.name}`,
        body: `${def.blurb} ${name} followed me home and picked a bed straight away.`,
        icon: 'hive',
        subject: 'hive',
      }, false)
      this.changed()
    },

    setJob(id: number, job: BeeJob) {
      const bee = this.bees.find(b => b.id === id)
      if (!bee || bee.job === job) return false
      const cell = workCell(job)
      if (cell && !this.canWorkAt(cell)) return false
      const hive = useHive()
      // Settle the building being left at its old pace, and the new one before it speeds up.
      hive.tick()
      bee.job = job
      bee.blocked = null
      // A bee already out finishes its trip; otherwise a gatherer looks for work right away.
      if (!bee.trip) bee.retryAt = gatherJob(job) ? Date.now() : null
      if (cell) {
        const b = hive.cells[cell]?.building
        if (b) useGame().announce(`${bee.name} is now working at the ${BUILDINGS[b].name}.`)
      }
      hive.changed()
      this.changed()
      return true
    },

    /* ---------------- building jobs ---------------- */
    /** Helpers whose job is this cell's building (including any still finishing a trip). */
    workersAt(key: string) {
      return this.bees.filter(b => b.job === `cell:${key}`)
    },

    /** Is there a building here that makes something, with a free spot for a helper? */
    canWorkAt(key: string) {
      const b = useHive().cells[key]?.building
      return !!b && !!BUILDINGS[b].recipe && this.workersAt(key).length < MAX_WORKERS
    },

    /* ---------------- gathering trips ---------------- */
    /** Nearest discovered tile of a resource, with something left at `at`, within range of home. */
    findTile(resource: RawResource, at: number, beeId: number): Tile | null {
      const world = useWorldData()
      const game = useGame()
      const hive = useHive()
      let best: Tile | null = null
      let bestScore = Infinity
      for (const key of game.discovered) {
        const tile = world.byKey.get(key)
        const src = tileSource(tile)
        if (!tile || !src || src.resource !== resource) continue
        const d = hexDistance(tile, HOME)
        if (d > GATHER_RANGE) continue
        if (hive.tileAmount(tile, at) <= 0) continue
        // Nearest first; a per-bee jitter spreads bees over equally near tiles.
        const score = d + hash2(tile.q + beeId * 31, tile.r, 77) * 0.9
        if (score < bestScore) {
          bestScore = score
          best = tile
        }
      }
      return best
    },

    /** Sends a bee out at `at` if there's work; otherwise schedules a retry. */
    startTrip(bee: ColonyBee, at: number) {
      bee.retryAt = null
      const resource = gatherJob(bee.job)
      if (!resource) return
      const tile = this.findTile(resource, at, bee.id)
      if (!tile) {
        bee.blocked = 'no-tiles'
        bee.retryAt = at + 30_000
        return
      }
      const def = SPECIES[bee.species]
      const carry = useHive().takeFromTile(tile, def.carry, at)
      if (carry <= 0) {
        bee.retryAt = at + 10_000
        return
      }
      const hexes = Math.max(1, hexDistance(tile, HOME))
      const flight = hexes * def.secondsPerHex * 1000
      bee.blocked = null
      // Bees gather their favourite a good deal quicker.
      const gatherMs = carry * def.gatherSeconds * 1000 * (resource === def.favourite ? FAVOURITE_GATHER : 1)
      bee.trip = { tile: tile.key, resource, startAt: at, outMs: flight, gatherMs, backMs: flight, carry }
    },

    /** Unloads a returning bee at `at`, then (if still employed) goes again. */
    finishTrip(bee: ColonyBee, at: number) {
      const trip = bee.trip!
      bee.trip = null
      bee.holding += trip.carry
      bee.holdingRes = trip.resource
      this.unload(bee, at)
    },

    unload(bee: ColonyBee, at: number) {
      if (bee.holding > 0 && bee.holdingRes) {
        bee.holding -= useHive().addStock(bee.holdingRes, bee.holding)
        if (bee.holding > 0) {
          bee.blocked = 'store-full'
          bee.retryAt = at + 30_000
          return
        }
      }
      bee.blocked = null
      bee.retryAt = gatherJob(bee.job) ? at + REST_BETWEEN_TRIPS_MS : null
    },

    /**
     * Advances every helper to `now`, processing trips in time order so bees share tiles fairly.
     * Also used after the game was closed (capped like the buildings).
     */
    tick(now = Date.now()) {
      const floor = now - OFFLINE_CAP_MS
      let changed = false
      for (let guard = 0; guard < 20000; guard++) {
        let next: ColonyBee | null = null
        let due = Infinity
        for (const b of this.bees) {
          const t = b.trip ? b.trip.startAt + b.trip.outMs + b.trip.gatherMs + b.trip.backMs : b.retryAt
          if (t != null && t <= now && t < due) {
            due = t
            next = b
          }
        }
        if (!next) break
        const at = Math.max(floor, due)
        if (next.trip) {
          if (next.trip.startAt < floor) next.trip.startAt = floor
          this.finishTrip(next, at)
        }
        else if (next.holding > 0) this.unload(next, at)
        else this.startTrip(next, at)
        changed = true
      }
      if (changed) {
        useHive().changed()
        this.changed()
      }
      return changed
    },

    /** Where a helper is on its trip right now: which tile, which leg, and how far along (0..1). */
    tripPhase(bee: ColonyBee, now = Date.now()): { tile: Hex, leg: 'out' | 'gather' | 'back', u: number } | null {
      const t = bee.trip
      if (!t) return null
      const e = now - t.startAt
      const tile = parseKey(t.tile)
      if (e < t.outMs) return { tile, leg: 'out', u: Math.max(0, e / t.outMs) }
      if (e < t.outMs + t.gatherMs) return { tile, leg: 'gather', u: (e - t.outMs) / t.gatherMs }
      return { tile, leg: 'back', u: Math.min(1, (e - t.outMs - t.gatherMs) / t.backMs) }
    },

    /** Short status for the colony list. */
    statusText(bee: ColonyBee, now = Date.now()) {
      const phase = this.tripPhase(bee, now)
      if (phase && bee.trip) {
        const what = RESOURCE_INFO[bee.trip.resource].name.toLowerCase()
        if (phase.leg === 'out') return `Flying out for ${what}`
        if (phase.leg === 'gather') return `Gathering ${what}`
        const left = Math.max(1, Math.ceil(((1 - phase.u) * bee.trip.backMs) / 1000))
        return `Bringing home ${bee.trip.carry} ${what} · ${left}s`
      }
      if (!bee.job) return 'Resting in the hive'
      const cell = workCell(bee.job)
      if (cell) {
        const hive = useHive()
        const b = hive.cells[cell]?.building
        if (!b) return 'Resting in the hive'
        const where = BUILDINGS[b].name
        const st = hive.status(cell, now)
        if (st.kind === 'working') return `Working the ${where} · ${st.remaining}s`
        if (st.kind === 'full') return `${where} paused: the store is full`
        if (st.kind === 'waiting') {
          const need = Object.keys(st.missing).map(r => RESOURCE_INFO[r as keyof typeof RESOURCE_INFO].name.toLowerCase())
          return `Waiting for ${need.join(' and ')} at the ${where}`
        }
        return `Tending the ${where}`
      }
      if (bee.retryAt && !bee.blocked) return 'Having a little rest'
      if (bee.blocked === 'store-full') return 'Waiting for room in the store'
      if (bee.blocked === 'no-tiles') return `No ${RESOURCE_INFO[gatherJob(bee.job)!].name.toLowerCase()} nearby right now`
      return 'Getting ready to fly'
    },
  },
})
