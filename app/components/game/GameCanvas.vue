<script setup lang="ts">
import { ACESFilmicToneMapping, PCFShadowMap } from 'three'
</script>

<template>
  <div class="canvas-wrap" aria-hidden="true">
    <TresCanvas
      alpha
      :clear-alpha="0"
      shadows
      :shadow-map-type="PCFShadowMap"
      :tone-mapping="ACESFilmicToneMapping"
      :tone-mapping-exposure="1.05"
      :dpr="[1, 2]"
      power-preference="high-performance"
    >
      <GameScene />
    </TresCanvas>
  </div>
</template>

<style scoped>
.canvas-wrap {
  position: fixed;
  inset: 0;
}
</style>
