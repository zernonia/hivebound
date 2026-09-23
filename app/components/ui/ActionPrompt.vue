<script setup lang="ts">
import { useGame } from '~/stores/game'

/*
 * Floating "F  Enter hive" / "F  Collect 3" prompt that hangs over the tile or hive cell
 * it belongs to. GameScene moves it every frame (it writes the `transform`), so this
 * component only decides what it says. It's a real button: tap or click works too.
 */
const game = useGame()
const action = computed(() => game.primaryAction)
</script>

<template>
  <div id="action-prompt" class="anchor" :class="{ on: !!action }">
    <Transition name="pop">
      <button
        v-if="action"
        :key="action.id"
        class="prompt"
        aria-keyshortcuts="F"
        :aria-label="`${action.label} (F)`"
        @click="game.doAction()"
      >
        <span class="key" aria-hidden="true">F</span>
        <span>{{ action.label }}</span>
      </button>
    </Transition>
  </div>
</template>

<style scoped>
.anchor {
  position: absolute;
  left: 0;
  top: 0;
  width: 0;
  height: 0;
  pointer-events: none;
  z-index: 5;
}
.prompt {
  position: absolute;
  left: 0;
  bottom: 0;
  transform: translate(-50%, 0);
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 6px 16px 6px 7px;
  border-radius: 99px;
  border: 2px solid rgba(240, 220, 192, 0.95);
  background: var(--panel-bg);
  box-shadow: var(--shadow);
  font-weight: 700;
  white-space: nowrap;
  pointer-events: auto;
  animation: float 2.4s ease-in-out infinite;
}
/* Little tail pointing down at the tile. */
.prompt::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: -8px;
  width: 14px;
  height: 14px;
  background: var(--panel-bg);
  border-right: 2px solid rgba(240, 220, 192, 0.95);
  border-bottom: 2px solid rgba(240, 220, 192, 0.95);
  transform: translateX(-50%) rotate(45deg);
  border-radius: 0 0 4px 0;
}
.key {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 9px;
  background: var(--honey);
  box-shadow: inset 0 -3px 0 var(--honey-deep);
  font-size: 1rem;
}
@keyframes float {
  50% {
    transform: translate(-50%, -5px);
  }
}
.pop-enter-active,
.pop-leave-active {
  transition: opacity 180ms ease, scale 220ms var(--ease);
}
.pop-enter-from,
.pop-leave-to {
  opacity: 0;
  scale: 0.8;
}
.pop-leave-active {
  position: absolute;
}
</style>
