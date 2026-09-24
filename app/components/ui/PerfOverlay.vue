<script setup lang="ts">
import { perfEnabled, perfStats } from '~/utils/perfMonitor'

/* Small dev overlay: FPS, frame time graph, main-thread busy %, memory and render stats. */

const graph = ref<HTMLCanvasElement>()
const W = 180
const H = 36

// Colour by how the number feels: green is comfy, amber is getting warm, red is too much.
const fpsTone = computed(() => (perfStats.fps >= 55 ? 'ok' : perfStats.fps >= 30 ? 'warm' : 'hot'))
const busyTone = computed(() => (perfStats.busyPct < 35 ? 'ok' : perfStats.busyPct < 65 ? 'warm' : 'hot'))

watch(() => perfStats.history, (h) => {
  const c = graph.value
  if (!c) return
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  if (c.width !== W * dpr) {
    c.width = W * dpr
    c.height = H * dpr
  }
  const ctx = c.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, W, H)
  // Guide lines at 60fps (16.7ms) and 30fps (33.3ms); the graph tops out at 50ms.
  const y = (ms: number) => H - Math.min(1, ms / 50) * H
  ctx.strokeStyle = 'rgba(255,255,255,0.25)'
  ctx.setLineDash([3, 3])
  for (const ms of [16.7, 33.3]) {
    ctx.beginPath()
    ctx.moveTo(0, y(ms))
    ctx.lineTo(W, y(ms))
    ctx.stroke()
  }
  ctx.setLineDash([])
  const step = W / Math.max(1, h.length - 1)
  const bw = Math.max(1, step - 0.5)
  h.forEach((ms, i) => {
    ctx.fillStyle = ms > 33.3 ? '#ff7a6b' : ms > 17.5 ? '#ffc94a' : '#8ee07a'
    ctx.fillRect(i * step, y(ms), bw, H - y(ms))
  })
})

// Low FPS with an idle main thread means the GPU is the bottleneck, and vice versa.
const bound = computed(() => {
  if (perfStats.fps >= 50) return null
  return perfStats.busyPct < 40 ? 'GPU-bound' : 'CPU-bound'
})

const fmt = (n: number, d = 0) => n.toFixed(d)
const tris = computed(() => (perfStats.triangles >= 1e6 ? `${fmt(perfStats.triangles / 1e6, 2)}M` : `${fmt(perfStats.triangles / 1e3, 0)}k`))
</script>

<template>
  <aside v-if="perfEnabled" class="perf" aria-label="Performance stats">
    <div class="row head">
      <span class="big" :class="fpsTone">{{ fmt(perfStats.fps) }} <small>fps</small></span>
      <span class="big" :class="busyTone" title="Share of time the main thread spends on the game's frame work">{{ fmt(perfStats.busyPct) }}% <small>busy</small></span>
      <button class="x" aria-label="Hide performance stats" title="Hide (`)" @click="perfEnabled = false">
        ×
      </button>
    </div>
    <canvas ref="graph" class="graph" :style="{ width: `${W}px`, height: `${H}px` }" aria-hidden="true" />
    <dl>
      <div><dt>frame</dt><dd>{{ fmt(perfStats.frameMs, 1) }} ms <span class="dim">worst {{ fmt(perfStats.worstMs) }}</span></dd></div>
      <div><dt>work</dt><dd>{{ fmt(perfStats.busyMs, 2) }} ms / frame</dd></div>
      <div><dt>long tasks</dt><dd :class="{ hot: perfStats.longTasks > 0 }">{{ perfStats.longTasks }} <span class="dim">/ 10s</span></dd></div>
      <div v-if="perfStats.heapMb != null"><dt>JS heap</dt><dd>{{ fmt(perfStats.heapMb, 1) }} MB</dd></div>
      <div><dt>draws</dt><dd>{{ perfStats.drawCalls }} <span class="dim">· {{ tris }} tris</span></dd></div>
      <div><dt>tiles</dt><dd>{{ perfStats.tiles }}</dd></div>
    </dl>
    <p v-if="bound" class="bound warm">
      {{ bound }}
    </p>
  </aside>
</template>

<style scoped>
.perf {
  position: fixed;
  left: 50%;
  top: max(10px, env(safe-area-inset-top));
  transform: translateX(-50%);
  z-index: 60;
  width: 204px;
  padding: 8px 12px 10px;
  border-radius: 14px;
  background: rgba(34, 24, 18, 0.82);
  color: #fff4e0;
  font: 12px/1.35 ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  pointer-events: auto;
  user-select: none;
  backdrop-filter: blur(4px);
}
.row {
  display: flex;
  align-items: baseline;
  gap: 12px;
}
.big {
  font-size: 18px;
  font-weight: 700;
}
.big small {
  font-size: 11px;
  font-weight: 500;
  opacity: 0.75;
}
.x {
  margin-left: auto;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.12);
  color: inherit;
  font-size: 16px;
  line-height: 1;
}
.graph {
  display: block;
  margin: 6px 0 4px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.06);
}
dl {
  margin: 0;
}
dl div {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}
dt {
  opacity: 0.7;
}
dd {
  margin: 0;
  text-align: right;
}
.dim {
  opacity: 0.6;
}
.bound {
  margin: 4px 0 0;
  font-weight: 700;
}
.ok {
  color: #8ee07a;
}
.warm {
  color: #ffc94a;
}
.hot {
  color: #ff7a6b;
}
</style>
