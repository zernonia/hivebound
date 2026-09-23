<script setup lang="ts">
import * as THREE from 'three'
import { useLoop, useTres } from '@tresjs/core'
import { buildBee } from '~/game/bee'
import { blobShadowTexture, hexRingGeometry } from '~/game/geometry'
import { WorldView } from '~/game/worldView'
import { type Hex, findPath, hexKey, hexToWorld, worldToHex } from '~/utils/hex'
import { PALETTE_CVD, PALETTE_DEFAULT } from '~/utils/palette'
import { useWorldData } from '~/utils/world'
import { useGame } from '~/stores/game'
import { useSettings } from '~/stores/settings'

const game = useGame()
const settings = useSettings()
const world = useWorldData()
const held = useHeldDirection()
const { renderer, camera: activeCamera } = useTres()

/* ------------------------------------------------------------------ */
/* Scene objects (plain three.js, owned by this component)            */
/* ------------------------------------------------------------------ */
const worldView = new WorldView(world, settings.colorVisionFriendly ? PALETTE_CVD : PALETTE_DEFAULT)
worldView.setReducedMotion(settings.reducedMotion)
worldView.syncDiscovered(game.discovered, [])
worldView.setVisitedPois(game.visitedPois)

const bee = buildBee()
const HOVER_ALT = 0.55

// Soft blob shadow under the bee: reads better than a real shadow while hopping.
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

const rig = new THREE.Group()
rig.add(worldView.group, bee.root, blob, hoverRing, destRing, dots, previewDots, sun, sun.target)

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
    const h = pick(ev)
    game.hoverKey = h ? hexKey(h) : null
    renderer.domElement.style.cursor = h && game.isWalkable(h) ? 'pointer' : 'default'
  }
}

function onPointerUp(ev: PointerEvent) {
  const wasPinch = pointers.size > 1
  pointers.delete(ev.pointerId)
  if (pointers.size < 2) pinchStart = 0
  if (wasPinch || dragged || ev.button > 0) return
  const h = pick(ev)
  if (h) game.travelTo(h)
}

function onPointerLeave() {
  game.hoverKey = null
}

function onWheel(ev: WheelEvent) {
  ev.preventDefault()
  settings.setZoom(settings.zoom * Math.exp(ev.deltaY * 0.0012))
}

onMounted(() => {
  // Handy for poking at the scene from the browser console during development.
  if (import.meta.dev) Object.assign(window, { __hivebound: { renderer, game, settings, rig } })
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

interface Hop { from: THREE.Vector3, to: THREE.Vector3, t: number, dur: number, lift: number }
let hop: Hop | null = null
let squash = 0
let yaw = 0
let time = 0
const tmpV = new THREE.Vector3()
const camOffset = new THREE.Vector3()

function yawFor(from: THREE.Vector3, to: THREE.Vector3) {
  return Math.atan2(to.x - from.x, to.z - from.z)
}
function startHop() {
  const next = game.beginHop()
  if (!next) return
  const to = worldPos(next).add(new THREE.Vector3(0, HOVER_ALT, 0))
  const from = bee.root.position.clone()
  const dh = Math.abs(to.y - from.y)
  hop = { from, to, t: 0, dur: settings.hopDuration, lift: (settings.reducedMotion ? 0.12 : 0.34) + dh * 0.6 }
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

const { onBeforeRender } = useLoop()
onBeforeRender(({ delta }) => {
  const dt = Math.min(delta, 1 / 20)
  time += dt
  const rm = settings.reducedMotion

  // --- movement ---
  if (!hop) {
    if (!game.queue.length) tryHeldStep()
    if (game.queue.length) startHop()
  }
  let targetYaw = yaw
  if (hop) {
    hop.t = Math.min(1, hop.t + dt / hop.dur)
    const t = hop.t
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2 // easeInOutQuad
    bee.root.position.lerpVectors(hop.from, hop.to, e)
    bee.root.position.y += Math.sin(Math.PI * t) * hop.lift
    targetYaw = yawFor(hop.from, hop.to)
    if (t >= 1) {
      hop = null
      squash = rm ? 0 : 1
      game.arrive()
      // Chain straight into the next hop for continuous travel.
      if (!game.queue.length) tryHeldStep()
      if (game.queue.length) startHop()
    }
  }
  else if (!game.queue.length) {
    // Idle: face the camera-ish direction of last travel, gentle bob.
    const home = worldPos(game.pos)
    // If the position changed without a hop (load / reset), glide or snap there.
    const dist = Math.hypot(home.x - bee.root.position.x, home.z - bee.root.position.z)
    if (dist > 4) bee.root.position.set(home.x, bee.root.position.y, home.z)
    else if (dist > 0.001) {
      const k = 1 - Math.exp(-dt * 10)
      bee.root.position.x += (home.x - bee.root.position.x) * k
      bee.root.position.z += (home.z - bee.root.position.z) * k
    }
    bee.root.position.y = home.y + HOVER_ALT + (rm ? 0 : Math.sin(time * 2.4) * 0.05)
  }

  // --- facing ---
  yaw += shortestAngle(yaw, targetYaw) * (1 - Math.exp(-dt * (rm ? 30 : 14)))
  bee.root.rotation.y = yaw

  // --- body squash / lean ---
  squash = Math.max(0, squash - dt * 5)
  const s = Math.sin(squash * Math.PI) * 0.16
  bee.body.scale.set(1 + s, 1 - s, 1 + s * 0.5)
  bee.body.rotation.x = hop && !rm ? 0.22 * Math.sin(Math.PI * hop.t) : 0

  // --- wings & antennae ---
  const flapSpeed = rm ? 10 : hop ? 38 : 26
  const flapAmp = rm ? 0.18 : hop ? 0.55 : 0.4
  const f = Math.sin(time * flapSpeed) * flapAmp + 0.25
  bee.wingR.rotation.z = f
  bee.wingL.rotation.z = -f
  bee.antennae.rotation.x = rm ? 0 : Math.sin(time * 3) * 0.08

  // --- blob shadow ---
  const ground = hop ? THREE.MathUtils.lerp(hop.from.y, hop.to.y, hop.t) - HOVER_ALT : worldPos(game.pos).y
  blob.position.set(bee.root.position.x, ground + 0.02, bee.root.position.z)
  const alt = bee.root.position.y - ground
  blob.scale.setScalar(THREE.MathUtils.clamp(1.2 - alt * 0.5, 0.5, 1))

  // --- camera follow ---
  const cam = camRef.value
  if (cam) {
    tmpV.set(bee.root.position.x, ground, bee.root.position.z)
    camTarget.lerp(tmpV, 1 - Math.exp(-dt * (rm ? 10 : 4)))
    // Portrait screens pull the camera back so a similar area of world stays visible.
    const portrait = Math.min(1.9, Math.max(1, 1 / Math.max(0.3, cam.aspect)))
    const z = settings.zoom * Math.pow(portrait, 0.75)
    camOffset.set(0, 12.5 * z, 10 * z)
    const desired = tmpV.copy(camTarget).add(camOffset)
    cam.position.lerp(desired, 1 - Math.exp(-dt * (rm ? 14 : 6)))
    cam.lookAt(camTarget.x, camTarget.y + 0.2, camTarget.z)
  }

  // --- light follows the action ---
  sun.position.set(camTarget.x + 7, 14, camTarget.z + 5)
  sun.target.position.copy(camTarget)

  // --- rings pulse ---
  if (!rm) {
    const pulse = 1 + Math.sin(time * 4) * 0.03
    hoverRing.scale.set(pulse, 1, pulse)
    destRing.scale.set(2 - pulse, 1, 2 - pulse)
  }

  worldView.update(dt)
})
</script>

<template>
  <TresPerspectiveCamera ref="camRef" :fov="34" :near="0.5" :far="120" />
  <TresHemisphereLight :args="['#fff6e6', '#b9d9a4', 1.15]" />
  <TresAmbientLight :intensity="0.25" color="#ffe9d6" />
  <TresFog :args="['#f7ecd8', 26, 52]" attach="fog" />
  <primitive :object="rig" />
</template>
