<script setup lang="ts">
import type { Direction } from '~/utils/hex'
import { PALETTE_CVD, PALETTE_DEFAULT } from '~/utils/palette'
import { perfAvailable, togglePerf } from '~/utils/perfMonitor'
import { useGame } from '~/stores/game'
import { useHive } from '~/stores/hive'
import { useSettings } from '~/stores/settings'

const game = useGame()
const hive = useHive()
const settings = useSettings()
const held = useHeldDirection()

settings.load()
game.load()
hive.load()
useGameAudio()

// Persist settings whenever they change.
watch(() => settings.$state, () => settings.save(), { deep: true })

// Reflect accessibility settings on <html>.
const sky = computed(() => (settings.colorVisionFriendly ? PALETTE_CVD : PALETTE_DEFAULT).sky)
useHead({
  htmlAttrs: {
    class: computed(() => [settings.highContrast && 'hc', settings.reducedMotion && 'rm'].filter(Boolean).join(' ')),
    style: computed(() => `--text-scale:${settings.textScale};--sky-top:${sky.value[0]};--sky-bottom:${sky.value[1]}`),
  },
})

/* ------------------------------------------------------------------ */
/* Keyboard                                                           */
/* ------------------------------------------------------------------ */
const MOVE_KEYS: Record<string, Direction | 'W' | 'E'> = {
  KeyW: 'N',
  ArrowUp: 'N',
  KeyS: 'S',
  ArrowDown: 'S',
  KeyQ: 'NW',
  KeyE: 'NE',
  KeyA: 'SW',
  KeyD: 'SE',
  ArrowLeft: 'W',
  ArrowRight: 'E',
}

function onKeyDown(e: KeyboardEvent) {
  if (e.metaKey || e.ctrlKey || e.altKey) return
  // ` toggles the performance overlay (dev builds, or any build opened with ?perf).
  if (e.code === 'Backquote' && perfAvailable) {
    togglePerf()
    return
  }
  const modal = game.journalOpen || game.settingsOpen
  if (modal) {
    // Native <dialog> handles Esc; J toggles the journal closed.
    if (e.code === 'KeyJ' && game.journalOpen) game.journalOpen = false
    return
  }
  const target = e.target as HTMLElement | null
  if (target?.closest('input, textarea, select, [contenteditable]')) return
  // Nothing steers the bee while it's flying through the hive door.
  if (game.transition) return

  // F: the contextual action shown in the floating prompt (enter, collect, unseal, leave).
  if (e.code === 'KeyF') {
    if (!e.repeat) game.doAction()
    return
  }
  if (game.scene === 'hive') {
    // Inside, movement keys walk the selection round the comb.
    const dir = MOVE_KEYS[e.code]
    if (dir) {
      e.preventDefault()
      if (dir === 'W' || dir === 'E') hive.moveSelectionSideways(dir)
      else hive.moveSelection(dir)
    }
    else if (e.code === 'KeyJ') game.journalOpen = true
    else if (e.code === 'Escape' || e.code === 'KeyO') game.settingsOpen = true
    return
  }

  const move = MOVE_KEYS[e.code]
  if (move) {
    e.preventDefault()
    if (e.repeat) return
    held.press(move)
    if (move === 'W' || move === 'E') game.stepLateral(move)
    else game.step(move)
    return
  }
  switch (e.code) {
    case 'KeyJ':
      game.journalOpen = true
      break
    case 'KeyL':
      game.announce(game.describeHere())
      game.toast(game.describeHere())
      break
    case 'KeyH':
      game.flyHome()
      break
    case 'KeyM':
      if (!settings.showMinimap) settings.showMinimap = true
      else settings.largeMinimap = !settings.largeMinimap
      break
    case 'Escape':
    case 'KeyO':
      game.settingsOpen = true
      break
    case 'Space':
      // Only when focus isn't on a button (Space activates buttons).
      if (target?.closest('button')) return
      e.preventDefault()
      game.cancelRoute()
      break
    case 'Equal':
    case 'NumpadAdd':
      settings.setZoom(settings.zoom / 1.15)
      break
    case 'Minus':
    case 'NumpadSubtract':
      settings.setZoom(settings.zoom * 1.15)
      break
  }
}

function onKeyUp(e: KeyboardEvent) {
  const move = MOVE_KEYS[e.code]
  if (move) held.release(move)
}

const saveNow = () => {
  game.save()
  hive.save()
}
// Buildings run on real time: advance them every second, and catch up when the tab returns.
let hiveClock: ReturnType<typeof setInterval> | undefined
const catchUp = () => document.visibilityState === 'visible' && hive.tick()

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', held.clear)
  window.addEventListener('pagehide', saveNow)
  document.addEventListener('visibilitychange', catchUp)
  hiveClock = setInterval(() => hive.tick(), 1000)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
  window.removeEventListener('blur', held.clear)
  window.removeEventListener('pagehide', saveNow)
  document.removeEventListener('visibilitychange', catchUp)
  clearInterval(hiveClock)
})

// Stop held movement when a panel opens.
watch(() => game.journalOpen || game.settingsOpen, open => open && held.clear())
</script>

<template>
  <main class="game">
    <h1 class="sr-only">
      Hivebound, a cozy bee exploration game
    </h1>
    <ClientOnly>
      <GameCanvas />
      <template #fallback>
        <div class="loading" role="status">
          <span class="hex" aria-hidden="true" />
          Warming up the hive…
        </div>
      </template>
    </ClientOnly>
    <GameHud />
    <JournalPanel />
    <SettingsPanel />
    <Announcer />
    <HiveIris />
    <PerfOverlay v-if="perfAvailable" />
  </main>
</template>

<style scoped>
.game {
  position: fixed;
  inset: 0;
}
.loading {
  position: fixed;
  inset: 0;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 14px;
  font-weight: 600;
  font-size: 1.1rem;
}
.hex {
  width: 56px;
  height: 56px;
  background: var(--honey);
  clip-path: polygon(25% 5%, 75% 5%, 100% 50%, 75% 95%, 25% 95%, 0 50%);
  animation: spin 1.6s var(--ease) infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
