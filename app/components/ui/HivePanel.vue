<script setup lang="ts">
import { type CellStatus, HIVE_CELLS, HIVE_DOOR, HIVE_RADIUS, QUEEN_CELL, useHive } from '~/stores/hive'
import { MAX_WORKERS, type ColonyBee, useColony, workCell } from '~/stores/colony'
import { SPECIES } from '~/utils/species'
import { useGame } from '~/stores/game'
import { RAW_RESOURCES } from '~/utils/resources'
import { hexKey } from '~/utils/hex'
import {
  ALL_RESOURCES,
  type Amounts,
  BUILDINGS,
  BUILDING_LIST,
  type BuildingId,
  RESOURCE_INFO,
  type RawResource,
  type Resource,
  TRAY_CAP,
  UNLOCK_CELL_COST,
  UPGRADES,
  UPGRADE_LIST,
  formatAmounts,
} from '~/utils/resources'

const hive = useHive()
const game = useGame()

const tab = ref<'cells' | 'colony' | 'upgrades'>('cells')
const colony = useColony()
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

function onWorkPick(bee: ColonyBee, ev: Event) {
  const key = (ev.target as HTMLSelectElement).value
  if (key) colony.setJob(bee.id, `cell:${key}`)
}

/** Bees that could be sent to the selected building (anyone not already there). */
function freeBees(key: string) {
  return colony.bees.filter(b => workCell(b.job) !== key)
}
function onAssign(key: string, ev: Event) {
  const el = ev.target as HTMLSelectElement
  const id = Number(el.value)
  el.value = ''
  if (id) colony.setJob(id, `cell:${key}`)
}

// The comb map (layout + unsealing) is tucked away until asked for; the choice is remembered.
const MAP_KEY = 'hivebound:hive-map'
const showMap = ref(false)
onMounted(() => {
  try {
    showMap.value = localStorage.getItem(MAP_KEY) === '1'
  }
  catch { /* storage unavailable */ }
})
function toggleMap() {
  showMap.value = !showMap.value
  try {
    localStorage.setItem(MAP_KEY, showMap.value ? '1' : '0')
  }
  catch { /* ignore */ }
}

// Tick a clock so countdowns and progress bars move.
const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => (timer = setInterval(() => (now.value = Date.now()), 500)))
onBeforeUnmount(() => clearInterval(timer))

/* ---------------- comb map ---------------- */
const S = 24 // hex size in px
const cells = computed(() => HIVE_CELLS.map((h) => {
  const key = hexKey(h)
  void hive.rev
  return {
    key,
    x: S * 1.5 * h.q,
    y: S * Math.sqrt(3) * (h.r + h.q / 2),
    status: hive.status(key, now.value),
    building: hive.cells[key]?.building,
    output: hive.cells[key]?.output ?? 0,
  }
}))

/** Buildings with goods waiting in their tray. */
const readyCount = computed(() => cells.value.filter(c => c.output > 0).length)

const productOf = (id: BuildingId): Resource | null => {
  const out = BUILDINGS[id].recipe?.out
  return out ? (Object.keys(out)[0] as Resource) : null
}

function cellLabel(c: (typeof cells.value)[number]) {
  const name = c.key === QUEEN_CELL ? 'The Queen' : c.building ? BUILDINGS[c.building].name : c.status.kind === 'locked' ? 'Sealed cell' : 'Empty cell'
  return `${name}, ${statusText(c.status, c.output)}`
}

/* ---------------- selection ---------------- */
const sel = computed(() => cells.value.find(c => c.key === hive.selected) ?? null)
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

function build(id: BuildingId) {
  if (sel.value) hive.build(sel.value.key, id)
}
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

    <div class="tabs" role="tablist" aria-label="Hive">
      <button id="tab-cells" role="tab" :aria-selected="tab === 'cells'" aria-controls="panel-cells" :class="{ on: tab === 'cells' }" @click="tab = 'cells'">
        Cells
      </button>
      <button id="tab-colony" role="tab" :aria-selected="tab === 'colony'" aria-controls="panel-colony" :class="{ on: tab === 'colony' }" @click="tab = 'colony'">
        Colony <span class="count">{{ colony.bees.length }}</span>
      </button>
      <button id="tab-upgrades" role="tab" :aria-selected="tab === 'upgrades'" aria-controls="panel-upgrades" :class="{ on: tab === 'upgrades' }" @click="tab = 'upgrades'">
        Upgrades
      </button>
    </div>

    <!-- Cells -->
    <div v-show="tab === 'cells'" id="panel-cells" role="tabpanel" aria-labelledby="tab-cells" class="body">
      <button class="map-toggle" :aria-expanded="showMap" aria-controls="hive-map" @click="toggleMap">
        <span>Hive map</span>
        <span v-if="readyCount" class="ready">{{ readyCount }} ready</span>
        <span class="chev" :class="{ open: showMap }" aria-hidden="true">▾</span>
      </button>
      <div v-show="showMap" id="hive-map" class="comb" role="group" aria-label="Hive cells">
        <button
          v-for="c in cells"
          :key="c.key"
          class="cell"
          :class="[c.status.kind, { sel: c.key === hive.selected }]"
          :style="{ transform: `translate(${c.x}px, ${c.y}px)` }"
          :aria-pressed="c.key === hive.selected"
          :aria-label="cellLabel(c)"
          @click="hive.selected = c.key"
        >
          <span class="hexbg" aria-hidden="true">
            <svg v-if="c.key === QUEEN_CELL" viewBox="0 0 24 24" class="glyph"><path d="M4 17h16l-1.5-9-4 4L12 6l-2.5 6-4-4z" fill="#ffc93d" stroke="#5b3a24" stroke-width="1.6" stroke-linejoin="round" /></svg>
            <svg v-else-if="c.status.kind === 'locked'" viewBox="0 0 24 24" class="glyph"><rect x="6" y="11" width="12" height="9" rx="2" fill="#f2b544" stroke="#5b3a24" stroke-width="1.6" /><path d="M9 11V8.5a3 3 0 0 1 6 0V11" fill="none" stroke="#5b3a24" stroke-width="1.6" /></svg>
            <ResourceIcon v-else-if="c.building && productOf(c.building)" :name="productOf(c.building)!" />
            <svg v-else-if="c.building === 'larder'" viewBox="0 0 24 24" class="glyph"><path d="M7 6h10v13H7z M7 12.5h10" fill="#f2b43c" stroke="#5b3a24" stroke-width="1.6" stroke-linejoin="round" /></svg>
            <svg v-else-if="c.building === 'room'" viewBox="0 0 24 24" class="glyph"><path d="M4 17V9m0 5h16v3m0-3v-2a3 3 0 0 0-3-3h-6v5" fill="none" stroke="#5b3a24" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /><circle cx="7.5" cy="11" r="1.8" fill="#f7a1b5" stroke="#5b3a24" stroke-width="1.4" /></svg>
            <span v-else class="plus">+</span>
          </span>
          <span v-if="c.output" class="badge" aria-hidden="true">{{ c.output }}</span>
          <span v-else-if="c.status.kind === 'working'" class="dot" aria-hidden="true" />
        </button>
        <button
          class="cell door"
          :class="{ sel: hive.selected === HIVE_DOOR }"
          :style="{ transform: `translate(0px, ${S * Math.sqrt(3) * (HIVE_RADIUS + 1)}px)` }"
          :aria-pressed="hive.selected === HIVE_DOOR"
          aria-label="Doorway, the way out"
          @click="hive.selected = HIVE_DOOR"
        >
          <span class="hexbg door-bg" aria-hidden="true">
            <UiIcon name="arrow" class="glyph out" />
          </span>
        </button>
      </div>
      <p v-show="showMap" class="hint hide-touch">
        Move with <span class="kbd">W</span><span class="kbd">A</span><span class="kbd">S</span><span class="kbd">D</span>, act with <span class="kbd">F</span>
      </p>

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
          <h3>The Queen</h3>
          <p class="blurb">
            She hums while you work and asks about every flower you visit. Bring back plenty so the hive can grow.
          </p>
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

        <!-- Empty: build menu -->
        <template v-else-if="sel.status.kind === 'empty'">
          <h3>Empty cell</h3>
          <ul class="builds">
            <li v-for="id in BUILDING_LIST" :key="id" class="build">
              <div class="build-head">
                <strong>{{ BUILDINGS[id].name }}</strong>
                <span class="costs">
                  <span v-for="c in costList(BUILDINGS[id].cost)" :key="c.r" class="cost" :class="{ short: !c.ok }"><ResourceIcon :name="c.r" />{{ c.n }}<span class="sr-only"> {{ RESOURCE_INFO[c.r].name }}</span></span>
                </span>
              </div>
              <p class="blurb">
                {{ BUILDINGS[id].blurb }}
              </p>
              <p v-if="BUILDINGS[id].recipe" class="recipe">
                <template v-for="c in costList(BUILDINGS[id].recipe!.in)" :key="c.r">
                  <ResourceIcon :name="c.r" />{{ c.n }}
                </template>
                <span aria-hidden="true">→</span><span class="sr-only">makes</span>
                <template v-for="(n, r) in BUILDINGS[id].recipe!.out" :key="r">
                  <ResourceIcon :name="r" />{{ n }}
                </template>
                <span class="secs">· {{ BUILDINGS[id].recipe!.seconds }}s</span>
              </p>
              <button class="chip-btn primary" :disabled="!hive.has(BUILDINGS[id].cost)" :aria-label="`Build ${BUILDINGS[id].name}`" @click="build(id)">
                Build
              </button>
              <p v-if="!hive.has(BUILDINGS[id].cost)" class="note">
                {{ missingText(BUILDINGS[id].cost) }}
              </p>
            </li>
          </ul>
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
              <select
                v-if="colony.workersAt(sel.key).length < MAX_WORKERS && freeBees(sel.key).length"
                class="assign"
                :aria-label="`Add a helper to the ${selBuilding.name}`"
                @change="onAssign(sel.key, $event)"
              >
                <option value="">
                  + Add a helper
                </option>
                <option v-for="b in freeBees(sel.key)" :key="b.id" :value="b.id">
                  {{ b.name }} ({{ SPECIES[b.species].name }})
                </option>
              </select>
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

    <!-- Colony -->
    <div v-show="tab === 'colony'" id="panel-colony" role="tabpanel" aria-labelledby="tab-colony" class="body">
      <p class="beds">
        <strong>{{ colony.bees.length }} / {{ colony.capacity }}</strong> beds filled
        <span v-if="!colony.hasRoom" class="note"> · build a Bee Room for more</span>
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
              :title="j.v === SPECIES[b.species].favourite ? `${j.label} (favourite)` : j.label"
              @click="colony.setJob(b.id, j.v)"
            >
              <ResourceIcon v-if="j.v" :name="j.v" />
              <span v-else>Rest</span>
              <span v-if="j.v" class="sr-only">{{ j.label }}</span>
            </button>
          </div>
          <select
            v-if="workplaces.length"
            class="work"
            :class="{ on: workCell(b.job) }"
            :value="workCell(b.job) ?? ''"
            :aria-label="`Where ${b.name} works in the hive`"
            @change="onWorkPick(b, $event)"
          >
            <option value="" disabled>
              Work at a building…
            </option>
            <option
              v-for="w in workplaces"
              :key="w.key"
              :value="w.key"
              :disabled="w.workers >= MAX_WORKERS && workCell(b.job) !== w.key"
            >
              {{ w.label }} ({{ w.workers }}/{{ MAX_WORKERS }})
            </option>
          </select>
        </li>
      </ul>
    </div>

    <!-- Upgrades -->
    <div v-show="tab === 'upgrades'" id="panel-upgrades" role="tabpanel" aria-labelledby="tab-upgrades" class="body">
      <ul class="upgrades">
        <li v-for="id in UPGRADE_LIST" :key="id" class="upgrade">
          <div class="build-head">
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
          <template v-if="UPGRADES[id].costs[hive.upgrades[id]]">
            <p class="costs">
              <span v-for="c in costList(UPGRADES[id].costs[hive.upgrades[id]]!)" :key="c.r" class="cost" :class="{ short: !c.ok }"><ResourceIcon :name="c.r" />{{ c.n }}<span class="sr-only"> {{ RESOURCE_INFO[c.r].name }}</span></span>
            </p>
            <button class="chip-btn primary" :disabled="!hive.has(UPGRADES[id].costs[hive.upgrades[id]]!)" :aria-label="`Upgrade ${UPGRADES[id].name}`" @click="hive.upgrade(id)">
              Upgrade
            </button>
          </template>
          <p v-else class="note">
            Fully upgraded.
          </p>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.hive-panel {
  position: absolute;
  top: max(14px, env(safe-area-inset-top));
  right: max(14px, env(safe-area-inset-right));
  bottom: max(14px, env(safe-area-inset-bottom));
  width: min(360px, calc(100vw - 28px));
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
.out {
  width: 20px;
  height: 20px;
  transform: rotate(180deg);
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
.tabs {
  display: flex;
  gap: 6px;
  margin: 12px 0 8px;
}
.tabs button {
  flex: 1;
  min-height: 44px;
  border-radius: 14px;
  border: 2px solid var(--line);
  background: var(--paper);
  font-weight: 700;
}
.tabs button.on {
  background: var(--honey);
  border-color: var(--honey-deep);
}
.body {
  overflow-y: auto;
  flex: 1;
  margin: 0 -6px;
  padding: 0 6px 6px;
}
/* Honeycomb map of the cells */
.tabs .count {
  display: inline-block;
  min-width: 20px;
  margin-left: 4px;
  padding: 0 6px;
  border-radius: 99px;
  background: var(--paper-2);
  font-size: 0.8rem;
}
.beds {
  margin: 0 0 8px;
}
.colony {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.friend {
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
.work,
.assign {
  width: 100%;
  min-height: 44px;
  margin-top: 4px;
  padding: 0 10px;
  border-radius: 12px;
  border: 2px solid var(--line);
  background: var(--paper-2);
  color: var(--ink);
  font: inherit;
  font-weight: 700;
  font-size: 0.85rem;
}
.work.on {
  background: var(--honey);
  border-color: var(--honey-deep);
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
  border-width: 2px;
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
  width: auto;
  flex: 1;
  margin: 0;
}
.jobs button.fav::after {
  content: '♥';
  position: absolute;
  top: 1px;
  right: 4px;
  font-size: 0.65rem;
  color: #e8553f;
}
.map-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 44px;
  margin: 0 0 8px;
  padding: 0 14px;
  border: 2px solid var(--line);
  border-radius: 14px;
  background: var(--paper);
  font-weight: 700;
}
.map-toggle .ready {
  padding: 1px 8px;
  border-radius: 99px;
  background: #e8553f;
  color: #fff;
  font-size: 0.8rem;
}
.map-toggle .chev {
  margin-left: auto;
  transition: transform 200ms var(--ease);
}
.map-toggle .chev.open {
  transform: rotate(180deg);
}
.comb {
  position: relative;
  height: 364px;
  margin: 0;
}
/* The comb is centred a little high so the doorway fits underneath. */
.comb .cell {
  top: calc(50% - 22px - 21px);
}
.door-bg {
  background: #fff1c2;
}
.hint {
  margin: 0 0 10px;
  text-align: center;
  font-size: 0.85rem;
  color: var(--ink-soft);
}
.cell {
  position: absolute;
  left: calc(50% - 24px);
  top: calc(50% - 23px);
  width: 48px;
  height: 44px;
  padding: 0;
  border: 0;
  background: none;
  border-radius: 12px;
}
.hexbg {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  clip-path: polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%);
  background: #ffd98a;
}
.cell.locked .hexbg {
  background: #e3a94c;
}
.cell.queen .hexbg {
  background: #f7a1b5;
}
.cell.sel .hexbg {
  background: var(--honey);
  transform: scale(1.1);
}
.glyph {
  width: 24px;
  height: 24px;
}
.plus {
  font-size: 1.4rem;
  font-weight: 700;
  color: var(--ink-soft);
}
.badge {
  position: absolute;
  top: -4px;
  right: 2px;
  min-width: 20px;
  height: 20px;
  padding: 0 5px;
  border-radius: 99px;
  background: #e8553f;
  color: #fff;
  font-size: 0.75rem;
  font-weight: 700;
  line-height: 20px;
}
.dot {
  position: absolute;
  top: 2px;
  right: 8px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #7fbf7a;
  box-shadow: 0 0 0 2px var(--paper);
  animation: pulse 1.4s ease-in-out infinite;
}
@keyframes pulse {
  50% {
    transform: scale(1.35);
  }
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
.builds,
.upgrades {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.build,
.upgrade {
  background: var(--paper);
  border: 2px solid var(--line);
  border-radius: 16px;
  padding: 10px 12px;
}
.build-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.build-head .costs {
  margin: 0;
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

@media (max-width: 640px) {
  .hive-panel {
    top: auto;
    left: max(10px, env(safe-area-inset-left));
    right: max(10px, env(safe-area-inset-right));
    width: auto;
    height: min(58vh, 520px);
    padding: 12px 14px;
  }
  .comb {
    height: 350px;
  }
}
</style>
