<script setup lang="ts">
import { type CellStatus, HIVE_DOOR, QUEEN_CELL, useHive } from '~/stores/hive'
import { useQueen } from '~/stores/queen'
import type { PickerOption } from './UiPicker.vue'
import { MAX_WORKERS, useColony, workCell } from '~/stores/colony'
import { SPECIES } from '~/utils/species'
import { useGame } from '~/stores/game'
import { ALL_RESOURCES, type Amounts, BUILDINGS, RESOURCE_INFO, TRAY_CAP, UNLOCK_CELL_COST, formatAmounts } from '~/utils/resources'

/*
 * The hive's compact card: the store, and whatever cell the bee is looking at. Bigger pages
 * open on demand instead: B builds, C shows the colony, U the upgrades.
 */
const hive = useHive()
const game = useGame()
const colony = useColony()
const queen = useQueen()

const queenLines = computed(() => {
  void hive.rev
  void colony.rev
  void game.visitedPois.length
  void queen.done
  return queen.lines()
})
const queenReady = computed(() => queenLines.value.every(l => l.done))

/** Bees that could be sent to the selected building (anyone not already there). */
function freeBees(key: string) {
  return colony.bees.filter(b => workCell(b.job) !== key)
}
function helperOptions(key: string): PickerOption[] {
  return freeBees(key).map(b => ({
    value: String(b.id),
    label: b.name,
    note: SPECIES[b.species].name,
    swatch: { fill: SPECIES[b.species].look.colors.body, border: SPECIES[b.species].look.colors.stripe },
  }))
}

// Tick a clock so countdowns and progress bars move.
const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => (timer = setInterval(() => (now.value = Date.now()), 500)))
onBeforeUnmount(() => clearInterval(timer))

/* ---------------- selection ---------------- */
const sel = computed(() => {
  const key = hive.selected
  if (!key || key === HIVE_DOOR) return null
  void hive.rev
  return {
    key,
    status: hive.status(key, now.value),
    building: hive.cells[key]?.building,
    output: hive.cells[key]?.output ?? 0,
  }
})
const selBuilding = computed(() => (sel.value?.building ? BUILDINGS[sel.value.building] : null))

function statusText(st: CellStatus, output = 0): string {
  const tray = output > 0 ? `, ${output} ready to collect` : ''
  switch (st.kind) {
    case 'queen': return 'resting on her cushion'
    case 'locked': return 'sealed with wax'
    case 'empty': return 'ready to build on'
    case 'storage': return 'storing extra'
    case 'working': return st.remaining > 0 ? `working, ${st.remaining}s left${tray}` : `just finishing${tray}`
    case 'waiting': return `waiting for ${formatAmounts(st.missing) || 'room'}${tray}`
    case 'full': return output ? `tray full, ${output} ready to collect` : 'tray full, collect to keep going'
  }
}

function missingText(cost: Amounts) {
  const m = hive.missing(cost)
  return Object.keys(m).length ? `Need ${formatAmounts(m)} more` : ''
}

const costList = (a: Amounts) => ALL_RESOURCES.filter(r => a[r]).map(r => ({ r, n: a[r]!, ok: hive.stock[r] >= a[r]! }))
</script>

<template>
  <section class="hive-panel panel" aria-labelledby="hive-title">
    <header class="head">
      <h2 id="hive-title">
        Home Hive
      </h2>
    </header>

    <!-- Store -->
    <div class="store">
      <h3 class="label">
        Store <span class="cap">up to {{ hive.storageCap }} each</span>
      </h3>
      <ul class="stock">
        <li v-for="r in ALL_RESOURCES" :key="r" :class="{ zero: !hive.stock[r] }">
          <ResourceIcon :name="r" />
          <span class="n">{{ hive.stock[r] }}</span>
          <span class="sr-only">{{ RESOURCE_INFO[r].name }}</span>
        </li>
      </ul>
    </div>

    <div class="body">
      <div v-if="hive.selected === HIVE_DOOR" class="detail" aria-live="polite">
        <h3>Doorway</h3>
        <p class="blurb">
          The way back out to the meadow.
        </p>
        <button class="chip-btn primary" @click="game.leaveHive()">
          <span class="kbd hide-touch" aria-hidden="true">F</span> Leave hive
        </button>
      </div>
      <div v-else-if="sel" class="detail" aria-live="polite">
        <!-- Queen -->
        <template v-if="sel.key === QUEEN_CELL">
          <h3>The Queen <span class="level">Hive level {{ queen.hiveLevel }}</span></h3>
          <p class="request-title">
            ♛ {{ queen.current.title }}
          </p>
          <p class="blurb">
            “{{ queen.current.ask }}”
          </p>
          <ul class="q-lines">
            <li v-for="l in queenLines" :key="l.label" :class="{ done: l.done }">
              <ResourceIcon v-if="l.resource" :name="l.resource" />
              <span>{{ l.done ? '✓' : '·' }} {{ l.label }}</span>
              <span v-if="l.need > 1" class="n">{{ l.have }}/{{ l.need }}</span>
            </li>
          </ul>
          <button class="chip-btn primary" :disabled="!queenReady" @click="queen.talk()">
            <span class="kbd hide-touch" aria-hidden="true">F</span> {{ queenReady ? 'Give to the Queen' : 'Not ready yet' }}
          </button>
        </template>

        <!-- Sealed -->
        <template v-else-if="sel.status.kind === 'locked'">
          <h3>Sealed cell</h3>
          <p class="blurb">
            Old comb, capped with wax. Unseal it to make room for another building.
          </p>
          <p v-if="!hive.canUnlock(sel.key)" class="note">
            Unseal a cell next to this one first.
          </p>
          <template v-else>
            <p class="costs">
              <span v-for="c in costList(UNLOCK_CELL_COST)" :key="c.r" class="cost" :class="{ short: !c.ok }"><ResourceIcon :name="c.r" />{{ c.n }}<span class="sr-only"> {{ RESOURCE_INFO[c.r].name }}</span></span>
            </p>
            <button class="chip-btn primary" :disabled="!hive.has(UNLOCK_CELL_COST)" @click="hive.unlock(sel.key)">
              <span class="kbd hide-touch" aria-hidden="true">F</span> Unseal
            </button>
            <p v-if="!hive.has(UNLOCK_CELL_COST)" class="note">
              {{ missingText(UNLOCK_CELL_COST) }}. Wax comes from the Wax Works.
            </p>
          </template>
        </template>

        <!-- Empty: point at the build menu -->
        <template v-else-if="sel.status.kind === 'empty'">
          <h3>Empty cell</h3>
          <p class="blurb">
            Room for a new building.
          </p>
          <button class="chip-btn primary" @click="game.buildMenuOpen = true">
            <span class="kbd hide-touch" aria-hidden="true">B</span> Build…
          </button>
        </template>

        <!-- A building -->
        <template v-else-if="selBuilding">
          <h3>{{ selBuilding.name }}</h3>
          <p class="blurb">
            {{ selBuilding.blurb }}
          </p>
          <template v-if="selBuilding.recipe">
            <p class="recipe">
              <template v-for="c in costList(selBuilding.recipe.in)" :key="c.r">
                <ResourceIcon :name="c.r" />{{ c.n }}
              </template>
              <span aria-hidden="true">→</span><span class="sr-only">makes</span>
              <template v-for="(n, r) in selBuilding.recipe.out" :key="r">
                <ResourceIcon :name="r" />{{ n }}
              </template>
              <span class="secs">· {{ Math.round(((void now, hive.batchMs(sel.key)) / 1000)) }}s each</span>
            </p>
            <div class="helpers" role="group" :aria-label="`Helpers at the ${selBuilding.name}`">
              <span class="label">Helpers {{ colony.workersAt(sel.key).length }}/{{ MAX_WORKERS }}</span>
              <span v-for="b in colony.workersAt(sel.key)" :key="b.id" class="helper">
                <span class="swatch" :style="{ background: SPECIES[b.species].look.colors.body, borderColor: SPECIES[b.species].look.colors.stripe }" aria-hidden="true" />
                {{ b.name }}
                <button class="unassign" :aria-label="`Send ${b.name} to rest`" @click="colony.setJob(b.id, null)">×</button>
              </span>
              <UiPicker
                v-if="colony.workersAt(sel.key).length < MAX_WORKERS && freeBees(sel.key).length"
                class="assign"
                :options="helperOptions(sel.key)"
                :model-value="null"
                placeholder="+ Add a helper"
                :label="`Add a helper to the ${selBuilding.name}`"
                @update:model-value="id => colony.setJob(Number(id), `cell:${sel!.key}`)"
              />
              <span v-else-if="!colony.bees.length" class="note">Befriend a wild bee to help here.</span>
            </div>
            <p v-if="colony.workersAt(sel.key).length" class="note">
              Helpers speed it up and carry each batch to the store for you.
            </p>
            <p class="status">
              {{ statusText(sel.status, 0).replace(/^./, m => m.toUpperCase()) }}.
            </p>
            <div v-if="sel.status.kind === 'working'" class="progress" aria-hidden="true">
              <span :style="{ width: `${sel.status.progress * 100}%` }" />
            </div>
            <div class="tray">
              <span>Tray: <strong>{{ sel.output }}</strong> / {{ TRAY_CAP }}</span>
              <button class="chip-btn primary" :disabled="!sel.output" @click="hive.collect(sel.key)">
                <span class="kbd hide-touch" aria-hidden="true">F</span> Collect
              </button>
            </div>
          </template>
          <p v-else-if="selBuilding.housing" class="status">
            A home for {{ selBuilding.housing }} helper bees. The colony has {{ colony.bees.length }} of {{ colony.capacity }} beds filled.
          </p>
          <p v-else class="status">
            Adds room for {{ selBuilding.storage }} more of every resource.
          </p>
        </template>
      </div>
    </div>

  </section>
</template>

<style scoped>
.hive-panel {
  position: absolute;
  top: max(14px, env(safe-area-inset-top));
  right: max(14px, env(safe-area-inset-right));
  width: min(340px, calc(100vw - 28px));
  max-height: calc(100vh - 28px - 76px);
  display: flex;
  flex-direction: column;
  padding: 14px 16px;
  overflow: hidden;
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
h2 {
  margin: 0;
  font-size: 1.3rem;
}
h3 {
  margin: 0 0 4px;
  font-size: 1.05rem;
}
.label {
  margin: 12px 0 6px;
  font-size: 0.8rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--honey-deep);
}
.cap {
  text-transform: none;
  letter-spacing: 0;
  color: var(--ink-soft);
  font-weight: 500;
}
.stock {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px 10px;
  font-weight: 700;
}
.stock li {
  display: flex;
  align-items: center;
  gap: 4px;
}
.stock li.zero {
  opacity: 0.45;
}
.body {
  overflow-y: auto;
  flex: 1;
  margin: 0 -6px;
  padding: 0 6px 6px;
}
.level {
  margin-left: 6px;
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--honey-deep);
}
.request-title {
  margin: 4px 0 2px;
  font-weight: 700;
}
.q-lines {
  list-style: none;
  margin: 6px 0 10px;
  padding: 0;
  display: grid;
  gap: 3px;
  font-size: 0.9rem;
}
.q-lines li {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--ink-soft);
}
.q-lines li.done {
  color: #3f8f35;
}
.q-lines .n {
  margin-left: auto;
}
.helpers {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin: 6px 0;
}
.helpers .label {
  font-weight: 700;
  font-size: 0.85rem;
  margin: 0;
}
.helper {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 2px 2px 8px;
  border-radius: 999px;
  background: var(--paper-2);
  border: 2px solid var(--line);
  font-weight: 700;
  font-size: 0.85rem;
}
.helper .swatch {
  width: 14px;
  height: 13px;
  flex: none;
  border: 2px solid;
  border-radius: 4px;
}
.unassign {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 0;
  background: none;
  font-size: 1.1rem;
  line-height: 1;
  color: var(--ink-soft);
}
.helpers .assign {
  flex-basis: 100%;
}
.detail {
  border-top: 2px dashed var(--line);
  padding-top: 10px;
}
.blurb {
  margin: 0 0 8px;
  color: var(--ink-soft);
  line-height: 1.45;
}
.note {
  margin: 6px 0 0;
  font-size: 0.9rem;
  color: var(--ink-soft);
}
.status {
  margin: 6px 0;
  font-weight: 600;
}
.recipe,
.costs {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 6px;
  margin: 4px 0 8px;
  font-weight: 700;
}
.secs {
  color: var(--ink-soft);
  font-weight: 500;
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
.progress {
  height: 10px;
  border-radius: 99px;
  background: var(--paper-2);
  border: 1px solid var(--line);
  overflow: hidden;
}
.progress span {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, #ffcf4d, var(--honey));
  transition: width 500ms linear;
}
.tray {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 10px;
}

@media (max-width: 640px) {
  .hive-panel {
    top: auto;
    left: max(10px, env(safe-area-inset-left));
    right: max(10px, env(safe-area-inset-right));
    width: auto;
    /* Sits above the action buttons. */
    bottom: max(78px, calc(env(safe-area-inset-bottom) + 70px));
    max-height: 42vh;
    padding: 12px 14px;
  }
}
</style>
