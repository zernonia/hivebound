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

const stats = computed(() => [
  { n: game.day, label: game.day === 1 ? 'day' : 'days' },
  { n: game.steps, label: 'hexes flown' },
  { n: colony.bees.length, label: colony.bees.length === 1 ? 'friend' : 'friends' },
  { n: `${game.visitedPois.length}/${POIS.length}`, label: 'places' },
  { n: `${game.keepsakes.length}/${KEEPSAKE_LIST.length}`, label: 'keepsakes' },
  { n: queen.hiveLevel, label: 'hive level' },
])

function close() {
  queen.showThanks = false
}
</script>

<template>
  <UiDialog :open="queen.showThanks" title="Thank you for playing!" @close="close">
    <div class="thanks">
      <img class="art" src="/icon.svg" alt="" width="140" height="140">
      <p class="queen">
        “You flew further than any bee in a hundred summers, and brought a whole meadow home with you. The hive will hum about this for a very long time.”
        <span class="who">The Queen</span>
      </p>
      <ul class="stats" aria-label="Your journey">
        <li v-for="s in stats" :key="s.label">
          <strong>{{ s.n }}</strong>
          <span>{{ s.label }}</span>
        </li>
      </ul>
      <p class="note">
        That's the whole story so far. Thank you so much for playing Hivebound: it was made with a lot of love, and I hope it gave you a few calm, happy moments. There's more to come.
      </p>
      <p class="note soft">
        The hive keeps going: the Queen's little wishes carry on, your helpers keep working, and every place and keepsake is still out there to enjoy.
      </p>
      <button class="chip-btn primary ok" autofocus @click="close">
        Keep playing
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
