<script setup lang="ts">
import { useGame } from '~/stores/game'
import { useHive } from '~/stores/hive'
import { ALL_RESOURCES, type Amounts, BUILDINGS, BUILDING_LIST, RESOURCE_INFO, formatAmounts } from '~/utils/resources'

/*
 * Quick build (B): with an empty cell selected in the hive, a small menu of buildings.
 * ↑/↓ or W/S (or 1–5) to choose, Enter / F to build, Esc or B to close. Clicking works too.
 */
const game = useGame()
const hive = useHive()
const active = ref(0)
const list = ref<HTMLElement>()

const canOpen = () => game.scene === 'hive' && !game.transition && !!hive.selected && hive.status(hive.selected).kind === 'empty'

const rows = computed(() => {
  void hive.rev
  return BUILDING_LIST.map((id) => {
    const def = BUILDINGS[id]
    const costs = ALL_RESOURCES.filter(r => def.cost[r]).map(r => ({ r, n: def.cost[r]!, ok: hive.stock[r] >= def.cost[r]! }))
    const missing = hive.missing(def.cost)
    return { id, def, costs, ok: !Object.keys(missing).length, missing }
  })
})
const needText = (m: Amounts) => `Need ${formatAmounts(m)} more`

function open() {
  if (!canOpen()) {
    if (game.scene === 'hive') {
      game.toast('Pick an empty cell to build on.')
      game.announce('Pick an empty cell to build on first.')
    }
    return
  }
  game.buildMenuOpen = true
}
// However it was opened (B, or the panel's Build button): start on something affordable.
watch(() => game.buildMenuOpen, (v) => {
  if (!v) return
  const firstOk = rows.value.findIndex(r => r.ok)
  active.value = firstOk >= 0 ? firstOk : 0
  game.announce('Build menu. Up and down to choose, Enter to build, Escape to close.')
  nextTick(() => list.value?.focus())
})
function close() {
  game.buildMenuOpen = false
  // Don't leave focus on the list as it animates away.
  if (list.value?.contains(document.activeElement)) (document.activeElement as HTMLElement).blur()
}
function build(i = active.value) {
  const r = rows.value[i]
  if (!r || !hive.selected) return
  if (!r.ok) {
    game.announce(`${r.def.name}: ${needText(r.missing)}.`)
    game.toast(needText(r.missing))
    return
  }
  if (hive.build(hive.selected, r.id)) close()
}

function onKey(e: KeyboardEvent) {
  const target = e.target as HTMLElement | null
  if (!game.buildMenuOpen) {
    if (e.code !== 'KeyB' || e.repeat || game.journalOpen || game.settingsOpen) return
    // Not while typing, or while a dropdown picker has the keys.
    if (target?.closest('input, textarea, [contenteditable], .picker-list')) return
    e.preventDefault()
    e.stopPropagation()
    open()
    return
  }
  // Open: this menu takes the keys (the page's own handler steps aside while it's open).
  const n = rows.value.length
  if (e.code === 'Escape' || e.code === 'KeyB') close()
  else if (e.code === 'ArrowDown' || e.code === 'KeyS') active.value = (active.value + 1) % n
  else if (e.code === 'ArrowUp' || e.code === 'KeyW') active.value = (active.value - 1 + n) % n
  else if (e.code === 'Enter' || e.code === 'KeyF' || e.code === 'Space') build()
  else if (/^Digit[1-9]$/.test(e.code)) {
    const i = Number(e.code.slice(5)) - 1
    if (i < n) {
      active.value = i
      build(i)
    }
  }
  else if (!['KeyA', 'KeyD', 'KeyQ', 'KeyE', 'ArrowLeft', 'ArrowRight', 'KeyJ', 'KeyH', 'KeyL'].includes(e.code)) return
  // Handled here: don't let the same key also steer the bee, open Settings, etc.
  e.preventDefault()
  e.stopPropagation()
}
// Capture phase, so this runs before the page's own key handler and can keep keys from it.
onMounted(() => window.addEventListener('keydown', onKey, true))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey, true))

// Leaving the hive (or the cell getting built on elsewhere) closes the menu.
watch(() => [game.scene, hive.selected, hive.rev], () => {
  if (game.buildMenuOpen && !canOpen()) close()
})

defineExpose({ open })
</script>

<template>
  <Transition name="pop">
    <section v-if="game.buildMenuOpen" class="build-menu panel" aria-labelledby="build-menu-title">
      <header>
        <h2 id="build-menu-title">
          Build here
        </h2>
        <button class="close" aria-label="Close build menu" @click="close">
          <UiIcon name="close" />
        </button>
      </header>
      <ul ref="list" role="listbox" tabindex="-1" aria-labelledby="build-menu-title" :aria-activedescendant="`build-opt-${active}`">
        <li
          v-for="(r, i) in rows"
          :id="`build-opt-${i}`"
          :key="r.id"
          role="option"
          :aria-selected="i === active"
          :aria-disabled="!r.ok || undefined"
          :class="{ active: i === active, short: !r.ok }"
          @mousemove="active = i"
          @click="build(i)"
        >
          <span class="num" aria-hidden="true">{{ i + 1 }}</span>
          <span class="main">
            <strong>{{ r.def.name }}</strong>
            <span class="blurb">{{ r.ok ? r.def.blurb : needText(r.missing) }}</span>
          </span>
          <span class="costs">
            <span v-for="c in r.costs" :key="c.r" class="cost" :class="{ low: !c.ok }">
              <ResourceIcon :name="c.r" />{{ c.n }}<span class="sr-only"> {{ RESOURCE_INFO[c.r].name }}</span>
            </span>
          </span>
        </li>
      </ul>
      <p class="keys hide-touch">
        <span class="kbd">↑</span><span class="kbd">↓</span> choose · <span class="kbd">Enter</span> build · <span class="kbd">Esc</span> close
      </p>
    </section>
  </Transition>
</template>

<style scoped>
.build-menu {
  position: fixed;
  left: 50%;
  bottom: max(88px, calc(env(safe-area-inset-bottom) + 84px));
  transform: translateX(-50%);
  z-index: 35;
  width: min(420px, calc(100vw - 24px));
  padding: 12px 12px 10px;
}
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 4px 6px;
}
h2 {
  margin: 0;
  font-size: 1.05rem;
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
ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 4px;
  outline: none;
}
/* The highlighted row shows where you are; no ring round the whole list. */
ul:focus,
ul:focus-visible {
  outline: none;
  box-shadow: none !important;
}
li {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 52px;
  padding: 6px 10px;
  border-radius: 14px;
  border: 2px solid transparent;
  cursor: pointer;
}
li.active {
  background: color-mix(in srgb, var(--honey) 30%, var(--paper));
  border-color: var(--honey-deep);
}
li.short {
  opacity: 0.6;
}
.num {
  width: 24px;
  height: 24px;
  flex: none;
  display: grid;
  place-items: center;
  border-radius: 7px;
  background: var(--paper-2);
  border: 2px solid var(--line);
  font-size: 0.8rem;
  font-weight: 700;
}
.main {
  flex: 1;
  min-width: 0;
  display: grid;
}
.blurb {
  font-size: 0.8rem;
  color: var(--ink-soft);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.costs {
  display: flex;
  gap: 6px;
  font-weight: 700;
  font-size: 0.85rem;
}
.cost {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}
.cost.low {
  color: #c0442f;
}
.keys {
  margin: 8px 4px 0;
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
  transform: translate(-50%, 12px) scale(0.97);
}
</style>
