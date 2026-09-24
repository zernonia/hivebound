/*
 * Dev performance monitor: FPS, frame time, main-thread busy share, long tasks, JS heap and
 * render stats. Browsers don't expose real CPU usage, so "busy" is the time the game's frame
 * work takes (our update + three.js's render calls) as a share of wall-clock time: a good proxy
 * for how hard the page is making the CPU work.
 *
 * Available in dev, or in any build with `?perf` in the URL. Toggle with the ` key.
 */

import { reactive, ref, watch } from 'vue'

const STORAGE_KEY = 'hivebound:perf'
const HISTORY = 90

export interface PerfStats {
  fps: number
  /** Average time between frames (ms). */
  frameMs: number
  /** Worst frame gap in the last sample window (ms). */
  worstMs: number
  /** Average frame work (ms): update + render submission. */
  busyMs: number
  /** Frame work as a share of wall-clock time, 0..100. */
  busyPct: number
  /** Main-thread tasks over 50ms seen in the last 10 seconds. */
  longTasks: number
  /** JS heap in MB (Chromium only), or null. */
  heapMb: number | null
  drawCalls: number
  triangles: number
  tiles: number
  /** Recent frame gaps (ms), oldest first, for the graph. */
  history: number[]
}

export const perfAvailable = typeof window !== 'undefined'
  && (import.meta.dev || new URLSearchParams(window.location.search).has('perf'))

export const perfEnabled = ref(false)
export const perfStats = reactive<PerfStats>({
  fps: 0, frameMs: 0, worstMs: 0, busyMs: 0, busyPct: 0, longTasks: 0, heapMb: null, drawCalls: 0, triangles: 0, tiles: 0, history: [],
})

if (perfAvailable) {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    // `?perf` turns it on straight away (handy on phones, which have no ` key).
    perfEnabled.value = saved ? saved === '1' : new URLSearchParams(window.location.search).has('perf')
  }
  catch { /* storage unavailable */ }
  watch(perfEnabled, (v) => {
    try {
      localStorage.setItem(STORAGE_KEY, v ? '1' : '0')
    }
    catch { /* ignore */ }
  })
}

export function togglePerf() {
  if (perfAvailable) perfEnabled.value = !perfEnabled.value
}

/* ------------------------------------------------------------------ */
/* Sampling (plain JS; only the snapshot above is reactive)           */
/* ------------------------------------------------------------------ */

let frameStartAt = 0
let lastFrameAt = 0
let windowStart = 0
let frames = 0
let busySum = 0
let worst = 0
const gaps: number[] = []
const longTaskTimes: number[] = []
let observing = false

function observeLongTasks() {
  if (observing || typeof PerformanceObserver === 'undefined') return
  observing = true
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) longTaskTimes.push(e.startTime)
    }).observe({ type: 'longtask', buffered: true })
  }
  catch { /* not supported (Safari / Firefox) */ }
}

/** Call at the very start of each frame's work. */
export function perfFrameStart() {
  if (!perfEnabled.value) return
  observeLongTasks()
  const now = performance.now()
  if (lastFrameAt) {
    const gap = now - lastFrameAt
    gaps.push(gap)
    if (gaps.length > HISTORY) gaps.shift()
    worst = Math.max(worst, gap)
  }
  lastFrameAt = now
  frameStartAt = now
  if (!windowStart) windowStart = now
}

/** Call once the frame has been rendered. Publishes a snapshot twice a second. */
export function perfFrameEnd(info: { render: { calls: number, triangles: number } }, tiles: number) {
  if (!perfEnabled.value || !frameStartAt) return
  const now = performance.now()
  busySum += now - frameStartAt
  frames++
  const elapsed = now - windowStart
  if (elapsed < 500) return

  const cutoff = now - 10_000
  while (longTaskTimes.length && longTaskTimes[0]! < cutoff) longTaskTimes.shift()
  const mem = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory

  perfStats.fps = (frames * 1000) / elapsed
  perfStats.frameMs = elapsed / frames
  perfStats.worstMs = worst
  perfStats.busyMs = busySum / frames
  perfStats.busyPct = Math.min(100, (busySum / elapsed) * 100)
  perfStats.longTasks = longTaskTimes.length
  perfStats.heapMb = mem ? mem.usedJSHeapSize / 1048576 : null
  perfStats.drawCalls = info.render.calls
  perfStats.triangles = info.render.triangles
  perfStats.tiles = tiles
  perfStats.history = gaps.slice()

  windowStart = now
  frames = 0
  busySum = 0
  worst = 0
}
