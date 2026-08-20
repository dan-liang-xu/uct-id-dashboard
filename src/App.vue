<script setup lang="ts">
import { computed, ref } from 'vue'

import accLogo from '@/assets/acc-logo.jpeg'
import LayerTogglePanel from '@/components/LayerTogglePanel.vue'
import LocatorMap from '@/components/LocatorMap.vue'
import MapPanel from '@/components/MapPanel.vue'
import SourcesPanel from '@/components/SourcesPanel.vue'
import StreetViewPanel from '@/components/StreetViewPanel.vue'
import { useLayersStore } from '@/stores/layers'

const store = useLayersStore()
const tab = ref<'layers' | 'sources'>('layers')

// The active demographic layer (if any) is mirrored on the locator key plan.
// Colours mirror the choropleth fills in layers.ts (bucketed to the legend stops).
const RACE_COLORS: Record<string, string> = {
  African: '#3f7185',
  Coloured: '#c99544',
  Indian: '#bd5c4c',
  White: '#5c8f6a',
  Other: '#7e6396',
}
const asNum = (v: unknown) => (typeof v === 'number' ? v : Number(v)) || 0
function nearestStop(stops: [number, string][], v: number): string {
  let best = stops[0]
  let bd = Infinity
  for (const s of stops) {
    const d = Math.abs(s[0] - v)
    if (d < bd) {
      bd = d
      best = s
    }
  }
  return best[1]
}
type Demographic = { file: string; colorFor: (p: Record<string, unknown>) => string }
const demographic = computed<Demographic | null>(() => {
  if (store.visible['race'])
    return { file: 'census.geojson', colorFor: (p) => RACE_COLORS[String(p.group)] ?? '#cccccc' }
  if (store.visible['population_census'])
    return {
      file: 'census.geojson',
      colorFor: (p) => nearestStop([[200, '#deebf7'], [500, '#9ecae1'], [900, '#3182bd']], asNum(p.total_pop)),
    }
  if (store.visible['population_density'])
    return {
      file: 'census.geojson',
      colorFor: (p) => nearestStop([[0, '#feedde'], [8000, '#fdae6b'], [35000, '#e6550d']], asNum(p.density)),
    }
  if (store.visible['gini_index'])
    return {
      file: 'gini_index.geojson',
      colorFor: (p) => nearestStop([[0.55, '#efedf5'], [0.62, '#bcbddc'], [0.7, '#756bb1']], asNum(p.gini)),
    }
  return null
})

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

// Street View: docked in the left column, or popped out into a draggable window.
const svFloating = ref(false)
const floatX = ref(72)
const floatY = ref(150)
let floatDrag = false
let fx = 0
let fy = 0
let fLeft = 0
let fTop = 0
function onFloatDown(e: PointerEvent) {
  const t = e.target as HTMLElement
  if (!t.closest('.sv-head') || t.closest('button')) return // drag from the header only
  floatDrag = true
  fx = e.clientX
  fy = e.clientY
  fLeft = floatX.value
  fTop = floatY.value
  window.addEventListener('pointermove', onFloatMove)
  window.addEventListener('pointerup', onFloatUp)
}
function onFloatMove(e: PointerEvent) {
  if (!floatDrag) return
  floatX.value = Math.max(8, fLeft + (e.clientX - fx))
  floatY.value = Math.max(8, fTop + (e.clientY - fy))
}
function onFloatUp() {
  floatDrag = false
  window.removeEventListener('pointermove', onFloatMove)
  window.removeEventListener('pointerup', onFloatUp)
}

// Rotate the floating window by dragging its rotate grip.
const svRotate = ref(0)
let rotDrag = false
let rotCx = 0
let rotCy = 0
let rotStart = 0
let rotBase = 0
const angleTo = (x: number, y: number) => (Math.atan2(y - rotCy, x - rotCx) * 180) / Math.PI
function onRotateDown(e: PointerEvent) {
  e.stopPropagation()
  const win = (e.target as HTMLElement).closest('.sv-float') as HTMLElement | null
  if (!win) return
  const r = win.getBoundingClientRect()
  rotCx = r.left + r.width / 2
  rotCy = r.top + r.height / 2
  rotStart = angleTo(e.clientX, e.clientY)
  rotBase = svRotate.value
  rotDrag = true
  window.addEventListener('pointermove', onRotateMove)
  window.addEventListener('pointerup', onRotateUp)
}
function onRotateMove(e: PointerEvent) {
  if (rotDrag) svRotate.value = rotBase + (angleTo(e.clientX, e.clientY) - rotStart)
}
function onRotateUp() {
  rotDrag = false
  window.removeEventListener('pointermove', onRotateMove)
  window.removeEventListener('pointerup', onRotateUp)
}

// Resize the floating window by dragging the corner grip. Pointer events work with
// touch (iPad); the drag delta is rotated into the window's local frame so it
// resizes correctly even when rotated.
const svW = ref(460)
const svH = ref(340)
let sizeDrag = false
let szx = 0
let szy = 0
let szW = 0
let szH = 0
function onResizeDown(e: PointerEvent) {
  e.stopPropagation()
  szx = e.clientX
  szy = e.clientY
  szW = svW.value
  szH = svH.value
  sizeDrag = true
  window.addEventListener('pointermove', onResizeMove)
  window.addEventListener('pointerup', onResizeUp)
}
function onResizeMove(e: PointerEvent) {
  if (!sizeDrag) return
  const dx = e.clientX - szx
  const dy = e.clientY - szy
  const rad = (-svRotate.value * Math.PI) / 180
  const rdx = dx * Math.cos(rad) - dy * Math.sin(rad)
  const rdy = dx * Math.sin(rad) + dy * Math.cos(rad)
  svW.value = Math.max(300, szW + rdx)
  svH.value = Math.max(220, szH + rdy)
}
function onResizeUp() {
  sizeDrag = false
  window.removeEventListener('pointermove', onResizeMove)
  window.removeEventListener('pointerup', onResizeUp)
}
</script>

<template>
  <div class="app">
    <header class="topbar">
      <div class="acc">
        <img :src="accLogo" alt="African Centre for Cities" class="acc-logo" />
        <span class="acc-text">African Centre for Cities</span>
      </div>
      <div class="spacer" />
      <span class="kicker">Data Atlas</span>
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
            <h1 class="mast-title">Innovation District</h1>
            <span class="mast-subtitle">University of Cape Town</span>
            <span class="mast-rule" />
            <p class="mast-desc">
              A layered atlas of the Main&nbsp;Road corridor — buildings, mobility, demographics and
              amenities.
            </p>
          </div>
          <div class="mast-locator">
            <LocatorMap :bounds="viewport" :demographic="demographic" />
          </div>
        </section>
        <aside class="card sv-col">
          <StreetViewPanel
            v-if="!svFloating"
            :lat="svLat"
            :lng="svLng"
            :floating="false"
            @position-changed="onSvMove"
            @toggle-dock="svFloating = true"
          />
          <button v-else class="sv-redock" @click="svFloating = false">
            <img :src="accLogo" alt="" class="sv-redock-logo" />
            <span>Street View is floating<br />click to dock</span>
          </button>
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

    <!-- Street View popped out into a draggable floating window -->
    <div
      v-if="svFloating"
      class="sv-float"
      :style="{
        left: `${floatX}px`,
        top: `${floatY}px`,
        width: `${svW}px`,
        height: `${svH}px`,
        transform: `rotate(${svRotate}deg)`,
      }"
      @pointerdown="onFloatDown"
    >
      <button class="sv-rotate" title="Drag to rotate" @pointerdown="onRotateDown">⟳</button>
      <StreetViewPanel
        :lat="svLat"
        :lng="svLng"
        :floating="true"
        @position-changed="onSvMove"
        @toggle-dock="svFloating = false"
      />
      <div class="sv-resize" title="Drag to resize" @pointerdown="onResizeDown" />
    </div>
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
  /* fixed-size key plan anchored bottom-right; unaffected by panel resizing */
  position: absolute;
  right: 0.7rem;
  bottom: 0.7rem;
  width: 130px;
  height: 195px;
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
  margin: 0.5rem 0 0.12rem;
}
.mast-subtitle {
  font-size: 0.92rem;
  font-weight: 500;
  letter-spacing: 0.01em;
  color: var(--color-light);
}
.mast-rule {
  width: 56px;
  height: 3px;
  background: var(--color-accent);
  border-radius: 2px;
  margin-top: 0.7rem;
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

/* Street View popped out into a draggable, resizable floating window */
.sv-float {
  position: fixed;
  z-index: 50;
  border: 1px solid var(--color-grey);
  border-radius: var(--panel-radius);
  box-shadow: 0 12px 44px rgb(40 25 15 / 0.3);
  background: var(--color-dark);
}
.sv-float :deep(.sv-head) {
  cursor: move;
  touch-action: none; /* header drag works with touch */
}
/* draggable corner grips — pointer events so they work on iPad too */
.sv-rotate,
.sv-resize {
  position: absolute;
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 1px solid var(--color-grey);
  background: var(--color-dark);
  color: var(--color-light);
  line-height: 1;
  touch-action: none;
  box-shadow: 0 2px 8px rgb(0 0 0 / 0.2);
}
.sv-rotate {
  top: -13px;
  right: -13px;
  font-size: 0.82rem;
  cursor: grab;
}
.sv-resize {
  bottom: -13px;
  right: -13px;
  cursor: nwse-resize;
}
.sv-resize::after {
  content: '';
  width: 8px;
  height: 8px;
  border-right: 2px solid currentColor;
  border-bottom: 2px solid currentColor;
}
.sv-rotate:hover,
.sv-resize:hover {
  color: var(--color-accent);
  border-color: var(--color-accent);
}
.sv-rotate:active {
  cursor: grabbing;
}

/* placeholder left in the docked slot so the layout (and locator) stay put */
.sv-redock {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.7rem;
  width: 100%;
  height: 100%;
  border: none;
  background: transparent;
  color: var(--color-light);
  font-family: var(--font-mono);
  font-size: 0.66rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  line-height: 1.6;
  cursor: pointer;
}
.sv-redock-logo {
  width: 52px;
  height: 52px;
  object-fit: contain;
  opacity: 0.22;
}
.sv-redock:hover {
  color: var(--color-accent);
}
.sv-redock:hover .sv-redock-logo {
  opacity: 0.4;
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
