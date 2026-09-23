<script setup lang="ts">
import { DIRECTION_NAMES, type Direction } from '~/utils/hex'
import { useGame } from '~/stores/game'

const game = useGame()
const held = useHeldDirection()

// Flat-top hex neighbours laid out around the centre (angles in degrees, 0 = up).
const buttons: { d: Direction, angle: number }[] = [
  { d: 'N', angle: 0 },
  { d: 'NE', angle: 60 },
  { d: 'SE', angle: 120 },
  { d: 'S', angle: 180 },
  { d: 'SW', angle: 240 },
  { d: 'NW', angle: 300 },
]

function down(d: Direction, ev: PointerEvent) {
  ;(ev.currentTarget as HTMLElement).setPointerCapture?.(ev.pointerId)
  held.press(d)
  game.step(d)
}
function up(d: Direction) {
  held.release(d)
}
function click(d: Direction, ev: MouseEvent) {
  // Keyboard activation (Enter / Space on the focused button).
  if (ev.detail === 0) game.step(d)
}
</script>

<template>
  <div class="pad" role="group" aria-label="Movement pad">
    <button
      v-for="b in buttons"
      :key="b.d"
      class="dir"
      :style="{ '--a': `${b.angle}deg` }"
      :aria-label="`Fly ${DIRECTION_NAMES[b.d]}`"
      @pointerdown.prevent="down(b.d, $event)"
      @pointerup="up(b.d)"
      @pointercancel="up(b.d)"
      @lostpointercapture="up(b.d)"
      @click="click(b.d, $event)"
    >
      <UiIcon name="arrow" />
    </button>
    <span class="hub" aria-hidden="true" />
  </div>
</template>

<style scoped>
.pad {
  position: relative;
  width: 176px;
  height: 176px;
  touch-action: none;
}
.dir {
  --r: 60px;
  position: absolute;
  left: 50%;
  top: 50%;
  width: 56px;
  height: 56px;
  margin: -28px 0 0 -28px;
  border-radius: 50%;
  border: var(--panel-border);
  background: var(--panel-bg);
  box-shadow: var(--shadow);
  display: grid;
  place-items: center;
  transform: rotate(var(--a)) translateY(calc(var(--r) * -1));
  transition: background var(--dur);
}
.dir:active {
  background: var(--honey);
}
.dir svg {
  width: 24px;
  height: 24px;
}
.hub {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 34px;
  height: 34px;
  margin: -17px 0 0 -17px;
  clip-path: polygon(25% 5%, 75% 5%, 100% 50%, 75% 95%, 25% 95%, 0 50%);
  background: var(--honey);
  opacity: 0.8;
}
</style>
