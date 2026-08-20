// Fixed viewport locked to the UCT Innovation District (campuses + Main Road
// corridor + ~200 m margin). Edit these to re-frame the map; the dev "log view"
// button (bottom-left of the map) prints the current center/zoom so you can pin
// an exact framing.
// DEFAULT framing only — the map opens here but pan/zoom are NOT locked, so users
// can move and zoom freely. (Rotation stays fixed to preserve the orientation.)
// Tweak `center`/`zoom`/`bearing` to change the opening view; the "log view"
// button on the map prints the current values.
export const VIEWPORT = {
  center: [18.464, -33.9484] as [number, number],
  zoom: 13,
  bearing: 270, // north points right
}

// Light basemap (CARTO/OpenFreeMap Positron) — same as CityPulse light mode.
export const BASEMAP_STYLE = 'https://tiles.openfreemap.org/styles/positron'
