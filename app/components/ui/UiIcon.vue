<script setup lang="ts">
defineProps<{ name: 'journal' | 'settings' | 'look' | 'home' | 'plus' | 'minus' | 'map' | 'close' | 'arrow' | 'expand' | 'shrink' | 'build' | 'bee' | 'upgrade' }>()
</script>

<template>
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
    <template v-if="name === 'journal'">
      <path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H18a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H6.5A1.5 1.5 0 0 1 5 18.5z" />
      <path d="M5 17.5A1.5 1.5 0 0 1 6.5 16H19" />
      <path d="M9 7.5h6M9 11h4" />
    </template>
    <template v-else-if="name === 'settings'">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.8v2.4M12 18.8v2.4M4.2 7.5l2.1 1.2M17.7 15.3l2.1 1.2M4.2 16.5l2.1-1.2M17.7 8.7l2.1-1.2" />
      <path d="M12 5.2 17.9 8.6v6.8L12 18.8l-5.9-3.4V8.6z" />
    </template>
    <template v-else-if="name === 'look'">
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="3" />
    </template>
    <template v-else-if="name === 'home'">
      <path d="M12 3.5c-4 0-7 3.3-7 7.5 0 3.6 0 7.5 0 9h14c0-1.5 0-5.4 0-9 0-4.2-3-7.5-7-7.5z" />
      <path d="M5.5 9h13M5 13.5h14" />
      <path d="M10 20v-3a2 2 0 0 1 4 0v3" />
    </template>
    <template v-else-if="name === 'build'">
      <path d="M12 2.8 19.8 7.3v9.4L12 21.2l-7.8-4.5V7.3z" />
      <path d="M12 8.5v7M8.5 12h7" />
    </template>
    <template v-else-if="name === 'bee'">
      <rect x="6" y="8" width="12" height="11" rx="3" />
      <path d="M6 12.5h12M6 16h12" />
      <path d="M9.5 8C8 5.5 5 5 4.5 7.5M14.5 8C16 5.5 19 5 19.5 7.5" />
    </template>
    <template v-else-if="name === 'upgrade'">
      <path d="M12 20V5M6 11l6-6 6 6" />
      <path d="M8 20h8" />
    </template>
    <template v-else-if="name === 'plus'">
      <path d="M12 5v14M5 12h14" />
    </template>
    <template v-else-if="name === 'minus'">
      <path d="M5 12h14" />
    </template>
    <template v-else-if="name === 'map'">
      <path d="M12 3 19.8 7.5v9L12 21l-7.8-4.5v-9z" />
      <circle cx="12" cy="12" r="2" />
    </template>
    <template v-else-if="name === 'close'">
      <path d="M6 6l12 12M18 6 6 18" />
    </template>
    <template v-else-if="name === 'arrow'">
      <path d="M12 19V5M6 11l6-6 6 6" />
    </template>
    <template v-else-if="name === 'expand'">
      <path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5" />
    </template>
    <template v-else-if="name === 'shrink'">
      <path d="M4 9h5V4M20 9h-5V4M4 15h5v5M20 15h-5v5" />
    </template>
  </svg>
</template>
