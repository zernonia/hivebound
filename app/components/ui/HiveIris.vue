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
/*
 * A see-through circle whose huge shadow is the coloured wipe. Shrinking the circle's size
 * (not scaling it, which would shrink the shadow too) closes the iris over the screen.
 */
.hole {
  position: absolute;
  left: 50%;
  top: 50%;
  /* Just larger than the screen's diagonal, so the wipe starts moving straight away. */
  width: 150vmax;
  height: 150vmax;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  box-shadow: 0 0 0 200vmax #f0a238, inset 0 0 3vmax 1vmax rgba(240, 162, 56, 0.85);
  transition: width 420ms cubic-bezier(0.55, 0, 0.35, 1), height 420ms cubic-bezier(0.55, 0, 0.35, 1);
}
.closed .hole {
  width: 0;
  height: 0;
}
/* Opening eases out, so the new scene blooms into view. */
.iris:not(.closed) .hole {
  transition-timing-function: cubic-bezier(0.25, 0, 0.3, 1);
}
</style>
