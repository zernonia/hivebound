<script setup lang="ts">
import * as THREE from 'three'
import { useLoop, useTres } from '@tresjs/core'
import { buildBeeVariant, isBeeVariantId } from '~/game/beeVariants'
import { blobShadowTexture, hexRingGeometry } from '~/game/geometry'
import { gameAudio } from '~/audio/engine'
import { perfAvailable, perfFrameEnd, perfFrameStart } from '~/utils/perfMonitor'
import { BeePool, animateBee, inView, updateFrustum } from '~/game/beePool'
import { HiveView } from '~/game/hiveView'
import { ResourceMarkers } from '~/game/resourceMarkers'
import { WorldView } from '~/game/worldView'
import { DIRECTION_LIST, type Hex, findPath, hexKey, hexToWorld, hexesInRange, neighbor, worldToHex } from '~/utils/hex'
import type { SpeciesId } from '~/utils/species'
import type { Tile } from '~/utils/world'
import { PALETTE_CVD, PALETTE_DEFAULT } from '~/utils/palette'
import { RESOURCE_INFO, tileSource } from '~/utils/resources'
import { useWorldData } from '~/utils/world'
import { useColony } from '~/stores/colony'
import { useGame } from '~/stores/game'
import { HIVE_CELLS, QUEEN_CELL, useHive } from '~/stores/hive'
import { useSettings } from '~/stores/settings'

const game = useGame()
const settings = useSettings()
const world = useWorldData()
const held = useHeldDirection()
const hive = useHive()
const colony = useColony()
const { renderer, camera: activeCamera, scene: tresScene } = useTres()

/* ------------------------------------------------------------------ */
/* Scene objects (plain three.js, owned by this component)            */
/* ------------------------------------------------------------------ */
const worldView = new WorldView(world, settings.colorVisionFriendly ? PALETTE_CVD : PALETTE_DEFAULT)
worldView.setReducedMotion(settings.reducedMotion)
worldView.syncDiscovered(game.discovered, [])
worldView.setVisitedPois(game.visitedPois)

// `?bee=queen` / `?bee=nocturnal` previews a variant; anything else is the honey bee.
const beeParam = new URLSearchParams(window.location.search).get('bee')
const bee = buildBeeVariant(isBeeVariantId(beeParam) ? beeParam : 'honey')
const HOVER_ALT = 0.55

// Soft blob shadow under the bee: reads better than a real shadow while flying.
const blob = new THREE.Mesh(
  new THREE.PlaneGeometry(0.9, 0.9).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ map: blobShadowTexture(), transparent: true, depthWrite: false }),
)
blob.renderOrder = 1

// Hover + destination rings.
const hoverRing = new THREE.Mesh(
  hexRingGeometry(0.9, 0.09),
  new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, depthWrite: false }),
)
hoverRing.visible = false
hoverRing.renderOrder = 3
const destRing = new THREE.Mesh(
  hexRingGeometry(0.9, 0.12),
  new THREE.MeshBasicMaterial({ color: '#ffb627', transparent: true, opacity: 0.95, depthWrite: false }),
)
destRing.visible = false
destRing.renderOrder = 3

// Route breadcrumbs.
const MAX_DOTS = 96
const dots = new THREE.InstancedMesh(
  new THREE.CircleGeometry(0.09, 16).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: '#fff7df', transparent: true, opacity: 0.9, depthWrite: false }),
  MAX_DOTS,
)
dots.count = 0
dots.renderOrder = 3
const previewDots = new THREE.InstancedMesh(
  dots.geometry,
  new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, depthWrite: false }),
  MAX_DOTS,
)
previewDots.count = 0
previewDots.renderOrder = 3

// Warm key light that follows the bee so shadows stay crisp near the action.
const sun = new THREE.DirectionalLight('#fff0d6', 2.1)
sun.castShadow = true
sun.shadow.mapSize.set(2048, 2048)
sun.shadow.camera.left = -12
sun.shadow.camera.right = 12
sun.shadow.camera.top = 12
sun.shadow.camera.bottom = -12
sun.shadow.camera.near = 1
sun.shadow.camera.far = 50
sun.shadow.bias = -0.0008
sun.shadow.normalBias = 0.03
sun.shadow.radius = 4

// Gathering: a progress ring round the tile and motes of the resource drifting up to the bee.
const gatherRingGeo = new THREE.RingGeometry(0.52, 0.62, 48, 1)
gatherRingGeo.rotateX(-Math.PI / 2)
const gatherRing = new THREE.Mesh(gatherRingGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthWrite: false }))
gatherRing.renderOrder = 3
gatherRing.visible = false
const GATHER_MOTES = 10
const gatherMotes = new THREE.InstancedMesh(new THREE.SphereGeometry(0.045, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffffff' }), GATHER_MOTES)
gatherMotes.visible = false

// Everything outside lives on one layer so the hive can take over the screen.
const worldLayer = new THREE.Group()
// Other bees outside: wild ones hovering on their tiles, and helpers flying their trips.
const outdoorBees = new BeePool()

// Badges only where you can act next: the six tiles round the bee, plus the one under the mouse.
const markers = new ResourceMarkers(8)
worldLayer.add(worldView.group, hoverRing, destRing, dots, previewDots, gatherRing, gatherMotes, markers.group, outdoorBees.group)
const hiveView = new HiveView(HIVE_CELLS, QUEEN_CELL)

const rig = new THREE.Group()
rig.add(worldLayer, hiveView.group, bee.root, blob, sun, sun.target)

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */
const tileTop = (h: Hex) => world.byKey.get(hexKey(h))?.height ?? 0
const worldPos = (h: Hex, out = new THREE.Vector3()) => {
  const { x, z } = hexToWorld(h)
  return out.set(x, tileTop(h), z)
}
const tmpM = new THREE.Matrix4()

function placeRing(ring: THREE.Mesh, h: Hex | null) {
  if (!h) {
    ring.visible = false
    return
  }
  worldPos(h, ring.position)
  ring.position.y += 0.03
  ring.visible = true
}

function layoutDots(mesh: THREE.InstancedMesh, path: Hex[]) {
  const n = Math.min(MAX_DOTS, Math.max(0, path.length - 1))
  for (let i = 0; i < n; i++) {
    const p = worldPos(path[i]!)
    tmpM.makeTranslation(p.x, p.y + 0.03, p.z)
    mesh.setMatrixAt(i, tmpM)
  }
  mesh.count = n
  mesh.instanceMatrix.needsUpdate = true
}

/* ------------------------------------------------------------------ */
/* Reactive sync                                                      */
/* ------------------------------------------------------------------ */
watch(() => game.revealTick, () => {
  worldView.syncDiscovered(game.discovered, game.freshlyRevealed)
  worldView.setVisitedPois(game.visitedPois)
})
watch(() => game.visitedPois.length, () => worldView.setVisitedPois(game.visitedPois))
watch(() => settings.colorVisionFriendly, v => worldView.setPalette(v ? PALETTE_CVD : PALETTE_DEFAULT))
watch(() => settings.reducedMotion, v => worldView.setReducedMotion(v))
watch(() => [game.queue.length, game.queue[game.queue.length - 1]], () => {
  placeRing(destRing, game.destination)
  layoutDots(dots, game.queue)
  previewDots.count = 0
})

const hoverTile = computed(() => (game.hoverKey ? world.byKey.get(game.hoverKey) : undefined))
watch(hoverTile, (t) => {
  placeRing(hoverRing, t ?? null)
  const mat = hoverRing.material as THREE.MeshBasicMaterial
  mat.color.set(t && !t.walkable ? '#c9c3d6' : '#ffffff')
  // Preview the route when idle.
  if (t && t.walkable && !game.queue.length) layoutDots(previewDots, findPath(game.pos, t, h => game.isWalkable(h)))
  else previewDots.count = 0
})

/* ------------------------------------------------------------------ */
/* Pointer input: hover, tap-to-travel, wheel + pinch zoom            */
/* ------------------------------------------------------------------ */
const raycaster = new THREE.Raycaster()
const ndc = new THREE.Vector2()
const pointers = new Map<number, { x: number, y: number, sx: number, sy: number }>()
let pinchStart = 0
let pinchZoom = 1
let dragged = false

function pick(ev: PointerEvent): Hex | null {
  const el = renderer.domElement
  const rect = el.getBoundingClientRect()
  ndc.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1)
  const cam = activeCamera.value
  if (!cam) return null
  raycaster.setFromCamera(ndc, cam)
  const hit = raycaster.intersectObject(worldView.caps, false)[0]
  if (hit?.instanceId != null) {
    const t = worldView.tileAtInstance(hit.instanceId)
    return t ? { q: t.q, r: t.r } : null
  }
  // Fallback: intersect ground plane (for clicks between tiles).
  const p = new THREE.Vector3()
  if (raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p)) {
    const h = worldToHex(p.x, p.z)
    return world.byKey.has(hexKey(h)) ? h : null
  }
  return null
}

function pickCell(ev: PointerEvent): string | null {
  const el = renderer.domElement
  const rect = el.getBoundingClientRect()
  ndc.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1)
  const cam = activeCamera.value
  if (!cam) return null
  raycaster.setFromCamera(ndc, cam)
  return hiveView.pick(raycaster)
}

function onPointerDown(ev: PointerEvent) {
  pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY, sx: ev.clientX, sy: ev.clientY })
  dragged = false
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()]
    pinchStart = Math.hypot(a!.x - b!.x, a!.y - b!.y)
    pinchZoom = settings.zoom
  }
}

function onPointerMove(ev: PointerEvent) {
  const p = pointers.get(ev.pointerId)
  if (p) {
    p.x = ev.clientX
    p.y = ev.clientY
    if (Math.hypot(p.x - p.sx, p.y - p.sy) > 8) dragged = true
    if (pointers.size === 2 && pinchStart > 0) {
      const [a, b] = [...pointers.values()]
      const d = Math.hypot(a!.x - b!.x, a!.y - b!.y)
      settings.setZoom(pinchZoom * (pinchStart / d))
    }
  }
  if (ev.pointerType === 'mouse') {
    if (game.scene === 'hive') {
      const key = game.transition ? null : pickCell(ev)
      hiveView.hover(key)
      renderer.domElement.style.cursor = key ? 'pointer' : 'default'
      return
    }
    const h = pick(ev)
    game.hoverKey = h ? hexKey(h) : null
    renderer.domElement.style.cursor = h && game.isWalkable(h) ? 'pointer' : 'default'
  }
}

function onPointerUp(ev: PointerEvent) {
  if (ev.type === 'pointercancel') {
    // The browser took the gesture (scroll, system swipe): never treat it as a tap.
    pointers.delete(ev.pointerId)
    if (pointers.size < 2) pinchStart = 0
    return
  }
  const wasPinch = pointers.size > 1
  pointers.delete(ev.pointerId)
  if (pointers.size < 2) pinchStart = 0
  if (wasPinch || dragged || ev.button > 0 || game.transition) return
  if (game.scene === 'hive') {
    const key = pickCell(ev)
    if (key) hive.selected = key
    return
  }
  const h = pick(ev)
  if (h) game.travelTo(h)
}

function onPointerLeave() {
  game.hoverKey = null
  hiveView.hover(null)
}

function onWheel(ev: WheelEvent) {
  ev.preventDefault()
  settings.setZoom(settings.zoom * Math.exp(ev.deltaY * 0.0012))
}

onMounted(() => {
  // Handy for poking at the scene from the browser console during development.
  if (import.meta.dev) Object.assign(window, { __hivebound: { renderer, game, hive, settings, rig, world, audio: gameAudio } })
  const el = renderer.domElement
  el.style.touchAction = 'none'
  el.addEventListener('pointerdown', onPointerDown)
  el.addEventListener('pointermove', onPointerMove)
  el.addEventListener('pointerup', onPointerUp)
  el.addEventListener('pointercancel', onPointerUp)
  el.addEventListener('pointerleave', onPointerLeave)
  el.addEventListener('wheel', onWheel, { passive: false })
})
onBeforeUnmount(() => {
  const el = renderer.domElement
  el.removeEventListener('pointerdown', onPointerDown)
  el.removeEventListener('pointermove', onPointerMove)
  el.removeEventListener('pointerup', onPointerUp)
  el.removeEventListener('pointercancel', onPointerUp)
  el.removeEventListener('pointerleave', onPointerLeave)
  el.removeEventListener('wheel', onWheel)
  worldView.dispose()
})

/* ------------------------------------------------------------------ */
/* Animation loop                                                     */
/* ------------------------------------------------------------------ */
const camRef = shallowRef<THREE.PerspectiveCamera>()
// Start the camera already framing the bee (no swoop from the origin).
watch(camRef, (cam) => {
  if (!cam) return
  cam.position.copy(worldPos(game.pos)).add(new THREE.Vector3(0, 12.5 * settings.zoom, 10 * settings.zoom))
  cam.lookAt(worldPos(game.pos))
}, { immediate: true })
const camTarget = worldPos(game.pos)
const beePos = worldPos(game.pos).add(new THREE.Vector3(0, HOVER_ALT, 0))
bee.root.position.copy(beePos)


/*
 * Flight model: an invisible "carrot" glides tile-to-tile along the route at constant
 * speed, and the bee chases it with critically-damped smoothing. That gives continuous,
 * curving flight through corners instead of discrete jumps. The bee climbs to cruise
 * altitude while travelling and settles back to a hover when it stops.
 */
const CRUISE_ALT = 1.05
interface Segment { from: THREE.Vector3, to: THREE.Vector3, len: number, t: number }
let seg: Segment | null = null
const carrot = worldPos(game.pos)
let fly = 0 // 0 = hovering, 1 = cruising
let linger = 0 // keeps cruise altitude briefly between queued legs
let groundY = carrot.y
let yaw = 0
let bank = 0
let pitch = 0
let time = 0
let blinkIn = 2 + Math.random() * 3
const tmpV = new THREE.Vector3()
const tmpV2 = new THREE.Vector3()
const camOffset = new THREE.Vector3()
const prevPos = new THREE.Vector3()

function startSegment() {
  const next = game.beginLeg()
  if (!next) return
  const to = worldPos(next)
  seg = { from: carrot.clone(), to, len: Math.max(0.001, Math.hypot(to.x - carrot.x, to.z - carrot.z)), t: 0 }
}

function tryHeldStep() {
  const d = held.current.value
  if (!d) return
  if (d === 'W' || d === 'E') game.stepLateral(d)
  else game.step(d)
}

const shortestAngle = (a: number, b: number) => {
  let d = (b - a) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}

/* ------------------------------------------------------------------ */
/* Gathering (outside)                                                */
/* ------------------------------------------------------------------ */
let gatherT = 0
let gatheringKey: string | null = null
/** Tile we last said something about, so arrival messages play once per visit. */
let notedKey: string | null = null
/** The "pouch full" message has been shown for the current full pouch. */
let fullNoticed = false
watch(() => hive.pouchFull, (full) => {
  if (!full) fullNoticed = false
})

function updateGathering(dt: number, rm: boolean, idle: boolean) {
  const tile = world.byKey.get(hexKey(game.pos))
  const src = tileSource(tile)
  const here = tile && idle && !game.transition ? tile : undefined
  let active = false
  if (here && src) {
    const left = hive.tileAmount(here)
    if (hive.pouchFull) {
      // Say it once per full pouch, not on every tile flown over.
      if (!fullNoticed) {
        fullNoticed = true
        notedKey = here.key
        game.toast('Your pouch is full. Fly home (H) to unload.')
        game.announce('Your pouch is full. Fly home to unload.')
      }
    }
    else if (left > 0) {
      active = true
      if (gatheringKey !== here.key) {
        gatheringKey = here.key
        notedKey = here.key
        game.announce(`Gathering ${RESOURCE_INFO[src.resource].name.toLowerCase()}.`)
      }
      gatherT += dt / hive.secondsPerGather
      if (gatherT >= 1) {
        gatherT = 0
        hive.gather(here)
        if (hive.pouchFull) {
          fullNoticed = true
          game.toast('Pouch full! Fly home (H) to unload.')
          game.announce(`Pouch full with ${hive.pouchTotal}. Fly home to unload.`)
        }
        else if (hive.tileAmount(here) === 0) {
          game.announce(`That's all the ${RESOURCE_INFO[src.resource].name.toLowerCase()} here for now. It will grow back.`)
        }
      }
    }
    else if (notedKey !== here.key) {
      notedKey = here.key
      game.announce(`No ${RESOURCE_INFO[src.resource].name.toLowerCase()} left here yet. It grows back in about ${hive.tileRegrowIn(here)} seconds.`)
    }
  }
  if (!here) notedKey = null
  if (!active) {
    gatheringKey = null
    gatherT = Math.max(0, gatherT - dt * 2)
  }

  // Progress ring round the tile, and motes drifting up into the bee.
  gatherRing.visible = active || gatherT > 0.02
  gatherMotes.visible = active && !rm
  if (tile && src) {
    const col = RESOURCE_INFO[src.resource].color
    ;(gatherRing.material as THREE.MeshBasicMaterial).color.set(col)
    ;(gatherMotes.material as THREE.MeshBasicMaterial).color.set(col)
    worldPos(game.pos, gatherRing.position)
    gatherRing.position.y += 0.05
    gatherRing.geometry.setDrawRange(0, Math.max(1, Math.floor(gatherT * 48)) * 6)
    if (gatherMotes.visible) {
      for (let i = 0; i < GATHER_MOTES; i++) {
        const t = (time * 0.9 + i / GATHER_MOTES) % 1
        const a = i * 2.39996
        const r = 0.55 * (1 - t)
        tmpM.makeTranslation(
          gatherRing.position.x + Math.cos(a + t * 2) * r,
          gatherRing.position.y + t * (bee.root.position.y - gatherRing.position.y),
          gatherRing.position.z + Math.sin(a + t * 2) * r,
        )
        tmpM.scale(tmpV.setScalar(1 - t * 0.6))
        gatherMotes.setMatrixAt(i, tmpM)
      }
      gatherMotes.instanceMatrix.needsUpdate = true
    }
  }
  return active
}

/* ------------------------------------------------------------------ */
/* Into and out of the hive                                           */
/* ------------------------------------------------------------------ */
/** Just inside the skep's door, where the bee vanishes / reappears outside. */
const DOOR_WORLD = new THREE.Vector3(0, 0.34, 0.55)
interface Transition { dir: 'enter' | 'exit', phase: 'out' | 'in', t: number, from: THREE.Vector3, irised: boolean }
let trans: Transition | null = null
watch(() => game.transition, (v) => {
  if (v && !trans) trans = { dir: v, phase: 'out', t: 0, from: bee.root.position.clone(), irised: false }
})
const easeInOut = (u: number) => u * u * (3 - 2 * u)
const beeGoal = new THREE.Vector3()
/** Keep this far from the skep's centre while circling it, so the bee never flies through it. */
const SKEP_CLEARANCE = 1.1

/**
 * A path between two points outside that swings round the hive rather than through it:
 * angle and radius are interpolated round the skep's centre, with the radius pushed out to
 * clear the skep when the bee has to go round it (e.g. from a tile behind the hive).
 */
function roundHive(from: THREE.Vector3, to: THREE.Vector3, u: number, out: THREE.Vector3) {
  const e = easeInOut(u)
  const a0 = Math.atan2(from.z, from.x)
  const da = shortestAngle(a0, Math.atan2(to.z, to.x))
  const r0 = Math.hypot(from.x, from.z)
  const r1 = Math.hypot(to.x, to.z)
  const a = a0 + da * e
  let r = THREE.MathUtils.lerp(r0, r1, e)
  if (Math.abs(da) > 0.3) r = Math.max(r, SKEP_CLEARANCE * Math.pow(Math.sin(Math.PI * u), 0.35))
  return out.set(Math.cos(a) * r, THREE.MathUtils.lerp(from.y, to.y, e), Math.sin(a) * r)
}

/** Moves the bee through the transition. Returns 0..1: how far the camera should be pulled in. */
function updateTransition(dt: number, rm: boolean): number {
  const t = trans!
  const dur = rm ? 0.35 : 1.05
  t.t += dt
  const u = Math.min(1, t.t / dur)
  const e = easeInOut(u)
  const before = tmpV2.copy(bee.root.position)
  if (t.phase === 'out') {
    if (t.dir === 'enter') roundHive(t.from, DOOR_WORLD, u, bee.root.position)
    else bee.root.position.lerpVectors(t.from, hiveView.entrance, e)
    bee.root.position.y += rm ? 0 : Math.sin(Math.PI * u) * 0.25
    // Shrink only on the final approach, once the bee is lined up with the doorway.
    bee.root.scale.setScalar(THREE.MathUtils.lerp(1, 0.25, Math.pow(u, 3)))
    faceMovement(before, dt)
    if (!t.irised && u >= 0.5) {
      t.irised = true
      game.irisClosed = true
    }
    if (u >= 1) {
      // Iris is closed: swap scenes and start the second half from the other doorway.
      game.swapScene()
      applyScene()
      t.phase = 'in'
      t.t = 0
      t.from = t.dir === 'enter' ? hiveView.entrance.clone() : DOOR_WORLD.clone()
      bee.root.position.copy(t.from)
      yaw = t.dir === 'enter' ? Math.PI : 0
      snapCamera(rm ? 0 : 1)
      game.irisClosed = false
    }
    return rm ? 0 : e
  }
  if (t.dir === 'enter') {
    hiveView.hoverSpot(hive.selected, beeGoal)
    bee.root.position.lerpVectors(t.from, beeGoal, e)
  }
  else {
    // Out through the door and onto the doorstep in front of it.
    worldPos(game.pos, beeGoal).add(tmpV.set(0, HOVER_ALT, 0))
    roundHive(t.from, beeGoal, u, bee.root.position)
  }
  bee.root.position.y += rm ? 0 : Math.sin(Math.PI * u) * 0.2
  bee.root.scale.setScalar(THREE.MathUtils.lerp(0.25, 1, 1 - Math.pow(1 - u, 3)))
  faceMovement(before, dt)
  if (u >= 1) {
    bee.root.scale.setScalar(1)
    trans = null
    if (game.scene === 'world') resetFlight()
    game.endTransition()
  }
  return rm ? 0 : 1 - e
}

/** Turns the bee to face the way it just moved (curved transition paths). */
function faceMovement(before: THREE.Vector3, dt: number) {
  const dx = bee.root.position.x - before.x
  const dz = bee.root.position.z - before.z
  if (Math.hypot(dx, dz) < 1e-4) return
  yaw += shortestAngle(yaw, Math.atan2(dx, dz)) * (1 - Math.exp(-dt * 12))
}

function resetFlight() {
  seg = null
  worldPos(game.pos, carrot)
  groundY = carrot.y
  linger = 0
  fly = 0
}

/* ------------------------------------------------------------------ */
/* Scene switching                                                    */
/* ------------------------------------------------------------------ */
const fog = new THREE.Fog('#f7ecd8', 26, 52)
function applyScene() {
  const inHive = game.scene === 'hive'
  worldLayer.visible = !inHive
  hiveView.group.visible = inHive
  if (inHive) {
    fog.color.set('#c9862f')
    fog.near = 24
    fog.far = 70
  }
  else {
    fog.color.set('#f7ecd8')
    fog.near = 26
    fog.far = 52
  }
}
applyScene()
onMounted(() => {
  tresScene.value.fog = fog
})

function syncHive() {
  const now = Date.now()
  hiveView.sync((key) => {
    const st = hive.status(key, now)
    return {
      unlocked: st.kind !== 'locked',
      canUnlock: hive.canUnlock(key),
      state: hive.cells[key],
      progress: st.kind === 'working' ? st.progress : null,
    }
  })
  hiveView.select(game.scene === 'hive' ? hive.selected : null)
}
syncHive()
watch(() => hive.rev, syncHive)
watch(() => [hive.selected, game.scene], syncHive)
watch(() => settings.reducedMotion, (v) => {
  hiveView.setReducedMotion(v)
  markers.setReducedMotion(v)
}, { immediate: true })

/**
 * Picks the badges to show: discovered resource tiles next to the bee, and the hovered tile.
 * The tile the bee is on is left to the HUD line.
 */
function refreshMarkers() {
  const list = []
  const keys = new Set(DIRECTION_LIST.map(d => hexKey(neighbor(game.pos, d))))
  if (game.hoverKey) keys.add(game.hoverKey)
  for (const key of keys) {
    const tile = world.byKey.get(key)
    if (!tile || !game.discovered.has(tile.key)) continue
    const src = tileSource(tile)
    if (src) list.push({ tile, resource: src.resource })
  }
  const now = Date.now()
  markers.refresh(list, t => hive.tileAmount(t, now), hexKey(game.pos))
}
refreshMarkers()
watch(() => [game.pos, game.hoverKey, game.revealTick, hive.rev, hive.pouchTotal], refreshMarkers)

/**
 * Gathered tiles visibly thin out (flowers, lily pads, mushrooms) and regrow over time.
 * Only tiles that have been dipped into can differ from full, so only those are tracked.
 */
const thinned = new Set<string>()
function syncFullness() {
  const now = Date.now()
  for (const key of new Set([...Object.keys(hive.tiles), ...thinned])) {
    const tile = world.byKey.get(key)
    const src = tileSource(tile)
    if (!tile || !src) continue
    const full = hive.tileAmount(tile, now) / src.max
    worldView.setFullness(key, full)
    if (full < 1) thinned.add(key)
    else thinned.delete(key)
  }
}
syncFullness()
watch(() => [hive.pouchTotal, hive.rev], syncFullness)
let markersIn = 0

/* ------------------------------------------------------------------ */
/* Camera                                                             */
/* ------------------------------------------------------------------ */
const camFocus = new THREE.Vector3()
/** Base distance multiplier for the current scene. */
function sceneDistance(cam: THREE.PerspectiveCamera) {
  // Portrait screens pull the camera back so a similar area stays visible.
  const portrait = Math.min(1.9, Math.max(1, 1 / Math.max(0.3, cam.aspect)))
  // The hive (radius 3) needs a little more room than the old radius-2 comb.
  const zoom = game.scene === 'hive' ? THREE.MathUtils.clamp(settings.zoom, 0.75, 1.3) * 1.02 : settings.zoom
  return zoom * Math.pow(portrait, 0.75)
}

/** Places the camera on its target immediately, `closeness` 0..1 pulled in towards it. */
function snapCamera(closeness: number) {
  const cam = camRef.value
  if (!cam) return
  focusFor(camFocus)
  camTarget.copy(camFocus)
  const z = sceneDistance(cam) * THREE.MathUtils.lerp(1, 0.38, closeness)
  cam.position.copy(camTarget).add(camOffset.set(0, 12.5 * z, 10 * z))
  cam.lookAt(camTarget.x, camTarget.y + 0.2, camTarget.z)
}

/** Where the camera looks: the bee outside, the middle of the comb (nudged to the bee) inside. */
function focusFor(out: THREE.Vector3) {
  if (game.scene === 'hive') {
    out.set(bee.root.position.x * 0.25, 0.1, 0.9 + (bee.root.position.z - 1) * 0.2)
    if (trans) out.lerp(tmpV.set(bee.root.position.x, 0.1, bee.root.position.z), 0.5)
    return out
  }
  return out.set(bee.root.position.x, groundY, bee.root.position.z)
}

/**
 * Inside, the hive panel covers part of the screen (right side, or the bottom on phones).
 * Shifting the projection keeps the comb centred in whatever space is left visible.
 */
const viewShift = { x: 0, y: 0, tx: 0, ty: 0, measureIn: 0 }
function updateViewShift(cam: THREE.PerspectiveCamera, dt: number) {
  const el = renderer.domElement
  const w = el.clientWidth
  const h = el.clientHeight
  viewShift.measureIn -= dt
  if (viewShift.measureIn <= 0) {
    viewShift.measureIn = 0.3
    viewShift.tx = 0
    viewShift.ty = 0
    const panel = game.scene === 'hive' && !trans ? document.querySelector('.hive-panel') : null
    if (panel) {
      const r = panel.getBoundingClientRect()
      if (r.left > w * 0.35) viewShift.tx = (w - r.left) / 2
      else viewShift.ty = (h - r.top) / 2
    }
  }
  const k = 1 - Math.exp(-dt * 5)
  viewShift.x += (viewShift.tx - viewShift.x) * k
  viewShift.y += (viewShift.ty - viewShift.y) * k
  if (Math.abs(viewShift.x) < 0.5 && Math.abs(viewShift.y) < 0.5) {
    if (cam.view?.enabled) cam.clearViewOffset()
  }
  else {
    cam.setViewOffset(w, h, viewShift.x, viewShift.y, w, h)
  }
}

/** Keeps the floating action prompt over the tile (outside) or the selected cell (inside). */
const promptAnchor = new THREE.Vector3()
let promptEl: HTMLElement | null = null
function updatePrompt(cam: THREE.PerspectiveCamera) {
  promptEl ??= document.getElementById('action-prompt')
  if (!promptEl || !game.primaryAction) return
  let ok = true
  if (game.scene === 'hive') ok = !!hiveView.promptAnchor(hive.selected, promptAnchor)
  else worldPos(game.pos, promptAnchor).add(tmpV.set(0, 1.55, 0))
  if (!ok) return
  promptAnchor.project(cam)
  const el = renderer.domElement
  const x = (promptAnchor.x * 0.5 + 0.5) * el.clientWidth
  const y = (-promptAnchor.y * 0.5 + 0.5) * el.clientHeight
  promptEl.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`
}

/* ------------------------------------------------------------------ */
/* Other bees outside                                                 */
/* ------------------------------------------------------------------ */
/** Wild bees are looked for within this many hexes of the player (then culled to the view). */
const WILD_RADIUS = 9
let wildList: { tile: Tile, species: SpeciesId, phase: number }[] = []
function refreshWild() {
  const now = Date.now()
  wildList = []
  for (const h of hexesInRange(game.pos, WILD_RADIUS)) {
    const tile = world.byKey.get(hexKey(h))
    const species = colony.wildBeeAt(tile, now)
    if (tile && species) wildList.push({ tile, species, phase: tile.rand * 6.28 })
  }
}
refreshWild()
watch(() => [game.pos, game.revealTick, colony.rev], refreshWild)
let wildIn = 0

/** Where helpers leave from and land: the top of the skep. */
const HIVE_TOP = new THREE.Vector3(0, 1.3, 0)
const beeSpot = new THREE.Vector3()
const beeAim = new THREE.Vector3()

function updateOutdoorBees(time: number, rm: boolean) {
  outdoorBees.begin()
  const now = Date.now()
  for (const w of wildList) {
    const dancing = colony.dance?.tileKey === w.tile.key
    worldPos(w.tile, beeSpot)
    let yaw: number
    if (dancing) {
      // Stops circling to face the player and does a little wiggle dance.
      beeSpot.z += 0.5
      beeSpot.y += 0.8 + (rm ? 0 : Math.abs(Math.sin(time * 7)) * 0.1)
      yaw = Math.PI + (rm ? 0 : Math.sin(time * 6) * 0.45)
    }
    else {
      const a = time * 0.6 + w.phase
      beeSpot.x += Math.cos(a) * 0.4
      beeSpot.z += Math.sin(a) * 0.4
      beeSpot.y += 0.75 + (rm ? 0 : Math.sin(time * 2 + w.phase) * 0.05)
      yaw = -a
    }
    if (!inView(beeSpot)) continue
    const rig = outdoorBees.take(w.species)
    rig.root.position.copy(beeSpot)
    rig.root.rotation.y = yaw
    animateBee(rig, time, w.phase, 0.2, rm)
  }
  for (const b of colony.bees) {
    const ph = colony.tripPhase(b, now)
    if (!ph) continue
    worldPos(ph.tile, beeAim).add(tmpV.set(0, 0.7, 0))
    let flying = 1
    if (ph.leg === 'gather') {
      const a = time * 1.4 + b.id
      beeSpot.set(beeAim.x + Math.cos(a) * 0.3, beeAim.y - 0.1 + Math.sin(time * 5 + b.id) * 0.04, beeAim.z + Math.sin(a) * 0.3)
      flying = 0.3
    }
    else {
      const u = ph.leg === 'out' ? ph.u : 1 - ph.u
      beeSpot.lerpVectors(HIVE_TOP, beeAim, easeInOut(u))
      beeSpot.y += Math.sin(Math.PI * u) * 0.9
    }
    if (!inView(beeSpot)) continue
    const rig = outdoorBees.take(b.species)
    rig.root.position.copy(beeSpot)
    if (ph.leg === 'gather') rig.root.rotation.y = -(time * 1.4 + b.id)
    else {
      const to = ph.leg === 'out' ? beeAim : HIVE_TOP
      rig.root.rotation.y = Math.atan2(to.x - beeSpot.x, to.z - beeSpot.z)
    }
    animateBee(rig, time, b.id * 0.37, flying, rm)
  }
  outdoorBees.end()
}

/* ------------------------------------------------------------------ */
/* Frame loop                                                         */
/* ------------------------------------------------------------------ */
let hiveSyncIn = 0
const { onBeforeRender } = useLoop()

// Dev performance overlay: time each frame from the first update hook to the end of three's
// render call (wrapped once here; the timing only runs while the overlay is on).
if (perfAvailable) {
  onBeforeRender(() => perfFrameStart(), -1000)
  const render = renderer.render.bind(renderer)
  renderer.render = (scene, camera) => {
    render(scene, camera)
    perfFrameEnd(renderer.info, worldView.loadedCount)
  }
}
onBeforeRender(({ delta }) => {
  const dt = Math.max(1e-4, Math.min(delta, 1 / 20))
  time += dt
  const rm = settings.reducedMotion
  // World units per second (one hex centre-to-centre is ~1.73 units).
  const speed = (1.732 / (settings.secondsPerHex * 1.1)) * hive.wingBoost
  prevPos.copy(bee.root.position)

  let closeness = 0
  let gathering = false
  if (trans) {
    closeness = updateTransition(dt, rm)
    fly += (1 - fly) * (1 - Math.exp(-dt * 5))
  }
  else if (game.scene === 'hive') {
    updateHiveBee(dt, rm)
  }
  else {
    gathering = updateWorldFlight(dt, rm, speed)
  }

  // --- facing, banking and pitch from velocity ---
  const vx = (bee.root.position.x - prevPos.x) / dt
  const vz = (bee.root.position.z - prevPos.z) / dt
  const v = Math.hypot(vx, vz)
  let yawRate = 0
  if (v > 0.35 && !trans) {
    const dYaw = shortestAngle(yaw, Math.atan2(vx, vz)) * (1 - Math.exp(-dt * (rm ? 20 : 10)))
    yaw += dYaw
    yawRate = dYaw / dt
  }
  else if (game.scene === 'hive' && !trans) {
    // Settled inside: turn round to face the camera.
    yaw += shortestAngle(yaw, 0) * (1 - Math.exp(-dt * 4))
  }
  bee.root.rotation.y = yaw
  const speedNorm = Math.min(1, v / speed)
  const targetBank = rm ? 0 : THREE.MathUtils.clamp(-yawRate * 0.12, -0.55, 0.55)
  bank += (targetBank - bank) * (1 - Math.exp(-dt * 6))
  // Nose dips towards the flower while gathering.
  const targetPitch = gathering ? 0.38 : (rm ? 0.08 : 0.28) * speedNorm
  pitch += (targetPitch - pitch) * (1 - Math.exp(-dt * 6))
  bee.body.rotation.set(pitch, 0, bank)

  // --- wings & antennae ---
  const flapSpeed = rm ? 12 : THREE.MathUtils.lerp(26, 44, gathering ? 0.6 : fly)
  const flapAmp = rm ? 0.2 : THREE.MathUtils.lerp(0.4, 0.6, fly)
  const f = Math.sin(time * flapSpeed) * flapAmp + 0.25
  bee.wingR.rotation.z = f
  bee.wingL.rotation.z = -f
  bee.antennae.rotation.x = rm ? 0 : -0.25 * speedNorm + Math.sin(time * (gathering ? 9 : 3)) * 0.08
  gameAudio.setFlight(trans ? 0.8 : speedNorm, gathering, !game.journalOpen && !game.settingsOpen)

  // --- blink every few seconds (a quick squash of the eyes, then open again) ---
  blinkIn -= dt
  const lid = blinkIn < 0.14 ? Math.max(0.08, Math.abs(blinkIn - 0.07) / 0.07) : 1
  if (blinkIn <= 0) blinkIn = 2.5 + Math.random() * 3.5
  for (const eye of bee.eyes) eye.scale.y = lid

  // --- blob shadow ---
  const ground = game.scene === 'hive' ? 0.13 : groundY
  blob.visible = bee.root.scale.x > 0.5
  blob.position.set(bee.root.position.x, ground + 0.02, bee.root.position.z)
  const alt = bee.root.position.y - ground
  blob.scale.setScalar(THREE.MathUtils.clamp(1.25 - alt * 0.45, 0.45, 1))

  // --- camera follow ---
  const cam = camRef.value
  if (cam) {
    focusFor(camFocus)
    camTarget.lerp(camFocus, 1 - Math.exp(-dt * (rm ? 10 : trans ? 6 : 4)))
    const z = sceneDistance(cam) * THREE.MathUtils.lerp(1, 0.38, closeness)
    camOffset.set(0, 12.5 * z, 10 * z)
    const desired = tmpV.copy(camTarget).add(camOffset)
    cam.position.lerp(desired, 1 - Math.exp(-dt * (rm ? 14 : 6)))
    cam.lookAt(camTarget.x, camTarget.y + 0.2, camTarget.z)
    updateViewShift(cam, dt)
    updatePrompt(cam)
    cam.updateMatrixWorld()
    updateFrustum(cam)
  }

  // --- light follows the action ---
  sun.position.set(camTarget.x + 7, 14, camTarget.z + 5)
  sun.target.position.copy(camTarget)

  if (game.scene === 'hive') {
    hiveSyncIn -= dt
    if (hiveSyncIn <= 0) {
      hiveSyncIn = 0.2
      syncHive()
    }
    hiveView.update(dt, time)
    hiveView.updateColony(colony.bees.filter(b => !b.trip).map(b => ({ id: b.id, species: b.species, resting: !b.job })), dt, time)
  }
  else {
    // --- rings pulse ---
    if (!rm) {
      const pulse = 1 + Math.sin(time * 4) * 0.03
      hoverRing.scale.set(pulse, 1, pulse)
      destRing.scale.set(2 - pulse, 1, 2 - pulse)
    }
    worldView.update(dt)
    // Regrowth happens on real time; re-check the badges now and then.
    markersIn -= dt
    if (markersIn <= 0) {
      markersIn = 0.5
      refreshMarkers()
      syncFullness()
    }
    markers.update(time)
    // Wild bees move to new tiles every few minutes.
    wildIn -= dt
    if (wildIn <= 0) {
      wildIn = 2
      refreshWild()
    }
    updateOutdoorBees(time, rm)
  }
})

/** Inside: the bee drifts over to whichever cell is selected and hovers there. */
function updateHiveBee(dt: number, rm: boolean) {
  hiveView.hoverSpot(hive.selected, beeGoal)
  const follow = 1 - Math.exp(-dt * (rm ? 10 : 4))
  bee.root.position.x += (beeGoal.x - bee.root.position.x) * follow
  bee.root.position.z += (beeGoal.z - bee.root.position.z) * follow
  const bob = rm ? 0 : Math.sin(time * 2.4) * 0.05
  bee.root.position.y += (beeGoal.y + bob - bee.root.position.y) * follow
  fly += (0.3 - fly) * (1 - Math.exp(-dt * 3))
}

/** Outside: the carrot-chasing flight model, plus hover-to-gather when idle. Returns true while gathering. */
function updateWorldFlight(dt: number, rm: boolean, speed: number) {
  // --- advance the carrot along the route ---
  if (!seg) {
    if (!game.queue.length) tryHeldStep()
    if (game.queue.length) startSegment()
  }
  if (seg) {
    seg.t += (dt * speed) / seg.len
    if (seg.t >= 1) {
      carrot.copy(seg.to)
      seg = null
      linger = 0.25
      game.arrive()
      // Chain straight into the next leg for continuous flight.
      if (!game.transition) {
        if (!game.queue.length) tryHeldStep()
        if (game.queue.length) startSegment()
      }
    }
    else {
      carrot.lerpVectors(seg.from, seg.to, seg.t)
    }
  }
  else {
    // Idle: stay anchored to the logical position (also handles load / reset).
    const home = worldPos(game.pos)
    if (Math.hypot(home.x - carrot.x, home.z - carrot.z) > 0.001) {
      if (Math.hypot(home.x - bee.root.position.x, home.z - bee.root.position.z) > 4) {
        bee.root.position.x = home.x
        bee.root.position.z = home.z
      }
      carrot.copy(home)
    }
  }
  linger = Math.max(0, linger - dt)
  const travelling = !!seg || game.queue.length > 0 || linger > 0

  // --- chase the carrot (smooth curves through corners) ---
  const follow = 1 - Math.exp(-dt * (rm ? 14 : 7))
  bee.root.position.x += (carrot.x - bee.root.position.x) * follow
  bee.root.position.z += (carrot.z - bee.root.position.z) * follow

  const gathering = updateGathering(dt, rm, !travelling)

  // --- altitude: follow the terrain softly, climb when cruising, dip while gathering ---
  const under = world.byKey.get(hexKey(worldToHex(bee.root.position.x, bee.root.position.z)))
  groundY += ((under?.height ?? groundY) - groundY) * (1 - Math.exp(-dt * 6))
  fly += ((travelling ? 1 : 0) - fly) * (1 - Math.exp(-dt * (travelling ? 5 : 3)))
  const bob = rm ? 0 : Math.sin(time * (travelling ? 7 : gathering ? 5 : 2.4)) * (travelling ? 0.03 : 0.05)
  const hover = gathering ? HOVER_ALT - 0.12 : HOVER_ALT
  const targetY = groundY + THREE.MathUtils.lerp(hover, CRUISE_ALT, fly) + bob
  bee.root.position.y += (targetY - bee.root.position.y) * (1 - Math.exp(-dt * 10))
  return gathering
}
</script>

<template>
  <TresPerspectiveCamera ref="camRef" :fov="34" :near="0.5" :far="120" />
  <TresHemisphereLight :args="['#fff6e6', '#b9d9a4', 1.15]" />
  <TresAmbientLight :intensity="0.25" color="#ffe9d6" />
  <primitive :object="rig" />
</template>
