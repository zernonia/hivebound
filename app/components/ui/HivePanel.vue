<script setup lang="ts">
import { type CellStatus, HIVE_DOOR, QUEEN_CELL, useHive } from '~/stores/hive'
import { useQueen } from '~/stores/queen'
import type { PickerOption } from './UiPicker.vue'
import { MAX_WORKERS, useColony, workCell } from '~/stores/colony'
import { SPECIES, speciesName } from '~/utils/species'
import { useGame } from '~/stores/game'
import { ALL_RESOURCES, type Amounts, buildingAt, buildingBlurb, buildingName, TRAY_CAP, UNLOCK_CELL_COST, formatAmounts, resourceName } from '~/utils/resources'
import { requestAsk, requestTitle } from '~/utils/requests'

/*
 * The hive's compact card: the store, and whatever cell the bee is looking at. Bigger pages
 * open on demand instead: B builds, C shows the colony, U the upgrades.
 */
const hive = useHive()
const game = useGame()
const colony = useColony()
const queen = useQueen()
const { t } = useI18n()

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
    note: speciesName(b.species),
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
const selBuildingId = computed(() => sel.value?.building ?? null)
const selBuilding = computed(() => (selBuildingId.value ? BUILDINGS[selBuildingId.value] : null))

function statusText(st: CellStatus, output = 0): string {
  const tray = output > 0 ? t('hivePanel.trayReady', { n: output }) : ''
  switch (st.kind) {
    case 'queen': return t('hivePanel.st.queen')
    case 'locked': return t('hivePanel.st.locked')
    case 'empty': return t('hivePanel.st.empty')
    case 'storage': return t('hivePanel.st.storage')
    case 'working': return st.remaining > 0 ? t('hivePanel.st.working', { n: st.remaining }) + tray : t('hivePanel.st.finishing') + tray
    case 'waiting': return t('hivePanel.st.waiting', { amounts: formatAmounts(st.missing) || t('hivePanel.st.room') }) + tray
    case 'full': return output ? t('hivePanel.st.fullReady', { n: output }) : t('hivePanel.st.full')
    case 'paused': return t('hivePanel.st.paused') + tray
  }
}

function missingText(cost: Amounts) {
  const m = hive.missing(cost)
  return Object.keys(m).length ? t('hivePanel.need', { amounts: formatAmounts(m) }) : ''
}

const costList = (a: Amounts) => ALL_RESOURCES.filter(r => a[r]).map(r => ({ r, n: a[r]!, ok: hive.stock[r] >= a[r]! }))
</script>

<template>
  <section class="hive-panel panel" aria-labelledby="hive-title">
    <header class="head">
      <h2 id="hive-title">
        {{ t('terrain.hive.label') }}
      </h2>
    </header>

    <!-- Store -->
    <div class="store">
      <h3 class="label">
        {{ t('hivePanel.store') }} <span class="cap">{{ t('hivePanel.upToEach', { n: hive.storageCap }) }}</span>
      </h3>
      <ul class="stock">
        <li v-for="r in ALL_RESOURCES" :key="r" :class="{ zero: !hive.stock[r] }">
          <ResourceIcon :name="r" />
          <span class="n">{{ hive.stock[r] }}</span>
          <span class="sr-only">{{ resourceName(r) }}</span>
        </li>
      </ul>
    </div>

    <div class="body">
      <div v-if="hive.selected === HIVE_DOOR" class="detail" aria-live="polite">
        <h3>{{ t('hivePanel.doorway') }}</h3>
        <p class="blurb">
          {{ t('hivePanel.doorwayBlurb') }}
        </p>
        <button class="chip-btn primary" @click="game.leaveHive()">
          <span class="kbd hide-touch" aria-hidden="true">F</span> {{ t('actions.leave') }}
        </button>
      </div>
      <div v-else-if="sel" class="detail" aria-live="polite">
        <!-- Queen -->
        <template v-if="sel.key === QUEEN_CELL">
          <h3>{{ t('hivePanel.theQueen') }} <span class="level">{{ t('hivePanel.hiveLevel', { n: queen.hiveLevel }) }}</span></h3>
          <p class="request-title">
            ♛ {{ requestTitle(queen.current) }}
          </p>
          <p class="blurb">
            “{{ requestAsk(queen.current) }}”
          </p>
          <ul class="q-lines">
            <li v-for="l in queenLines" :key="l.label" :class="{ done: l.done }">
              <ResourceIcon v-if="l.resource" :name="l.resource" />
              <span>{{ l.done ? '✓' : '·' }} {{ l.label }}</span>
              <span v-if="l.need > 1" class="n">{{ l.have }}/{{ l.need }}</span>
            </li>
          </ul>
          <button class="chip-btn primary" :disabled="!queenReady" @click="queen.talk()">
            <span class="kbd hide-touch" aria-hidden="true">F</span> {{ queenReady ? t('actions.give') : t('hivePanel.notReady') }}
          </button>
        </template>

        <!-- Sealed -->
        <template v-else-if="sel.status.kind === 'locked'">
          <h3>{{ t('hivePanel.sealedCell') }}</h3>
          <p class="blurb">
            {{ t('hivePanel.sealedBlurb') }}
          </p>
          <p v-if="!hive.canUnlock(sel.key)" class="note">
            {{ t('hivePanel.unsealNext') }}
          </p>
          <template v-else>
            <p class="costs">
              <span v-for="c in costList(UNLOCK_CELL_COST)" :key="c.r" class="cost" :class="{ short: !c.ok }"><ResourceIcon :name="c.r" />{{ c.n }}<span class="sr-only"> {{ resourceName(c.r) }}</span></span>
            </p>
            <button class="chip-btn primary" :disabled="!hive.has(UNLOCK_CELL_COST)" @click="hive.unlock(sel.key)">
              <span class="kbd hide-touch" aria-hidden="true">F</span> {{ t('actions.unseal') }}
            </button>
            <p v-if="!hive.has(UNLOCK_CELL_COST)" class="note">
              {{ t('hivePanel.missingWax', { missing: missingText(UNLOCK_CELL_COST) }) }}
            </p>
          </template>
        </template>

        <!-- Empty: point at the build menu -->
        <template v-else-if="sel.status.kind === 'empty'">
          <h3>{{ t('hivePanel.emptyCell') }}</h3>
          <p class="blurb">
            {{ t('hivePanel.emptyBlurb') }}
          </p>
          <button class="chip-btn primary" @click="game.buildMenuOpen = true">
            <span class="kbd hide-touch" aria-hidden="true">B</span> {{ t('hivePanel.buildDots') }}
          </button>
        </template>

        <!-- A building -->
        <template v-else-if="selBuilding">
          <h3>{{ buildingName(selBuildingId!) }}</h3>
          <p class="blurb">
            {{ buildingBlurb(selBuildingId!) }}
          </p>
          <template v-if="selBuilding.recipe">
            <p class="recipe">
              <template v-for="c in costList(selBuilding.recipe.in)" :key="c.r">
                <ResourceIcon :name="c.r" />{{ c.n }}
              </template>
              <span aria-hidden="true">→</span><span class="sr-only">{{ t('hivePanel.makes') }}</span>
              <template v-for="(n, r) in selBuilding.recipe.out" :key="r">
                <ResourceIcon :name="r" />{{ n }}
              </template>
              <span class="secs">· {{ t('hivePanel.secsEach', { n: Math.round(((void now, hive.batchMs(sel.key)) / 1000)) }) }}</span>
            </p>
            <div class="helpers" role="group" :aria-label="t('hivePanel.helpersAtAria', { at: buildingAt(selBuildingId!) })">
              <span class="label">{{ t('hivePanel.helpers') }} {{ colony.workersAt(sel.key).length }}/{{ MAX_WORKERS }}</span>
              <span v-for="b in colony.workersAt(sel.key)" :key="b.id" class="helper">
                <span class="swatch" :style="{ background: SPECIES[b.species].look.colors.body, borderColor: SPECIES[b.species].look.colors.stripe }" aria-hidden="true" />
                {{ b.name }}
                <button class="unassign" :aria-label="t('hivePanel.sendToRest', { name: b.name })" @click="colony.setJob(b.id, null)">×</button>
              </span>
              <UiPicker
                v-if="colony.workersAt(sel.key).length < MAX_WORKERS && freeBees(sel.key).length"
                class="assign"
                :options="helperOptions(sel.key)"
                :model-value="null"
                :placeholder="t('hivePanel.addHelper')"
                :label="t('hivePanel.addHelperAt', { at: buildingAt(selBuildingId!) })"
                @update:model-value="id => colony.setJob(Number(id), `cell:${sel!.key}`)"
              />
              <span v-else-if="!colony.bees.length" class="note">{{ t('hivePanel.befriendToHelp') }}</span>
            </div>
            <p v-if="colony.workersAt(sel.key).length" class="note">
              {{ t('hivePanel.helpersNote') }}
            </p>
            <p class="status">
              {{ statusText(sel.status, 0).replace(/^./, m => m.toUpperCase()) }}.
            </p>
            <div v-if="sel.status.kind === 'working'" class="progress" aria-hidden="true">
              <span :style="{ width: `${sel.status.progress * 100}%` }" />
            </div>
            <div class="tray">
              <span>{{ t('hivePanel.tray') }} <strong>{{ sel.output }}</strong> / {{ TRAY_CAP }}</span>
              <span class="tray-actions">
                <button class="chip-btn" :aria-pressed="!!hive.cells[sel.key]?.paused" @click="hive.togglePause(sel.key)">
                  {{ hive.cells[sel.key]?.paused ? t('hivePanel.resume') : t('hivePanel.pause') }}
                </button>
                <button class="chip-btn primary" :disabled="!sel.output" @click="hive.collect(sel.key)">
                  <span class="kbd hide-touch" aria-hidden="true">F</span> {{ t('hivePanel.collect') }}
                </button>
              </span>
            </div>
          </template>
          <p v-else-if="selBuilding.housing" class="status">
            {{ t('hivePanel.housing', { n: selBuilding.housing, filled: colony.bees.length, cap: colony.capacity }) }}
          </p>
          <p v-else class="status">
            {{ t('hivePanel.storage', { n: selBuilding.storage }) }}
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
/* On short screens the card scrolls: fade its bottom edge while there's more below, so buttons
   under the fold don't look cut off. Scroll-driven, so it clears once you reach the end. */
@property --more {
  syntax: '<length>';
  inherits: false;
  initial-value: 0px;
}
@supports (animation-timeline: scroll()) {
  .body {
    mask-image: linear-gradient(to bottom, #000 calc(100% - var(--more)), transparent);
    animation: more-below linear both;
    animation-timeline: scroll(self);
  }
}
@keyframes more-below {
  from {
    --more: 28px;
  }
  95% {
    --more: 28px;
  }
  to {
    --more: 0px;
  }
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
.tray-actions {
  display: flex;
  gap: 6px;
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
