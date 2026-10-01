<script setup lang="ts">
import { hexKey } from '~/utils/hex'
import { KEEPSAKES, KEEPSAKE_LIST, keepsakeName, type KeepsakeSlot } from '~/utils/keepsakes'
import { POIS, POI_BY_ID, poiAt, poiName, useWorldData } from '~/utils/world'
import { journalBody, journalTitle, useGame, type JournalEntry } from '~/stores/game'

const game = useGame()
const world = useWorldData()
const { t } = useI18n()
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

const slotLabel = (slot: KeepsakeSlot) => t(`journal.slots.${slot}`)
const keepsakes = computed(() => KEEPSAKE_LIST.map((id) => {
  const def = KEEPSAKES[id]
  const found = game.keepsakes.includes(id)
  const where = def.from === 'queen'
    ? t('journal.keepsake.queenGift')
    : t('journal.keepsake.waiting', { at: placeSeen(def.from) ? poiAt(def.from) : t('journal.keepsake.unfound') })
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
  <UiDialog :open="game.journalOpen" :title="t('journal.title')" wide @close="game.journalOpen = false">
    <div class="tabs" role="tablist" :aria-label="t('journal.sectionsAria')">
      <button role="tab" :aria-selected="tab === 'entries'" :class="{ on: tab === 'entries' }" @click="tab = 'entries'">
        {{ t('journal.tabEntries') }} <span class="count">{{ game.journal.length }}</span>
      </button>
      <button role="tab" :aria-selected="tab === 'places'" :class="{ on: tab === 'places' }" @click="tab = 'places'">
        {{ t('journal.tabPlaces') }} <span class="count">{{ game.visitedPois.length }}/{{ POIS.length }}</span>
      </button>
      <button role="tab" :aria-selected="tab === 'keepsakes'" :class="{ on: tab === 'keepsakes' }" @click="tab = 'keepsakes'">
        {{ t('journal.tabKeepsakes') }} <span class="count">{{ game.keepsakes.length }}/{{ KEEPSAKE_LIST.length }}</span>
      </button>
    </div>

    <div v-if="tab === 'entries'" class="book" role="tabpanel">
      <nav class="index" :aria-label="t('journal.indexAria')">
        <ul>
          <li v-for="e in entries" :key="e.id">
            <button :class="{ on: selected?.id === e.id }" :aria-current="selected?.id === e.id ? 'true' : undefined" @click="selectedId = e.id">
              <span class="dot" :class="{ unread: e.unread }" aria-hidden="true" />
              <span class="t">{{ journalTitle(e) }}</span>
              <span v-if="e.unread" class="sr-only">{{ t('journal.isNew') }}</span>
            </button>
          </li>
        </ul>
      </nav>
      <article v-if="selected" class="page" aria-live="polite">
        <div class="art-wrap">
          <JournalArt :subject="selected.subject" />
        </div>
        <p class="day">
          {{ t('journal.dayN', { n: selected.day }) }}
        </p>
        <h3>{{ journalTitle(selected) }}</h3>
        <p class="text">
          {{ journalBody(selected) }}
        </p>
      </article>
    </div>

    <div v-else-if="tab === 'keepsakes'" class="keepsakes" role="tabpanel">
      <p class="hint">
        {{ t('journal.keepsakesHint') }}
      </p>
      <ul>
        <li v-for="k in keepsakes" :key="k.id" :class="{ found: k.found, worn: k.worn }">
          <div class="meta">
            <strong>{{ k.found ? keepsakeName(k.id) : '???' }}</strong>
            <span class="slot">{{ slotLabel(k.def.slot) }}</span>
            <span>{{ k.found ? t(`keepsakes.${k.id}.blurb`) : k.where }}</span>
          </div>
          <button
            v-if="k.found"
            class="chip-btn"
            :class="{ primary: !k.worn }"
            :aria-pressed="k.worn"
            @click="game.toggleWear(k.id)"
          >
            {{ k.worn ? t('journal.takeOff') : t('journal.wear') }}
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
            <strong>{{ p.seen ? poiName(p.id) : t('journal.undiscovered') }}</strong>
            <span>{{ p.visited ? t('journal.visited') : p.seen ? t('journal.spotted') : t('journal.somewhere') }}</span>
          </div>
        </li>
      </ul>
    </div>
  </UiDialog>
</template>

<style scoped>
.tabs {
  display: flex;
  flex-wrap: wrap;
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
  grid-template-columns: minmax(180px, 240px) minmax(0, 1fr);
  gap: 18px;
  min-height: 360px;
}
/* Grid items default to min-width: auto, which lets the scrolling index push the page wider than the dialog. */
.book > * {
  min-width: 0;
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
    grid-template-columns: minmax(0, 1fr);
    min-height: 0;
  }
  .page {
    padding: 14px 16px 18px;
  }
  .art-wrap {
    max-width: 160px;
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
