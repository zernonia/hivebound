<script setup lang="ts">
import { hexKey, hexToWorld, worldToHex } from '~/utils/hex'
import { PALETTE_CVD, PALETTE_DEFAULT } from '~/utils/palette'
import { OUTER_RADIUS, POIS, POI_BY_ID, WORLD_RADIUS, useWorldData } from '~/utils/world'
import { useQueen } from '~/stores/queen'
import { useGame } from '~/stores/game'
import { useSettings } from '~/stores/settings'

const game = useGame()
const settings = useSettings()
const world = useWorldData()

const canvas = ref<HTMLCanvasElement>()
const narrow = ref(false)
onMounted(() => {
  const mq = window.matchMedia('(max-width: 640px)')
  narrow.value = mq.matches
  mq.addEventListener('change', e => (narrow.value = e.matches))
})
const size = computed(() => (settings.largeMinimap ? (narrow.value ? 220 : 260) : narrow.value ? 112 : 156))

// Large map shows the whole island (and the land beyond the mist, once it lifts); small map
// is a local view around the bee.
const queen = useQueen()
const fullExtent = computed(() => ((queen.mistLifted ? OUTER_RADIUS : WORLD_RADIUS) + 1) * 1.5)
const LOCAL_EXTENT = 7 * 1.5
const view = computed(() => {
  const extent = settings.largeMinimap ? fullExtent.value : LOCAL_EXTENT
  const c = settings.largeMinimap ? { x: 0, z: 0 } : hexToWorld(game.pos)
  return { extent, cx: c.x, cz: c.z, scale: size.value / 2 / extent }
})

const summary = computed(() => {
  void game.revealTick
  const open = world.tiles.filter(t => t.walkable && (!t.beyond || queen.mistLifted))
  const walkable = open.length
  const seen = open.filter(t => game.discovered.has(t.key)).length
  const found = world.pois.filter(p => game.discovered.has(hexKey(p.hex))).length
  return `Map. Explored ${Math.round((seen / walkable) * 100)} percent of the meadow. ${found} of ${POIS.length} places found, ${game.visitedPois.length} visited.`
})

function draw() {
  const c = canvas.value
  if (!c) return
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const px = size.value
  if (c.width !== px * dpr) {
    c.width = px * dpr
    c.height = px * dpr
  }
  const ctx = c.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, px, px)
  const { scale } = view.value
  // Screen position of world origin.
  const cx = px / 2 - view.value.cx * scale
  const cy = px / 2 - view.value.cz * scale
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(0, 0, px, px, 14)
  ctx.clip()
  ctx.fillStyle = settings.highContrast ? '#ffffff' : 'rgba(207,232,255,0.45)'
  ctx.fillRect(0, 0, px, px)
  const pal = settings.colorVisionFriendly ? PALETTE_CVD : PALETTE_DEFAULT
  const r = scale * 0.98

  const hexPath = (x: number, y: number, rad: number) => {
    ctx.beginPath()
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i
      const hx = x + Math.cos(a) * rad
      const hy = y + Math.sin(a) * rad
      if (i === 0) ctx.moveTo(hx, hy)
      else ctx.lineTo(hx, hy)
    }
    ctx.closePath()
  }

  // Island silhouette so the unexplored area still reads as "there's more".
  for (const t of world.tiles) {
    // The land beyond the mist isn't even hinted at until the mist lifts.
    if (t.beyond && !queen.mistLifted) continue
    const { x, z } = hexToWorld(t)
    hexPath(cx + x * scale, cy + z * scale, r)
    if (game.discovered.has(t.key)) {
      ctx.fillStyle = pal.terrain[t.terrain]
    }
    else {
      ctx.fillStyle = t.terrain === 'edge' ? 'rgba(255,255,255,0.55)' : 'rgba(214,205,226,0.55)'
    }
    ctx.fill()
  }

  // Route.
  if (game.queue.length) {
    ctx.strokeStyle = settings.highContrast ? '#000' : 'rgba(255,255,255,0.95)'
    ctx.lineWidth = 2
    ctx.setLineDash([3, 3])
    ctx.beginPath()
    const p0 = hexToWorld(game.pos)
    ctx.moveTo(cx + p0.x * scale, cy + p0.z * scale)
    for (const h of game.queue) {
      const p = hexToWorld(h)
      ctx.lineTo(cx + p.x * scale, cy + p.z * scale)
    }
    ctx.stroke()
    ctx.setLineDash([])
  }

  // Points of interest.
  for (const p of world.pois) {
    if (!game.discovered.has(hexKey(p.hex))) continue
    const { x, z } = hexToWorld(p.hex)
    const visited = game.visitedPois.includes(p.id)
    const sx = cx + x * scale
    const sy = cy + z * scale
    // Star shape: shape + colour, not colour alone.
    ctx.beginPath()
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5
      const rad = i % 2 === 0 ? scale * 1.25 : scale * 0.55
      ctx.lineTo(sx + Math.cos(a) * rad, sy + Math.sin(a) * rad)
    }
    ctx.closePath()
    ctx.fillStyle = visited ? '#fff3dc' : '#ffb627'
    ctx.strokeStyle = '#5b3a24'
    ctx.lineWidth = 1.4
    ctx.fill()
    ctx.stroke()
  }

  // Home hive.
  ctx.fillStyle = '#f2c46b'
  ctx.strokeStyle = '#5b3a24'
  ctx.lineWidth = 1.5
  hexPath(cx, cy, scale * 1.2)
  ctx.fill()
  ctx.stroke()

  // The bee.
  const b = hexToWorld(game.pos)
  const bx = cx + b.x * scale
  const by = cy + b.z * scale
  ctx.beginPath()
  ctx.arc(bx, by, Math.max(4.5, scale * 1.1), 0, Math.PI * 2)
  ctx.fillStyle = '#ffd24d'
  ctx.fill()
  ctx.lineWidth = 2.5
  ctx.strokeStyle = '#3a2618'
  ctx.stroke()
  ctx.restore()
}

let raf = 0
const schedule = () => {
  cancelAnimationFrame(raf)
  raf = requestAnimationFrame(draw)
}
watch(
  () => [game.revealTick, game.pos, game.queue.length, game.visitedPois.length, settings.colorVisionFriendly, settings.highContrast, size.value, queen.mistLifted],
  schedule,
)
onMounted(schedule)
onBeforeUnmount(() => cancelAnimationFrame(raf))

function onClick(ev: MouseEvent) {
  const c = canvas.value!
  const rect = c.getBoundingClientRect()
  const { scale, cx, cz } = view.value
  const x = cx + (ev.clientX - rect.left - rect.width / 2) / scale
  const z = cz + (ev.clientY - rect.top - rect.height / 2) / scale
  const h = worldToHex(x, z)
  if (world.byKey.has(hexKey(h))) game.travelTo(h)
}

const nextPlace = computed(() => {
  void game.revealTick
  const p = world.pois.find(p => game.discovered.has(hexKey(p.hex)) && !game.visitedPois.includes(p.id))
  return p ? POI_BY_ID[p.id].name : null
})
</script>

<template>
  <section class="minimap panel" :class="{ large: settings.largeMinimap }" aria-label="Minimap">
    <canvas
      ref="canvas"
      :style="{ width: `${size}px`, height: `${size}px` }"
      role="img"
      :aria-label="summary"
      title="Click to fly there"
      @click="onClick"
    />
    <div class="row">
      <span class="label">
        <span aria-hidden="true">★</span>
        {{ game.visitedPois.length }}/{{ POIS.length }}
        <span class="sr-only">places visited</span>
      </span>
      <button
        class="mini-btn"
        :aria-label="settings.largeMinimap ? 'Make map smaller' : 'Make map bigger'"
        :aria-pressed="settings.largeMinimap"
        @click="settings.largeMinimap = !settings.largeMinimap"
      >
        <UiIcon :name="settings.largeMinimap ? 'shrink' : 'expand'" />
        <span class="kbd hide-touch" aria-hidden="true">M</span>
      </button>
    </div>
    <p v-if="nextPlace && settings.largeMinimap" class="hint">
      Unvisited: {{ nextPlace }}
    </p>
  </section>
</template>

<style scoped>
.minimap {
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  transition: width var(--dur) var(--ease);
}
canvas {
  display: block;
  cursor: crosshair;
  border-radius: 14px;
}
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: 600;
  font-size: 0.9rem;
}
.label {
  padding-left: 4px;
}
.label [aria-hidden] {
  color: var(--honey-deep);
}
.mini-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 40px;
  min-width: 40px;
  justify-content: center;
  padding: 0 8px;
  border: none;
  background: var(--paper-2);
  border-radius: 12px;
}
.mini-btn svg {
  width: 18px;
  height: 18px;
}
.hint {
  margin: 0;
  font-size: 0.85rem;
  color: var(--ink-soft);
  max-width: 260px;
}
</style>
