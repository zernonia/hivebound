<script setup lang="ts">
import { RECOMMENDED_BEES, useSettings } from '~/stores/settings'

/* Shown once at the start: the bee limit, and why 20 is the friendly number. */
const settings = useSettings()
const { summary } = useWelcomeBack()
const open = computed(() => !settings.beeLimitAcknowledged && !summary.value)
// Closing because the welcome-back card took over doesn't count as reading it.
const done = () => {
  if (!summary.value) settings.beeLimitAcknowledged = true
}
const descId = useId()
</script>

<template>
  <UiDialog :open="open" title="How big a hive?" :aria-describedby="descId" @close="done">
    <p :id="descId" class="lead">
      More helper bees make the hive lively, but every bee is drawn on screen, so a big colony can slow things down on older phones and laptops.
    </p>
    <p class="lead">
      Up to {{ RECOMMENDED_BEES }} is recommended for most people. You can change this any time in Settings.
    </p>
    <BeeLimitControl />
    <button class="chip-btn primary ok" autofocus @click="done">
      Got it
    </button>
  </UiDialog>
</template>

<style scoped>
.lead {
  margin: 0 0 10px;
}
.ok {
  margin-top: 10px;
}
</style>
