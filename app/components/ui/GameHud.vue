<script setup lang="ts">
import { DOORSTEP } from '~/utils/world'
import { useGame } from '~/stores/game'
import { useHive } from '~/stores/hive'
import { useSettings } from '~/stores/settings'
import { RESOURCE_INFO, tileSource } from '~/utils/resources'
import { useWorldData } from '~/utils/world'

const game = useGame()
const hive = useHive()
const settings = useSettings()
const world = useWorldData()

const inHive = computed(() => game.scene === 'hive')
const place = computed(() => (inHive.value ? 'Home Hive' : game.describeTile(game.pos)))

// What can be gathered on this tile (refreshed on a slow clock so regrowth shows up).
const now = ref(Date.now())
let clock: ReturnType<typeof setInterval> | undefined
onMounted(() => (clock = setInterval(() => (now.value = Date.now()), 1000)))
onBeforeUnmount(() => clearInterval(clock))
const here = computed(() => {
  if (inHive.value || game.queue.length) return null
  const tile = world.byKey.get(`${game.pos.q},${game.pos.r}`)
  const src = tileSource(tile)
  if (!tile || !src) return null
  void hive.rev
  void hive.pouchTotal
  const left = hive.tileAmount(tile, now.value)
  return { resource: src.resource, left, max: src.max, regrow: left < src.max ? hive.tileRegrowIn(tile, now.value) : 0 }
})

function lookAround() {
  game.announce(game.describeHere())
  game.toast(game.describeHere())
}
</script>

<template>
  <div class="hud">
    <!-- Top-left: where am I -->
    <div class="left-col">
      <header class="where panel">
        <p class="title">
          Hivebound
        </p>
        <p class="place">
          {{ place }}
        </p>
        <p class="sub">
          Day {{ game.day }} · {{ game.steps }} {{ game.steps === 1 ? 'hex' : 'hexes' }} flown
        </p>
        <p v-if="here" class="here">
          <ResourceIcon :name="here.resource" />
          <span>{{ RESOURCE_INFO[here.resource].name }} {{ here.left }}/{{ here.max }}</span>
          <span v-if="here.regrow" class="regrow">· +1 in {{ here.regrow }}s</span>
        </p>
      </header>
      <PouchMeter v-if="!inHive" />
    </div>

    <!-- Top-right: minimap -->
    <div v-if="!inHive" class="map-slot">
      <Minimap v-if="settings.showMinimap" />
    </div>

    <!-- Inside the hive -->
    <HivePanel v-if="inHive && !game.transition" />

    <!-- Bottom-left: actions -->
    <nav class="actions" :class="{ 'in-hive': inHive }" aria-label="Game actions">
      <button class="chip-btn" style="position: relative" :aria-label="game.unreadCount ? `Journal, ${game.unreadCount} new` : 'Journal'" @click="game.journalOpen = true">
        <UiIcon name="journal" />
        <span>Journal</span>
        <span class="kbd hide-touch" aria-hidden="true">J</span>
        <span v-if="game.unreadCount" class="badge" aria-hidden="true">{{ game.unreadCount }}</span>
      </button>
      <template v-if="!inHive">
        <button class="chip-btn" aria-label="Look around" @click="lookAround">
          <UiIcon name="look" />
          <span>Look</span>
          <span class="kbd hide-touch" aria-hidden="true">L</span>
        </button>
        <button class="chip-btn" aria-label="Fly home" @click="game.travelTo(DOORSTEP)">
          <UiIcon name="home" />
          <span>Home</span>
          <span class="kbd hide-touch" aria-hidden="true">H</span>
        </button>
        <button class="chip-btn" aria-label="Enter the hive" @click="game.enterHive()">
          <UiIcon name="arrow" />
          <span>Enter hive</span>
          <span class="kbd hide-touch" aria-hidden="true">I</span>
        </button>
      </template>
      <button class="chip-btn" aria-label="Settings" @click="game.settingsOpen = true">
        <UiIcon name="settings" />
      </button>
    </nav>

    <!-- Bottom-right: zoom + pad -->
    <div v-if="!inHive" class="right">
      <MovePad v-if="settings.showPad" />
      <div class="zoom" role="group" aria-label="Zoom">
        <button class="chip-btn" aria-label="Zoom in" @click="settings.setZoom(settings.zoom / 1.15)">
          <UiIcon name="plus" />
        </button>
        <button class="chip-btn" aria-label="Zoom out" @click="settings.setZoom(settings.zoom * 1.15)">
          <UiIcon name="minus" />
        </button>
      </div>
    </div>

    <!-- First-run tip -->
    <Transition name="fade">
      <aside v-if="settings.showHints && game.steps < 3 && !inHive" class="tip panel" aria-label="Tip">
        <p>
          <strong>Tap a tile</strong> to fly there<span class="hide-touch">, or use
            <span class="kbd">Q</span><span class="kbd">W</span><span class="kbd">E</span>
            <span class="kbd">A</span><span class="kbd">S</span><span class="kbd">D</span></span>.
          Follow the <span class="spark" aria-hidden="true">◆</span> sparkles to find new places.
        </p>
        <button class="chip-btn small" @click="settings.showHints = false">
          Got it
        </button>
      </aside>
    </Transition>

    <!-- Toasts (visual only; the announcer handles screen readers) -->
    <div class="toasts" aria-hidden="true">
      <TransitionGroup name="toast">
        <div v-for="t in game.toasts" :key="t.id" class="toast panel">
          {{ t.text }}
        </div>
      </TransitionGroup>
    </div>
  </div>
</template>

<style scoped>
.hud {
  position: fixed;
  inset: 0;
  pointer-events: none;
  padding: max(14px, env(safe-area-inset-top)) max(14px, env(safe-area-inset-right)) max(14px, env(safe-area-inset-bottom)) max(14px, env(safe-area-inset-left));
}
.hud > * {
  pointer-events: auto;
}
.left-col {
  position: absolute;
  top: max(14px, env(safe-area-inset-top));
  left: max(14px, env(safe-area-inset-left));
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  max-width: calc(100vw - 220px);
}
.where {
  padding: 10px 18px 12px;
}
.where p {
  margin: 0;
}
.title {
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--honey-deep);
}
.place {
  font-size: 1.35rem;
  font-weight: 700;
  line-height: 1.2;
}
.sub {
  font-size: 0.85rem;
  color: var(--ink-soft);
}
.here {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 4px !important;
  font-weight: 700;
  font-size: 0.95rem;
}
.regrow {
  font-weight: 500;
  color: var(--ink-soft);
}
.map-slot {
  position: absolute;
  top: max(14px, env(safe-area-inset-top));
  right: max(14px, env(safe-area-inset-right));
}
.actions {
  position: absolute;
  left: max(14px, env(safe-area-inset-left));
  bottom: max(14px, env(safe-area-inset-bottom));
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  max-width: calc(100vw - 230px);
}
.right {
  position: absolute;
  right: max(14px, env(safe-area-inset-right));
  bottom: max(14px, env(safe-area-inset-bottom));
  display: flex;
  align-items: flex-end;
  gap: 10px;
}
.zoom {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.zoom .chip-btn {
  padding: 0;
  width: 48px;
}
.tip {
  position: absolute;
  left: 50%;
  top: max(92px, calc(env(safe-area-inset-top) + 80px));
  transform: translateX(-50%);
  width: min(440px, calc(100vw - 28px));
  padding: 14px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
}
.tip p {
  margin: 0;
  line-height: 1.55;
}
.tip .kbd {
  margin: 0 1px;
}
.spark {
  color: var(--honey-deep);
}
.chip-btn.small {
  min-height: 44px;
  flex: none;
  box-shadow: none;
}
.toasts {
  position: absolute;
  left: 50%;
  bottom: max(84px, calc(env(safe-area-inset-bottom) + 76px));
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  width: min(460px, calc(100vw - 28px));
  pointer-events: none;
}
.toast {
  padding: 10px 18px;
  font-weight: 600;
  text-align: center;
}
.toast-enter-active,
.toast-leave-active,
.fade-enter-active,
.fade-leave-active {
  transition: all 300ms var(--ease);
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(12px) scale(0.96);
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

@media (max-width: 640px) {
  .actions.in-hive {
    bottom: calc(min(58vh, 520px) + max(20px, env(safe-area-inset-bottom)));
  }
  .where {
    padding: 8px 14px 10px;
  }
  .place {
    font-size: 1.1rem;
  }
  .actions .chip-btn span:not(.badge):not(.kbd):not(.sr-only) {
    display: none;
  }
  .actions .chip-btn {
    padding: 0;
    width: 52px;
    height: 52px;
  }
  .actions {
    max-width: none;
  }
  .right {
    bottom: max(80px, calc(env(safe-area-inset-bottom) + 72px));
  }
  .tip {
    top: auto;
    bottom: max(290px, calc(env(safe-area-inset-bottom) + 280px));
  }
  .toasts {
    bottom: max(250px, calc(env(safe-area-inset-bottom) + 240px));
  }
}
</style>
