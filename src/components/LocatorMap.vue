<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

// A tiny north-up locator ("key plan"): a light-grey outline of the Cape Town
// metro with a red box showing the current map viewport, which moves/resizes as
// the user pans and zooms.
const props = defineProps<{ bounds: [number, number, number, number] | null }>()
const BASE = import.meta.env.BASE_URL

const rings = ref<number[][][]>([])
const bbox = ref<[number, number, number, number] | null>(null)
const W = 200

const height = computed(() => {
  if (!bbox.value) return W
  const [minLon, minLat, maxLon, maxLat] = bbox.value
  const cosLat = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180)
  return (W * (maxLat - minLat)) / ((maxLon - minLon) * cosLat)
})

function proj(lon: number, lat: number): [number, number] {
  const [minLon, minLat, maxLon, maxLat] = bbox.value!
  const x = ((lon - minLon) / (maxLon - minLon)) * W
  const y = ((maxLat - lat) / (maxLat - minLat)) * height.value
  return [x, y]
}

const metroPath = computed(() => {
  if (!bbox.value) return ''
  return rings.value
    .map(
      (ring) =>
        ring
          .map(([lon, lat], i) => {
            const [x, y] = proj(lon, lat)
            return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`
          })
          .join(' ') + ' Z',
    )
    .join(' ')
})

const rect = computed(() => {
  if (!bbox.value || !props.bounds) return null
  const [w, s, e, n] = props.bounds
  const clamp = (v: number, hi: number) => Math.max(0, Math.min(hi, v))
  const [x1, y1] = proj(w, n)
  const [x2, y2] = proj(e, s)
  const rx = clamp(Math.min(x1, x2), W)
  const ry = clamp(Math.min(y1, y2), height.value)
  return {
    x: rx,
    y: ry,
    w: Math.max(clamp(Math.max(x1, x2), W) - rx, 1.5),
    h: Math.max(clamp(Math.max(y1, y2), height.value) - ry, 1.5),
  }
})

function collectRings(geom: GeoJSON.Geometry, out: number[][][]) {
  if (geom.type === 'Polygon') geom.coordinates.forEach((r) => out.push(r as number[][]))
  else if (geom.type === 'MultiPolygon')
    geom.coordinates.forEach((poly) => poly.forEach((r) => out.push(r as number[][])))
}

onMounted(async () => {
  try {
    const res = await fetch(`${BASE}data/layers/ct_metro.geojson`)
    if (!res.ok) return
    const fc = (await res.json()) as GeoJSON.FeatureCollection
    const out: number[][][] = []
    fc.features.forEach((f) => f.geometry && collectRings(f.geometry, out))
    let minLon = Infinity,
      minLat = Infinity,
      maxLon = -Infinity,
      maxLat = -Infinity
    out.forEach((r) =>
      r.forEach(([lon, lat]) => {
        if (lon < minLon) minLon = lon
        if (lon > maxLon) maxLon = lon
        if (lat < minLat) minLat = lat
        if (lat > maxLat) maxLat = lat
      }),
    )
    rings.value = out
    bbox.value = [minLon, minLat, maxLon, maxLat]
  } catch {
    /* no locator data — component stays hidden */
  }
})
</script>

<template>
  <figure v-if="bbox" class="locator">
    <svg :viewBox="`0 0 ${W} ${height}`" preserveAspectRatio="xMidYMid meet">
      <path :d="metroPath" class="metro" />
      <rect
        v-if="rect"
        :x="rect.x"
        :y="rect.y"
        :width="rect.w"
        :height="rect.h"
        class="viewbox"
      />
    </svg>
  </figure>
</template>

<style scoped>
.locator {
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0;
  width: 100%;
  height: 100%;
}
.locator svg {
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
  display: block;
  overflow: visible;
}
.metro {
  fill: none;
  stroke: var(--color-accent);
  stroke-width: 2;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
}
.viewbox {
  fill: rgb(234 76 46 / 0.14);
  stroke: var(--color-accent);
  stroke-width: 2;
  vector-effect: non-scaling-stroke;
}
</style>
