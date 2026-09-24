<script setup lang="ts">
import { RESOURCE_INFO, type Resource } from '~/utils/resources'

/* Each resource has its own silhouette as well as colour, so they read without colour. */
const props = defineProps<{ name: Resource }>()
const color = computed(() => RESOURCE_INFO[props.name].color)
</script>

<template>
  <svg class="res-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <g stroke="#5b3a24" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round">
      <!-- Nectar: a round drop with a flower-shaped highlight -->
      <template v-if="name === 'nectar'">
        <path :fill="color" d="M12 3.5c3.2 4 6 7.2 6 10.4a6 6 0 0 1-12 0c0-3.2 2.8-6.4 6-10.4z" />
        <circle cx="12" cy="14.5" r="1.4" fill="#fff" stroke="none" />
        <circle cx="12" cy="12.3" r="1" fill="#fff" stroke="none" />
        <circle cx="14.1" cy="14.5" r="1" fill="#fff" stroke="none" />
        <circle cx="9.9" cy="14.5" r="1" fill="#fff" stroke="none" />
        <circle cx="12" cy="16.7" r="1" fill="#fff" stroke="none" />
      </template>
      <!-- Pollen: a fuzzy ball of dots -->
      <template v-else-if="name === 'pollen'">
        <circle cx="12" cy="12" r="7.5" :fill="color" />
        <g fill="#b37a00" stroke="none">
          <circle cx="9.5" cy="9.5" r="1.2" /><circle cx="14.5" cy="10" r="1.2" /><circle cx="12" cy="13.5" r="1.2" />
          <circle cx="8.8" cy="14.5" r="1" /><circle cx="15.2" cy="14.8" r="1" />
        </g>
      </template>
      <!-- Water: a pointed drop with a wave -->
      <template v-else-if="name === 'water'">
        <path :fill="color" d="M12 2.8 17.6 12a6 6 0 1 1-11.2 0z" />
        <path d="M8.6 15.2c1.1-1 2.3-1 3.4 0s2.3 1 3.4 0" stroke="#fff" fill="none" />
      </template>
      <!-- Resin: a glossy amber lump -->
      <template v-else-if="name === 'resin'">
        <path :fill="color" d="M7 7.5c2-3 8-3.5 10.5-.5 2.2 2.7 1.6 8.8-1.5 10.8-3 2-8.8 1.4-10.4-1.6C4.2 13.6 5.4 9.9 7 7.5z" />
        <path d="M9.5 8.8c1-.8 2.2-1 3.2-.8" stroke="#fff" fill="none" />
      </template>
      <!-- Honey: a little jar -->
      <template v-else-if="name === 'honey'">
        <rect x="7" y="4" width="10" height="3.2" rx="1" fill="#a86a3a" />
        <path :fill="color" d="M6.5 8.5c0-.8.6-1.3 1.3-1.3h8.4c.7 0 1.3.5 1.3 1.3v9.2a2.3 2.3 0 0 1-2.3 2.3H8.8a2.3 2.3 0 0 1-2.3-2.3z" />
        <path d="M9 11.5h6" stroke="#fff" fill="none" />
      </template>
      <!-- Bee bread: a scored loaf -->
      <template v-else-if="name === 'beebread'">
        <path :fill="color" d="M4 14c0-4.2 3.6-7 8-7s8 2.8 8 7v2.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 16.5z" />
        <path d="M9 10.5 8 13.5M12.5 10 12 13M16 10.5l.6 3" fill="none" />
      </template>
      <!-- Golden pollen: a four-point sparkle round a glowing ball -->
      <template v-else-if="name === 'golden'">
        <path fill="#fff6c9" d="M12 1.8 13.6 8.4 20.2 10 13.6 11.6 12 18.2 10.4 11.6 3.8 10 10.4 8.4z" />
        <circle cx="12" cy="13.5" r="5.2" :fill="color" />
        <circle cx="10.4" cy="12" r="1.3" fill="#fff" stroke="none" />
        <path d="M18.5 17.5l.8 1.8 1.8.8-1.8.8-.8 1.8-.8-1.8-1.8-.8 1.8-.8z" fill="#fff6c9" stroke-width="1" />
      </template>
      <!-- Wax: a hexagon -->
      <template v-else>
        <path :fill="color" d="M12 3.2 19.6 7.6v8.8L12 20.8 4.4 16.4V7.6z" />
        <path d="M12 7.5 15.9 9.8v4.4L12 16.5l-3.9-2.3V9.8z" fill="none" />
      </template>
    </g>
  </svg>
</template>

<style scoped>
.res-icon {
  width: 1.4em;
  height: 1.4em;
  flex: none;
  display: inline-block;
  vertical-align: middle;
}
</style>
