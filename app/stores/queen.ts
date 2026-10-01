import { defineStore } from 'pinia'
import { track } from '~/utils/analytics'
import { hexDistance, hexKey } from '~/utils/hex'
import { isGoldenSpot } from '~/utils/golden'
import { keepsakeName } from '~/utils/keepsakes'
import { requestAsk, requestThanks, requestTitle, type Goal, type RequestDef, requestAt, CHAPTER_ONE, STORY } from '~/utils/requests'
import { speciesBefriendCount } from '~/utils/species'
import { ALL_RESOURCES, type Amounts, buildingThe, formatAmounts, type Resource, resourceLower, resourceName, resourceSome } from '~/utils/resources'
import { HOME, poiThe, useWorldData } from '~/utils/world'
import { appI18n } from '~/utils/i18n'
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
  resource?: Resource
  /** What's still missing, for the Queen's "still needed" line. */
  missing?: string
}

export const useQueen = defineStore('queen', {
  state: () => ({
    /** How many requests have been handed in. */
    done: 0,
    /** Requests whose map reveal has already happened. */
    revealed: [] as string[],
    /** What you've flown home yourself since the current request started ('bring' goals). */
    brought: {} as Amounts,
    /** Little wishes done before chapter two existed (older saves), still counted in the level. */
    extraLevels: 0,
    /** The end-of-story thank-you has been shown (saved, so it only ever appears once). */
    thanked: false,
    /** UI: the thank-you card is open. Not saved. */
    showThanks: false,
  }),

  getters: {
    current(s): RequestDef {
      return requestAt(s.done)
    },
    /** 1 + requests completed: a gentle measure of how far the hive has come. */
    hiveLevel(s) {
      return s.done + s.extraLevels + 1
    },
    inChapterOne(s) {
      return s.done < CHAPTER_ONE.length
    },
    /** The feast (end of chapter one) lifts the mist: the land beyond opens up. */
    mistLifted(s) {
      return s.done >= CHAPTER_ONE.length
    },
    /** Both chapters handed in: only little wishes remain. */
    storyDone(s) {
      return s.done >= STORY.length
    },
  },

  actions: {
    load() {
      try {
        const raw = localStorage.getItem(SAVE_KEY)
        if (raw) {
          const d = JSON.parse(raw) as { v?: number, done?: number, revealed?: string[], brought?: Amounts, extraLevels?: number, thanked?: boolean }
          this.thanked = d.thanked ?? false
          this.done = d.done ?? 0
          this.revealed = d.revealed ?? []
          this.brought = d.brought ?? {}
          this.extraLevels = d.extraLevels ?? 0
          // Saves from before chapter two: anyone already on little wishes goes back to start
          // chapter two, keeping the wishes they did as hive levels.
          if (!d.v && this.done > CHAPTER_ONE.length) {
            this.extraLevels += this.done - CHAPTER_ONE.length
            this.done = CHAPTER_ONE.length
            this.brought = {}
          }
        }
      }
      catch { /* start fresh */ }
      // Finished the story before the thank-you existed: show it once now.
      if (this.storyDone && !this.thanked) this.finishStory()
      this.startCurrent()
    },
    save() {
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 2, done: this.done, revealed: this.revealed, brought: this.brought, extraLevels: this.extraLevels, thanked: this.thanked }))
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
      this.extraLevels = 0
      this.thanked = false
      this.showThanks = false
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
      const t = appI18n().t
      switch (g.kind) {
        case 'bring':
          return ALL_RESOURCES.filter(r => g.amounts[r]).map((r) => {
            const need = g.amounts[r]!
            const have = Math.min(need, this.brought[r] ?? 0)
            return { label: t(`queen.goals.bring.${r}`), have, need, done: have >= need, resource: r, missing: t('queen.missing.res', { n: need - have, some: resourceSome(r), name: resourceLower(r) }) }
          })
        case 'deliver':
          return ALL_RESOURCES.filter(r => g.amounts[r]).map((r) => {
            const need = g.amounts[r]!
            const have = Math.min(need, hive.stock[r])
            return { label: resourceName(r), have, need, done: have >= need, resource: r, missing: t('queen.missing.res', { n: need - have, some: resourceSome(r), name: resourceLower(r) }) }
          })
        case 'build': {
          const have = Object.values(hive.cells).some(c => c.building === g.building) ? 1 : 0
          return [{ label: t(`queen.goals.build.${g.building}`), have, need: 1, done: have >= 1, missing: t('queen.missing.build', { the: buildingThe(g.building) }) }]
        }
        case 'species': {
          const have = Math.min(g.count, useColony().bees.filter(b => b.species === g.species).length)
          return [{ label: speciesBefriendCount(g.species, g.count), have, need: g.count, done: have >= g.count }]
        }
        case 'friends': {
          const have = Math.min(g.count, useColony().bees.length)
          return [{ label: t('queen.goals.friends', g.count), have, need: g.count, done: have >= g.count }]
        }
        case 'visit': {
          const have = useGame().visitedPois.includes(g.poi) ? 1 : 0
          return [{ label: t('queen.goals.visit', { the: poiThe(g.poi) }), have, need: 1, done: have >= 1, missing: t('queen.missing.visit', { the: poiThe(g.poi) }) }]
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
      const t = appI18n().t
      if (this.ready()) return this.handIn()
      const missing = this.lines().filter(l => !l.done).map(l => l.missing ?? l.label).join(', ')
      game.announce(t('queen.talk', { ask: requestAsk(this.current), missing }))
      game.toast(t('queen.stillNeeded', { missing }))
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
      const t = appI18n().t
      const r = req.reward
      const gifts: string[] = []
      if (r.storage) {
        const add = Math.max(0, Math.min(r.storage, MAX_BONUS_STORAGE - hive.bonusStorage))
        hive.bonusStorage += add
        if (add) gifts.push(t('queen.giftStorage', { n: add }))
      }
      if (r.gift) {
        for (const res of ALL_RESOURCES) if (r.gift[res]) hive.addStock(res, r.gift[res]!)
        gifts.push(formatAmounts(r.gift))
      }
      if (r.keepsake) {
        game.giveKeepsake(r.keepsake)
        gifts.push(keepsakeName(r.keepsake))
      }
      const chapter = this.done < STORY.length
      if (chapter) {
        // Keyed (not raw text) so the entry re-renders when the language changes.
        game.addJournal({ id: `queen:${req.id}`, titleKey: `requests.${req.id}.title`, bodyKey: `requests.${req.id}.thanksBody`, icon: 'hive', subject: 'hive' }, false)
      }
      this.done++
      this.brought = {}
      track('request_completed', { request: req.id, number: this.done, story: chapter, day: game.day })
      if (this.done === CHAPTER_ONE.length) {
        this.liftMist()
        track('mist_lifted', { day: game.day })
      }
      if (this.done === STORY.length) {
        this.finishStory()
        track('story_finished', { day: game.day, steps: game.steps })
      }
      const giftList = gifts.join(', ')
      game.toast(giftList ? t('queen.delightedGifts', { gifts: giftList }) : t('queen.delighted'))
      game.announce(giftList
        ? t('queen.announceThanksGifts', { thanks: requestThanks(req), gifts: giftList })
        : t('queen.announceThanks', { thanks: requestThanks(req) }))
      this.startCurrent()
      hive.changed()
      this.save()
      return true
    },

    /** The last story request is in: a thank-you card, and a closing page in the journal. */
    finishStory() {
      this.thanked = true
      this.showThanks = true
      useGame().addJournal({
        id: 'the-end',
        titleKey: 'journal.theEnd.title',
        bodyKey: 'journal.theEnd.body',
        icon: 'hive',
        subject: 'hive',
      }, false)
      this.save()
    },

    /** End of chapter one: the mist ring thins and the land beyond opens. */
    liftMist() {
      const game = useGame()
      game.addJournal({
        id: 'mist-lifts',
        titleKey: 'journal.mistLifts.title',
        bodyKey: 'journal.mistLifts.body',
        icon: 'poi',
        subject: 'mist',
      })
      game.toast(appI18n().t('queen.mistLiftedToast'))
      game.announce(appI18n().t('queen.mistLiftedAnnounce'))
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
