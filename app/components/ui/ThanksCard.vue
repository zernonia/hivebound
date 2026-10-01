<script setup lang="ts">
import { useColony } from '~/stores/colony'
import { useGame } from '~/stores/game'
import { useQueen } from '~/stores/queen'
import { KEEPSAKE_LIST } from '~/utils/keepsakes'
import { POIS } from '~/utils/world'

/*
 * "Thank you for playing": shown once, when the last story request is handed in. A few
 * numbers from the journey, a note from the maker, and the little wishes carry on after.
 */
const queen = useQueen()
const game = useGame()
const colony = useColony()
const { t } = useI18n()

const stats = computed(() => [
  { n: game.day, label: t('thanks.day', game.day) },
  { n: game.steps, label: t('thanks.hexesFlown') },
  { n: colony.bees.length, label: t('thanks.friend', colony.bees.length) },
  { n: `${game.visitedPois.length}/${POIS.length}`, label: t('thanks.places') },
  { n: `${game.keepsakes.length}/${KEEPSAKE_LIST.length}`, label: t('thanks.keepsakes') },
  { n: queen.hiveLevel, label: t('thanks.hiveLevel') },
])

function close() {
  queen.showThanks = false
}
</script>

<template>
  <UiDialog :open="queen.showThanks" :title="t('thanks.title')" @close="close">
    <div class="thanks">
      <img class="art" src="/icon.svg" alt="" width="140" height="140">
      <p class="queen">
        “{{ t('thanks.quote') }}”
        <span class="who">{{ t('thanks.theQueen') }}</span>
      </p>
      <ul class="stats" :aria-label="t('thanks.statsAria')">
        <li v-for="s in stats" :key="s.label">
          <strong>{{ s.n }}</strong>
          <span>{{ s.label }}</span>
        </li>
      </ul>
      <p class="note">
        {{ t('thanks.note') }}
      </p>
      <p class="note soft">
        {{ t('thanks.noteSoft') }}
      </p>
      <button class="chip-btn primary ok" autofocus @click="close">
        {{ t('thanks.keepPlaying') }}
      </button>
    </div>
  </UiDialog>
</template>

<style scoped>
.thanks {
  display: grid;
  gap: 12px;
}
.art {
  display: block;
  width: 140px;
  height: 140px;
  margin: -4px auto 0;
}
.queen {
  margin: 0;
  font-family: var(--font-hand, inherit);
  font-size: 1.1rem;
  line-height: 1.45;
  text-align: center;
}
.who {
  display: block;
  margin-top: 4px;
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--honey-deep);
}
.stats {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.stats li {
  display: grid;
  justify-items: center;
  gap: 2px;
  padding: 8px 4px;
  border-radius: 14px;
  background: var(--paper-2);
  border: 2px solid var(--line);
}
.stats strong {
  font-size: 1.25rem;
}
.stats span {
  font-size: 0.8rem;
  color: var(--ink-soft);
}
.note {
  margin: 0;
  line-height: 1.5;
}
.note.soft {
  color: var(--ink-soft);
  font-size: 0.92rem;
}
.ok {
  justify-self: center;
  min-width: 160px;
}
</style>
