import * as THREE from 'three'

/*
 * Name labels and the hover tooltip for helper bees. It's one plain-DOM layer with pooled
 * elements (no reactive state per bee): each frame the scene calls begin(), track() for every
 * bee it draws, then end(). Positions are projected here and written as transforms; text is
 * only touched when it changes. When names are off and the mouse isn't over the scene, begin()
 * returns false and the scene skips the whole thing.
 */

export interface TagBee {
  id: number
  name: string
  species: string
}

/** How close (screen px) the pointer has to be to a bee to count as hovering it. */
const HOVER_RADIUS = 24
/** Label anchor: a little above the bee's body. */
const LIFT = 0.45

interface Tag {
  el: HTMLElement
  text: string
  seen: boolean
  shown: boolean
  pos: string
}

interface Hit {
  bee: TagBee
  x: number
  y: number
}

const v = new THREE.Vector3()

export class BeeTags {
  showNames = false
  private root: HTMLElement
  private tip: HTMLElement
  private tipTitle: HTMLElement
  private tipStatus: HTMLElement
  private tipShown = false
  private tipPos = ''
  private tags = new Map<number, Tag>()
  private hits: Hit[] = []
  private hitCount = 0
  private ptrX = 0
  private ptrY = 0
  private ptrOn = false
  private cam: THREE.PerspectiveCamera | null = null
  private w = 0
  private h = 0
  private running = false
  private lastTitle = ''
  private lastStatus = ''

  constructor(host: HTMLElement) {
    this.root = document.createElement('div')
    this.root.className = 'bee-tags'
    this.root.setAttribute('aria-hidden', 'true')
    this.tip = document.createElement('div')
    this.tip.className = 'bee-tip'
    this.tip.hidden = true
    this.tipTitle = document.createElement('strong')
    this.tipStatus = document.createElement('span')
    this.tip.append(this.tipTitle, this.tipStatus)
    this.root.append(this.tip)
    host.append(this.root)
  }

  /** Mouse position in canvas pixels; call from pointermove (cheap, read on the next frame). */
  setPointer(x: number, y: number) {
    this.ptrX = x
    this.ptrY = y
    this.ptrOn = true
  }

  clearPointer() {
    this.ptrOn = false
  }

  /** Returns whether anything needs tracking this frame. */
  begin(cam: THREE.PerspectiveCamera, w: number, h: number) {
    this.running = this.showNames || this.ptrOn
    this.cam = cam
    this.w = w
    this.h = h
    this.hitCount = 0
    return this.running
  }

  track(bee: TagBee, pos: THREE.Vector3) {
    const cam = this.cam
    if (!this.running || !cam) return
    v.copy(pos)
    v.y += LIFT
    v.applyMatrix4(cam.matrixWorldInverse)
    // Behind (or right on top of) the camera: nothing to draw.
    if (v.z > -cam.near) return
    v.applyMatrix4(cam.projectionMatrix)
    if (v.x < -1.05 || v.x > 1.05 || v.y < -1.05 || v.y > 1.05) return
    const x = (v.x * 0.5 + 0.5) * this.w
    const y = (-v.y * 0.5 + 0.5) * this.h
    let hit = this.hits[this.hitCount]
    if (!hit) this.hits[this.hitCount] = hit = { bee, x, y }
    hit.bee = bee
    hit.x = x
    hit.y = y
    this.hitCount++
    if (this.showNames) this.place(bee, x, y)
  }

  /** Hides what wasn't drawn this frame and updates the tooltip. `status` describes a bee's doing. */
  end(status: (bee: TagBee) => string) {
    for (const t of this.tags.values()) {
      if (!t.seen && t.shown) {
        t.el.hidden = true
        t.shown = false
      }
      t.seen = false
    }
    let best: Hit | null = null
    if (this.running && this.ptrOn) {
      let bestD = HOVER_RADIUS * HOVER_RADIUS
      for (let i = 0; i < this.hitCount; i++) {
        const hit = this.hits[i]!
        const d = (hit.x - this.ptrX) ** 2 + (hit.y - this.ptrY) ** 2
        if (d < bestD) {
          bestD = d
          best = hit
        }
      }
    }
    if (!best) {
      if (this.tipShown) {
        this.tip.hidden = true
        this.tipShown = false
      }
      return
    }
    const title = `${best.bee.name} · ${best.bee.species}`
    if (title !== this.lastTitle) this.tipTitle.textContent = this.lastTitle = title
    const s = status(best.bee)
    if (s !== this.lastStatus) this.tipStatus.textContent = this.lastStatus = s
    const x = Math.min(Math.max(best.x, 90), Math.max(90, this.w - 90))
    const pos = `translate3d(${x.toFixed(1)}px, ${(best.y + 30).toFixed(1)}px, 0)`
    if (pos !== this.tipPos) this.tip.style.transform = this.tipPos = pos
    if (!this.tipShown) {
      this.tip.hidden = false
      this.tipShown = true
    }
  }

  private place(bee: TagBee, x: number, y: number) {
    let t = this.tags.get(bee.id)
    if (!t) {
      const el = document.createElement('div')
      el.className = 'bee-tag'
      el.hidden = true
      this.root.append(el)
      t = { el, text: '', seen: false, shown: false, pos: '' }
      this.tags.set(bee.id, t)
    }
    t.seen = true
    if (t.text !== bee.name) t.el.textContent = t.text = bee.name
    const pos = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`
    if (pos !== t.pos) t.el.style.transform = t.pos = pos
    if (!t.shown) {
      t.el.hidden = false
      t.shown = true
    }
  }

  dispose() {
    this.root.remove()
    this.tags.clear()
  }
}
