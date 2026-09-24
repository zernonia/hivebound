import { defineStore } from 'pinia'
import { hexDistance, hexKey } from '~/utils/hex'
import { isGoldenSpot } from '~/utils/golden'
import { KEEPSAKES } from '~/utils/keepsakes'
import { type Goal, type RequestDef, requestAt, CHAPTER_ONE } from '~/utils/requests'
import { ALL_RESOURCES, type Amounts, BUILDINGS, RESOURCE_INFO, formatAmounts } from '~/utils/resources'
import { HOME, POI_BY_ID, useWorldData } from '~/utils/world'
import { useColony } from './colony'
import { useGame } from './game'
import { useHive } from './hive'

/*
 * The Queen's requests: one at a time, handed in at the Queen with F. Deliveries are taken
 * from the store; other goals (build, befriend, visit) just need to be true.
 */

const SAVE_KEY = 'hivebound:queen:v1'
/** The store can't grow past this much extra room from the Queen's thanks. */
const MAX_BONUS_STORAGE = 160

export interface GoalLine {
  label: string
  have: number
  need: number
  done: boolean
  /** A resource icon to show, for deliveries. */
  resource?: keyof typeof RESOURCE_INFO
}

export const useQueen = defineStore('queen', {
  state: () => ({
    /** How many requests have been handed in. */
    done: 0,
    /** Requests whose map reveal has already happened. */
    revealed: [] as string[],
    /** What you've flown home yourself since the current request started ('bring' goals). */
    brought: {} as Amounts,
  }),

  getters: {
    current(s): RequestDef {
      return requestAt(s.done)
    },
    /** 1 + requests completed: a gentle measure of how far the hive has come. */
    hiveLevel(s) {
      return s.done + 1
    },
    inChapterOne(s) {
      return s.done < CHAPTER_ONE.length
    },
  },

  actions: {
    load() {
      try {
        const raw = localStorage.getItem(SAVE_KEY)
        if (raw) {
          const d = JSON.parse(raw) as { done?: number, revealed?: string[], brought?: Amounts }
          this.done = d.done ?? 0
          this.revealed = d.revealed ?? []
          this.brought = d.brought ?? {}
        }
      }
      catch { /* start fresh */ }
      this.startCurrent()
    },
    save() {
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify({ done: this.done, revealed: this.revealed, brought: this.brought }))
      }
      catch { /* ignore */ }
    },
    reset() {
      try {
        localStorage.removeItem(SAVE_KEY)
      }
      catch { /* ignore */ }
      this.done = 0
      this.revealed = []
      this.brought = {}
      this.startCurrent()
    },

    /** Progress on each goal of the current request. Reads live store / colony / map state. */
    lines(): GoalLine[] {
      const out: GoalLine[] = []
      for (const g of this.current.goals) out.push(...this.goalLines(g))
      return out
    },

    goalLines(g: Goal): GoalLine[] {
      const hive = useHive()
      switch (g.kind) {
        case 'bring':
          return ALL_RESOURCES.filter(r => g.amounts[r]).map((r) => {
            const need = g.amounts[r]!
            const have = Math.min(need, this.brought[r] ?? 0)
            return { label: `Fly home ${RESOURCE_INFO[r].name.toLowerCase()}`, have, need, done: have >= need, resource: r }
          })
        case 'deliver':
          return ALL_RESOURCES.filter(r => g.amounts[r]).map((r) => {
            const need = g.amounts[r]!
            const have = Math.min(need, hive.stock[r])
            return { label: RESOURCE_INFO[r].name, have, need, done: have >= need, resource: r }
          })
        case 'build': {
          const have = Object.values(hive.cells).some(c => c.building === g.building) ? 1 : 0
          return [{ label: `Build a ${BUILDINGS[g.building].name}`, have, need: 1, done: have >= 1 }]
        }
        case 'friends': {
          const have = Math.min(g.count, useColony().bees.length)
          return [{ label: g.count === 1 ? 'Befriend a wild bee' : `Befriend ${g.count} bees`, have, need: g.count, done: have >= g.count }]
        }
        case 'visit': {
          const have = useGame().visitedPois.includes(g.poi) ? 1 : 0
          return [{ label: `Visit ${POI_BY_ID[g.poi].name}`, have, need: 1, done: have >= 1 }]
        }
      }
    },

    ready() {
      return this.lines().every(l => l.done)
    },

    /** Counts resources you've just unloaded at the hive, for 'bring' goals. */
    noteBrought(moved: Amounts) {
      if (!this.current.goals.some(g => g.kind === 'bring')) return
      for (const r of ALL_RESOURCES) if (moved[r]) this.brought[r] = (this.brought[r] ?? 0) + moved[r]!
      this.save()
    },

    /** F at the Queen: hand in if everything's ready, otherwise hear what's still needed. */
    talk() {
      const game = useGame()
      if (this.ready()) return this.handIn()
      const missing = this.lines().filter(l => !l.done).map(l => (l.resource ? `${l.need - l.have} more ${l.label.toLowerCase()}` : l.label.toLowerCase()))
      game.announce(`The Queen: "${this.current.ask}" Still needed: ${missing.join(', ')}.`)
      game.toast(`Still needed: ${missing.join(', ')}`)
      return false
    },

    handIn() {
      if (!this.ready()) return false
      const hive = useHive()
      const game = useGame()
      const req = this.current
      const delivered: Amounts = {}
      for (const g of req.goals) if (g.kind === 'deliver') for (const r of ALL_RESOURCES) delivered[r] = (delivered[r] ?? 0) + (g.amounts[r] ?? 0)
      hive.pay(delivered)
      const r = req.reward
      const gifts: string[] = []
      if (r.storage) {
        const add = Math.max(0, Math.min(r.storage, MAX_BONUS_STORAGE - hive.bonusStorage))
        hive.bonusStorage += add
        if (add) gifts.push(`${add} more room in the store`)
      }
      if (r.gift) {
        for (const res of ALL_RESOURCES) if (r.gift[res]) hive.addStock(res, r.gift[res]!)
        gifts.push(formatAmounts(r.gift))
      }
      if (r.keepsake) {
        game.giveKeepsake(r.keepsake)
        gifts.push(KEEPSAKES[r.keepsake].name)
      }
      const chapter = this.done < CHAPTER_ONE.length
      if (chapter) {
        game.addJournal({ id: `queen:${req.id}`, title: req.title, body: `The Queen said: "${req.thanks}"`, icon: 'hive', subject: 'hive' }, false)
      }
      this.done++
      this.brought = {}
      game.toast(`The Queen is delighted!${gifts.length ? ` ${gifts.join(', ')}.` : ''}`)
      game.announce(`The Queen says: "${req.thanks}"${gifts.length ? ` You received ${gifts.join(', ')}.` : ''}`)
      this.startCurrent()
      hive.changed()
      this.save()
      return true
    },

    /** Marks the new request's place (or the nearest golden pollen) on the map, once. */
    startCurrent() {
      const req = this.current
      if (!req.reveal || this.revealed.includes(req.id)) return
      const game = useGame()
      const world = useWorldData()
      let spot: { q: number, r: number } | undefined
      if (req.reveal === 'golden') {
        let best = Infinity
        for (const t of world.tiles) {
          if (!isGoldenSpot(t)) continue
          const d = hexDistance(t, HOME)
          if (d < best) {
            best = d
            spot = t
          }
        }
      }
      else {
        spot = world.pois.find(p => p.id === req.reveal)?.hex
      }
      this.revealed.push(req.id)
      this.save()
      if (spot && !game.discovered.has(hexKey(spot))) game.reveal(spot, true)
    },
  },
})
