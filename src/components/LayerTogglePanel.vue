<script setup lang="ts">
import { computed } from 'vue'

import { GROUPS, LAYERS } from '@/config/layers'
import { useLayersStore } from '@/stores/layers'

import LegendMark from './LegendMark.vue'

const store = useLayersStore()
const fmt = (n: number) => n.toLocaleString('en-US')
const grouped = computed(() =>
  GROUPS.map((group) => ({ group, layers: LAYERS.filter((l) => l.group === group) })).filter(
    (g) => g.layers.length,
  ),
)
</script>

<template>
  <div class="toggle-panel">
    <div v-for="grp in grouped" :key="grp.group" class="group">
      <div class="group-title">{{ grp.group }}</div>
      <div
        v-for="l in grp.layers"
        :key="l.key"
        class="row"
        :class="{ disabled: !store.isAvailable(l.key) }"
      >
        <LegendMark :legend="l.legend" />
        <span class="label" :title="l.legend.label || l.label">{{ l.label }}</span>
        <span v-if="store.isAvailable(l.key) && store.counts[l.key]" class="count">{{
          fmt(store.counts[l.key])
        }}</span>
        <span v-if="!store.isAvailable(l.key)" class="pending" title="Data not provided yet">
          pending
        </span>
        <button
          v-else
          class="switch"
          :class="{ on: store.visible[l.key] }"
          role="switch"
          :aria-checked="store.visible[l.key]"
          :aria-label="`Toggle ${l.label}`"
          @click="store.toggle(l.key)"
        >
          <span class="knob" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.toggle-panel {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.group-title {
  font-family: var(--font-mono);
  font-size: 0.66rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-accent);
  font-weight: 600;
  margin-bottom: 0.25rem;
}
.row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.28rem 0.15rem;
  border-radius: 4px;
}
.row:hover {
  background: var(--color-darkest);
}
.row.disabled {
  opacity: 0.55;
}
.label {
  flex: 1;
  font-size: 0.82rem;
  color: var(--color-lighter);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.count {
  font-family: var(--font-mono);
  font-size: 0.64rem;
  color: var(--color-light);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}
.pending {
  font-family: var(--font-mono);
  font-size: 0.6rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-light);
  border: 1px dashed var(--color-grey);
  border-radius: 3px;
  padding: 1px 4px;
}
.switch {
  position: relative;
  width: 30px;
  height: 17px;
  border-radius: 999px;
  background: var(--color-grey);
  border: none;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 160ms ease;
}
.switch.on {
  background: var(--color-accent);
}
.knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 13px;
  height: 13px;
  border-radius: 50%;
  background: #fff;
  transition: transform 160ms ease;
}
.switch.on .knob {
  transform: translateX(13px);
}
</style>
