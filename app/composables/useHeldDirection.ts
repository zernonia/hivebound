import type { Direction } from '~/utils/hex'

/**
 * Directions currently held on the keyboard / on-screen pad.
 * Most recent press wins, so rolling between keys feels natural.
 */
const held = ref<(Direction | 'W' | 'E')[]>([])

export function useHeldDirection() {
  const press = (d: Direction | 'W' | 'E') => {
    held.value = [...held.value.filter(x => x !== d), d]
  }
  const release = (d: Direction | 'W' | 'E') => {
    held.value = held.value.filter(x => x !== d)
  }
  const clear = () => {
    held.value = []
  }
  const current = computed(() => held.value[held.value.length - 1] ?? null)
  return { held, current, press, release, clear }
}
