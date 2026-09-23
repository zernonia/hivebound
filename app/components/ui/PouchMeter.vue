<script setup lang="ts">
import { useHive } from '~/stores/hive'
import { RAW_RESOURCES, RESOURCE_INFO } from '~/utils/resources'

const hive = useHive()
const carried = computed(() => RAW_RESOURCES.filter(r => hive.pouch[r] > 0))
const label = computed(() => {
  const parts = carried.value.map(r => `${hive.pouch[r]} ${RESOURCE_INFO[r].name}`)
  return `Pouch ${hive.pouchTotal} of ${hive.pouchCapacity}${parts.length ? `: ${parts.join(', ')}` : ', empty'}`
})

// A little bounce whenever something goes in.
const bump = ref(false)
watch(() => hive.pouchTotal, (n, old) => {
  if (n <= old) return
  bump.value = false
  requestAnimationFrame(() => (bump.value = true))
})
</script>

<template>
  <div class="pouch panel" :class="{ full: hive.pouchFull, bump }" role="group" :aria-label="label" @animationend="bump = false">
    <div class="row" aria-hidden="true">
      <span class="name">Pouch</span>
      <span class="count">{{ hive.pouchTotal }}/{{ hive.pouchCapacity }}</span>
    </div>
    <div class="bar" aria-hidden="true">
      <span class="fill" :style="{ width: `${(hive.pouchTotal / hive.pouchCapacity) * 100}%` }" />
    </div>
    <ul v-if="carried.length" class="items" aria-hidden="true">
      <li v-for="r in carried" :key="r">
        <ResourceIcon :name="r" />{{ hive.pouch[r] }}
      </li>
    </ul>
  </div>
</template>

<style scoped>
.pouch {
  padding: 8px 14px 10px;
  min-width: 150px;
}
.row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
  font-weight: 700;
}
.name {
  font-size: 0.8rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--honey-deep);
}
.count {
  font-size: 0.95rem;
}
.bar {
  margin-top: 6px;
  height: 8px;
  border-radius: 99px;
  background: var(--paper-2);
  border: 1px solid var(--line);
  overflow: hidden;
}
.fill {
  display: block;
  height: 100%;
  border-radius: 99px;
  background: linear-gradient(90deg, #ffcf4d, var(--honey));
  transition: width 300ms var(--ease);
}
.full .fill {
  background: linear-gradient(90deg, #ffb35c, #ff8a4c);
}
.items {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  font-weight: 600;
}
.items li {
  display: flex;
  align-items: center;
  gap: 3px;
}
.bump {
  animation: bump 320ms var(--ease);
}
@keyframes bump {
  40% {
    transform: scale(1.06);
  }
}
</style>
