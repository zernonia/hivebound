<script setup lang="ts">
import { useGame } from '~/stores/game'
import { useHive } from '~/stores/hive'
import { MAX_COLONY, useColony } from '~/stores/colony'
import { useQueen } from '~/stores/queen'

/* The Queen's current request, pinned under the location card: what's needed and how close. */
const queen = useQueen()
const game = useGame()
const hive = useHive()
const colony = useColony()

const lines = computed(() => {
  void hive.rev
  void colony.rev
  void game.visitedPois.length
  return queen.lines()
})
const ready = computed(() => lines.value.length > 0 && lines.value.every(l => l.done))
/** The request wants a new friend but every bed is taken: say how to make room, so it never feels stuck. */
const needsRoom = computed(() => {
  void colony.rev
  void hive.rev
  if (colony.hasRoom) return false
  return queen.current.goals.some(g =>
    (g.kind === 'species' && colony.bees.filter(b => b.species === g.species).length < g.count)
    || (g.kind === 'friends' && colony.bees.length < g.count),
  )
})
const open = ref(true)
</script>

<template>
  <section class="queen panel" :class="{ ready }" aria-labelledby="queen-title">
    <button class="head" :aria-expanded="open" aria-controls="queen-body" @click="open = !open">
      <span class="crown" aria-hidden="true">♛</span>
      <span id="queen-title" class="t">{{ queen.current.title }}</span>
      <span class="chev" :class="{ open }" aria-hidden="true">▾</span>
    </button>
    <div v-show="open" id="queen-body">
      <ul class="lines">
        <li v-for="l in lines" :key="l.label" :class="{ done: l.done }">
          <ResourceIcon v-if="l.resource" :name="l.resource" />
          <span class="tick" aria-hidden="true">{{ l.done ? '✓' : '·' }}</span>
          <span>{{ l.label }}</span>
          <span v-if="l.need > 1" class="n">{{ l.have }}/{{ l.need }}</span>
          <span class="sr-only">{{ l.done ? 'done' : 'not yet' }}</span>
        </li>
      </ul>
      <p v-if="ready" class="go" aria-live="polite">
        Ready! Visit the Queen in the hive.
      </p>
      <p v-else-if="needsRoom" class="room">
        {{ colony.capacity >= MAX_COLONY
          ? 'Every bed is taken. Dismiss a helper from the Colony page to make room for a new friend.'
          : 'The hive is full. Build a Bee Room, or dismiss a helper from the Colony page, to make room for a new friend.' }}
      </p>
    </div>
  </section>
</template>

<style scoped>
.queen {
  padding: 6px 12px 8px;
  max-width: 260px;
  font-size: 0.88rem;
}
.head {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-height: 44px;
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  font-weight: 700;
  text-align: left;
  color: var(--ink);
}
.crown {
  color: var(--honey-deep);
}
.t {
  flex: 1;
}
.chev {
  transition: transform 200ms var(--ease);
  transform: rotate(-90deg);
}
.chev.open {
  transform: none;
}
.lines {
  list-style: none;
  margin: 2px 0 0;
  padding: 0;
  display: grid;
  gap: 2px;
}
.lines li {
  display: flex;
  align-items: center;
  gap: 5px;
  color: var(--ink-soft);
}
.lines li.done {
  color: #3f8f35;
}
.lines :deep(.res-icon) {
  width: 1.1em;
  height: 1.1em;
}
.tick {
  width: 0.8em;
  text-align: center;
  font-weight: 700;
}
.n {
  margin-left: auto;
  font-variant-numeric: tabular-nums;
}
.go {
  margin: 4px 0 0;
  font-weight: 700;
  color: #3f8f35;
}
.ready {
  border-color: #7fcf6a;
}
.room {
  margin: 6px 0 0;
  font-size: 0.8rem;
  line-height: 1.35;
  color: var(--ink-soft);
}
</style>
