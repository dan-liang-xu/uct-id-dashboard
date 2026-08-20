<script setup lang="ts">
import { ref } from 'vue'

import accLogo from '@/assets/acc-logo.jpeg'
import LayerTogglePanel from '@/components/LayerTogglePanel.vue'
import MapPanel from '@/components/MapPanel.vue'
import SourcesPanel from '@/components/SourcesPanel.vue'
import StreetViewPanel from '@/components/StreetViewPanel.vue'

const tab = ref<'layers' | 'sources'>('layers')

// Street View is empty until the user clicks a location on the map.
const svLng = ref<number | null>(null)
const svLat = ref<number | null>(null)
function onMapClick(lng: number, lat: number) {
  svLng.value = lng
  svLat.value = lat
}
</script>

<template>
  <div class="app">
    <header class="topbar">
      <span class="kicker">Data Atlas</span>
      <div class="spacer" />
      <div class="acc">
        <span class="acc-text">African Centre for Cities</span>
        <img :src="accLogo" alt="African Centre for Cities" class="acc-logo" />
      </div>
    </header>

    <main class="content">
      <div class="left-col">
        <section class="card masthead">
          <span class="mast-kicker">Cape Town · Urban Atlas</span>
          <h1 class="mast-title">UCT Innovation District</h1>
          <span class="mast-rule" />
          <p class="mast-desc">
            A layered atlas of the Main&nbsp;Road corridor — buildings, mobility, demographics and
            amenities.
          </p>
        </section>
        <aside class="card sv-col"><StreetViewPanel :lat="svLat" :lng="svLng" /></aside>
      </div>

      <section class="card map-col"><MapPanel @map-click="onMapClick" /></section>

      <aside class="card side-col">
        <div class="side-body">
          <LayerTogglePanel v-show="tab === 'layers'" />
          <SourcesPanel v-show="tab === 'sources'" />
        </div>
        <div class="tabs">
          <button class="tab" :class="{ active: tab === 'layers' }" @click="tab = 'layers'">
            Layers
          </button>
          <button class="tab" :class="{ active: tab === 'sources' }" @click="tab = 'sources'">
            Data sources
          </button>
        </div>
      </aside>
    </main>
  </div>
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  padding: var(--layout-margin);
  gap: var(--layout-gap);
  background: var(--color-canvas);
}

/* ---- slim top strip: ACC lockup on the right ---- */
.topbar {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  flex-shrink: 0;
  padding: 0 0.3rem;
}
.kicker {
  font-family: var(--font-mono);
  font-size: 0.62rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--color-light);
}
.spacer {
  flex: 1;
}
.acc {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.acc-text {
  font-size: 0.78rem;
  font-weight: 500;
  color: var(--color-lighter);
}
.acc-logo {
  width: 34px;
  height: 34px;
  border-radius: 7px;
  object-fit: contain;
}

/* ---- content grid ---- */
.content {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 640px 1fr 340px;
  gap: var(--layout-gap);
}

.card {
  border: 1px solid var(--color-grey);
  border-radius: var(--panel-radius);
  box-shadow: var(--shadow-card);
  overflow: hidden;
  background: var(--color-dark);
}

.left-col {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  gap: var(--layout-gap);
}

/* Masthead — bold publication heading, ~half the left column */
.masthead {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 1.4rem 1.5rem;
  /* airier: let the paper canvas show through the heading panel */
  background: rgb(253 251 245 / 0.45);
}
.mast-kicker {
  font-family: var(--font-mono);
  font-size: 0.66rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--color-accent);
}
.mast-title {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: clamp(2.1rem, 3.5vw, 3.4rem);
  line-height: 0.96;
  letter-spacing: -0.03em;
  color: var(--color-accent);
  margin: 0.5rem 0 0.7rem;
}
.mast-rule {
  width: 56px;
  height: 3px;
  background: var(--color-accent);
  border-radius: 2px;
}
.mast-desc {
  margin-top: 0.7rem;
  max-width: 30ch;
  font-size: 0.82rem;
  line-height: 1.45;
  color: var(--color-light);
}

.sv-col {
  flex: 1;
  min-height: 0;
}
.map-col {
  position: relative;
  min-width: 0;
  min-height: 0;
}
.side-col {
  display: flex;
  flex-direction: column;
  min-height: 0;
  /* legend/layers panel matches the page canvas */
  background: var(--color-canvas);
}
.tabs {
  display: flex;
  flex-shrink: 0;
  border-top: 1px solid var(--color-grey);
}
.tab {
  flex: 1;
  padding: 0.6rem 0.5rem;
  font-size: 0.78rem;
  font-weight: 500;
  color: var(--color-light);
  background: transparent;
  border: none;
  cursor: pointer;
  border-top: 2px solid transparent;
  margin-top: -1px;
  transition:
    color 150ms ease,
    border-color 150ms ease;
}
.tab.active {
  color: var(--color-accent);
  border-top-color: var(--color-accent);
}
.tab:hover {
  color: var(--color-lighter);
}
.side-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0.8rem;
}

@media (max-width: 1400px) {
  .content {
    grid-template-columns: 500px 1fr 320px;
  }
  .mast-title {
    font-size: clamp(1.9rem, 3vw, 2.8rem);
  }
}
@media (max-width: 1120px) {
  .content {
    grid-template-columns: 1fr 300px;
  }
  .left-col {
    display: none;
  }
}
@media (max-width: 640px) {
  .content {
    grid-template-columns: 1fr;
    grid-template-rows: 1fr auto;
  }
  .side-col {
    max-height: 44vh;
  }
  .acc-text {
    display: none;
  }
}
</style>
