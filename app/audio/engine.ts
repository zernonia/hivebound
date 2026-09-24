/*
 * All of Hivebound's sound, synthesised live with the Web Audio API (no audio files).
 *
 * - Music: a generative, never-quite-repeating piece. A soft pad walks a cosy chord
 *   progression, a round bass marks each bar, and kalimba-like plucks wander a pentatonic
 *   scale. Inside the hive it slows down and warms up; at night it turns low and hushed,
 *   with far-off crickets.
 * - Effects: a wing buzz that follows flight speed, plus short one-shots for gathering,
 *   unloading, discoveries, the hive door, collecting and building.
 *
 * Browsers only allow audio after a user gesture, so nothing plays until `unlock()`.
 */

type Mood = 'meadow' | 'hive' | 'night'

const A4 = 440
const midi = (n: number) => A4 * Math.pow(2, (n - 69) / 12)

/** Chords as MIDI note numbers (voiced low-mid), one per bar. */
const PROGRESSIONS: Record<Mood, number[][]> = {
  // Cmaj7 – Am7 – Fmaj7 – G6
  meadow: [[48, 55, 59, 64], [45, 52, 55, 60], [41, 48, 52, 57], [43, 50, 52, 59]],
  // Fmaj7 – Em7 – Dm7 – Cmaj7 (sleepier, for inside)
  hive: [[41, 48, 52, 57], [40, 47, 50, 55], [38, 45, 48, 53], [36, 43, 47, 52]],
  // Am7 – Fmaj7 – Cmaj7 – Em7, voiced low (night)
  night: [[45, 52, 55, 60], [41, 48, 52, 57], [36, 43, 47, 52], [40, 47, 50, 55]],
}
/** C major pentatonic across two octaves for the melody. */
const SCALE = [72, 74, 76, 79, 81, 84, 86, 88]

export class GameAudio {
  private ctx: AudioContext | null = null
  private master!: GainNode
  private musicBus!: GainNode
  private sfxBus!: GainNode
  private reverb!: ConvolverNode
  private reverbSend!: GainNode
  private musicFilter!: BiquadFilterNode

  private musicVolume = 0.5
  private sfxVolume = 0.7
  private mood: Mood = 'meadow'

  // Music scheduler state.
  private timer: ReturnType<typeof setInterval> | null = null
  private nextBar = 0
  private bar = 0
  private melodyIndex = 3

  // Wing buzz (continuous).
  private buzzGain!: GainNode
  private buzzOscA!: OscillatorNode
  private buzzOscB!: OscillatorNode
  private buzzFilter!: BiquadFilterNode

  private lastGather = 0

  get ready() {
    return !!this.ctx && this.ctx.state === 'running'
  }

  /** Creates / resumes the audio graph. Call from a user gesture (key press, tap). */
  unlock() {
    if (typeof window === 'undefined') return
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return
      this.ctx = new Ctor()
      this.build()
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
  }

  setVolumes(music: number, sfx: number) {
    this.musicVolume = music
    this.sfxVolume = sfx
    if (!this.ctx) return
    const t = this.ctx.currentTime
    this.musicBus.gain.setTargetAtTime(music * 0.85, t, 0.2)
    this.sfxBus.gain.setTargetAtTime(sfx, t, 0.05)
  }

  /** Meadow outside, hive inside: the next bar picks up the new chords. */
  setMood(mood: Mood) {
    this.mood = mood
    if (!this.ctx) return
    this.musicFilter.frequency.setTargetAtTime(this.filterFor(mood), this.ctx.currentTime, 1.5)
  }

  /** Pause everything while the tab is hidden. */
  setSuspended(hidden: boolean) {
    if (!this.ctx) return
    if (hidden) void this.ctx.suspend()
    else void this.ctx.resume()
  }

  /* ------------------------------------------------------------------ */
  /* Graph                                                              */
  /* ------------------------------------------------------------------ */

  private build() {
    const ctx = this.ctx!
    this.master = ctx.createGain()
    this.master.gain.value = 2.2
    // Gentle limiter so stacked sounds never clip.
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -14
    comp.ratio.value = 4
    this.master.connect(comp).connect(ctx.destination)

    this.reverb = ctx.createConvolver()
    this.reverb.buffer = this.impulse(2.4)
    this.reverbSend = ctx.createGain()
    this.reverbSend.gain.value = 0.5
    this.reverbSend.connect(this.reverb).connect(this.master)

    this.musicFilter = ctx.createBiquadFilter()
    this.musicFilter.type = 'lowpass'
    this.musicFilter.frequency.value = this.filterFor(this.mood)
    this.musicBus = ctx.createGain()
    this.musicBus.gain.value = this.musicVolume * 0.85
    this.musicFilter.connect(this.musicBus)
    this.musicBus.connect(this.master)
    this.musicBus.connect(this.reverbSend)

    this.sfxBus = ctx.createGain()
    this.sfxBus.gain.value = this.sfxVolume
    this.sfxBus.connect(this.master)
    const sfxSend = ctx.createGain()
    sfxSend.gain.value = 0.25
    this.sfxBus.connect(sfxSend).connect(this.reverbSend)

    this.buildBuzz()
    this.startMusic()
  }

  /** A soft, decaying noise tail used as the reverb's room. */
  private impulse(seconds: number) {
    const ctx = this.ctx!
    const len = Math.floor(ctx.sampleRate * seconds)
    const buf = ctx.createBuffer(2, len, ctx.sampleRate)
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch)
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3)
    }
    return buf
  }

  private noiseBuffer?: AudioBuffer
  private noise() {
    const ctx = this.ctx!
    if (!this.noiseBuffer) {
      this.noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
      const d = this.noiseBuffer.getChannelData(0)
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
    }
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuffer
    src.loop = true
    return src
  }

  /* ------------------------------------------------------------------ */
  /* Music                                                              */
  /* ------------------------------------------------------------------ */

  private filterFor(mood: Mood) {
    return mood === 'hive' ? 1000 : mood === 'night' ? 1100 : 1800
  }

  private barSeconds() {
    return this.mood === 'hive' ? 5.2 : this.mood === 'night' ? 5.8 : 4.2
  }

  private startMusic() {
    this.nextBar = this.ctx!.currentTime + 0.3
    // Look-ahead scheduler: queue anything due in the next ~1.2s.
    this.timer = setInterval(() => this.schedule(), 250)
  }

  private schedule() {
    const ctx = this.ctx
    if (!ctx || ctx.state !== 'running') return
    while (this.nextBar < ctx.currentTime + 1.2) {
      this.playBar(this.nextBar)
      this.nextBar += this.barSeconds()
      this.bar++
    }
  }

  private playBar(t: number) {
    const chords = PROGRESSIONS[this.mood]
    const chord = chords[this.bar % chords.length]!
    const len = this.barSeconds()
    // Pad: soft triangle voices that swell in and out across the bar.
    for (const n of chord.slice(1)) this.padVoice(midi(n), t, len * 1.15)
    // Bass: a round sine on the root.
    this.pluck(midi(chord[0]! - 12), t, { type: 'sine', gain: 0.15, decay: len * 0.8, bus: 'music', attack: 0.12 })
    if (this.mood === 'night') this.crickets(t, len)
    // Melody: a few kalimba notes drifting stepwise, with whole bars of rest to breathe.
    if (this.bar % 4 === 3) return
    const steps = this.mood === 'meadow' ? 4 : 3
    for (let i = 0; i < steps; i++) {
      if (Math.random() > (this.mood === 'meadow' ? 0.4 : this.mood === 'hive' ? 0.3 : 0.22)) continue
      const move = Math.random() < 0.7 ? (Math.random() < 0.5 ? -1 : 1) : 0
      this.melodyIndex = Math.max(0, Math.min(SCALE.length - 3, this.melodyIndex + move))
      const when = t + (i * len) / steps + (Math.random() - 0.5) * 0.04
      this.kalimba(midi(SCALE[this.melodyIndex]!), when, 0.075, 'music')
    }
  }

  /** Far-off crickets: a few soft trills of short high pips, panned about, well under the music. */
  private crickets(t: number, len: number) {
    const ctx = this.ctx!
    const trills = 1 + Math.floor(Math.random() * 3)
    for (let k = 0; k < trills; k++) {
      const start = t + Math.random() * len
      const pitch = 4200 + Math.random() * 900
      const pan = ctx.createStereoPanner()
      pan.pan.value = Math.random() * 1.6 - 0.8
      pan.connect(this.musicBus)
      const pips = 3 + Math.floor(Math.random() * 3)
      for (let i = 0; i < pips; i++) {
        const at = start + i * 0.075
        const osc = ctx.createOscillator()
        osc.type = 'sine'
        osc.frequency.value = pitch
        const g = ctx.createGain()
        g.gain.setValueAtTime(0, at)
        g.gain.linearRampToValueAtTime(0.012, at + 0.008)
        g.gain.exponentialRampToValueAtTime(0.0001, at + 0.05)
        osc.connect(g).connect(pan)
        osc.start(at)
        osc.stop(at + 0.06)
      }
    }
  }

  private padVoice(freq: number, t: number, len: number) {
    const ctx = this.ctx!
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(0.04, t + len * 0.45)
    g.gain.linearRampToValueAtTime(0, t + len)
    for (const detune of [-6, 6]) {
      const o = ctx.createOscillator()
      o.type = 'triangle'
      o.frequency.value = freq
      o.detune.value = detune
      o.connect(g)
      o.start(t)
      o.stop(t + len + 0.05)
    }
    g.connect(this.musicFilter)
  }

  /* ------------------------------------------------------------------ */
  /* Instruments                                                        */
  /* ------------------------------------------------------------------ */

  private out(bus: 'music' | 'sfx') {
    return bus === 'music' ? this.musicFilter : this.sfxBus
  }

  private pluck(freq: number, t: number, o: { type?: OscillatorType, gain?: number, decay?: number, attack?: number, bus?: 'music' | 'sfx', glide?: number } = {}) {
    const ctx = this.ctx!
    const osc = ctx.createOscillator()
    osc.type = o.type ?? 'sine'
    osc.frequency.setValueAtTime(freq, t)
    if (o.glide) osc.frequency.exponentialRampToValueAtTime(freq * o.glide, t + (o.decay ?? 0.4))
    const g = ctx.createGain()
    const peak = o.gain ?? 0.2
    const attack = o.attack ?? 0.005
    const decay = o.decay ?? 0.4
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(peak, t + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay)
    osc.connect(g).connect(this.out(o.bus ?? 'sfx'))
    osc.start(t)
    osc.stop(t + attack + decay + 0.05)
  }

  /** Soft kalimba / marimba: a sine with a quick bright overtone. */
  private kalimba(freq: number, t: number, gain: number, bus: 'music' | 'sfx') {
    this.pluck(freq, t, { gain, decay: 0.9, bus })
    this.pluck(freq * 3.01, t, { gain: gain * 0.1, decay: 0.08, bus })
  }

  /** Filtered noise sweep, for doors and whooshes. */
  private whoosh(t: number, from: number, to: number, dur: number, gain = 0.25) {
    const ctx = this.ctx!
    const src = this.noise()
    const f = ctx.createBiquadFilter()
    f.type = 'bandpass'
    f.Q.value = 1.2
    f.frequency.setValueAtTime(from, t)
    f.frequency.exponentialRampToValueAtTime(to, t + dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(gain, t + dur * 0.4)
    g.gain.linearRampToValueAtTime(0, t + dur)
    src.connect(f).connect(g).connect(this.sfxBus)
    src.start(t)
    src.stop(t + dur + 0.05)
  }

  /* ------------------------------------------------------------------ */
  /* Wing buzz                                                          */
  /* ------------------------------------------------------------------ */

  private buildBuzz() {
    const ctx = this.ctx!
    this.buzzGain = ctx.createGain()
    this.buzzGain.gain.value = 0
    this.buzzFilter = ctx.createBiquadFilter()
    this.buzzFilter.type = 'lowpass'
    this.buzzFilter.frequency.value = 420
    this.buzzFilter.Q.value = 0.7
    // Two slightly detuned saws give a soft, fuzzy beating.
    this.buzzOscA = ctx.createOscillator()
    this.buzzOscB = ctx.createOscillator()
    // Soft triangles (not saws) keep it a gentle hum rather than a mosquito.
    this.buzzOscA.type = this.buzzOscB.type = 'triangle'
    this.buzzOscA.frequency.value = 140
    this.buzzOscB.frequency.value = 142
    // Wingbeat tremolo.
    const trem = ctx.createGain()
    trem.gain.value = 0.7
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 28
    const lfoDepth = ctx.createGain()
    lfoDepth.gain.value = 0.15
    lfo.connect(lfoDepth).connect(trem.gain)
    this.buzzOscA.connect(this.buzzFilter)
    this.buzzOscB.connect(this.buzzFilter)
    this.buzzFilter.connect(trem).connect(this.buzzGain).connect(this.sfxBus)
    this.buzzOscA.start()
    this.buzzOscB.start()
    lfo.start()
  }

  /**
   * Called every frame by the scene. `speed` 0..1 is how fast the bee is flying; hovering keeps
   * a faint hum. `busy` (gathering) adds a little flutter.
   */
  setFlight(speed: number, busy: boolean, active: boolean) {
    if (!this.ready) return
    const t = this.ctx!.currentTime
    // Only while actually flying: hovering and gathering are quiet.
    const moving = Math.max(0, speed - 0.15) / 0.85
    const level = active ? moving * 0.03 : 0
    this.buzzGain.gain.setTargetAtTime(level, t, busy ? 0.3 : 0.25)
    const pitch = 135 + moving * 25
    this.buzzOscA.frequency.setTargetAtTime(pitch, t, 0.3)
    this.buzzOscB.frequency.setTargetAtTime(pitch * 1.015, t, 0.3)
    this.buzzFilter.frequency.setTargetAtTime(350 + moving * 250, t, 0.3)
  }

  /* ------------------------------------------------------------------ */
  /* One-shots                                                          */
  /* ------------------------------------------------------------------ */

  private now() {
    return this.ready ? this.ctx!.currentTime + 0.01 : -1
  }

  /** One unit gathered; pitch climbs as the pouch fills (fill 0..1). */
  gather(fill: number) {
    const t = this.now()
    if (t < 0 || t - this.lastGather < 0.08) return
    this.lastGather = t
    const i = Math.min(SCALE.length - 1, Math.floor(fill * (SCALE.length - 1)))
    this.kalimba(midi(SCALE[Math.min(i, SCALE.length - 3)]! - 12), t, 0.1, 'sfx')
  }

  pouchFull() {
    const t = this.now()
    if (t < 0) return
    this.kalimba(midi(79), t, 0.1, 'sfx')
    this.kalimba(midi(76), t + 0.18, 0.1, 'sfx')
  }

  /** Pouch emptied into the hive: a little rising cascade. */
  unload() {
    const t = this.now()
    if (t < 0) return
    ;[67, 72, 76].forEach((n, i) => this.kalimba(midi(n), t + i * 0.11, 0.09, 'sfx'))
  }

  /** New journal entry / place found: sparkling arpeggio. */
  discover() {
    const t = this.now()
    if (t < 0) return
    ;[72, 76, 79, 84].forEach((n, i) => this.kalimba(midi(n), t + i * 0.13, 0.08, 'sfx'))
  }

  hiveDoor(entering: boolean) {
    const t = this.now()
    if (t < 0) return
    if (entering) this.whoosh(t, 1400, 250, 1.0, 0.1)
    else this.whoosh(t, 250, 1400, 1.0, 0.1)
    // A warm "home" chord as the iris opens.
    const chord = entering ? [53, 57, 60, 64] : [60, 64, 67, 72]
    chord.forEach((n, i) => this.pluck(midi(n), t + 0.75 + i * 0.05, { gain: 0.045, decay: 1.8, type: 'sine', attack: 0.15 }))
  }

  collect() {
    const t = this.now()
    if (t < 0) return
    this.kalimba(midi(76), t, 0.09, 'sfx')
    this.kalimba(midi(81), t + 0.1, 0.08, 'sfx')
  }

  /** Built, unsealed or upgraded something. */
  fanfare() {
    const t = this.now()
    if (t < 0) return
    ;[60, 64, 67, 72].forEach((n, i) => this.kalimba(midi(n), t + i * 0.12, 0.08, 'sfx'))
  }

  /** Soft tick for selecting cells / pressing the prompt. */
  tick() {
    const t = this.now()
    if (t < 0) return
    this.pluck(midi(84), t, { gain: 0.025, decay: 0.08, type: 'sine' })
  }

  /** Befriending dance: the marker just entered the green. */
  danceCue() {
    const t = this.now()
    if (t < 0) return
    this.pluck(midi(91), t, { gain: 0.04, decay: 0.12, type: 'sine' })
  }

  /** A new friend joined. */
  befriended() {
    const t = this.now()
    if (t < 0) return
    ;[67, 71, 74, 79, 83].forEach((n, i) => this.kalimba(midi(n), t + i * 0.1, 0.09, 'sfx'))
  }

  /** Missed the green: a soft, low "oops". */
  danceMiss() {
    const t = this.now()
    if (t < 0) return
    this.kalimba(midi(55), t, 0.08, 'sfx')
    this.kalimba(midi(52), t + 0.12, 0.07, 'sfx')
  }

  dispose() {
    if (this.timer) clearInterval(this.timer)
    void this.ctx?.close()
    this.ctx = null
  }
}

/** One shared engine for the whole game. */
export const gameAudio = new GameAudio()
