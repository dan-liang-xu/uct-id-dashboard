<script setup lang="ts">
import { ref } from 'vue'

import accLogo from '@/assets/acc-logo.jpeg'
import LayerTogglePanel from '@/components/LayerTogglePanel.vue'
import LocatorMap from '@/components/LocatorMap.vue'
import MapPanel from '@/components/MapPanel.vue'
import SourcesPanel from '@/components/SourcesPanel.vue'
import StreetViewPanel from '@/components/StreetViewPanel.vue'

const tab = ref<'layers' | 'sources'>('layers')

// Street View is empty until the user clicks a location on the map.
const svLng = ref<number | null>(null)
const svLat = ref<number | null>(null)
// ACC marker position — starts at the clicked point, then follows the Street View
// panorama as the user walks around inside it.
const markerLng = ref<number | null>(null)
const markerLat = ref<number | null>(null)
function onMapClick(lng: number, lat: number) {
  svLng.value = lng
  svLat.value = lat
  markerLng.value = lng
  markerLat.value = lat
}
function onSvMove(lng: number, lat: number) {
  markerLng.value = lng
  markerLat.value = lat
}

// Current map viewport bounds [w, s, e, n] — drives the locator inset's red box.
const viewport = ref<[number, number, number, number] | null>(null)
function onViewport(w: number, s: number, e: number, n: number) {
  viewport.value = [w, s, e, n]
}

// Resizable columns: drag the splitters to resize the left + right panels; the
// map (centre) flexes to fill the rest.
const leftW = ref(360)
const rightW = ref(340)
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
let drag: 'left' | 'right' | null = null
let startX = 0
let startLeft = 0
let startRight = 0
function startDrag(which: 'left' | 'right', e: PointerEvent) {
  drag = which
  startX = e.clientX
  startLeft = leftW.value
  startRight = rightW.value
  window.addEventListener('pointermove', onDrag)
  window.addEventListener('pointerup', endDrag)
}
function onDrag(e: PointerEvent) {
  const dx = e.clientX - startX
  if (drag === 'left') leftW.value = clamp(startLeft + dx, 240, 700)
  else if (drag === 'right') rightW.value = clamp(startRight - dx, 240, 640)
}
function endDrag() {
  drag = null
  window.removeEventListener('pointermove', onDrag)
  window.removeEventListener('pointerup', endDrag)
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

    <main class="content" :style="{ gridTemplateColumns: `${leftW}px 1fr ${rightW}px` }">
      <div
        class="splitter splitter-left"
        :style="{ left: `${leftW}px` }"
        title="Drag to resize"
        @pointerdown="startDrag('left', $event)"
      />
      <div
        class="splitter splitter-right"
        :style="{ right: `${rightW}px` }"
        title="Drag to resize"
        @pointerdown="startDrag('right', $event)"
      />
      <div class="left-col">
        <section class="card masthead">
          <div class="mast-text">
            <span class="mast-kicker">Cape Town · Urban Atlas</span>
            <h1 class="mast-title">UCT Innovation District</h1>
            <span class="mast-rule" />
            <p class="mast-desc">
              A layered atlas of the Main&nbsp;Road corridor — buildings, mobility, demographics and
              amenities.
            </p>
          </div>
          <LocatorMap class="mast-locator" :bounds="viewport" />
        </section>
        <aside class="card sv-col">
          <StreetViewPanel :lat="svLat" :lng="svLng" @position-changed="onSvMove" />
        </aside>
      </div>

      <section class="card map-col">
        <MapPanel
          :marker-lng="markerLng"
          :marker-lat="markerLat"
          @map-click="onMapClick"
          @viewport="onViewport"
        />
      </section>

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
  position: relative;
  /* columns are set inline (drag-resizable); this is just the initial fallback */
  grid-template-columns: 360px 1fr 340px;
  gap: var(--layout-gap);
}

/* draggable resize handles sitting in the gaps between the columns */
.splitter {
  position: absolute;
  top: 0;
  bottom: 0;
  width: var(--layout-gap);
  z-index: 15;
  cursor: col-resize;
  touch-action: none;
}
.splitter::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 2px;
  height: 36px;
  border-radius: 2px;
  background: var(--color-grey);
  transition: background 150ms ease;
}
.splitter:hover::after {
  background: var(--color-accent);
  height: 52px;
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
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  padding: 1.1rem 0.4rem;
  /* sits directly on the page canvas — no card frame */
  background: transparent;
  border: none;
  box-shadow: none;
}
.mast-text {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  flex-shrink: 0;
}
.mast-locator {
  flex: 1;
  min-height: 0;
  align-self: stretch;
  display: flex;
  align-items: center;
  justify-content: center;
  /* breathing room around the enlarged key plan */
  padding: 0.6rem 0.8rem 0.2rem;
  margin-top: 0.6rem;
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
  /* red frame around the map */
  border: 4px solid var(--color-accent);
}
.side-col {
  display: flex;
  flex-direction: column;
  min-height: 0;
  /* sits directly on the page canvas — no card frame */
  background: transparent;
  border: none;
  box-shadow: none;
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
  .mast-title {
    font-size: clamp(1.9rem, 3vw, 2.8rem);
  }
}
@media (max-width: 1120px) {
  .content {
    grid-template-columns: 1fr 300px !important;
  }
  .left-col,
  .splitter {
    display: none;
  }
}
@media (max-width: 640px) {
  .content {
    grid-template-columns: 1fr !important;
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
