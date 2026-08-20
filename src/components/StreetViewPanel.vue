<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { googleMapsApiKey } from '@/lib/config'

const props = defineProps<{ lat: number | null; lng: number | null; floating?: boolean }>()
const emit = defineEmits<{ positionChanged: [lng: number, lat: number]; toggleDock: [] }>()

const containerRef = ref<HTMLDivElement | null>(null)
const hasKey = !!googleMapsApiKey
const status = ref<'idle' | 'loading' | 'ok' | 'no-key' | 'error'>(!hasKey ? 'no-key' : 'idle')
const streetName = ref<string | null>(null)
let panorama: google.maps.StreetViewPanorama | null = null
let svService: google.maps.StreetViewService | null = null
let geocoder: google.maps.Geocoder | null = null
let loadPromise: Promise<void> | null = null
let mounted = false

// Header shows the reverse-geocoded street name (instead of coordinates).
const headerLabel = computed(() => {
  if (status.value === 'ok') return streetName.value ?? 'Unknown road'
  if (status.value === 'loading') return '…'
  return ''
})

async function reverseGeocode(latLng: google.maps.LatLng) {
  if (!geocoder) geocoder = new google.maps.Geocoder()
  try {
    const { results } = await geocoder.geocode({ location: latLng })
    const comps = results.flatMap((r) => r.address_components)
    const pick = (types: string[]) =>
      comps.find((c) => types.some((t) => c.types.includes(t)))?.long_name ?? null
    const road = pick(['route'])
    const suburb = pick(['sublocality', 'sublocality_level_1', 'neighborhood'])
    const city = pick(['locality', 'postal_town', 'administrative_area_level_2'])
    const country = pick(['country'])
    const parts = [road, suburb, city, country].filter(Boolean)
    streetName.value = parts.length ? parts.join(', ') : (results[0]?.formatted_address ?? null)
  } catch {
    streetName.value = null
  }
}

function loadGoogleMaps(): Promise<void> {
  if (loadPromise) return loadPromise
  if (window.google?.maps?.StreetViewPanorama) return Promise.resolve()
  if (!googleMapsApiKey) return Promise.reject(new Error('No Google Maps API key'))
  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${googleMapsApiKey}&loading=async&callback=__gmapsReady`
    script.async = true
    script.defer = true
    ;(window as unknown as { __gmapsReady: () => void }).__gmapsReady = () => {
      delete (window as unknown as { __gmapsReady?: () => void }).__gmapsReady
      resolve()
    }
    script.onerror = () => reject(new Error('Failed to load Google Maps SDK'))
    document.head.appendChild(script)
  })
  return loadPromise
}

async function initOrUpdate() {
  if (!mounted || !hasKey || props.lat == null || props.lng == null) return
  try {
    await loadGoogleMaps()
  } catch {
    status.value = 'error'
    return
  }
  const pos = { lat: props.lat, lng: props.lng }
  if (!svService) svService = new google.maps.StreetViewService()
  try {
    const result = await svService.getPanorama({ location: pos, radius: 300, source: google.maps.StreetViewSource.OUTDOOR })
    if (!result?.data?.location?.latLng) {
      status.value = 'error'
      return
    }
    status.value = 'ok'
    reverseGeocode(result.data.location.latLng)
    if (panorama) {
      panorama.setPano(result.data.location.pano!)
    } else if (containerRef.value) {
      panorama = new google.maps.StreetViewPanorama(containerRef.value, {
        pano: result.data.location.pano!,
        pov: { heading: 0, pitch: 0 },
        zoom: 0,
        addressControl: false,
        fullscreenControl: true,
        motionTracking: false,
        motionTrackingControl: false,
        linksControl: true,
        panControl: false,
        zoomControl: true,
        enableCloseButton: false,
        showRoadLabels: false,
      })
      // As the user walks the panorama, report the new position (moves the ACC
      // map marker) and refresh the street name.
      panorama.addListener('position_changed', () => {
        const p = panorama?.getPosition()
        if (!p) return
        emit('positionChanged', p.lng(), p.lat())
        reverseGeocode(p)
      })
    }
  } catch {
    status.value = 'error'
  }
}

onMounted(() => {
  mounted = true
  initOrUpdate()
})
watch(
  () => [props.lat, props.lng],
  () => {
    if (props.lat == null || props.lng == null) return
    streetName.value = null
    if (status.value !== 'no-key') status.value = 'loading'
    initOrUpdate()
  },
)
onBeforeUnmount(() => {
  mounted = false
  panorama = null
})
</script>

<template>
  <div class="sv-card">
    <div class="sv-head">
      <div class="sv-head-top">
        <span class="sv-title">Street View</span>
        <button
          class="sv-dock"
          :title="floating ? 'Dock back into the panel' : 'Pop out into a floating window'"
          @click="emit('toggleDock')"
        >
          {{ floating ? '⇤ dock' : '⇱ pop out' }}
        </button>
      </div>
      <span class="sv-coords" :title="headerLabel">{{ headerLabel }}</span>
    </div>
    <div class="sv-body">
      <div v-show="status === 'ok'" ref="containerRef" class="sv-pano" />
      <div v-if="status === 'idle'" class="sv-fallback">
        <span class="sv-hint">Click a location on the map to start Street View.</span>
      </div>
      <div v-else-if="status === 'no-key'" class="sv-fallback">
        <p class="sv-msg">Street View needs a Google Maps API key.</p>
        <p class="sv-sub">
          Add <code>VITE_GOOGLE_MAPS_API_KEY</code> to <code>.env.local</code> (Maps JavaScript API
          enabled), then restart the dev server.
        </p>
      </div>
      <div v-else-if="status === 'loading'" class="sv-fallback"><span class="sv-hint">Loading…</span></div>
      <div v-else-if="status === 'error'" class="sv-fallback">
        <span class="sv-hint">No Street View imagery here — click nearer a road.</span>
      </div>
    </div>
    <div class="sv-foot">Click the map to look around · drag inside to pan</div>
  </div>
</template>

<style scoped>
.sv-card {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--color-dark);
  border: 1px solid var(--color-grey);
  border-radius: var(--panel-radius);
  overflow: hidden;
}
.sv-head {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 0.5rem 0.6rem;
  border-bottom: 1px solid var(--color-grey);
  flex-shrink: 0;
}
.sv-head-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}
.sv-title {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-light);
}
.sv-dock {
  font-family: var(--font-mono);
  font-size: 0.58rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-light);
  background: transparent;
  border: 1px solid var(--color-grey);
  border-radius: 4px;
  padding: 1px 6px;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
}
.sv-dock:hover {
  color: var(--color-accent);
  border-color: var(--color-accent);
}
.sv-coords {
  font-size: 0.76rem;
  color: var(--color-white);
  line-height: 1.3;
}
.sv-body {
  position: relative;
  flex: 1;
  min-height: 0;
}
.sv-pano {
  width: 100%;
  height: 100%;
}
.sv-fallback {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  padding: 1rem;
  text-align: center;
}
.sv-msg {
  font-size: 0.8rem;
  color: var(--color-lighter);
  font-weight: 500;
}
.sv-sub {
  font-size: 0.68rem;
  color: var(--color-light);
  line-height: 1.4;
}
.sv-sub code {
  font-family: var(--font-mono);
  font-size: 0.62rem;
  background: var(--color-darkest);
  padding: 0 3px;
  border-radius: 3px;
}
.sv-hint {
  font-size: 0.72rem;
  color: var(--color-light);
}
.sv-foot {
  flex-shrink: 0;
  padding: 0.35rem 0.6rem;
  font-size: 0.64rem;
  color: var(--color-light);
  border-top: 1px solid var(--color-grey);
}
</style>
