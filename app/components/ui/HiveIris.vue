<script setup lang="ts">
import { useGame } from '~/stores/game'

/*
 * A honey-coloured circle that closes over the screen while the scene swaps between
 * the meadow and the inside of the hive, then opens again. Purely visual.
 */
const game = useGame()
</script>

<template>
  <div class="iris" :class="{ closed: game.irisClosed }" aria-hidden="true">
    <div class="hole" />
  </div>
</template>

<style scoped>
.iris {
  position: fixed;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
  z-index: 40;
}
/* A circle whose huge shadow is the coloured wipe; scaling the circle down closes the iris. */
.hole {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 260vmax;
  height: 260vmax;
  margin: -130vmax 0 0 -130vmax;
  border-radius: 50%;
  box-shadow: 0 0 0 200vmax #f0a238, inset 0 0 6vmax 2vmax rgba(240, 162, 56, 0.9);
  transform: scale(1);
  transition: transform 420ms cubic-bezier(0.55, 0, 0.35, 1);
}
.closed .hole {
  transform: scale(0);
}
/* Opening eases out, so the new scene blooms into view. */
.iris:not(.closed) .hole {
  transition-timing-function: cubic-bezier(0.25, 0, 0.3, 1);
}
</style>
