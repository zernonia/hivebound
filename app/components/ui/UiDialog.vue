<script setup lang="ts">
/**
 * Accessible modal built on the native <dialog>: focus trapping, Esc to close
 * and an inert background come for free from the browser.
 */
const props = defineProps<{ open: boolean, title: string, wide?: boolean }>()
const emit = defineEmits<{ close: [] }>()
const el = ref<HTMLDialogElement>()
const titleId = useId()

watch(
  () => props.open,
  (open) => {
    const d = el.value
    if (!d) return
    if (open && !d.open) d.showModal()
    else if (!open && d.open) d.close()
  },
  { flush: 'post' },
)
onMounted(() => {
  if (props.open) el.value?.showModal()
})

function onBackdrop(ev: MouseEvent) {
  if (ev.target === el.value) emit('close')
}
</script>

<template>
  <dialog
    ref="el"
    class="dialog"
    :class="{ wide }"
    :aria-labelledby="titleId"
    @close="emit('close')"
    @click="onBackdrop"
  >
    <div class="sheet">
      <header>
        <h2 :id="titleId">
          {{ title }}
        </h2>
        <button class="close" aria-label="Close" @click="emit('close')">
          <UiIcon name="close" />
        </button>
      </header>
      <div class="body">
        <slot />
      </div>
    </div>
  </dialog>
</template>

<style scoped>
.dialog {
  padding: 0;
  border: none;
  background: transparent;
  max-width: min(560px, calc(100vw - 24px));
  width: 100%;
  max-height: calc(100dvh - 32px);
  color: var(--ink);
  overflow: visible;
}
.dialog.wide {
  max-width: min(860px, calc(100vw - 24px));
}
.dialog[open] {
  animation: pop var(--dur) var(--ease);
}
.dialog::backdrop {
  background: rgba(90, 60, 30, 0.28);
  backdrop-filter: blur(3px);
}
.sheet {
  background: var(--paper);
  border: var(--panel-border);
  border-radius: 28px;
  box-shadow: var(--shadow);
  display: flex;
  flex-direction: column;
  max-height: calc(100dvh - 32px);
  overflow: hidden;
}
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 16px 8px 24px;
}
h2 {
  margin: 0;
  font-size: 1.45rem;
  font-weight: 700;
}
.close {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: none;
  background: var(--paper-2);
  display: grid;
  place-items: center;
}
.close svg {
  width: 22px;
  height: 22px;
}
.body {
  padding: 4px 24px 24px;
  overflow: auto;
  user-select: text;
}
/* Transform only: content stays readable even if the animation is starved. */
@keyframes pop {
  from {
    transform: scale(0.96) translateY(8px);
  }
}
</style>
