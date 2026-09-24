<script setup lang="ts">
import { hexKey } from '~/utils/hex'
import { KEEPSAKES, KEEPSAKE_LIST, type KeepsakeSlot } from '~/utils/keepsakes'
import { POIS, POI_BY_ID, useWorldData } from '~/utils/world'
import { useGame } from '~/stores/game'

const game = useGame()
const world = useWorldData()
const tab = ref<'entries' | 'places' | 'keepsakes'>('entries')
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

const SLOT_LABEL: Record<KeepsakeSlot, string> = { head: 'Head', face: 'Face', neck: 'Neck', side: 'Side', back: 'Back', tail: 'Tail' }
const keepsakes = computed(() => KEEPSAKE_LIST.map((id) => {
  const def = KEEPSAKES[id]
  const found = game.keepsakes.includes(id)
  const where = def.from === 'queen' ? 'A gift from the Queen, one day.' : `Waiting at ${placeSeen(def.from) ? POI_BY_ID[def.from].name : 'a place you haven\'t found yet'}.`
  return { id, def, found, worn: game.wearing[def.slot] === id, where }
}))
function placeSeen(id: keyof typeof POI_BY_ID) {
  void game.revealTick
  const loc = world.pois.find(x => x.id === id)
  return !!loc && game.discovered.has(hexKey(loc.hex))
}

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
      <button role="tab" :aria-selected="tab === 'keepsakes'" :class="{ on: tab === 'keepsakes' }" @click="tab = 'keepsakes'">
        Keepsakes <span class="count">{{ game.keepsakes.length }}/{{ KEEPSAKE_LIST.length }}</span>
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

    <div v-else-if="tab === 'keepsakes'" class="keepsakes" role="tabpanel">
      <p class="hint">
        Things to wear, found around the island. One per spot: head, face, neck, side, back and tail.
      </p>
      <ul>
        <li v-for="k in keepsakes" :key="k.id" :class="{ found: k.found, worn: k.worn }">
          <div class="meta">
            <strong>{{ k.found ? k.def.name : '???' }}</strong>
            <span class="slot">{{ SLOT_LABEL[k.def.slot] }}</span>
            <span>{{ k.found ? k.def.blurb : k.where }}</span>
          </div>
          <button
            v-if="k.found"
            class="chip-btn"
            :class="{ primary: !k.worn }"
            :aria-pressed="k.worn"
            @click="game.toggleWear(k.id)"
          >
            {{ k.worn ? 'Take off' : 'Wear' }}
          </button>
        </li>
      </ul>
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
.keepsakes .hint {
  margin: 0 0 10px;
  color: var(--ink-soft);
}
.keepsakes ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 10px;
}
.keepsakes li {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 16px;
  border: 2px dashed var(--line);
  background: var(--paper);
}
.keepsakes li.found {
  border-style: solid;
}
.keepsakes li.worn {
  border-color: var(--honey-deep);
  background: color-mix(in srgb, var(--honey) 25%, var(--paper));
}
.keepsakes .meta {
  flex: 1;
  display: grid;
  gap: 2px;
  font-size: 0.9rem;
}
.keepsakes .slot {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--honey-deep);
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
