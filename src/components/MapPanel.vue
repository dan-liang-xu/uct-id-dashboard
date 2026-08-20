<script setup lang="ts">
import maplibregl from 'maplibre-gl'
import { Protocol } from 'pmtiles'
import { onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'

import accLogo from '@/assets/acc-logo.jpeg'
import { LAYERS, type LayerDef } from '@/config/layers'
import { buildBasemapStyle, VIEWPORT } from '@/config/viewport'
import { useLayersStore } from '@/stores/layers'

const store = useLayersStore()
const emit = defineEmits<{
  mapClick: [lng: number, lat: number]
  viewport: [w: number, s: number, e: number, n: number]
}>()
const props = defineProps<{ markerLng: number | null; markerLat: number | null }>()
const BASE = import.meta.env.BASE_URL
let map: maplibregl.Map | null = null
let hoverPopup: maplibregl.Popup | null = null
let tapPopup: maplibregl.Popup | null = null
let svMarker: maplibregl.Marker | null = null // ACC-logo marker at the Street View location
let firstSymbolId: string | undefined // basemap label layer; custom layers insert below it
let basemapLabelIds: string[] = [] // basemap symbol/label layers (toggled by "detail")

function placeSvMarker(m: maplibregl.Map, lngLat: maplibregl.LngLat) {
  if (!svMarker) {
    const el = document.createElement('img')
    el.src = accLogo
    el.alt = 'Street View location'
    el.style.cssText =
      'width:30px;height:30px;border-radius:50%;border:2px solid #fff;box-shadow:0 1px 7px rgba(0,0,0,.5);object-fit:cover;background:#fff'
    svMarker = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(lngLat).addTo(m)
  } else {
    svMarker.setLngLat(lngLat)
  }
}

// Move the ACC marker whenever the parent updates its position — on map click, and
// as the Street View panorama is walked around (position follows the panorama).
watch(
  () => [props.markerLng, props.markerLat] as const,
  ([lng, lat]) => {
    if (map && lng != null && lat != null) placeSvMarker(map, new maplibregl.LngLat(lng, lat))
  },
)
const canHover = window.matchMedia?.('(hover: hover) and (pointer: fine)').matches ?? true
const bearing = ref(VIEWPORT.bearing) // drives the north-arrow rotation
const gridOn = ref(true) // dynamic scale grid overlay (on by default)
const gridCellLabel = ref('')
const detailOn = ref(false) // basemap labels on (detailed) vs off (clean/architectural)
const terrainOn = ref(false) // 3D scene (terrain + extruded buildings) — off by default (2D)

// Live coordinates at the 4 viewport corners, eased toward their targets so the
// numbers animate smoothly as you pan/zoom.
type LL = { lng: number; lat: number }
const corners = reactive<{ nw: LL; ne: LL; sw: LL; se: LL }>({
  nw: { lng: 0, lat: 0 },
  ne: { lng: 0, lat: 0 },
  sw: { lng: 0, lat: 0 },
  se: { lng: 0, lat: 0 },
})
let coordTargets: { nw: LL; ne: LL; sw: LL; se: LL } = {
  nw: { lng: 0, lat: 0 },
  ne: { lng: 0, lat: 0 },
  sw: { lng: 0, lat: 0 },
  se: { lng: 0, lat: 0 },
}
let coordRaf = 0
const CORNER_KEYS = ['nw', 'ne', 'sw', 'se'] as const
function animateCoords() {
  let moving = false
  for (const k of CORNER_KEYS) {
    for (const ax of ['lng', 'lat'] as const) {
      const d = coordTargets[k][ax] - corners[k][ax]
      if (Math.abs(d) > 1e-6) {
        corners[k][ax] += d * 0.2
        moving = true
      } else corners[k][ax] = coordTargets[k][ax]
    }
  }
  coordRaf = moving ? requestAnimationFrame(animateCoords) : 0
}
function updateCoordTargets() {
  const m = map
  if (!m) return
  const el = m.getContainer()
  const w = el.clientWidth
  const h = el.clientHeight
  const un = (x: number, y: number): LL => {
    const p = m.unproject([x, y])
    return { lng: p.lng, lat: p.lat }
  }
  coordTargets = { nw: un(0, 0), ne: un(w, 0), sw: un(0, h), se: un(w, h) }
  if (!coordRaf) coordRaf = requestAnimationFrame(animateCoords)
}
const fmtCoord = (c: LL) =>
  `${Math.abs(c.lat).toFixed(4)}°${c.lat < 0 ? 'S' : 'N'}  ${Math.abs(c.lng).toFixed(4)}°${c.lng < 0 ? 'W' : 'E'}`

const layerByKey = new Map(LAYERS.map((l) => [l.key, l]))
// Point layers are clustered: they aggregate into count-bubbles that break apart
// as you zoom (the "16" pattern). Their MapLibre layer ids differ from ml layers.
const isCluster = (l: LayerDef) => l.geometry === 'point' && !!l.file
const mlIds = (l: LayerDef) =>
  isCluster(l)
    ? [`${l.key}-clusters`, `${l.key}-cluster-count`, `${l.key}-unclustered`]
    : l.ml.map((_, i) => `${l.key}-${i}`)
let clusterFont: string[] = ['Noto Sans Regular'] // captured from the loaded style

function addClusterLayer(m: maplibregl.Map, l: LayerDef, srcId: string, beforeId?: string) {
  if (!m.getSource(srcId))
    m.addSource(srcId, {
      type: 'geojson',
      data: `${BASE}data/layers/${l.file}`,
      cluster: true,
      clusterRadius: 48,
      clusterMaxZoom: 15,
    })
  const vis = store.visible[l.key] ? 'visible' : 'none'
  const color = l.legend.color ?? '#ea4c2e'
  if (!m.getLayer(`${l.key}-clusters`))
    m.addLayer(
      {
        id: `${l.key}-clusters`,
        type: 'circle',
        source: srcId,
        filter: ['has', 'point_count'],
        layout: { visibility: vis },
        paint: {
          // light disc so the red count reads; the layer colour becomes the ring.
          'circle-color': '#fdfbf5',
          'circle-opacity': 0.92,
          // radius ∝ √count (area ∝ count) so bubbles scale proportionally; exaggerated.
          'circle-radius': [
            'min',
            72,
            ['max', 20, ['*', 3.8, ['sqrt', ['to-number', ['get', 'point_count']]]]],
          ],
          'circle-stroke-color': color,
          'circle-stroke-width': 2.5,
        },
      },
      beforeId,
    )
  if (!m.getLayer(`${l.key}-cluster-count`))
    m.addLayer(
      {
        id: `${l.key}-cluster-count`,
        type: 'symbol',
        source: srcId,
        filter: ['has', 'point_count'],
        layout: {
          visibility: vis,
          'text-field': ['get', 'point_count_abbreviated'],
          'text-font': ['Noto Sans Bold', ...clusterFont],
          'text-size': ['interpolate', ['linear'], ['get', 'point_count'], 2, 20, 50, 30, 500, 40, 5000, 52],
          'text-allow-overlap': true,
        },
        paint: { 'text-color': color },
      },
      beforeId,
    )
  if (!m.getLayer(`${l.key}-unclustered`))
    m.addLayer(
      {
        id: `${l.key}-unclustered`,
        type: 'circle',
        source: srcId,
        filter: ['!', ['has', 'point_count']],
        layout: { visibility: vis },
        paint: {
          'circle-color': color,
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 6, 17, 13],
          'circle-stroke-color': '#fdfbf5',
          'circle-stroke-width': 1.8,
          'circle-opacity': 0.95,
        },
      },
      beforeId,
    )
}

function addLayer(m: maplibregl.Map, l: LayerDef, beforeId?: string) {
  const srcId = `src-${l.key}`
  if (l.geometry === 'raster' && l.raster) {
    if (!m.getSource(srcId))
      m.addSource(srcId, {
        type: 'raster',
        tiles: l.raster.tiles,
        tileSize: l.raster.tileSize ?? 256,
        attribution: l.raster.attribution ?? '',
      })
  } else if (l.pmtiles && store.isAvailable(l.key)) {
    if (!m.getSource(srcId))
      m.addSource(srcId, {
        type: 'vector',
        url: `pmtiles://${location.origin}${BASE}data/layers/${l.pmtiles.file}`,
      })
  } else if (l.file && store.isAvailable(l.key)) {
    if (isCluster(l)) {
      addClusterLayer(m, l, srcId, beforeId)
      return
    }
    if (!m.getSource(srcId))
      m.addSource(srcId, { type: 'geojson', data: `${BASE}data/layers/${l.file}` })
  } else {
    return // data not provided yet
  }

  const visibility = store.visible[l.key] ? 'visible' : 'none'
  l.ml.forEach((spec, i) => {
    const id = `${l.key}-${i}`
    if (m.getLayer(id)) return
    m.addLayer(
      {
        id,
        type: spec.type,
        source: srcId,
        ...(l.pmtiles ? { 'source-layer': l.pmtiles.sourceLayer } : {}),
        ...(spec.filter ? { filter: spec.filter } : {}),
        ...(spec.paint ? { paint: spec.paint } : {}),
        layout: { ...(spec.layout ?? {}), visibility },
        ...(spec.minzoom ? { minzoom: spec.minzoom } : {}),
      } as maplibregl.LayerSpecification,
      beforeId,
    )
  })
}

// An open 90° chevron (two lines meeting at a right angle), pointing up = north
// by default; icon-rotate + rotation-alignment 'map' turn it to each corridor
// end's outward bearing.
function addArrowImage(m: maplibregl.Map) {
  if (m.hasImage('corridor-arrow')) return
  const s = 44
  const c = document.createElement('canvas')
  c.width = s
  c.height = s
  const ctx = c.getContext('2d')
  if (!ctx) return
  ctx.translate(s / 2, s / 2)
  // Equal horizontal & vertical reach on each arm -> the two arms are
  // perpendicular, i.e. a true 90° chevron.
  ctx.beginPath()
  ctx.moveTo(-14, 2)
  ctx.lineTo(0, -12)
  ctx.lineTo(14, 2)
  ctx.strokeStyle = '#ea4c2e'
  ctx.lineWidth = 5
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.stroke()
  m.addImage('corridor-arrow', ctx.getImageData(0, 0, s, s), { pixelRatio: 2 })
}

// A tileable diagonal hatch (engraved-poster texture) used as a fill-pattern.
function addHatchImage(m: maplibregl.Map) {
  if (m.hasImage('hatch')) return
  const s = 8
  const c = document.createElement('canvas')
  c.width = s
  c.height = s
  const ctx = c.getContext('2d')
  if (!ctx) return
  ctx.strokeStyle = 'rgba(234, 76, 46, 0.9)'
  ctx.lineWidth = 1.1
  ctx.beginPath()
  ctx.moveTo(0, s)
  ctx.lineTo(s, 0) // corner-to-corner line tiles into continuous diagonal stripes
  ctx.stroke()
  m.addImage('hatch', ctx.getImageData(0, 0, s, s), { pixelRatio: 1 })
}

// --- Dynamic scale grid: a metric square grid that re-sizes its cells to a
// "nice" round distance for the current zoom and re-draws across the view on move.
function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const rad = Math.PI / 180
  const dLat = (lat2 - lat1) * rad
  const dLon = (lon2 - lon1) * rad
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}
const NICE_M = [10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000, 50000]
function niceCell(m: maplibregl.Map): number {
  const c = m.getCenter()
  const p = m.project(c)
  const ll = m.unproject([p.x + 100, p.y]) // 100 px east of centre
  const metresPerPx = haversineM(c.lat, c.lng, ll.lat, ll.lng) / 100
  const target = metresPerPx * 90 // aim for ~90 px cells
  return NICE_M.find((v) => v >= target) ?? 100000
}
function buildGrid(m: maplibregl.Map, cell: number): GeoJSON.FeatureCollection {
  const b = m.getBounds()
  const latC = m.getCenter().lat
  const dLat = cell / 111320
  const dLon = cell / (111320 * Math.cos((latC * Math.PI) / 180))
  const w = b.getWest()
  const e = b.getEast()
  const s = b.getSouth()
  const n = b.getNorth()
  const feats: GeoJSON.Feature[] = []
  for (let x = Math.floor(w / dLon) * dLon; x <= e; x += dLon)
    feats.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[x, s], [x, n]] } })
  for (let y = Math.floor(s / dLat) * dLat; y <= n; y += dLat)
    feats.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[w, y], [e, y]] } })
  return { type: 'FeatureCollection', features: feats }
}
function updateGrid(m: maplibregl.Map) {
  if (!gridOn.value) return
  const cell = niceCell(m)
  gridCellLabel.value = cell >= 1000 ? `${cell / 1000} km` : `${cell} m`
  ;(m.getSource('grid-src') as maplibregl.GeoJSONSource | undefined)?.setData(buildGrid(m, cell))
}
function toggleGrid() {
  gridOn.value = !gridOn.value
  if (!map) return
  if (map.getLayer('grid-line'))
    map.setLayoutProperty('grid-line', 'visibility', gridOn.value ? 'visible' : 'none')
  if (gridOn.value) updateGrid(map)
}
function toggleDetail() {
  detailOn.value = !detailOn.value
  if (!map) return
  for (const id of basemapLabelIds)
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', detailOn.value ? 'visible' : 'none')
}

// Lazy: a layer's source+layers are added the first time it's switched on
// (so full-extent GeoJSON isn't all fetched upfront), then just toggled.
// ---- elegant toggle transitions ---------------------------------------------
// Each toggle cross-fades via MapLibre paint transitions rather than snapping
// visibility. Per-layer target opacities are captured when the layer is added.
const FADE_MS = 350
const OPACITY_KEYS: Record<string, string[]> = {
  circle: ['circle-opacity', 'circle-stroke-opacity'],
  line: ['line-opacity'],
  fill: ['fill-opacity'],
  'fill-extrusion': ['fill-extrusion-opacity'],
  raster: ['raster-opacity'],
  symbol: ['icon-opacity', 'text-opacity'],
}
const fadeTargets = new Map<string, { prop: string; target: number }[]>()
const fadeTimers = new Map<string, ReturnType<typeof setTimeout>>()
const appliedVisible = new Map<string, boolean>()
const toNum = (v: unknown, d: number) => (typeof v === 'number' ? v : d)

function rememberFadeTargets(m: maplibregl.Map, id: string) {
  const layer = m.getLayer(id)
  if (!layer) return
  const keys = OPACITY_KEYS[layer.type] ?? []
  fadeTargets.set(
    id,
    keys.map((prop) => ({ prop, target: toNum(m.getPaintProperty(id, prop), 1) })),
  )
}

function fadeIn(m: maplibregl.Map, id: string) {
  const pending = fadeTimers.get(id)
  if (pending) {
    clearTimeout(pending)
    fadeTimers.delete(id)
  }
  if (!fadeTargets.has(id)) rememberFadeTargets(m, id)
  const targets = fadeTargets.get(id) ?? []
  m.setLayoutProperty(id, 'visibility', 'visible')
  // start transparent (instantly), then transition up to the target opacity
  targets.forEach(({ prop }) => {
    m.setPaintProperty(id, `${prop}-transition`, { duration: 0, delay: 0 })
    m.setPaintProperty(id, prop, 0)
  })
  requestAnimationFrame(() => {
    if (!m.getLayer(id)) return
    targets.forEach(({ prop, target }) => {
      m.setPaintProperty(id, `${prop}-transition`, { duration: FADE_MS, delay: 0 })
      m.setPaintProperty(id, prop, target)
    })
  })
}

function fadeOut(m: maplibregl.Map, id: string) {
  if (m.getLayoutProperty(id, 'visibility') === 'none') return
  if (!fadeTargets.has(id)) rememberFadeTargets(m, id)
  const targets = fadeTargets.get(id) ?? []
  targets.forEach(({ prop }) => {
    m.setPaintProperty(id, `${prop}-transition`, { duration: FADE_MS, delay: 0 })
    m.setPaintProperty(id, prop, 0)
  })
  const timer = setTimeout(() => {
    if (m.getLayer(id)) m.setLayoutProperty(id, 'visibility', 'none')
    fadeTimers.delete(id)
  }, FADE_MS + 40)
  fadeTimers.set(id, timer)
}

function syncLayers(m: maplibregl.Map) {
  for (const l of LAYERS) {
    const on = !!store.visible[l.key]
    const ids = mlIds(l)
    const exists = ids.length > 0 && !!m.getLayer(ids[0])
    if (on && !exists) {
      addLayer(m, l, firstSymbolId)
      for (const id of mlIds(l)) {
        if (!m.getLayer(id)) continue
        rememberFadeTargets(m, id)
        appliedVisible.set(id, true)
        fadeIn(m, id)
      }
    } else {
      for (const id of ids) {
        if (!m.getLayer(id)) continue
        if (appliedVisible.get(id) === on) continue // only animate on real change
        appliedVisible.set(id, on)
        if (on) fadeIn(m, id)
        else fadeOut(m, id)
      }
    }
  }
  raiseOverlays(m)
}

/** Keep the Innovation District corridor (+ its shadow) above every other layer. */
function raiseCorridor(m: maplibregl.Map) {
  const l = layerByKey.get('innovation_district')
  if (!l) return
  l.ml.forEach((_, i) => {
    const id = `innovation_district-${i}`
    if (m.getLayer(id)) m.moveLayer(id) // no beforeId => move to the very top
  })
}

// (geolibre/Protomaps branch) Restyle the basemap labels shown in "detailed"
// view: admin/place names + street names in accent red. Fonts switch to
// Inter / JetBrains Mono only when their glyphs are self-hosted.
const ADMIN_LABELS = ['places_country', 'places_region', 'places_locality', 'places_subplace']
const STREET_LABELS = ['roads_labels_major', 'roads_labels_minor', 'roads_shields']
const USE_CUSTOM_LABEL_FONTS = true // Inter/JetBrains glyphs self-hosted under public/data/basemap/fonts
function styleBasemapLabels(m: maplibregl.Map) {
  const restyle = (id: string, font: string[]) => {
    if (!m.getLayer(id)) return
    try {
      m.setPaintProperty(id, 'text-color', '#ea4c2e')
      m.setPaintProperty(id, 'text-halo-color', '#ffffff')
      m.setPaintProperty(id, 'text-halo-width', 1.1)
      if (USE_CUSTOM_LABEL_FONTS) m.setLayoutProperty(id, 'text-font', font)
    } catch {
      /* layer/paint/glyph mismatch — ignore */
    }
  }
  ADMIN_LABELS.forEach((id) => restyle(id, ['Inter Regular']))
  STREET_LABELS.forEach((id) => restyle(id, ['JetBrains Mono Regular']))
}

/** Raise all data overlays above the 3D building extrusions + terrain, corridor topmost. */
function raiseOverlays(m: maplibregl.Map) {
  for (const l of LAYERS) {
    if (l.geometry === 'raster' || l.key === 'innovation_district' || l.key === 'study_area') continue
    for (const id of mlIds(l)) if (m.getLayer(id)) m.moveLayer(id)
  }
  if (m.getLayer('grid-line')) m.moveLayer('grid-line')
  raiseCorridor(m)
  sinkStudyArea(m)
  // detailed basemap text labels sit on top of the entire layer order
  basemapLabelIds.forEach((id) => {
    if (m.getLayer(id)) m.moveLayer(id)
  })
}

/** Keep the Study Area at the bottom of the data overlays (above the basemap +
 *  satellite), so its soft fill never covers the other layers. */
function sinkStudyArea(m: maplibregl.Map) {
  if (!m.getLayer('study_area-0')) return
  const anchor = m
    .getStyle()
    .layers.find(
      (l) =>
        l.type !== 'background' &&
        l.type !== 'raster' &&
        (l as { source?: string }).source !== 'protomaps' &&
        !l.id.startsWith('study_area'),
    )?.id
  if (!anchor) return
  ;['study_area-0', 'study_area-1'].forEach((id) => {
    if (m.getLayer(id)) m.moveLayer(id, anchor)
  })
}

/** ids of currently-visible interactive layers, for hit-testing popups. */
function interactiveIds(m: maplibregl.Map): string[] {
  const ids: string[] = []
  for (const l of LAYERS) {
    if (!l.interactive || !store.visible[l.key]) continue
    if (isCluster(l)) {
      const id = `${l.key}-unclustered` // popups on individual points, not the cluster bubbles
      if (m.getLayer(id)) ids.push(id)
    } else {
      for (const id of mlIds(l)) if (m.getLayer(id)) ids.push(id)
    }
  }
  return ids
}

/** ids of visible cluster-bubble layers, for click-to-zoom. */
function clusterIds(m: maplibregl.Map): string[] {
  return LAYERS.filter((l) => isCluster(l) && store.visible[l.key])
    .map((l) => `${l.key}-clusters`)
    .filter((id) => m.getLayer(id))
}

function isBlank(v: unknown): boolean {
  return v === null || v === undefined || v === '' || String(v).toLowerCase() === 'nan'
}

// Explanatory tooltip: layer title + one-line description of what the layer is,
// then the layer's chosen attributes with friendly labels (config in layers.ts).
function popupHtml(feature: maplibregl.MapGeoJSONFeature): string {
  const key = feature.layer.id.replace(/-(unclustered|clusters|cluster-count|\d+)$/, '')
  const l = layerByKey.get(key)
  const props = (feature.properties ?? {}) as Record<string, unknown>
  const title = l?.label ?? key
  const desc = l?.tooltip?.desc ? `<div class="tip-desc">${l.tooltip.desc}</div>` : ''

  let rows = ''
  if (l?.tooltip?.fields?.length) {
    rows = l.tooltip.fields
      .filter((f) => !isBlank(props[f.key]))
      .map((f) => {
        const v = `${f.prefix ?? ''}${props[f.key]}${f.suffix ?? ''}`
        return `<div class="tip-row"><span class="tip-k">${f.label}</span><span class="tip-v">${v}</span></div>`
      })
      .join('')
  } else if (!l?.tooltip) {
    rows = Object.entries(props)
      .filter(([, v]) => !isBlank(v))
      .slice(0, 5)
      .map(([k, v]) => `<div class="tip-row"><span class="tip-k">${k}</span><span class="tip-v">${v}</span></div>`)
      .join('')
  }
  return `<div class="tip"><div class="tip-title">${title}</div>${desc}${rows}</div>`
}

function wireInteractions(m: maplibregl.Map) {
  // Desktop: transient popup that follows the cursor (fine pointer only —
  // 'mousemove' also fires spuriously on touch, so gate it on hover support).
  if (canHover) {
    m.on('mousemove', (e) => {
      const ids = interactiveIds(m)
      const feats = ids.length ? m.queryRenderedFeatures(e.point, { layers: ids }) : []
      if (feats.length) {
        m.getCanvas().style.cursor = 'pointer'
        if (!hoverPopup)
          hoverPopup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 8 })
        hoverPopup.setLngLat(e.lngLat).setHTML(popupHtml(feats[0])).addTo(m)
      } else {
        m.getCanvas().style.cursor = ''
        hoverPopup?.remove()
        hoverPopup = null
      }
    })
    m.on('mouseout', () => {
      hoverPopup?.remove()
      hoverPopup = null
    })
  }

  // Touch + click: a persistent, closeable popup at the tapped feature. This is
  // the only way to inspect on an iPad (no hover), and is harmless on desktop.
  m.on('click', (e) => {
    // Clicking a cluster bubble zooms in to break it apart.
    const cIds = clusterIds(m)
    const cFeats = cIds.length ? m.queryRenderedFeatures(e.point, { layers: cIds }) : []
    if (cFeats.length) {
      const f = cFeats[0]
      const srcId = `src-${f.layer.id.replace('-clusters', '')}`
      const src = m.getSource(srcId) as maplibregl.GeoJSONSource | undefined
      const cid = f.properties?.cluster_id
      if (src && cid != null) {
        src
          .getClusterExpansionZoom(cid)
          .then((z) => m.easeTo({ center: (f.geometry as GeoJSON.Point).coordinates as [number, number], zoom: z }))
          .catch(() => {})
      }
      return
    }
    emit('mapClick', e.lngLat.lng, e.lngLat.lat) // drives Street View; marker follows via markerLng/markerLat
    const ids = interactiveIds(m)
    const feats = ids.length ? m.queryRenderedFeatures(e.point, { layers: ids }) : []
    if (!feats.length) {
      tapPopup?.remove()
      tapPopup = null
      return
    }
    if (!tapPopup) tapPopup = new maplibregl.Popup({ closeButton: true, closeOnClick: true, offset: 8 })
    tapPopup.setLngLat(e.lngLat).setHTML(popupHtml(feats[0])).addTo(m)
  })
}

onMounted(async () => {
  maplibregl.addProtocol('pmtiles', new Protocol().tile)
  await store.loadAvailability()

  map = new maplibregl.Map({
    container: 'id-map',
    style: buildBasemapStyle(BASE),
    center: VIEWPORT.center,
    zoom: VIEWPORT.zoom,
    bearing: VIEWPORT.bearing,
    dragRotate: true, // opens at VIEWPORT.bearing but is freely rotatable
    pitchWithRotate: false, // 2D rotation stays flat; 3D pitch is set by the 3D toggle
    attributionControl: { compact: true },
  })
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
  map.addControl(new maplibregl.ScaleControl({ maxWidth: 110, unit: 'metric' }), 'bottom-right')
  // ensure rotation works on desktop (right-drag / ctrl-drag) and iPad (two-finger)
  map.dragRotate.enable()
  map.touchZoomRotate.enableRotation()
  map.on('rotate', () => {
    if (map) bearing.value = map.getBearing()
  })

  map.on('load', () => {
    const m = map!
    const styleLayers = m.getStyle()?.layers ?? []
    firstSymbolId = styleLayers.find((l) => l.type === 'symbol')?.id
    // Reuse a font that exists in the style for cluster-count labels.
    const withFont = styleLayers.find(
      (l) => l.type === 'symbol' && Array.isArray((l.layout as { 'text-font'?: string[] })?.['text-font']),
    )
    if (withFont) clusterFont = (withFont.layout as { 'text-font': string[] })['text-font']
    // Basemap labels: hidden by default (clean/architectural look), toggled by "detail".
    basemapLabelIds = styleLayers.filter((l) => l.type === 'symbol').map((l) => l.id)
    if (!detailOn.value)
      basemapLabelIds.forEach((id) => {
        if (m.getLayer(id)) m.setLayoutProperty(id, 'visibility', 'none')
      })
    // (geolibre branch) grayscale Protomaps basemap — no warm tint patch.
    styleBasemapLabels(m) // admin + street labels in red (fonts flip on once glyphs hosted)
    addArrowImage(m)
    addHatchImage(m)
    // Add the ESRI raster first (kept hidden until toggled) so it always sits at
    // the bottom of the custom stack; then add the default-on layers.
    const esri = LAYERS.find((l) => l.geometry === 'raster')
    if (esri) addLayer(m, esri, firstSymbolId)
    syncLayers(m)

    // Dynamic scale grid — sits on top of everything, re-drawn on move.
    m.addSource('grid-src', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
    m.addLayer({
      id: 'grid-line',
      type: 'line',
      source: 'grid-src',
      layout: { visibility: gridOn.value ? 'visible' : 'none' },
      paint: { 'line-color': '#e07a5f', 'line-width': 0.6, 'line-opacity': 0.5 },
    })
    m.on('moveend', () => updateGrid(m))
    updateGrid(m) // populate the grid now (it's on by default)

    wireInteractions(m)
    if (terrainOn.value) apply3D(true, false) // 3D scene on by default
    raiseOverlays(m) // data layers above the grid, 3D buildings + terrain

    // Report the current viewport bounds to the locator inset (moves the red box).
    const emitBounds = () => {
      const b = m.getBounds()
      emit('viewport', b.getWest(), b.getSouth(), b.getEast(), b.getNorth())
    }
    m.on('move', () => {
      emitBounds()
      updateCoordTargets()
    })
    m.on('resize', updateCoordTargets)
    emitBounds()
    updateCoordTargets()
  })

  // add-on-demand + toggle visibility reactively
  watch(
    () => ({ ...store.visible }),
    () => {
      if (map?.isStyleLoaded()) syncLayers(map)
    },
    { deep: true },
  )
})

onBeforeUnmount(() => {
  if (coordRaf) cancelAnimationFrame(coordRaf)
  hoverPopup?.remove()
  tapPopup?.remove()
  svMarker?.remove()
  map?.remove()
  map = null
})

function logView() {
  if (!map) return
  const c = map.getCenter()
  // eslint-disable-next-line no-console
  console.log('viewport:', {
    center: [Number(c.lng.toFixed(5)), Number(c.lat.toFixed(5))],
    zoom: Number(map.getZoom().toFixed(2)),
  })
}

// Building ids managed by the 3D scene (not part of the LAYERS catalogue).
const BUILDING_3D_IDS = ['buildings-3d-context', 'buildings-3d-study']

// Heights are ESTIMATED from footprint area (no measured heights exist for Cape
// Town). Two layers: the study-area buildings as a solid white "Rhino Arctic"
// massing, and the inverse (all other footprints) as a mid-opacity, ghosted
// context. Heights below are shared; the study set is nudged ~4% taller so its
// opaque white always wins over the transparent context where they overlap.
const CTX_HEIGHT: unknown[] = ['interpolate', ['linear'], ['to-number', ['get', 'area_mtrs']], 40, 6, 400, 14, 1500, 26, 6000, 44]
function ensureBuildings3D(m: maplibregl.Map) {
  const g = layerByKey.get('google_buildings')
  if (g?.pmtiles && store.isAvailable('google_buildings')) {
    const srcId = 'src-google_buildings'
    if (!m.getSource(srcId))
      m.addSource(srcId, {
        type: 'vector',
        url: `pmtiles://${location.origin}${BASE}data/layers/${g.pmtiles.file}`,
      })
    if (!m.getLayer('buildings-3d-context'))
      m.addLayer({
        id: 'buildings-3d-context',
        type: 'fill-extrusion',
        source: srcId,
        'source-layer': g.pmtiles.sourceLayer,
        minzoom: 13,
        paint: {
          'fill-extrusion-color': '#e9e7e1',
          'fill-extrusion-height': CTX_HEIGHT,
          'fill-extrusion-opacity': 0.32,
          'fill-extrusion-vertical-gradient': true,
        },
      } as maplibregl.LayerSpecification)
  }
  const s = layerByKey.get('study_buildings')
  if (s && store.isAvailable('study_buildings')) {
    const sid = 'src-study3d'
    if (!m.getSource(sid)) m.addSource(sid, { type: 'geojson', data: `${BASE}data/layers/study_buildings.geojson` })
    if (!m.getLayer('buildings-3d-study'))
      m.addLayer({
        id: 'buildings-3d-study',
        type: 'fill-extrusion',
        source: sid,
        minzoom: 13,
        paint: {
          'fill-extrusion-color': '#ffffff',
          'fill-extrusion-height': ['*', 1.04, CTX_HEIGHT],
          'fill-extrusion-opacity': 1,
          'fill-extrusion-vertical-gradient': true,
        },
      } as maplibregl.LayerSpecification)
  }
}

// 3D scene: drape the basemap over a free elevation DEM (AWS Terrarium tiles),
// extrude building footprints, and tilt the camera. Off resets to the flat,
// fixed-bearing publication view. `animate=false` is used to apply the default
// on first load without a fly-in.
function apply3D(on: boolean, animate = true) {
  const m = map
  if (!m) return
  if (on) {
    if (!m.getSource('terrain-dem'))
      m.addSource('terrain-dem', {
        type: 'raster-dem',
        tiles: ['https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png'],
        encoding: 'terrarium',
        tileSize: 256,
        maxzoom: 15,
      })
    m.setTerrain({ source: 'terrain-dem', exaggeration: 1.4 })
    m.setSky({
      'sky-color': '#a9c7e6',
      'horizon-color': '#eef1ec',
      'fog-color': '#efe9db',
      'sky-horizon-blend': 0.6,
      'horizon-fog-blend': 0.6,
      'fog-ground-blend': 0.35,
    })
    ensureBuildings3D(m)
    BUILDING_3D_IDS.forEach((id) => {
      if (m.getLayer(id)) m.setLayoutProperty(id, 'visibility', 'visible')
    })
    // soft, near-white directional light for a Rhino "Arctic"-style matte massing
    m.setLight({ anchor: 'viewport', color: '#ffffff', intensity: 0.4, position: [1.4, 210, 32] })
    raiseOverlays(m) // all data layers sit above the 3D buildings + terrain
    m.dragRotate.enable()
    m.touchZoomRotate.enableRotation()
    if (animate) m.easeTo({ pitch: 55, duration: 800 })
    else m.setPitch(55)
  } else {
    m.setTerrain(null)
    BUILDING_3D_IDS.forEach((id) => {
      if (m.getLayer(id)) m.setLayoutProperty(id, 'visibility', 'none')
    })
    // keep rotation enabled in 2D; just flatten the pitch (preserve the bearing)
    if (animate) m.easeTo({ pitch: 0, duration: 800 })
    else m.setPitch(0)
  }
}

function toggle3D() {
  terrainOn.value = !terrainOn.value
  apply3D(terrainOn.value)
}

function resetNorth() {
  map?.easeTo({ bearing: VIEWPORT.bearing, duration: 500 })
}
</script>

<template>
  <div class="map-wrap">
    <div id="id-map" class="map" />
    <div class="coord coord-nw">{{ fmtCoord(corners.nw) }}</div>
    <div class="coord coord-ne">{{ fmtCoord(corners.ne) }}</div>
    <div class="coord coord-sw">{{ fmtCoord(corners.sw) }}</div>
    <div class="coord coord-se">{{ fmtCoord(corners.se) }}</div>
    <button
      class="north-arrow"
      aria-label="Reset map orientation"
      title="Reset orientation"
      @click="resetNorth"
    >
      <svg viewBox="0 0 44 44" width="40" height="40" fill="none" stroke="#ea4c2e">
        <circle cx="22" cy="22" r="16" stroke-width="2.5" />
        <!-- north tick at 12 o'clock; rotates with the map bearing -->
        <line
          :transform="`rotate(${-bearing} 22 22)`"
          x1="22"
          y1="6"
          x2="22"
          y2="22"
          stroke-width="3"
          stroke-linecap="round"
        />
      </svg>
    </button>
    <button
      class="terrain-toggle"
      :class="{ on: terrainOn }"
      title="Toggle 3D view (terrain relief + extruded buildings)"
      @click="toggle3D"
    >
      ⛰ {{ terrainOn ? '3D' : '2D' }}
    </button>
    <button
      class="detail-toggle"
      :class="{ on: detailOn }"
      title="Toggle basemap labels (detailed vs clean)"
      @click="toggleDetail"
    >
      ◫ {{ detailOn ? 'detailed' : 'clean' }}
    </button>
    <button
      class="grid-toggle"
      :class="{ on: gridOn }"
      title="Toggle a scale grid that resizes with zoom"
      @click="toggleGrid"
    >
      ▦ grid<span v-if="gridOn && gridCellLabel"> · {{ gridCellLabel }}</span>
    </button>
    <button class="log-view" title="Log current center/zoom to console" @click="logView">
      ⌖ log view
    </button>
  </div>
</template>

<style scoped>
.map-wrap {
  position: relative;
  height: 100%;
  width: 100%;
}
.map {
  height: 100%;
  width: 100%;
}
.north-arrow {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 5;
  padding: 0;
  border: none;
  background: transparent;
  line-height: 0;
  cursor: pointer;
}
/* live corner coordinates */
.coord {
  position: absolute;
  z-index: 5;
  font-family: var(--font-mono);
  font-size: 0.6rem;
  letter-spacing: 0.02em;
  color: var(--color-accent);
  background: rgb(253 251 245 / 0.6);
  padding: 1px 5px;
  border-radius: 3px;
  pointer-events: none;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.coord-nw {
  top: 52px;
  left: 8px;
}
.coord-ne {
  top: 72px;
  right: 10px;
}
.coord-sw {
  bottom: 118px;
  left: 8px;
}
.coord-se {
  bottom: 44px;
  right: 10px;
}
.log-view,
.grid-toggle,
.detail-toggle,
.terrain-toggle {
  position: absolute;
  left: 8px;
  z-index: 5;
  font-size: 0.68rem;
  color: var(--color-light);
  background: var(--color-darker);
  border: 1px solid var(--color-grey);
  border-radius: 4px;
  padding: 2px 6px;
  opacity: 0.85;
  cursor: pointer;
}
.log-view {
  bottom: 8px;
}
.grid-toggle {
  bottom: 34px;
}
.detail-toggle {
  bottom: 60px;
}
.terrain-toggle {
  bottom: 86px;
}
.log-view:hover,
.grid-toggle:hover,
.detail-toggle:hover,
.terrain-toggle:hover {
  opacity: 1;
}
.grid-toggle.on,
.detail-toggle.on,
.terrain-toggle.on {
  color: var(--color-accent);
  border-color: var(--color-accent);
  opacity: 1;
}
</style>
