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


/*
 * Flight model: an invisible "carrot" glides tile-to-tile along the route at constant
 * speed, and the bee chases it with critically-damped smoothing. That gives continuous,
 * curving flight through corners instead of discrete hops. The bee climbs to cruise
 * altitude while travelling and settles back to a hover when it stops.
 */
const CRUISE_ALT = 1.05
interface Segment { from: THREE.Vector3, to: THREE.Vector3, len: number, t: number }
let seg: Segment | null = null
const carrot = worldPos(game.pos)
let fly = 0 // 0 = hovering, 1 = cruising
let linger = 0 // keeps cruise altitude briefly between queued hops
let groundY = carrot.y
let yaw = 0
let bank = 0
let pitch = 0
let time = 0
const tmpV = new THREE.Vector3()
const camOffset = new THREE.Vector3()
const prevPos = new THREE.Vector3()

function startSegment() {
  const next = game.beginHop()
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

const { onBeforeRender } = useLoop()
onBeforeRender(({ delta }) => {
  const dt = Math.max(1e-4, Math.min(delta, 1 / 20))
  time += dt
  const rm = settings.reducedMotion
  // World units per second (one hex centre-to-centre is ~1.73 units).
  const speed = 1.732 / (settings.hopDuration * 1.1)

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
      if (!game.queue.length) tryHeldStep()
      if (game.queue.length) startSegment()
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
  prevPos.copy(bee.root.position)
  const follow = 1 - Math.exp(-dt * (rm ? 14 : 7))
  bee.root.position.x += (carrot.x - bee.root.position.x) * follow
  bee.root.position.z += (carrot.z - bee.root.position.z) * follow

  // --- altitude: follow the terrain softly, climb when cruising ---
  const under = world.byKey.get(hexKey(worldToHex(bee.root.position.x, bee.root.position.z)))
  groundY += ((under?.height ?? groundY) - groundY) * (1 - Math.exp(-dt * 6))
  fly += ((travelling ? 1 : 0) - fly) * (1 - Math.exp(-dt * (travelling ? 5 : 3)))
  const bob = rm ? 0 : Math.sin(time * (travelling ? 7 : 2.4)) * (travelling ? 0.03 : 0.05)
  bee.root.position.y = groundY + THREE.MathUtils.lerp(HOVER_ALT, CRUISE_ALT, fly) + bob

  // --- facing, banking and pitch from velocity ---
  const vx = (bee.root.position.x - prevPos.x) / dt
  const vz = (bee.root.position.z - prevPos.z) / dt
  const v = Math.hypot(vx, vz)
  let yawRate = 0
  if (v > 0.35) {
    const dYaw = shortestAngle(yaw, Math.atan2(vx, vz)) * (1 - Math.exp(-dt * (rm ? 20 : 10)))
    yaw += dYaw
    yawRate = dYaw / dt
  }
  bee.root.rotation.y = yaw
  const speedNorm = Math.min(1, v / speed)
  const targetBank = rm ? 0 : THREE.MathUtils.clamp(-yawRate * 0.12, -0.55, 0.55)
  bank += (targetBank - bank) * (1 - Math.exp(-dt * 6))
  pitch += ((rm ? 0.08 : 0.28) * speedNorm - pitch) * (1 - Math.exp(-dt * 6))
  bee.body.rotation.set(pitch, 0, bank)
  bee.body.scale.set(1, 1, 1)

  // --- wings & antennae ---
  const flapSpeed = rm ? 12 : THREE.MathUtils.lerp(26, 44, fly)
  const flapAmp = rm ? 0.2 : THREE.MathUtils.lerp(0.4, 0.6, fly)
  const f = Math.sin(time * flapSpeed) * flapAmp + 0.25
  bee.wingR.rotation.z = f
  bee.wingL.rotation.z = -f
  bee.antennae.rotation.x = rm ? 0 : -0.25 * speedNorm + Math.sin(time * 3) * 0.08

  // --- blob shadow ---
  const ground = groundY
  blob.position.set(bee.root.position.x, ground + 0.02, bee.root.position.z)
  const alt = bee.root.position.y - ground
  blob.scale.setScalar(THREE.MathUtils.clamp(1.25 - alt * 0.45, 0.45, 1))

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
