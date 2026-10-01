<script setup lang="ts">
import { useGame } from '~/stores/game'
import { type FlightSpeed, type Lang, type TextScale, useSettings } from '~/stores/settings'
import { useColony } from '~/stores/colony'
import { useHive } from '~/stores/hive'
import { useQueen } from '~/stores/queen'
import { exportSave, importSave, parseSave, saveFileName } from '~/utils/saveTransfer'

const game = useGame()
const settings = useSettings()
const { t } = useI18n()
// The minimap isn't shown on phones, so its switch would do nothing there.
const compact = useCompactScreen()
const pct = (v: number) => (v <= 0 ? t('settings.off') : `${Math.round(v * 100)}%`)

// Shown in their own language, like locale names usually are.
const langs: { v: Lang, label: string }[] = [
  { v: 'en', label: 'English' },
  { v: 'fr', label: 'Français' },
]

type BoolKey = 'reducedMotion' | 'highContrast' | 'colorVisionFriendly' | 'narration' | 'showMinimap' | 'showPad' | 'showHints' | 'easyBefriend' | 'dayNight'
// Built inside computed() so the labels follow the language setting.
const shownToggles = computed<{ key: BoolKey, label: string, hint: string }[]>(() => {
  const all: { key: BoolKey, label: string, hint: string }[] = [
    { key: 'reducedMotion', label: t('settings.toggles.reducedMotion.label'), hint: t('settings.toggles.reducedMotion.hint') },
    { key: 'highContrast', label: t('settings.toggles.highContrast.label'), hint: t('settings.toggles.highContrast.hint') },
    { key: 'colorVisionFriendly', label: t('settings.toggles.colorVisionFriendly.label'), hint: t('settings.toggles.colorVisionFriendly.hint') },
    { key: 'narration', label: t('settings.toggles.narration.label'), hint: t('settings.toggles.narration.hint') },
    { key: 'showMinimap', label: t('settings.toggles.showMinimap.label'), hint: t('settings.toggles.showMinimap.hint') },
    { key: 'showPad', label: t('settings.toggles.showPad.label'), hint: t('settings.toggles.showPad.hint') },
    { key: 'easyBefriend', label: t('settings.toggles.easyBefriend.label'), hint: t('settings.toggles.easyBefriend.hint') },
    { key: 'dayNight', label: t('settings.toggles.dayNight.label'), hint: t('settings.toggles.dayNight.hint') },
    { key: 'showHints', label: t('settings.toggles.showHints.label'), hint: t('settings.toggles.showHints.hint') },
  ]
  // The minimap isn't shown on phones, so its switch would do nothing there.
  return compact.value ? all.filter(tg => tg.key !== 'showMinimap') : all
})
const textSizes = computed(() => [
  { v: 1 as TextScale, label: t('settings.textSizes.normal') },
  { v: 1.2 as TextScale, label: t('settings.textSizes.large') },
  { v: 1.4 as TextScale, label: t('settings.textSizes.huge') },
])
const speeds = computed(() => [
  { v: 'relaxed' as FlightSpeed, label: t('settings.speeds.relaxed') },
  { v: 'normal' as FlightSpeed, label: t('settings.speeds.normal') },
  { v: 'brisk' as FlightSpeed, label: t('settings.speeds.brisk') },
])

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

// --- Your save: export / import ---
const hive = useHive()
const colony = useColony()
const queen = useQueen()
const saveStatus = ref('')
const saveError = ref(false)
/** Shown when the clipboard is off-limits, so the code can be selected by hand. */
const fallbackCode = ref('')
const copied = ref(false)
const loadOpen = ref(false)
const pasted = ref('')
const confirmLoad = ref(false)
let copiedTimer: ReturnType<typeof setTimeout> | undefined
const keepBtn = ref<HTMLButtonElement>()

function say(msg: string, error = false) {
  saveStatus.value = msg
  saveError.value = error
}

/** Export what's in play right now, not just what was last written to storage. */
function freshCode() {
  game.save()
  hive.save()
  colony.save()
  queen.save()
  settings.save()
  return exportSave()
}

async function copySave() {
  const code = freshCode()
  try {
    await navigator.clipboard.writeText(code)
    fallbackCode.value = ''
    copied.value = true
    say(t('settings.save.statusCopied'))
    clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => (copied.value = false), 2000)
  }
  catch {
    fallbackCode.value = code
    say(t('settings.save.statusClipboard'))
  }
}

function downloadSave() {
  const blob = new Blob([freshCode()], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = saveFileName()
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  say(t('settings.save.statusDownloaded'))
}

function toggleLoad() {
  loadOpen.value = !loadOpen.value
  confirmLoad.value = false
  if (!loadOpen.value) pasted.value = ''
  say('')
}

async function pickFile(ev: Event) {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    pasted.value = (await file.text()).trim()
    askLoad()
  }
  catch {
    say(t('settings.save.statusFileError'), true)
  }
}

/** Step one: check the code, then ask before replacing anything. */
function askLoad() {
  const check = parseSave(pasted.value)
  if (!check.ok) {
    confirmLoad.value = false
    say(check.error, true)
    return
  }
  confirmLoad.value = true
  say('')
  // The load button gives way to the confirm pair; land on the safe choice.
  nextTick(() => keepBtn.value?.focus())
}

/** Step two: write it in and reload so every store starts from the loaded save. */
function doLoad() {
  const result = importSave(pasted.value)
  if (!result.ok) {
    confirmLoad.value = false
    say(result.error, true)
    return
  }
  say(t('settings.save.statusLoaded'))
  location.reload()
}

watch(() => game.settingsOpen, (open) => {
  if (open) return
  // Start fresh next time Settings opens.
  loadOpen.value = false
  confirmLoad.value = false
  pasted.value = ''
  fallbackCode.value = ''
  say('')
})
watch(pasted, () => {
  if (confirmLoad.value) confirmLoad.value = false
})
onBeforeUnmount(() => clearTimeout(copiedTimer))
</script>

<template>
  <UiDialog :open="game.settingsOpen" :title="t('settings.title')" @close="game.settingsOpen = false">
    <section aria-labelledby="s-lang" class="language">
      <h3 id="s-lang">
        {{ t('settings.language') }}
      </h3>
      <fieldset class="seg">
        <div class="seg-row">
          <label v-for="l in langs" :key="l.v" :class="{ on: settings.lang === l.v }">
            <input v-model="settings.lang" type="radio" name="lang" :value="l.v" class="sr-only">
            {{ l.label }}
          </label>
        </div>
      </fieldset>
    </section>

    <section aria-labelledby="s-access">
      <h3 id="s-access">
        {{ t('settings.sections.accessibility') }}
      </h3>
      <ul class="toggles">
        <li v-for="t in shownToggles" :key="t.key">
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
        <legend>{{ t('settings.textSize') }}</legend>
        <div class="seg-row">
          <label v-for="s in textSizes" :key="s.v" :class="{ on: settings.textScale === s.v }">
            <input v-model="settings.textScale" type="radio" name="textScale" :value="s.v" class="sr-only">
            {{ s.label }}
          </label>
        </div>
      </fieldset>

      <fieldset class="seg">
        <legend>{{ t('settings.flyingSpeed') }}</legend>
        <div class="seg-row">
          <label v-for="s in speeds" :key="s.v" :class="{ on: settings.flightSpeed === s.v }">
            <input v-model="settings.flightSpeed" type="radio" name="flightSpeed" :value="s.v" class="sr-only">
            {{ s.label }}
          </label>
        </div>
      </fieldset>
    </section>

    <section aria-labelledby="s-sound">
      <h3 id="s-sound">
        {{ t('settings.sections.sound') }}
      </h3>
      <div class="slider">
        <label for="vol-music">{{ t('settings.music') }}</label>
        <input id="vol-music" v-model.number="settings.musicVolume" type="range" :style="{ '--fill': `${settings.musicVolume * 100}%` }" min="0" max="1" step="0.05" :aria-valuetext="pct(settings.musicVolume)">
        <span class="val" aria-hidden="true">{{ pct(settings.musicVolume) }}</span>
      </div>
      <div class="slider">
        <label for="vol-sfx">{{ t('settings.sfx') }}</label>
        <input id="vol-sfx" v-model.number="settings.sfxVolume" type="range" :style="{ '--fill': `${settings.sfxVolume * 100}%` }" min="0" max="1" step="0.05" :aria-valuetext="pct(settings.sfxVolume)">
        <span class="val" aria-hidden="true">{{ pct(settings.sfxVolume) }}</span>
      </div>
    </section>

    <section aria-labelledby="s-keys" class="keys">
      <h3 id="s-keys">
        {{ t('settings.sections.controls') }}
      </h3>
      <dl>
        <div><dt>{{ t('settings.controls.fly.label') }}</dt><dd>{{ t('settings.controls.fly.hint') }} · <span class="kbd">Q</span><span class="kbd">W</span><span class="kbd">E</span> <span class="kbd">A</span><span class="kbd">S</span><span class="kbd">D</span> · {{ t('settings.controls.fly.arrows') }}</dd></div>
        <div><dt>{{ t('settings.controls.look') }}</dt><dd><span class="kbd">L</span></dd></div>
        <div><dt>{{ t('settings.controls.journal') }}</dt><dd><span class="kbd">J</span></dd></div>
        <div><dt>{{ t('settings.controls.home') }}</dt><dd><span class="kbd">H</span></dd></div>
        <div><dt>{{ t('settings.controls.action') }}</dt><dd><span class="kbd">F</span></dd></div>
        <div><dt>{{ t('settings.controls.build') }}</dt><dd><span class="kbd">B</span></dd></div>
        <div><dt>{{ t('settings.controls.colony') }}</dt><dd><span class="kbd">C</span> <span class="kbd">U</span></dd></div>
        <div><dt>{{ t('settings.controls.map') }}</dt><dd><span class="kbd">M</span></dd></div>
        <div><dt>{{ t('settings.controls.zoom') }}</dt><dd><span class="kbd">+</span> <span class="kbd">−</span> · {{ t('settings.controls.zoomGestures') }}</dd></div>
        <div><dt>{{ t('settings.controls.stop') }}</dt><dd><span class="kbd">Space</span></dd></div>
        <div><dt>{{ t('settings.controls.settings') }}</dt><dd><span class="kbd">Esc</span></dd></div>
      </dl>
    </section>

    <section aria-labelledby="s-save" class="save">
      <h3 id="s-save">
        {{ t('settings.save.title') }}
      </h3>
      <p class="save-intro">
        {{ t('settings.save.intro') }}
      </p>
      <div class="save-row">
        <button class="save-btn" @click="copySave">
          {{ copied ? t('settings.save.copied') : t('settings.save.copyCode') }}
        </button>
        <button class="save-btn" @click="downloadSave">
          {{ t('settings.save.download') }}
        </button>
        <button class="save-btn" :aria-expanded="loadOpen" aria-controls="save-load" @click="toggleLoad">
          {{ t('settings.save.load') }}
        </button>
      </div>

      <div v-if="fallbackCode" class="save-field">
        <label for="save-code-out">{{ t('settings.save.yourCode') }}</label>
        <textarea
          id="save-code-out"
          :value="fallbackCode"
          readonly
          rows="3"
          spellcheck="false"
          @focus="($event.target as HTMLTextAreaElement).select()"
        />
      </div>

      <div v-if="loadOpen" id="save-load" class="save-field">
        <label for="save-code-in">{{ t('settings.save.pasteCode') }}</label>
        <textarea
          id="save-code-in"
          v-model="pasted"
          rows="3"
          spellcheck="false"
          autocomplete="off"
          autocapitalize="off"
          placeholder="HIVEBOUND1:…"
        />
        <div class="save-row">
          <label class="save-btn file-btn">
            <input type="file" accept=".txt,text/plain" class="sr-only" @change="pickFile">
            {{ t('settings.save.chooseFile') }}
          </label>
          <button v-if="!confirmLoad" class="save-btn primary" :disabled="!pasted.trim()" @click="askLoad">
            {{ t('settings.save.loadThis') }}
          </button>
        </div>
        <div v-if="confirmLoad" class="confirm" role="group" aria-labelledby="save-confirm-q">
          <p id="save-confirm-q">
            {{ t('settings.save.confirmQ') }}
          </p>
          <div class="save-row">
            <button class="save-btn danger-btn" @click="doLoad">
              {{ t('settings.save.yes') }}
            </button>
            <button ref="keepBtn" class="save-btn" @click="confirmLoad = false">
              {{ t('settings.save.keep') }}
            </button>
          </div>
        </div>
      </div>

      <p class="save-status" :class="{ error: saveError }" role="status" aria-live="polite">
        {{ saveStatus }}
      </p>
    </section>

    <section class="danger">
      <button class="reset" :class="{ armed: confirmReset }" @click="reset">
        {{ confirmReset ? t('settings.reset.armed') : t('settings.reset.start') }}
      </button>
    </section>
  </UiDialog>
</template>

<style scoped>
h3 {
  font-size: 1.05rem;
  margin: 12px 0 8px;
}
.language {
  margin-top: 4px;
}
.language .seg {
  margin: 0;
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
.save-intro {
  margin: 0 12px 10px;
  font-size: 0.92rem;
  color: var(--ink-soft);
}
.save-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0 12px;
}
.save-btn {
  flex: 1 1 auto;
  min-height: 44px;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 6px 14px;
  border-radius: 14px;
  border: 2px solid var(--line);
  border-bottom-width: 4px;
  background: var(--paper-2);
  font-weight: 600;
  text-align: center;
  cursor: pointer;
  transition: transform var(--dur) var(--ease), background var(--dur);
}
.save-btn:hover {
  background: #fff;
}
.save-btn:active {
  transform: translateY(1px) scale(0.98);
}
.save-btn:disabled {
  opacity: 0.55;
  cursor: default;
  transform: none;
}
.save-btn.primary {
  background: var(--honey);
  border-color: var(--honey-deep);
}
.save-btn.danger-btn {
  background: #ffe3e0;
  border-color: #e7a3a3;
  color: #a4453f;
}
/* The native file control stays hidden; its label is the button. */
.file-btn:has(input:focus-visible) {
  box-shadow: var(--focus);
}
.save-field {
  margin: 12px 0 0;
}
.save-field > label {
  display: block;
  margin: 0 12px 6px;
  font-weight: 600;
}
.save-field textarea {
  display: block;
  width: calc(100% - 24px);
  margin: 0 12px 8px;
  padding: 10px 12px;
  border-radius: 14px;
  border: 2px solid var(--line);
  background: #fff;
  color: var(--ink);
  font: 0.85rem/1.4 ui-monospace, 'SF Mono', Menlo, monospace;
  resize: vertical;
  word-break: break-all;
  user-select: text;
}
.save-field textarea:focus-visible {
  border-color: var(--honey-deep);
  box-shadow: var(--focus) !important;
}
.confirm {
  margin: 4px 12px 0;
  padding: 10px 0;
  border-radius: 16px;
  background: #fff1e0;
  border: 2px solid #f3c9a0;
}
.confirm p {
  margin: 0 12px 8px;
  font-weight: 600;
}
.save-status {
  min-height: 1.4em;
  margin: 8px 12px 0;
  font-size: 0.92rem;
  font-weight: 600;
}
.save-status.error {
  color: #a4453f;
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
.slider {
  display: grid;
  grid-template-columns: 8.5em 1fr 3em;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  font-weight: 600;
}
.slider input[type='range'] {
  width: 100%;
  height: 32px;
  margin: 0;
  background: transparent;
  appearance: none;
  -webkit-appearance: none;
  cursor: pointer;
  /* Filled part of the track, set from the value inline. */
  --fill: 50%;
}
.slider input[type='range']::-webkit-slider-runnable-track {
  height: 12px;
  border-radius: 99px;
  border: 2px solid var(--line);
  background: linear-gradient(90deg, var(--honey) var(--fill), var(--paper-2) var(--fill));
}
.slider input[type='range']::-moz-range-track {
  height: 12px;
  border-radius: 99px;
  border: 2px solid var(--line);
  background: linear-gradient(90deg, var(--honey) var(--fill), var(--paper-2) var(--fill));
}
.slider input[type='range']::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 26px;
  height: 26px;
  margin-top: -9px;
  border-radius: 50%;
  border: 3px solid var(--ink);
  background: #fffaf0;
  box-shadow: 0 2px 0 rgba(91, 58, 36, 0.25);
}
.slider input[type='range']::-moz-range-thumb {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 3px solid var(--ink);
  background: #fffaf0;
}
.slider input[type='range']:focus-visible {
  outline: 3px solid var(--honey-deep);
  outline-offset: 2px;
  border-radius: 99px;
}
.slider .val {
  text-align: right;
  color: var(--ink-soft);
  font-weight: 500;
}
/* Fingers need a taller hit area and a bigger knob than a mouse does. */
@media (pointer: coarse) {
  .slider input[type='range'] {
    height: 44px;
  }
  .slider input[type='range']::-webkit-slider-thumb {
    width: 32px;
    height: 32px;
    margin-top: -12px;
  }
  .slider input[type='range']::-moz-range-thumb {
    width: 26px;
    height: 26px;
  }
}
</style>
