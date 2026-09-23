<script setup lang="ts">
import { useGame } from '~/stores/game'
import { type FlightSpeed, type TextScale, useSettings } from '~/stores/settings'

const game = useGame()
const settings = useSettings()

type BoolKey = 'reducedMotion' | 'highContrast' | 'colorVisionFriendly' | 'narration' | 'showMinimap' | 'showPad' | 'showHints'
const toggles: { key: BoolKey, label: string, hint: string }[] = [
  { key: 'reducedMotion', label: 'Reduce motion', hint: 'Calmer camera, no bouncing or pop-ins.' },
  { key: 'highContrast', label: 'High contrast', hint: 'Stronger text and outlines on panels.' },
  { key: 'colorVisionFriendly', label: 'Colour-friendly palette', hint: 'Terrain differs by brightness, not just hue.' },
  { key: 'narration', label: 'Screen reader narration', hint: 'Describe where you fly and what is nearby.' },
  { key: 'showMinimap', label: 'Show minimap', hint: '' },
  { key: 'showPad', label: 'On-screen movement pad', hint: 'Six big buttons for hex directions.' },
  { key: 'showHints', label: 'Show tips', hint: '' },
]
const textSizes: { v: TextScale, label: string }[] = [
  { v: 1, label: 'Normal' },
  { v: 1.2, label: 'Large' },
  { v: 1.4, label: 'Huge' },
]
const speeds: { v: FlightSpeed, label: string }[] = [
  { v: 'relaxed', label: 'Relaxed' },
  { v: 'normal', label: 'Normal' },
  { v: 'brisk', label: 'Brisk' },
]

const confirmReset = ref(false)
function reset() {
  if (!confirmReset.value) {
    confirmReset.value = true
    setTimeout(() => (confirmReset.value = false), 4000)
    return
  }
  confirmReset.value = false
  game.resetProgress()
  game.settingsOpen = false
}
</script>

<template>
  <UiDialog :open="game.settingsOpen" title="Settings" @close="game.settingsOpen = false">
    <section aria-labelledby="s-access">
      <h3 id="s-access">
        Comfort &amp; accessibility
      </h3>
      <ul class="toggles">
        <li v-for="t in toggles" :key="t.key">
          <button
            role="switch"
            :aria-checked="settings[t.key]"
            class="switch-row"
            @click="settings[t.key] = !settings[t.key]"
          >
            <span class="txt">
              <span class="label">{{ t.label }}</span>
              <span v-if="t.hint" class="hint">{{ t.hint }}</span>
            </span>
            <span class="switch" :class="{ on: settings[t.key] }" aria-hidden="true"><span /></span>
          </button>
        </li>
      </ul>

      <fieldset class="seg">
        <legend>Text size</legend>
        <div class="seg-row">
          <label v-for="s in textSizes" :key="s.v" :class="{ on: settings.textScale === s.v }">
            <input v-model="settings.textScale" type="radio" name="textScale" :value="s.v" class="sr-only">
            {{ s.label }}
          </label>
        </div>
      </fieldset>

      <fieldset class="seg">
        <legend>Flying speed</legend>
        <div class="seg-row">
          <label v-for="s in speeds" :key="s.v" :class="{ on: settings.flightSpeed === s.v }">
            <input v-model="settings.flightSpeed" type="radio" name="flightSpeed" :value="s.v" class="sr-only">
            {{ s.label }}
          </label>
        </div>
      </fieldset>
    </section>

    <section aria-labelledby="s-keys" class="keys">
      <h3 id="s-keys">
        Controls
      </h3>
      <dl>
        <div><dt>Fly</dt><dd>Tap or click a tile · <span class="kbd">Q</span><span class="kbd">W</span><span class="kbd">E</span> <span class="kbd">A</span><span class="kbd">S</span><span class="kbd">D</span> · arrow keys</dd></div>
        <div><dt>Look around</dt><dd><span class="kbd">L</span></dd></div>
        <div><dt>Journal</dt><dd><span class="kbd">J</span></dd></div>
        <div><dt>Fly home</dt><dd><span class="kbd">H</span></dd></div>
        <div><dt>Map size</dt><dd><span class="kbd">M</span></dd></div>
        <div><dt>Zoom</dt><dd><span class="kbd">+</span> <span class="kbd">−</span> · scroll · pinch</dd></div>
        <div><dt>Stop</dt><dd><span class="kbd">Space</span></dd></div>
        <div><dt>Settings</dt><dd><span class="kbd">Esc</span></dd></div>
      </dl>
    </section>

    <section class="danger">
      <button class="reset" :class="{ armed: confirmReset }" @click="reset">
        {{ confirmReset ? 'Tap again to erase your journey' : 'Start a new journey' }}
      </button>
    </section>
  </UiDialog>
</template>

<style scoped>
h3 {
  font-size: 1.05rem;
  margin: 12px 0 8px;
}
.toggles {
  list-style: none;
  padding: 0;
  margin: 0 0 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.switch-row {
  width: 100%;
  min-height: 52px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 12px;
  border: none;
  border-radius: 14px;
  background: transparent;
  text-align: left;
}
.switch-row:hover {
  background: var(--paper-2);
}
.txt {
  display: flex;
  flex-direction: column;
}
.label {
  font-weight: 600;
}
.hint {
  font-size: 0.85rem;
  color: var(--ink-soft);
}
.switch {
  width: 52px;
  height: 30px;
  border-radius: 999px;
  background: #e5d8c6;
  border: 2px solid var(--line);
  position: relative;
  flex: none;
  transition: background var(--dur);
}
.switch span {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  transition: transform var(--dur) var(--ease);
}
.switch.on {
  background: var(--honey);
  border-color: var(--honey-deep);
}
.switch.on span {
  transform: translateX(22px);
}
.seg {
  border: none;
  padding: 0;
  margin: 10px 12px;
}
.seg legend {
  font-weight: 600;
  margin-bottom: 6px;
  padding: 0;
}
.seg-row {
  display: flex;
  gap: 6px;
  background: var(--paper-2);
  padding: 4px;
  border-radius: 999px;
}
.seg-row label {
  flex: 1;
  min-height: 44px;
  display: grid;
  place-items: center;
  border-radius: 999px;
  cursor: pointer;
  font-weight: 600;
}
.seg-row label.on {
  background: #fff;
  box-shadow: 0 2px 6px rgba(120, 80, 40, 0.18);
}
.seg-row label:has(input:focus-visible) {
  box-shadow: var(--focus);
}
.keys dl {
  margin: 0 12px;
  display: grid;
  gap: 6px;
}
.keys dl div {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 0.92rem;
}
.keys dt {
  font-weight: 600;
}
.keys dd {
  margin: 0;
  text-align: right;
  color: var(--ink-soft);
}
.kbd {
  margin-left: 2px;
}
.danger {
  margin-top: 18px;
  padding: 0 12px;
}
.reset {
  width: 100%;
  min-height: 48px;
  border-radius: 14px;
  border: 2px dashed #e7a3a3;
  background: transparent;
  color: #a4453f;
  font-weight: 600;
}
.reset.armed {
  background: #ffe3e0;
  border-style: solid;
}
</style>
