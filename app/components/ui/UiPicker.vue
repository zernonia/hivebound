<script setup lang="ts">
/*
 * A small in-theme dropdown, used instead of a native <select> so it matches the rest of the
 * UI. The list floats over everything (teleported to <body>, fixed to the button), so opening
 * it never shifts the layout or gets clipped by a scrolling panel; it opens upwards when
 * there's no room below. Works like a listbox: arrows move, Enter/Space picks, Esc closes.
 * Keys it handles don't reach the game, so arrowing through options never steers the bee.
 */
export interface PickerOption {
  value: string
  label: string
  /** Small extra text on the right, e.g. "1/2". */
  note?: string
  disabled?: boolean
  /** A colour swatch shown before the label (e.g. a bee's body colour). */
  swatch?: { fill: string, border: string }
}

const props = defineProps<{
  options: PickerOption[]
  /** The picked value, or null for none (shows the placeholder). */
  modelValue: string | null
  placeholder: string
  /** Accessible name for the control. */
  label: string
  /** Highlight the button when something is picked. */
  highlight?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const open = ref(false)
const active = ref(0)
const root = ref<HTMLDivElement>()
const btn = ref<HTMLButtonElement>()
const list = ref<HTMLUListElement>()
/** Where the floating list sits, from the button's position on screen. */
const pos = ref({ left: 0, width: 0, top: 0 as number | null, bottom: null as number | null })

function place() {
  const r = btn.value?.getBoundingClientRect()
  if (!r) return
  const want = Math.min(260, props.options.length * 42 + 12)
  const below = window.innerHeight - r.bottom
  const up = below < want + 8 && r.top > below
  pos.value = {
    left: r.left,
    width: r.width,
    top: up ? null : r.bottom + 4,
    bottom: up ? window.innerHeight - r.top + 4 : null,
  }
}
// Follow the button if the panel scrolls or the window resizes while open.
const follow = () => (open.value ? place() : undefined)
onMounted(() => {
  window.addEventListener('scroll', follow, true)
  window.addEventListener('resize', follow)
})
onBeforeUnmount(() => {
  window.removeEventListener('scroll', follow, true)
  window.removeEventListener('resize', follow)
})
const id = useId()

const current = computed(() => props.options.find(o => o.value === props.modelValue) ?? null)

function enabledIndex(from: number, step: number) {
  const n = props.options.length
  for (let i = 1; i <= n; i++) {
    const j = (from + step * i + n * 2) % n
    if (!props.options[j]!.disabled) return j
  }
  return from
}

async function show() {
  place()
  open.value = true
  const sel = props.options.findIndex(o => o.value === props.modelValue && !o.disabled)
  active.value = sel >= 0 ? sel : enabledIndex(-1, 1)
  await nextTick()
  focusActive()
}
function close(refocus = true) {
  open.value = false
  if (refocus) btn.value?.focus()
}
function toggle() {
  if (open.value) close()
  else show()
}
function focusActive() {
  list.value?.querySelectorAll<HTMLElement>('[role="option"]')[active.value]?.focus()
}
function pick(i: number) {
  const o = props.options[i]
  if (!o || o.disabled) return
  emit('update:modelValue', o.value)
  close()
}

function onButtonKey(e: KeyboardEvent) {
  if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
    e.preventDefault()
    e.stopPropagation()
    show()
  }
}
function onListKey(e: KeyboardEvent) {
  const handled = ['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' ', 'Escape', 'Tab']
  if (!handled.includes(e.key)) {
    // Letters etc. shouldn't steer the bee while the list is open either.
    e.stopPropagation()
    return
  }
  e.stopPropagation()
  if (e.key === 'Tab') {
    close(false)
    return
  }
  e.preventDefault()
  if (e.key === 'ArrowDown') active.value = enabledIndex(active.value, 1)
  else if (e.key === 'ArrowUp') active.value = enabledIndex(active.value, -1)
  else if (e.key === 'Home') active.value = enabledIndex(-1, 1)
  else if (e.key === 'End') active.value = enabledIndex(props.options.length, -1)
  else if (e.key === 'Escape') return close()
  else return pick(active.value)
  focusActive()
}
function onFocusOut(e: FocusEvent) {
  const next = e.relatedTarget as Node | null
  // The list lives elsewhere in the page (teleported), so check both halves.
  if (next && (root.value?.contains(next) || list.value?.contains(next))) return
  open.value = false
}
</script>

<template>
  <div ref="root" class="picker" :class="{ open }" @focusout="onFocusOut">
    <button
      ref="btn"
      type="button"
      class="trigger"
      :class="{ on: highlight && current }"
      aria-haspopup="listbox"
      :aria-expanded="open"
      :aria-controls="`${id}-list`"
      :aria-label="`${label}: ${current ? current.label : placeholder}`"
      @click="toggle"
      @keydown="onButtonKey"
    >
      <span v-if="current?.swatch" class="swatch" :style="{ background: current.swatch.fill, borderColor: current.swatch.border }" aria-hidden="true" />
      <span class="text" :class="{ placeholder: !current }">{{ current ? current.label : placeholder }}</span>
      <span v-if="current?.note" class="note">{{ current.note }}</span>
      <span class="chev" aria-hidden="true">▾</span>
    </button>
    <Teleport to="body">
    <ul
      v-if="open"
      :id="`${id}-list`"
      ref="list"
      role="listbox"
      :aria-label="label"
      class="picker-list"
      :class="{ up: pos.bottom != null }"
      :style="{ left: `${pos.left}px`, width: `${pos.width}px`, top: pos.top != null ? `${pos.top}px` : undefined, bottom: pos.bottom != null ? `${pos.bottom}px` : undefined }"
      @keydown="onListKey"
      @focusout="onFocusOut"
    >
      <li
        v-for="(o, i) in options"
        :key="o.value"
        role="option"
        :tabindex="i === active ? 0 : -1"
        :aria-selected="o.value === modelValue"
        :aria-disabled="o.disabled || undefined"
        :class="{ sel: o.value === modelValue, disabled: o.disabled, active: i === active }"
        @click="pick(i)"
        @mousemove="!o.disabled && (active = i)"
      >
        <span v-if="o.swatch" class="swatch" :style="{ background: o.swatch.fill, borderColor: o.swatch.border }" aria-hidden="true" />
        <span class="text">{{ o.label }}</span>
        <span v-if="o.note" class="note">{{ o.note }}</span>
        <span v-if="o.value === modelValue" class="tick" aria-hidden="true">✓</span>
      </li>
    </ul>
    </Teleport>
  </div>
</template>

<style scoped>
.picker {
  width: 100%;
}
.trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 44px;
  padding: 0 12px;
  border-radius: 12px;
  border: 2px solid var(--line);
  background: var(--paper-2);
  color: var(--ink);
  font: inherit;
  font-weight: 700;
  font-size: 0.85rem;
  text-align: left;
}
.trigger.on {
  background: var(--honey);
  border-color: var(--honey-deep);
}
.text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.placeholder {
  color: var(--ink-soft);
}
.note {
  font-weight: 600;
  color: var(--ink-soft);
  font-variant-numeric: tabular-nums;
}
.chev {
  transition: transform 180ms var(--ease);
}
.open .chev {
  transform: rotate(180deg);
}
.swatch {
  width: 16px;
  height: 14px;
  flex: none;
  border-radius: 4px;
  border: 2px solid;
}
.picker-list {
  position: fixed;
  z-index: 60;
  max-height: 260px;
  overflow-y: auto;
  list-style: none;
  margin: 0;
  padding: 4px;
  border-radius: 12px;
  border: 2px solid var(--line);
  background: var(--paper);
  box-shadow: var(--shadow);
  display: grid;
  gap: 2px;
  font-family: var(--font-ui);
  font-size: calc(16px * var(--text-scale));
  color: var(--ink);
  animation: pop-in 140ms var(--ease);
  transform-origin: top center;
}
.picker-list.up {
  transform-origin: bottom center;
}
@keyframes pop-in {
  from {
    opacity: 0;
    transform: scale(0.96);
  }
}
:global(html.rm) .picker-list {
  animation: none;
}
.picker-list li {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 40px;
  padding: 0 10px;
  border-radius: 9px;
  font-weight: 600;
  font-size: 0.88rem;
  cursor: pointer;
  outline: none;
}
.picker-list li.active {
  background: var(--paper-2);
}
.picker-list li:focus-visible {
  box-shadow: 0 0 0 3px var(--honey-deep);
}
.picker-list li.sel {
  background: color-mix(in srgb, var(--honey) 45%, var(--paper));
}
.picker-list li.disabled {
  opacity: 0.45;
  cursor: default;
}
.tick {
  font-weight: 800;
  color: var(--honey-deep);
}
</style>
