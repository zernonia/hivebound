<script setup lang="ts">
import { hexKey } from '~/utils/hex'
import { POIS, useWorldData } from '~/utils/world'
import { useGame } from '~/stores/game'

const game = useGame()
const world = useWorldData()
const tab = ref<'entries' | 'places'>('entries')
const selectedId = ref<string | null>(null)

const entries = computed(() => [...game.journal].reverse())
const selected = computed(() => game.journal.find(e => e.id === selectedId.value) ?? entries.value[0])

watch(() => game.journalOpen, (open) => {
  if (open) {
    selectedId.value = entries.value.find(e => e.unread)?.id ?? entries.value[0]?.id ?? null
    tab.value = 'entries'
  }
  else {
    game.markJournalRead()
  }
})

const places = computed(() => {
  void game.revealTick
  return POIS.map((p) => {
    const loc = world.pois.find(x => x.id === p.id)
    const seen = !!loc && game.discovered.has(hexKey(loc.hex))
    return { ...p, seen, visited: game.visitedPois.includes(p.id) }
  })
})
</script>

<template>
  <UiDialog :open="game.journalOpen" title="My Journal" wide @close="game.journalOpen = false">
    <div class="tabs" role="tablist" aria-label="Journal sections">
      <button role="tab" :aria-selected="tab === 'entries'" :class="{ on: tab === 'entries' }" @click="tab = 'entries'">
        Entries <span class="count">{{ game.journal.length }}</span>
      </button>
      <button role="tab" :aria-selected="tab === 'places'" :class="{ on: tab === 'places' }" @click="tab = 'places'">
        Places <span class="count">{{ game.visitedPois.length }}/{{ POIS.length }}</span>
      </button>
    </div>

    <div v-if="tab === 'entries'" class="book" role="tabpanel">
      <nav class="index" aria-label="Journal entries">
        <ul>
          <li v-for="e in entries" :key="e.id">
            <button :class="{ on: selected?.id === e.id }" :aria-current="selected?.id === e.id ? 'true' : undefined" @click="selectedId = e.id">
              <span class="dot" :class="{ unread: e.unread }" aria-hidden="true" />
              <span class="t">{{ e.title }}</span>
              <span v-if="e.unread" class="sr-only">(new)</span>
            </button>
          </li>
        </ul>
      </nav>
      <article v-if="selected" class="page" aria-live="polite">
        <div class="art-wrap">
          <JournalArt :subject="selected.subject" />
        </div>
        <p class="day">
          Day {{ selected.day }}
        </p>
        <h3>{{ selected.title }}</h3>
        <p class="text">
          {{ selected.body }}
        </p>
      </article>
    </div>

    <div v-else class="places" role="tabpanel">
      <ul>
        <li v-for="p in places" :key="p.id" :class="{ seen: p.seen, visited: p.visited }">
          <div class="thumb">
            <JournalArt v-if="p.seen" :subject="p.id" />
            <span v-else aria-hidden="true">?</span>
          </div>
          <div class="meta">
            <strong>{{ p.seen ? p.name : 'Undiscovered' }}</strong>
            <span>{{ p.visited ? 'Visited' : p.seen ? 'Spotted, not visited yet' : 'Somewhere out there…' }}</span>
          </div>
        </li>
      </ul>
    </div>
  </UiDialog>
</template>

<style scoped>
.tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 14px;
}
.tabs button {
  min-height: 44px;
  padding: 0 16px;
  border-radius: 999px;
  border: 2px solid var(--line);
  background: var(--paper);
  font-weight: 600;
}
.tabs button.on {
  background: var(--honey);
  border-color: var(--honey-deep);
  color: #3a2618;
}
.count {
  opacity: 0.7;
  margin-left: 4px;
}
.book {
  display: grid;
  grid-template-columns: minmax(180px, 240px) 1fr;
  gap: 18px;
  min-height: 360px;
}
.index ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.index button {
  width: 100%;
  min-height: 44px;
  display: flex;
  align-items: center;
  gap: 10px;
  text-align: left;
  padding: 6px 12px;
  border: none;
  border-radius: 12px;
  background: transparent;
  font-weight: 500;
}
.index button:hover {
  background: var(--paper-2);
}
.index button.on {
  background: var(--paper-2);
  font-weight: 700;
}
.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--line);
  flex: none;
}
.dot.unread {
  background: #ff7a8a;
}
.page {
  background:
    repeating-linear-gradient(180deg, transparent 0 31px, rgba(200, 170, 130, 0.25) 31px 32px),
    #fffdf6;
  border-radius: 18px;
  border: 2px solid var(--line);
  padding: 18px 22px 22px;
  font-family: var(--font-hand);
  box-shadow: inset 6px 0 0 rgba(255, 182, 39, 0.35);
}
.art-wrap {
  max-width: 220px;
  margin: 0 auto 6px;
}
.day {
  margin: 0;
  color: var(--ink-soft);
  font-size: 1.05rem;
}
h3 {
  margin: 2px 0 8px;
  font-size: 1.7rem;
  font-weight: 400;
}
.text {
  margin: 0;
  font-size: 1.3rem;
  line-height: 32px;
}
.places ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
}
.places li {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 10px;
  border-radius: 16px;
  border: 2px dashed var(--line);
}
.places li.seen {
  border-style: solid;
  background: #fffdf6;
}
.places li.visited {
  border-color: var(--honey);
}
.thumb {
  width: 64px;
  height: 52px;
  flex: none;
  display: grid;
  place-items: center;
  font-size: 1.6rem;
  font-weight: 700;
  color: var(--ink-soft);
}
.meta {
  display: flex;
  flex-direction: column;
  font-size: 0.95rem;
}
.meta span {
  color: var(--ink-soft);
  font-size: 0.85rem;
}
@media (max-width: 640px) {
  .book {
    grid-template-columns: 1fr;
  }
  .index ul {
    flex-direction: row;
    overflow-x: auto;
    padding-bottom: 4px;
  }
  .index button {
    white-space: nowrap;
  }
}
</style>
