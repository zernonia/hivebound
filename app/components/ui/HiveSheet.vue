<script setup lang="ts">
import { MAX_WORKERS, type ColonyBee, useColony, workCell } from '~/stores/colony'
import { useGame } from '~/stores/game'
import { useHive } from '~/stores/hive'
import { ALL_RESOURCES, type Amounts, BUILDINGS, RAW_RESOURCES, RESOURCE_INFO, type RawResource, UPGRADES, UPGRADE_LIST } from '~/utils/resources'
import { SPECIES } from '~/utils/species'
import type { PickerOption } from './UiPicker.vue'

/*
 * The hive's two bigger pages, each opened on demand so the hive view stays clear:
 * Colony (C) — every helper, what they're doing, and their job — and Upgrades (U).
 * Same key or Esc closes; only one sheet (or the build menu) is open at a time.
 */
const game = useGame()
const hive = useHive()
const colony = useColony()
const sheet = computed(() => game.hiveSheet)
const panel = ref<HTMLElement>()

const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => (timer = setInterval(() => (now.value = Date.now()), 500)))
onBeforeUnmount(() => clearInterval(timer))

/* ---------------- colony ---------------- */
const jobs: { v: RawResource | null, label: string }[] = [...RAW_RESOURCES.map(r => ({ v: r as RawResource, label: RESOURCE_INFO[r].name })), { v: null, label: 'Rest' }]

/** Buildings that make something, as places a helper can work ("Honey Press 2" when there are several). */
const workplaces = computed(() => {
  void hive.rev
  void colony.rev
  const list = Object.entries(hive.cells)
    .filter(([, c]) => c.building && BUILDINGS[c.building].recipe)
    .map(([key, c]) => ({ key, id: c.building!, name: BUILDINGS[c.building!].name }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.key.localeCompare(b.key))
  const seen: Record<string, number> = {}
  return list.map((w) => {
    const n = (seen[w.id] = (seen[w.id] ?? 0) + 1)
    const many = list.filter(o => o.id === w.id).length > 1
    return { ...w, label: many ? `${w.name} ${n}` : w.name, workers: colony.workersAt(w.key).length }
  })
})

/** Buildings a bee can be sent to (full ones greyed out, unless it already works there). */
function workOptions(bee: ColonyBee): PickerOption[] {
  return workplaces.value.map(w => ({
    value: w.key,
    label: w.label,
    note: `${w.workers}/${MAX_WORKERS}`,
    disabled: w.workers >= MAX_WORKERS && workCell(bee.job) !== w.key,
  }))
}

/* ---------------- upgrades ---------------- */
const costList = (a: Amounts) => ALL_RESOURCES.filter(r => a[r]).map(r => ({ r, n: a[r]!, ok: hive.stock[r] >= a[r]! }))

/* ---------------- opening and keys ---------------- */
function toggle(which: 'colony' | 'upgrades') {
  game.hiveSheet = game.hiveSheet === which ? null : which
}
function close() {
  game.hiveSheet = null
  if (panel.value?.contains(document.activeElement)) (document.activeElement as HTMLElement).blur()
}
// One thing at a time: opening a sheet closes the build menu, and the other way round.
watch(() => game.hiveSheet, (v) => {
  if (v) {
    game.buildMenuOpen = false
    nextTick(() => panel.value?.focus())
  }
})
watch(() => game.buildMenuOpen, v => v && (game.hiveSheet = null))
watch(() => game.scene, s => s !== 'hive' && (game.hiveSheet = null))

function onKey(e: KeyboardEvent) {
  if (game.scene !== 'hive' || game.transition || game.journalOpen || game.settingsOpen || e.repeat) return
  const target = e.target as HTMLElement | null
  // Typing, or a dropdown list with the keys: leave them be.
  if (target?.closest('input, textarea, [contenteditable], .picker-list')) return
  const key = e.code === 'KeyC' ? 'colony' : e.code === 'KeyU' ? 'upgrades' : null
  if (key) toggle(key)
  else if (game.hiveSheet && e.code === 'Escape') close()
  else return
  e.preventDefault()
  e.stopPropagation()
}
// Capture phase: runs before the page's own handler (so Esc here doesn't also open Settings).
onMounted(() => window.addEventListener('keydown', onKey, true))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey, true))
</script>

<template>
  <Transition name="pop">
    <section
      v-if="sheet"
      ref="panel"
      class="sheet panel"
      tabindex="-1"
      :aria-labelledby="`sheet-${sheet}`"
    >
      <header>
        <h2 :id="`sheet-${sheet}`">
          {{ sheet === 'colony' ? 'Colony' : 'Upgrades' }}
          <span v-if="sheet === 'colony'" class="sub">{{ colony.bees.length }} / {{ colony.capacity }} beds filled</span>
        </h2>
        <button class="close" :aria-label="`Close ${sheet}`" @click="close">
          <UiIcon name="close" />
        </button>
      </header>

      <div class="body">
        <!-- Colony -->
        <template v-if="sheet === 'colony'">
          <p v-if="!colony.hasRoom" class="note">
            Build a Bee Room for more beds.
          </p>
          <p v-if="!colony.bees.length" class="blurb">
            No helpers yet. Wild bees hover over meadows, flower patches, water and woods: fly onto one and press <span class="kbd">F</span> to try the befriending dance. There's always a friendly Bumble at the Wild Nest.
          </p>
          <ul class="colony">
            <li v-for="b in colony.bees" :key="b.id" class="friend">
              <div class="friend-head">
                <span class="swatch" :style="{ background: SPECIES[b.species].look.colors.body, borderColor: SPECIES[b.species].look.colors.stripe }" aria-hidden="true" />
                <span class="who"><strong>{{ b.name }}</strong> <span class="species">{{ SPECIES[b.species].name }}</span></span>
              </div>
              <p class="status-line">
                {{ (void now, colony.statusText(b, now)) }}
              </p>
              <div class="jobs" role="radiogroup" :aria-label="`${b.name}'s job`">
                <button
                  v-for="j in jobs"
                  :key="j.label"
                  role="radio"
                  :aria-checked="b.job === j.v"
                  :class="{ on: b.job === j.v, fav: j.v === SPECIES[b.species].favourite }"
                  :title="j.v === SPECIES[b.species].favourite ? `${j.label} (favourite: gathers it faster)` : j.label"
                  @click="colony.setJob(b.id, j.v)"
                >
                  <ResourceIcon v-if="j.v" :name="j.v" />
                  <span v-else>Rest</span>
                  <span v-if="j.v" class="sr-only">{{ j.label }}{{ j.v === SPECIES[b.species].favourite ? ', favourite' : '' }}</span>
                </button>
              </div>
              <UiPicker
                v-if="workplaces.length"
                class="work"
                highlight
                :options="workOptions(b)"
                :model-value="workCell(b.job)"
                placeholder="Work at a building…"
                :label="`Where ${b.name} works in the hive`"
                @update:model-value="key => colony.setJob(b.id, `cell:${key}`)"
              />
            </li>
          </ul>
        </template>

        <!-- Upgrades -->
        <ul v-else class="upgrades">
          <li v-for="id in UPGRADE_LIST" :key="id" class="upgrade">
            <div class="up-head">
              <strong>{{ UPGRADES[id].name }}</strong>
              <span class="pips" :aria-label="`Level ${hive.upgrades[id]} of ${UPGRADES[id].costs.length}`">
                <span v-for="i in UPGRADES[id].costs.length" :key="i" class="pip" :class="{ on: i <= hive.upgrades[id] }" />
              </span>
            </div>
            <p class="blurb">
              {{ UPGRADES[id].describe(UPGRADES[id].values[hive.upgrades[id]]!) }}
              <template v-if="UPGRADES[id].costs[hive.upgrades[id]]">
                → <strong>{{ UPGRADES[id].describe(UPGRADES[id].values[hive.upgrades[id] + 1]!) }}</strong>
              </template>
            </p>
            <div v-if="UPGRADES[id].costs[hive.upgrades[id]]" class="buy">
              <span class="costs">
                <span v-for="c in costList(UPGRADES[id].costs[hive.upgrades[id]]!)" :key="c.r" class="cost" :class="{ short: !c.ok }"><ResourceIcon :name="c.r" />{{ c.n }}<span class="sr-only"> {{ RESOURCE_INFO[c.r].name }}</span></span>
              </span>
              <button class="chip-btn primary" :disabled="!hive.has(UPGRADES[id].costs[hive.upgrades[id]]!)" :aria-label="`Upgrade ${UPGRADES[id].name}`" @click="hive.upgrade(id)">
                Upgrade
              </button>
            </div>
            <p v-else class="note">
              Fully upgraded.
            </p>
          </li>
        </ul>
      </div>

      <p class="keys hide-touch">
        <span class="kbd">{{ sheet === 'colony' ? 'C' : 'U' }}</span> or <span class="kbd">Esc</span> to close
      </p>
    </section>
  </Transition>
</template>

<style scoped>
.sheet {
  position: fixed;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  z-index: 35;
  width: min(440px, calc(100vw - 24px));
  max-height: min(78vh, 640px);
  display: flex;
  flex-direction: column;
  padding: 12px 14px 10px;
  outline: none;
}
/* Focus moves here so keys work straight away; no ring round the whole sheet. */
.sheet:focus,
.sheet:focus-visible {
  box-shadow: var(--shadow) !important;
}
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 2px 8px;
}
h2 {
  margin: 0;
  font-size: 1.15rem;
}
.sub {
  margin-left: 6px;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--ink-soft);
}
.close {
  width: 36px;
  height: 36px;
  border: 0;
  border-radius: 50%;
  background: var(--paper-2);
  display: grid;
  place-items: center;
}
.body {
  overflow-y: auto;
  flex: 1;
  margin: 0 -6px;
  padding: 0 6px 4px;
}
.blurb {
  margin: 0 0 8px;
  color: var(--ink-soft);
  line-height: 1.45;
}
.note {
  margin: 0 0 8px;
  font-size: 0.9rem;
  color: var(--ink-soft);
}
.colony,
.upgrades {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.friend,
.upgrade {
  background: var(--paper);
  border: 2px solid var(--line);
  border-radius: 16px;
  padding: 8px 10px;
}
.friend-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.swatch {
  width: 22px;
  height: 20px;
  border-radius: 7px;
  border: 3px solid;
  flex: none;
}
.species {
  color: var(--ink-soft);
  font-size: 0.9rem;
}
.status-line {
  margin: 4px 0 6px;
  font-size: 0.9rem;
  color: var(--ink-soft);
}
.jobs {
  display: flex;
  gap: 4px;
}
.jobs button {
  flex: 1;
  min-height: 44px;
  display: grid;
  place-items: center;
  border-radius: 12px;
  border: 2px solid var(--line);
  background: var(--paper-2);
  font-weight: 700;
  font-size: 0.85rem;
  position: relative;
}
.jobs button.on {
  background: var(--honey);
  border-color: var(--honey-deep);
}
.jobs button.fav::after {
  content: '♥';
  position: absolute;
  top: 1px;
  right: 4px;
  font-size: 0.65rem;
  color: #e8553f;
}
.work {
  margin-top: 4px;
}
.up-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.pips {
  display: flex;
  gap: 4px;
}
.pip {
  width: 12px;
  height: 12px;
  border-radius: 4px;
  border: 2px solid var(--honey-deep);
}
.pip.on {
  background: var(--honey);
}
.buy {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.costs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
  font-weight: 700;
}
.cost {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}
.cost.short {
  color: #c2412d;
}
.chip-btn.primary {
  min-height: 44px;
  box-shadow: none;
}
.chip-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.keys {
  margin: 8px 2px 0;
  font-size: 0.8rem;
  color: var(--ink-soft);
}
.pop-enter-active,
.pop-leave-active {
  transition: opacity 160ms ease, transform 200ms var(--ease);
}
.pop-enter-from,
.pop-leave-to {
  opacity: 0;
  transform: translate(-50%, calc(-50% + 12px)) scale(0.97);
}
</style>
