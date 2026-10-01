<script setup lang="ts">
import { MAX_BEES_LIMIT, MIN_BEES, RECOMMENDED_BEES, useSettings } from '~/stores/settings'

const settings = useSettings()
const id = useId()
const high = computed(() => settings.maxBees > RECOMMENDED_BEES)
const valueText = computed(() => `${settings.maxBees} bees${high.value ? `, above the recommended ${RECOMMENDED_BEES}` : ''}`)
</script>

<template>
  <div class="bee-limit" :class="{ high }">
    <div class="slider">
      <label :for="`${id}-range`">Most bees</label>
      <input
        :id="`${id}-range`"
        type="range"
        :value="settings.maxBees"
        :style="{ '--fill': `${((settings.maxBees - MIN_BEES) / (MAX_BEES_LIMIT - MIN_BEES)) * 100}%` }"
        :min="MIN_BEES"
        :max="MAX_BEES_LIMIT"
        step="1"
        :aria-valuetext="valueText"
        :aria-describedby="`${id}-hint`"
        @input="settings.setMaxBees(Number(($event.target as HTMLInputElement).value))"
      >
      <span class="val" aria-hidden="true">{{ settings.maxBees }}</span>
    </div>
    <p :id="`${id}-hint`" class="hint">
      {{ RECOMMENDED_BEES }} is recommended. More bees can slow down less capable devices.
    </p>
    <button v-if="settings.maxBees !== RECOMMENDED_BEES" class="reco" @click="settings.setMaxBees(RECOMMENDED_BEES)">
      Use recommended ({{ RECOMMENDED_BEES }})
    </button>
  </div>
</template>

<style scoped>
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
  background: var(--paper);
  box-shadow: 0 2px 0 rgba(91, 58, 36, 0.25);
}
.slider input[type='range']::-moz-range-thumb {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 3px solid var(--ink);
  background: var(--paper);
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
.hint {
  margin: 2px 0 0;
  font-size: 0.85rem;
  color: var(--ink-soft);
}
/* Above the recommended count the readout and track edge turn honey-deep and the hint gets a warm card. */
.high .slider .val {
  color: var(--honey-deep);
  font-weight: 700;
}
.high .slider input[type='range']::-webkit-slider-runnable-track,
.high .slider input[type='range']::-moz-range-track {
  border-color: var(--honey-deep);
}
.high .hint {
  padding: 6px 10px;
  border-radius: 12px;
  background: var(--paper-2);
  border: 2px solid var(--honey-deep);
  color: var(--ink);
}
.reco {
  margin-top: 6px;
  padding: 6px 0;
  min-height: 44px;
  border: none;
  background: transparent;
  color: var(--ink);
  font-weight: 600;
  text-decoration: underline;
  cursor: pointer;
}
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
    width: 32px;
    height: 32px;
  }
}
@media (max-width: 420px) {
  .slider {
    grid-template-columns: 1fr 3em;
  }
  .slider input[type='range'] {
    grid-column: 1 / -1;
    grid-row: 2;
  }
}
</style>
