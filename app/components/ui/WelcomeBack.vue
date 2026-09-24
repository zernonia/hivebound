<script setup lang="ts">
import { ALL_RESOURCES, RESOURCE_INFO } from '~/utils/resources'

/* "While you were away…": what the helpers and buildings made since the last visit. */
const { summary, dismiss } = useWelcomeBack()

const awayText = computed(() => {
  const ms = summary.value?.awayMs ?? 0
  const mins = Math.round(ms / 60000)
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'}`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  const hours = `${h} hour${h === 1 ? '' : 's'}`
  return m ? `${hours} ${m} min` : hours
})
const gains = computed(() => ALL_RESOURCES.filter(r => summary.value?.gains[r]).map(r => ({ r, n: summary.value!.gains[r]! })))
const helpersText = computed(() => {
  const h = summary.value?.helpers ?? []
  if (!h.length) return ''
  if (h.length === 1) return `${h[0]} kept busy.`
  if (h.length <= 3) return `${h.slice(0, -1).join(', ')} and ${h.at(-1)} kept busy.`
  return `${h.slice(0, 2).join(', ')} and ${h.length - 2} more friends kept busy.`
})
</script>

<template>
  <UiDialog :open="!!summary" title="Welcome back!" @close="dismiss">
    <template v-if="summary">
      <p class="lead">
        You were away for {{ awayText }}. While you were gone:
      </p>
      <ul class="gains">
        <li v-for="g in gains" :key="g.r">
          <ResourceIcon :name="g.r" />
          <strong>+{{ g.n }}</strong> {{ RESOURCE_INFO[g.r].name }}
        </li>
      </ul>
      <p v-if="helpersText" class="note">
        {{ helpersText }}
      </p>
      <p v-if="summary.capped" class="note">
        Everyone stopped for a nap after 8 hours.
      </p>
      <button class="chip-btn primary ok" autofocus @click="dismiss">
        Lovely
      </button>
    </template>
  </UiDialog>
</template>

<style scoped>
.lead {
  margin: 0 0 10px;
}
.gains {
  list-style: none;
  margin: 0 0 10px;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.gains li {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 999px;
  background: var(--paper-2);
  border: 2px solid var(--line);
}
.gains :deep(.res-icon) {
  width: 22px;
  height: 22px;
}
.note {
  margin: 0 0 8px;
  color: var(--ink-soft);
}
.ok {
  margin-top: 6px;
}
</style>
