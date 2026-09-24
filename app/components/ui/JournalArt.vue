<script setup lang="ts">
/** Little hand-drawn-style illustrations for journal pages. */
defineProps<{ subject?: string }>()
</script>

<template>
  <svg viewBox="0 0 120 90" aria-hidden="true" class="art" fill="none" stroke="#5b3a24" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <ellipse cx="60" cy="78" rx="46" ry="8" fill="#e9d9a6" stroke="none" opacity="0.7" />
    <template v-if="subject === 'hive'">
      <path d="M60 18c-18 0-28 14-28 30v26h56V48c0-16-10-30-28-30z" fill="#f2c46b" />
      <path d="M34 36h52M32 48h56M32 60h56" />
      <path d="M53 74V64a7 7 0 0 1 14 0v10" fill="#5a3a22" />
    </template>
    <template v-else-if="subject === 'signpost'">
      <path d="M60 76V22" stroke-width="4" />
      <path d="M60 28h28l6 6-6 6H60z" fill="#e6c49a" />
      <path d="M60 46H34l-6 6 6 6h26z" fill="#e6c49a" />
    </template>
    <template v-else-if="subject === 'sunflower'">
      <path d="M60 76V40" stroke="#6fb35e" stroke-width="4" />
      <path d="M60 60c8-8 16-6 18-4-6 6-12 6-18 4z" fill="#79c46b" />
      <g fill="#ffd23f">
        <ellipse v-for="i in 12" :key="i" cx="60" cy="18" rx="5" ry="10" :transform="`rotate(${i * 30} 60 32)`" />
      </g>
      <circle cx="60" cy="32" r="11" fill="#8a5a2b" />
    </template>
    <template v-else-if="subject === 'pond' || subject === 'water'">
      <ellipse cx="60" cy="58" rx="42" ry="16" fill="#8fd3e8" />
      <path d="M38 56a10 5 0 1 0 14 2l-6-2z" fill="#79c46b" />
      <path d="M66 62a9 4 0 1 0 12 1l-5-2z" fill="#79c46b" />
      <circle cx="46" cy="50" r="5" fill="#ffc2dc" />
    </template>
    <template v-else-if="subject === 'stump'">
      <path d="M40 74V46h40v28z" fill="#8a5f3c" />
      <ellipse cx="60" cy="46" rx="20" ry="6" fill="#e6c49a" />
      <ellipse cx="54" cy="42" rx="8" ry="4" fill="#8cc97a" />
      <circle cx="60" cy="64" r="5" fill="#5a3a22" />
    </template>
    <template v-else-if="subject === 'dandelion' || subject === 'flowers'">
      <path d="M44 76V44M64 76V36M80 76V50" stroke="#6fb35e" />
      <circle cx="44" cy="38" r="9" :fill="subject === 'flowers' ? '#ff9ec7' : '#fffaf0'" />
      <circle cx="64" cy="30" r="10" :fill="subject === 'flowers' ? '#c9a7ff' : '#fffaf0'" />
      <circle cx="80" cy="44" r="8" :fill="subject === 'flowers' ? '#ffe27a' : '#fffaf0'" />
    </template>
    <template v-else-if="subject === 'nest'">
      <path d="M30 20h60" stroke-width="4" stroke="#8a5f3c" />
      <ellipse cx="60" cy="46" rx="18" ry="22" fill="#d9b3e6" />
      <path d="M44 38h32M42 48h36M44 58h32" stroke="#b58fc7" />
      <circle cx="60" cy="52" r="4" fill="#5a3a22" />
    </template>
    <template v-else-if="subject === 'honeycomb'">
      <path v-for="(p, i) in [[42, 50], [60, 40], [78, 50], [60, 60]]" :key="i" :d="`M${p[0]! - 9} ${p[1]}l4.5-8h9l4.5 8-4.5 8h-9z`" fill="#f6c453" />
    </template>
    <template v-else-if="subject === 'mist'">
      <path d="M22 60c0-8 8-12 14-10 2-10 16-12 20-4 6-8 22-6 22 4 10-2 18 6 16 14H22z" fill="#f3e9f5" />
      <circle cx="60" cy="30" r="7" fill="#fff4c9" />
    </template>
    <template v-else-if="subject === 'forest'">
      <path d="M44 76V56M76 76V60" stroke="#8a5f3c" stroke-width="4" />
      <circle cx="44" cy="42" r="16" fill="#7cc47a" />
      <circle cx="76" cy="48" r="13" fill="#8fd07a" />
    </template>
    <template v-else-if="subject === 'cottage'">
      <path d="M36 74V48h48v26z" fill="#fff4e0" />
      <path d="M30 50 60 26l30 24z" fill="#b99ae0" />
      <path d="M54 74V62a6 6 0 0 1 12 0v12" fill="#8a5f3c" />
      <rect x="70" y="54" width="9" height="8" rx="2" fill="#bfe6ff" />
      <path d="M24 76v-8M28 76v-10M92 76v-9M96 76v-7" stroke="#8d6cc4" stroke-width="3" />
    </template>
    <template v-else-if="subject === 'hollowoak' || subject === 'amber'">
      <path d="M50 76V52M70 76V52" stroke="#8a5f3c" stroke-width="5" />
      <path v-if="subject === 'hollowoak'" d="M54 76V60a6 6 0 0 1 12 0v16" fill="#5a3a22" />
      <circle cx="60" cy="36" r="22" fill="#f0a24a" />
      <circle cx="44" cy="44" r="12" fill="#e8913a" />
      <circle cx="78" cy="42" r="13" fill="#f5b85c" />
    </template>
    <template v-else-if="subject === 'moonwell'">
      <ellipse cx="60" cy="62" rx="28" ry="10" fill="#cfd6e6" />
      <ellipse cx="60" cy="60" rx="20" ry="6" fill="#6fa8e6" />
      <path d="M40 62v10M80 62v10" stroke="#9aa5ba" stroke-width="4" />
      <path d="M66 22a10 10 0 1 1-8 16 8 8 0 1 0 8-16z" fill="#fff4c9" />
    </template>
    <template v-else-if="subject === 'lavender'">
      <g v-for="x in [34, 48, 62, 76, 90]" :key="x">
        <path :d="`M${x} 76V46`" stroke="#6fb35e" />
        <ellipse :cx="x" cy="42" rx="4" ry="10" fill="#b99ae0" />
      </g>
    </template>
    <template v-else>
      <path d="M30 74c4-14 8-22 10-26M50 74c2-12 4-20 6-26M70 74c-1-12 0-18 2-24M88 74c-2-10-4-16-6-20" stroke="#6fb35e" />
      <circle cx="56" cy="44" r="5" fill="#ff9ec7" />
    </template>
  </svg>
</template>

<style scoped>
.art {
  width: 100%;
  height: auto;
  display: block;
}
</style>
