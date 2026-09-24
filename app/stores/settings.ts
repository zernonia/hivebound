import { defineStore } from 'pinia'

export type TextScale = 1 | 1.2 | 1.4
export type FlightSpeed = 'relaxed' | 'normal' | 'brisk'

export interface SettingsState {
  reducedMotion: boolean
  textScale: TextScale
  highContrast: boolean
  colorVisionFriendly: boolean
  narration: boolean
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

export const useSettings = defineStore('settings', {
  state: (): SettingsState => ({
    reducedMotion: systemPrefersReducedMotion(),
    textScale: 1,
    highContrast: systemPrefersContrast(),
    colorVisionFriendly: false,
    narration: true,
    showMinimap: true,
    largeMinimap: false,
    showHints: true,
    showPad: systemIsTouch(),
    flightSpeed: 'normal',
    zoom: 1.2,
    musicVolume: 0.4,
    sfxVolume: 0.6,
    easyBefriend: false,
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
        this.$patch(data)
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
    reset() {
      this.$reset()
    },
  },
})
