<script setup lang="ts">
import type { Legend } from '@/config/layers'

defineProps<{ legend: Legend }>()

function rampGradient(colors?: { color: string }[]): string {
  if (!colors?.length) return 'linear-gradient(90deg,#ddd,#999)'
  return `linear-gradient(90deg, ${colors.map((c) => c.color).join(', ')})`
}
</script>

<template>
  <span class="mark">
    <span v-if="legend.kind === 'point'" class="dot" :style="{ background: legend.color }" />
    <span v-else-if="legend.kind === 'line'" class="line" :style="{ background: legend.color }" />
    <span
      v-else-if="legend.kind === 'polygon'"
      class="poly"
      :style="{ background: legend.color, borderColor: legend.color }"
    />
    <span v-else-if="legend.kind === 'ramp'" class="ramp" :style="{ background: rampGradient(legend.colors) }" />
    <span v-else class="raster" />
  </span>
</template>

<style scoped>
.mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  flex-shrink: 0;
}
.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 1px solid #fff;
  box-shadow: 0 0 0 1px rgb(0 0 0 / 0.15);
}
.line {
  width: 14px;
  height: 3px;
  border-radius: 2px;
}
.poly {
  width: 12px;
  height: 12px;
  border-radius: 2px;
  border: 1px solid;
  opacity: 0.85;
}
.ramp {
  width: 16px;
  height: 8px;
  border-radius: 2px;
}
.raster {
  width: 12px;
  height: 12px;
  border-radius: 2px;
  background:
    conic-gradient(#b7c7b0 0 25%, #9fb3c8 0 50%, #b7c7b0 0 75%, #9fb3c8 0) 0 / 6px 6px;
}
</style>
