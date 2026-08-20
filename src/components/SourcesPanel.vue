<script setup lang="ts">
import { LAYERS } from '@/config/layers'
import { useLayersStore } from '@/stores/layers'

const store = useLayersStore()
</script>

<template>
  <div class="sources">
    <p class="intro">
      Data sources & provenance for each layer. Layers marked <em>pending</em> are awaiting data;
      provider details are finalised on ingest.
    </p>
    <div v-for="l in LAYERS" :key="l.key" class="src">
      <div class="src-head">
        <span class="src-name">{{ l.label }}</span>
        <span v-if="!store.isAvailable(l.key)" class="pending">pending</span>
      </div>
      <div class="src-meta">
        <span>{{ l.source.name }}</span>
        <span class="dot">·</span>
        <span>{{ l.source.provider }}</span>
        <template v-if="l.source.year">
          <span class="dot">·</span><span>{{ l.source.year }}</span>
        </template>
        <template v-if="l.source.licence">
          <span class="dot">·</span><span>{{ l.source.licence }}</span>
        </template>
      </div>
      <div v-if="l.source.attribution" class="src-attr">{{ l.source.attribution }}</div>
      <a v-if="l.source.url" class="src-url" :href="l.source.url" target="_blank" rel="noopener">
        {{ l.source.url }}
      </a>
    </div>
    <p class="footer">
      Basemap © OpenMapTiles © OpenStreetMap contributors. Built by the African Centre for Cities.
    </p>
  </div>
</template>

<style scoped>
.sources {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.intro {
  font-size: 0.72rem;
  color: var(--color-light);
  line-height: 1.4;
}
.src {
  border-bottom: 1px solid var(--color-darkest);
  padding-bottom: 0.5rem;
}
.src-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}
.src-name {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--color-accent);
}
.src-meta {
  font-size: 0.72rem;
  color: var(--color-light);
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  margin-top: 0.1rem;
}
.dot {
  color: var(--color-grey);
}
.src-attr {
  font-size: 0.68rem;
  color: var(--color-light);
  margin-top: 0.1rem;
}
.src-url {
  font-size: 0.68rem;
  color: var(--color-accent);
  text-decoration: underline;
  word-break: break-all;
}
.pending {
  font-family: var(--font-mono);
  font-size: 0.58rem;
  text-transform: uppercase;
  color: var(--color-light);
  border: 1px dashed var(--color-grey);
  border-radius: 3px;
  padding: 1px 4px;
}
.footer {
  font-size: 0.66rem;
  color: var(--color-light);
  font-style: italic;
  margin-top: 0.3rem;
}
</style>
