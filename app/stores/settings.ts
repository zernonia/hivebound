import { defineStore } from 'pinia'

export type TextScale = 1 | 1.2 | 1.4
export type FlightSpeed = 'relaxed' | 'normal' | 'brisk'

export interface SettingsState {
  reducedMotion: boolean
  textScale: TextScale
  highContrast: boolean
  colorVisionFriendly: boolean
  narration: boolean
  /** Set once narration's default became off, so a saved value is a real choice. */
  narrationOptIn: boolean
  showMinimap: boolean
  largeMinimap: boolean
  showHints: boolean
  /** On-screen hex movement pad (defaults on for touch screens). */
  showPad: boolean
  flightSpeed: FlightSpeed
  zoom: number
  /** 0..1; 0 turns it off. */
  musicVolume: number
  sfxVolume: number
  /** Slower marker and a wider green arc in the befriending dance. */
  easyBefriend: boolean
  dayNight: boolean
  /** Most helper bees the colony will take in (Bee Rooms still gate growth). */
  maxBees: number
  /** The one-time performance heads-up has been seen. */
  beeLimitAcknowledged: boolean
}

const STORAGE_KEY = 'hivebound:settings:v1'

function systemPrefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function systemPrefersContrast() {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-contrast: more)').matches
}

function systemIsTouch() {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(pointer: coarse)').matches
}

export const ZOOM_MIN = 0.6
export const ZOOM_MAX = 1.7
export const MIN_BEES = 2
export const MAX_BEES_LIMIT = 50
export const RECOMMENDED_BEES = 20

function clampBees(n: unknown) {
  const v = typeof n === 'number' ? n : Number.NaN
  if (!Number.isFinite(v)) return RECOMMENDED_BEES
  return Math.min(MAX_BEES_LIMIT, Math.max(MIN_BEES, Math.round(v)))
}

export const useSettings = defineStore('settings', {
  state: (): SettingsState => ({
    reducedMotion: systemPrefersReducedMotion(),
    textScale: 1,
    highContrast: systemPrefersContrast(),
    colorVisionFriendly: false,
    /** Extra spoken detail, plus the Look around button. Off by default: turned on by those who want it. */
    narration: false,
    narrationOptIn: true,
    showMinimap: true,
    largeMinimap: false,
    showHints: true,
    showPad: systemIsTouch(),
    flightSpeed: 'normal',
    zoom: 1.2,
    musicVolume: 0.4,
    sfxVolume: 0.6,
    easyBefriend: false,
    /** Slow day and night cycle (off = always day). */
    dayNight: true,
    maxBees: RECOMMENDED_BEES,
    beeLimitAcknowledged: false,
  }),
  getters: {
    /** Seconds to fly one hex. */
    secondsPerHex(s): number {
      const base = { relaxed: 0.42, normal: 0.3, brisk: 0.2 }[s.flightSpeed]
      return s.reducedMotion ? Math.min(base, 0.22) : base
    },
  },
  actions: {
    load() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return
        const data = JSON.parse(raw) as Partial<SettingsState> & { hopSpeed?: FlightSpeed }
        // Saves from before the flight rewrite called this setting `hopSpeed`.
        if (data.hopSpeed && !data.flightSpeed) data.flightSpeed = data.hopSpeed
        delete data.hopSpeed
        // Narration used to be on for everyone and was saved that way, so older settings can't
        // tell a choice from the old default: start them at the new default (off) once.
        if (!data.narrationOptIn) delete data.narration
        this.$patch(data)
        this.maxBees = clampBees(this.maxBees)
      }
      catch { /* storage unavailable: keep defaults */ }
    },
    save() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.$state))
      }
      catch { /* ignore */ }
    },
    setZoom(z: number) {
      this.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z))
    },
    setMaxBees(n: number) {
      this.maxBees = clampBees(n)
    },
    reset() {
      this.$reset()
    },
  },
})
