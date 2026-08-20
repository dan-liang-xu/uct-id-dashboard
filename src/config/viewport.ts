import { layers, namedFlavor } from '@protomaps/basemaps'
import type { StyleSpecification } from 'maplibre-gl'

// Fixed viewport locked to the UCT Innovation District (campuses + Main Road
// corridor + ~200 m margin). Edit these to re-frame the map; the dev "log view"
// button (bottom-left of the map) prints the current center/zoom so you can pin
// an exact framing.
// DEFAULT framing only — the map opens here but pan/zoom are NOT locked, so users
// can move and zoom freely. (Rotation stays fixed to preserve the orientation.)
export const VIEWPORT = {
  center: [18.464, -33.9484] as [number, number],
  zoom: 13,
  bearing: 270, // north points right
}

// EXPERIMENT (geolibre branch): a self-hosted GRAYSCALE Protomaps basemap, the
// GeoLibre approach — a Cape Town extract of the Protomaps planet as a local
// .pmtiles (public/data/basemap/ct-basemap.pmtiles) themed with
// @protomaps/basemaps. No dependency on OpenFreeMap's tile servers.
export function buildBasemapStyle(base: string): StyleSpecification {
  return {
    version: 8,
    glyphs: 'https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf',
    sprite: 'https://protomaps.github.io/basemaps-assets/sprites/v4/white',
    sources: {
      protomaps: {
        type: 'vector',
        url: `pmtiles://${window.location.origin}${base}data/basemap/ct-basemap.pmtiles`,
        attribution: '© OpenStreetMap · Protomaps',
      },
    },
    layers: layers('protomaps', namedFlavor('white'), { lang: 'en' }),
  }
}
