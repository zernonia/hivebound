<script setup lang="ts">
import { ALL_RESOURCES, resourceName } from '~/utils/resources'
import { joinList } from '~/utils/i18n'

/* "While you were away…": what the helpers and buildings made since the last visit. */
const { summary, dismiss } = useWelcomeBack()
const { t } = useI18n()

const awayText = computed(() => {
  const ms = summary.value?.awayMs ?? 0
  const mins = Math.round(ms / 60000)
  if (mins < 60) return t('wb.min', mins)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  const hours = t('wb.hour', h)
  return m ? `${hours} ${m} min` : hours
})
const gains = computed(() => ALL_RESOURCES.filter(r => summary.value?.gains[r]).map(r => ({ r, n: summary.value!.gains[r]! })))
const helpersText = computed(() => {
  const h = summary.value?.helpers ?? []
  if (!h.length) return ''
  if (h.length === 1) return t('wb.oneBusy', { name: h[0] })
  if (h.length <= 3) return t('wb.fewBusy', { names: joinList(h) })
  return t('wb.manyBusy', { names: joinList(h.slice(0, 2)), n: h.length - 2 })
})
</script>

<template>
  <UiDialog :open="!!summary" :title="t('wb.title')" @close="dismiss">
    <template v-if="summary">
      <p class="lead">
        {{ t('wb.lead', { away: awayText }) }}
      </p>
      <ul class="gains">
        <li v-for="g in gains" :key="g.r">
          <ResourceIcon :name="g.r" />
          <strong>+{{ g.n }}</strong> {{ resourceName(g.r) }}
        </li>
      </ul>
      <p v-if="helpersText" class="note">
        {{ helpersText }}
      </p>
      <p v-if="summary.capped" class="note">
        {{ t('wb.capped') }}
      </p>
      <button class="chip-btn primary ok" autofocus @click="dismiss">
        {{ t('wb.lovely') }}
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
