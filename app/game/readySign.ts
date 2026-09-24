import * as THREE from 'three'

/*
 * "Ready to hand in!": a round gold bubble with a "!" that bobs over the Queen (inside) and
 * over the hive (outside) when her current request is complete. A camera-facing sprite, drawn
 * on top of everything so a crown or the skep never hides it.
 */

function signTexture() {
  const size = 128
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')!
  const r = size / 2
  // Soft glow.
  const glow = ctx.createRadialGradient(r, r, r * 0.45, r, r, r)
  glow.addColorStop(0, 'rgba(255, 214, 90, 0.55)')
  glow.addColorStop(1, 'rgba(255, 214, 90, 0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, size, size)
  // Bubble.
  ctx.beginPath()
  ctx.arc(r, r, r * 0.6, 0, Math.PI * 2)
  ctx.fillStyle = '#ffc93d'
  ctx.fill()
  ctx.lineWidth = 7
  ctx.strokeStyle = '#fffaf0'
  ctx.stroke()
  ctx.lineWidth = 3
  ctx.strokeStyle = '#5b3a24'
  ctx.beginPath()
  ctx.arc(r, r, r * 0.6 + 5, 0, Math.PI * 2)
  ctx.stroke()
  // "!"
  ctx.fillStyle = '#5b3a24'
  ctx.beginPath()
  ctx.roundRect(r - 7, r - 30, 14, 38, 7)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(r, r + 22, 8, 0, Math.PI * 2)
  ctx.fill()
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

let sharedTexture: THREE.Texture | null = null

export class ReadySign {
  readonly sprite: THREE.Sprite
  private base = new THREE.Vector3()
  private shown = 0
  private want = false

  constructor(size = 0.7) {
    sharedTexture ??= signTexture()
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: sharedTexture, depthTest: false, transparent: true }))
    this.sprite.renderOrder = 20
    this.sprite.scale.setScalar(size)
    this.sprite.userData.size = size
    this.sprite.visible = false
  }

  /** Where the sign hovers (its bob is added on top). */
  place(p: THREE.Vector3) {
    this.base.copy(p)
  }

  setReady(v: boolean) {
    this.want = v
  }

  update(dt: number, time: number, reducedMotion: boolean) {
    // Pop in and out rather than blinking on.
    this.shown += ((this.want ? 1 : 0) - this.shown) * (1 - Math.exp(-dt * (reducedMotion ? 30 : 8)))
    const s = this.shown
    this.sprite.visible = s > 0.02
    if (!this.sprite.visible) return
    const size = this.sprite.userData.size as number
    const pulse = reducedMotion ? 1 : 1 + Math.sin(time * 4) * 0.06
    this.sprite.scale.setScalar(size * s * pulse)
    this.sprite.position.copy(this.base)
    if (!reducedMotion) this.sprite.position.y += Math.sin(time * 2.4) * 0.08
  }
}
