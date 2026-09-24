<script setup lang="ts">
import { gameAudio } from '~/audio/engine'
import { useColony } from '~/stores/colony'
import { SPECIES } from '~/utils/species'

/*
 * The befriending dance: a marker circles a ring; press F (or tap the ring) while it's inside
 * the green arc. Three tries, then the wild bee shyly flies off. A soft tick plays each time
 * the marker enters the green, so it can be played by ear too.
 */
const colony = useColony()
const dance = computed(() => colony.dance)
const species = computed(() => (dance.value ? SPECIES[dance.value.species] : null))

const R = 74
const C = 90
const angle = ref(0)
let raf = 0
let wasIn = false
let closeTimer: ReturnType<typeof setTimeout> | undefined

function frame() {
  if (!colony.dance) return
  if (!colony.dance.result || colony.dance.result === 'miss') {
    angle.value = colony.danceAngle()
    const inside = colony.inZone(angle.value)
    if (inside && !wasIn) gameAudio.danceCue()
    wasIn = inside
  }
  raf = requestAnimationFrame(frame)
}

watch(() => !!dance.value, (on) => {
  cancelAnimationFrame(raf)
  clearTimeout(closeTimer)
  if (on) {
    wasIn = false
    raf = requestAnimationFrame(frame)
  }
}, { immediate: true })

// React to each result: a sound, then close after a beat when it's over.
watch(() => dance.value && `${dance.value.result}:${dance.value.misses}`, () => {
  const r = dance.value?.result
  if (r === 'hit') {
    gameAudio.befriended()
    closeTimer = setTimeout(() => colony.endDance(), 1300)
  }
  else if (r === 'miss') {
    gameAudio.danceMiss()
  }
  else if (r === 'fled') {
    gameAudio.danceMiss()
    closeTimer = setTimeout(() => colony.endDance(), 1400)
  }
})
onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  clearTimeout(closeTimer)
})

/** Point on the ring for an angle in degrees (0 = top, clockwise). */
const at = (deg: number, r = R) => {
  const a = ((deg - 90) * Math.PI) / 180
  return { x: C + Math.cos(a) * r, y: C + Math.sin(a) * r }
}
const arcPath = computed(() => {
  const d = dance.value
  if (!d) return ''
  const a = at(d.zoneStart)
  const b = at(d.zoneStart + d.zoneSize)
  return `M ${a.x} ${a.y} A ${R} ${R} 0 ${d.zoneSize > 180 ? 1 : 0} 1 ${b.x} ${b.y}`
})
const marker = computed(() => at(angle.value))
const triesLeft = computed(() => (dance.value ? 3 - dance.value.misses : 0))
const message = computed(() => {
  const d = dance.value
  if (!d || !species.value) return ''
  if (d.result === 'hit') return 'Friends!'
  if (d.result === 'fled') return 'Too shy this time…'
  if (d.result === 'miss') return 'Almost! Try again'
  return 'Press F in the green'
})
</script>

<template>
  <Transition name="dance">
    <div v-if="dance && species" class="dance" :class="dance.result">
      <button class="ring-btn" :aria-label="`Befriend the ${species.name}: press now while the marker is in the green`" @click="colony.danceHit()">
        <svg :viewBox="`0 0 ${C * 2} ${C * 2}`" aria-hidden="true">
          <circle :cx="C" :cy="C" :r="R" class="track" />
          <path :d="arcPath" class="zone" />
          <circle :cx="marker.x" :cy="marker.y" r="11" class="marker" />
        </svg>
        <span class="center" aria-hidden="true">
          <span class="swatch" :style="{ background: species.look.colors.body, borderColor: species.look.colors.stripe }" />
          <span class="kind">{{ species.name }}</span>
        </span>
      </button>
      <p class="msg">
        {{ message }}
      </p>
      <div class="tries" :aria-label="`${triesLeft} tries left`">
        <span v-for="i in 3" :key="i" class="pip" :class="{ used: i > triesLeft }" />
      </div>
      <p class="keys hide-touch">
        <span class="kbd">F</span> catch · <span class="kbd">Esc</span> back away
      </p>
    </div>
  </Transition>
</template>

<style scoped>
.dance {
  position: fixed;
  left: 50%;
  bottom: max(96px, calc(env(safe-area-inset-bottom) + 90px));
  transform: translateX(-50%);
  z-index: 30;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 14px 18px 12px;
  border-radius: 24px;
  background: var(--panel-bg);
  border: var(--panel-border);
  box-shadow: var(--shadow);
}
.ring-btn {
  position: relative;
  width: 180px;
  height: 180px;
  padding: 0;
  border: 0;
  background: none;
  border-radius: 50%;
}
.ring-btn svg {
  width: 100%;
  height: 100%;
}
.track {
  fill: none;
  stroke: var(--paper-2);
  stroke-width: 16;
}
.zone {
  fill: none;
  stroke: #7fcf6a;
  stroke-width: 16;
  stroke-linecap: round;
}
.marker {
  fill: #fffaf0;
  stroke: var(--ink);
  stroke-width: 4;
}
.center {
  position: absolute;
  inset: 0;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 4px;
}
.swatch {
  width: 34px;
  height: 30px;
  border-radius: 10px;
  border: 4px solid;
}
.kind {
  font-weight: 700;
}
.msg {
  margin: 0;
  font-weight: 700;
  font-size: 1.05rem;
}
.hit .msg {
  color: #3f8f35;
}
.hit .track {
  stroke: #bfe8b3;
}
.miss .ring-btn {
  animation: shake 320ms ease;
}
.tries {
  display: flex;
  gap: 6px;
}
.pip {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--honey);
  border: 2px solid var(--honey-deep);
}
.pip.used {
  background: transparent;
}
.keys {
  margin: 0;
  font-size: 0.85rem;
  color: var(--ink-soft);
}
@keyframes shake {
  25% { transform: translateX(-6px); }
  75% { transform: translateX(6px); }
}
.dance-enter-active,
.dance-leave-active {
  transition: opacity 220ms ease, transform 260ms var(--ease);
}
.dance-enter-from,
.dance-leave-to {
  opacity: 0;
  transform: translate(-50%, 16px) scale(0.94);
}
</style>
