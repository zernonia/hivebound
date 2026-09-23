<script setup lang="ts">
import { useGame } from '~/stores/game'

/**
 * Polite live region for screen readers. Two alternating regions guarantee
 * repeated identical messages are still announced.
 */
const game = useGame()
const a = ref('')
const b = ref('')
watch(() => game.announceTick, (tick) => {
  if (tick % 2) {
    a.value = game.announcement
    b.value = ''
  }
  else {
    b.value = game.announcement
    a.value = ''
  }
})
</script>

<template>
  <div class="sr-only" aria-live="polite" aria-atomic="true">{{ a }}</div>
  <div class="sr-only" aria-live="polite" aria-atomic="true">{{ b }}</div>
</template>
