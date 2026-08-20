// The layer catalogue for the UCT Innovation District dashboard.
//
// Each entry defines: how the layer is drawn (MapLibre specs), its legend, its
// data-source metadata (Sources panel), and an explanatory `tooltip` (what the
// layer is + which attributes to surface, with friendly labels). A vector layer
// renders only once its GeoJSON exists in public/data/layers/<file> AND its key
// is in public/data/layers/available.json (written by scripts/build_layers.py).

export type Geom = 'point' | 'line' | 'polygon' | 'raster'

export interface MlLayer {
  type: 'circle' | 'line' | 'fill' | 'raster' | 'symbol'
  paint?: Record<string, unknown>
  layout?: Record<string, unknown>
  filter?: unknown[]
  minzoom?: number
}

export interface SourceMeta {
  name: string
  provider: string
  url?: string
  year?: string
  licence?: string
  attribution?: string
  notes?: string
}

export interface Legend {
  kind: Geom | 'ramp'
  color?: string
  colors?: { color: string; label: string }[]
  label?: string
}

export interface TipField {
  key: string
  label: string
  prefix?: string
  suffix?: string
}
export interface Tooltip {
  desc?: string
  fields?: TipField[]
}

export interface LayerDef {
  key: string
  label: string
  group: string
  geometry: Geom
  file?: string
  pmtiles?: { file: string; sourceLayer: string } // vector tiles for heavy full-extent layers
  raster?: { tiles: string[]; tileSize?: number; attribution?: string }
  ml: MlLayer[]
  legend: Legend
  source: SourceMeta
  tooltip?: Tooltip
  defaultOn?: boolean
  interactive?: boolean
}

export const GROUPS = [
  'Basemap & Boundaries',
  'Catalytic Clusters',
  'Buildings & Streets',
  'Transport',
  'Amenities',
  'Environment & Terrain',
  'Demographics',
  'Activity',
] as const

// ---- style helpers -------------------------------------------------------
const pointMl = (color: string, r = 1): MlLayer[] => [
  {
    type: 'circle',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 4 * r, 17, 11 * r],
      'circle-color': color,
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 1.6,
      'circle-opacity': 0.95,
    },
  },
]
const lineMl = (color: string, w = 1): MlLayer[] => [
  {
    type: 'line',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': color,
      'line-width': ['interpolate', ['linear'], ['zoom'], 13, w, 17, w * 3],
      'line-opacity': 0.9,
    },
  },
]
const polygonMl = (fill: string, outline: string, opacity = 0.5): MlLayer[] => [
  { type: 'fill', paint: { 'fill-color': fill, 'fill-opacity': opacity } },
  { type: 'line', paint: { 'line-color': outline, 'line-width': 0.6, 'line-opacity': 0.8 } },
]
const fillMl = (fill: string, opacity = 0.6): MlLayer[] => [
  { type: 'fill', paint: { 'fill-color': fill, 'fill-opacity': opacity } },
]
type ChoroLabel = { text: unknown; bold?: boolean; size?: number }
const choroMl = (fill: unknown, label?: ChoroLabel): MlLayer[] => {
  const layers: MlLayer[] = [
    { type: 'fill', paint: { 'fill-color': fill, 'fill-opacity': 0.6 } },
    {
      type: 'line',
      paint: {
        'line-color': '#ffffff',
        'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.6, 15, 1.6],
        'line-opacity': 0.9,
      },
    },
  ]
  // centre label: small identifier for census; large bold value for gini
  if (label) {
    const base = label.size ?? 9
    layers.push({
      type: 'symbol',
      minzoom: 12.5,
      layout: {
        'text-field': label.text,
        'text-font': label.bold ? ['Noto Sans Bold'] : ['Noto Sans Regular'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 12.5, base, 16, base + (label.bold ? 9 : 2)],
        'text-allow-overlap': false,
        'text-padding': 3,
      },
      paint: {
        'text-color': '#4a443c',
        'text-halo-color': '#ffffff',
        'text-halo-width': label.bold ? 1.6 : 1.1,
      },
    })
  }
  return layers
}

const RACE_FILL = [
  'match', ['get', 'group'],
  'African', '#3f7185', 'Coloured', '#c99544', 'Indian', '#bd5c4c', 'White', '#5c8f6a', 'Other', '#7e6396',
  '#c9c6bd',
]
const GINI_FILL = ['interpolate', ['linear'], ['to-number', ['get', 'gini']], 0.55, '#efedf5', 0.62, '#bcbddc', 0.7, '#756bb1']
const POP_FILL = ['interpolate', ['linear'], ['to-number', ['get', 'total_pop']], 200, '#deebf7', 500, '#9ecae1', 900, '#3182bd']
const DENS_FILL = ['interpolate', ['linear'], ['to-number', ['get', 'density']], 0, '#feedde', 8000, '#fdae6b', 35000, '#e6550d']

const USER = 'User-provided (ACC)'

// ---- catalogue -----------------------------------------------------------
export const LAYERS: LayerDef[] = [
  // Basemap & Boundaries
  {
    key: 'esri_satellite',
    label: 'ESRI Satellite Imagery',
    group: 'Basemap & Boundaries',
    geometry: 'raster',
    raster: {
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      attribution: 'Esri, Maxar, Earthstar Geographics, and the GIS User Community',
    },
    ml: [{ type: 'raster', paint: { 'raster-opacity': 1 } }],
    legend: { kind: 'raster', label: 'Aerial imagery' },
    source: { name: 'World Imagery', provider: 'Esri', attribution: 'Esri, Maxar, Earthstar Geographics' },
  },
  {
    key: 'innovation_district',
    label: 'Innovation District Corridor',
    group: 'Basemap & Boundaries',
    geometry: 'line',
    file: 'innovation_district.geojson',
    ml: [
      // soft drop-shadow: a wider, blurred, dark line beneath the red corridor
      {
        type: 'line',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': 'rgba(20,10,5,0.9)',
          'line-width': ['interpolate', ['linear'], ['zoom'], 13, 4.5, 17, 11],
          'line-blur': 2.5,
          'line-opacity': 0.4,
        },
      },
      ...lineMl('#ea4c2e', 2),
    ],
    legend: { kind: 'line', color: '#ea4c2e', label: 'Main Road corridor' },
    source: { name: 'UCT Innovation District corridor', provider: 'ACC / UCT', year: '2026' },
    tooltip: { desc: 'The Main Road innovation-district study corridor.', fields: [{ key: 'segment_name', label: 'Segment' }] },
    defaultOn: true,
    interactive: true,
  },
  {
    key: 'uct_campuses',
    label: 'UCT Campuses',
    group: 'Basemap & Boundaries',
    geometry: 'polygon',
    file: 'uct_campuses.geojson',
    ml: [
      { type: 'fill', paint: { 'fill-color': '#ea4c2e', 'fill-opacity': 0.3 } },
      { type: 'line', paint: { 'line-color': '#ea4c2e', 'line-width': 1.4, 'line-opacity': 0.85 } },
    ],
    legend: { kind: 'polygon', color: '#ea4c2e', label: 'Campus boundary' },
    source: { name: 'UCT campus boundaries', provider: 'ACC / UCT', year: '2026' },
    tooltip: { desc: 'University of Cape Town campus precincts.', fields: [{ key: 'campus_name', label: 'Campus' }] },
    defaultOn: true,
    interactive: true,
  },

  {
    key: 'study_area', label: 'Study Area (corridor +800 m)', group: 'Basemap & Boundaries', geometry: 'polygon', file: 'study_area.geojson',
    ml: [
      // dense, soft-light mid-opacity fill highlighting the study zone
      { type: 'fill', paint: { 'fill-color': '#8fb4dd', 'fill-opacity': 0.35 } },
      { type: 'line', paint: { 'line-color': '#1565c0', 'line-width': 1.5, 'line-dasharray': [3, 2], 'line-opacity': 0.85 } },
    ],
    legend: { kind: 'line', color: '#1565c0', label: 'Study boundary' },
    source: { name: 'Study area', provider: 'Derived', notes: 'Main Road corridor buffered 800 m ∪ UCT campuses' },
    tooltip: { desc: 'The study extent: the Main Road corridor buffered 800 m plus the UCT campuses.' },
  },
  // Buildings & Streets
  {
    key: 'study_buildings', label: 'Study Buildings (800 m + campuses)', group: 'Buildings & Streets', geometry: 'polygon', file: 'study_buildings.geojson',
    ml: fillMl('#f2a488', 0.35),
    legend: { kind: 'polygon', color: '#f2a488', label: 'Buildings in study area' },
    source: { name: 'Study buildings', provider: 'Google Open Buildings', licence: 'CC BY 4.0 / ODbL', notes: 'Footprints within 800 m of the corridor + UCT campuses' },
    tooltip: { desc: 'Buildings within the study area (Main Road corridor +800 m, plus UCT campuses).', fields: [{ key: 'area_mtrs', label: 'Area', suffix: ' m²' }, { key: 'confidence', label: 'Confidence' }] },
    defaultOn: true,
    interactive: true,
  },
  {
    key: 'google_buildings',
    label: 'Building Footprints (Google)',
    group: 'Buildings & Streets',
    geometry: 'polygon',
    pmtiles: { file: 'google_buildings.pmtiles', sourceLayer: 'google_buildings' },
    ml: fillMl('#b9b9b3', 0.5),
    legend: { kind: 'polygon', color: '#b9b9b3', label: 'Buildings (ML-detected)' },
    source: { name: 'Google Open Buildings', provider: 'Google Research', url: 'https://sites.research.google/open-buildings/', licence: 'CC BY 4.0 / ODbL', year: '2023' },
    tooltip: { desc: 'Machine-learning building footprints from satellite imagery (Google Open Buildings).', fields: [{ key: 'area_mtrs', label: 'Area', suffix: ' m²' }, { key: 'confidence', label: 'Confidence' }] },
    interactive: true,
  },

  // Transport
  {
    key: 'railway_lines', label: 'Railway Lines', group: 'Transport', geometry: 'line', file: 'railway_lines.geojson',
    ml: lineMl('#6f8fb5', 1.4), legend: { kind: 'line', color: '#6f8fb5', label: 'Railway' },
    source: { name: 'Railway lines', provider: 'City of Cape Town' },
    tooltip: { desc: 'Passenger & freight railway lines.', fields: [{ key: 'line_type', label: 'Line' }, { key: 'usage', label: 'Status' }] }, interactive: true,
  },
  {
    key: 'taxi_routes', label: 'Taxi Routes', group: 'Transport', geometry: 'line', file: 'taxi_routes.geojson',
    ml: lineMl('#e0a800', 1.1), legend: { kind: 'line', color: '#e0a800', label: 'Minibus-taxi routes' },
    source: { name: 'Minibus-taxi routes', provider: 'City of Cape Town' },
    tooltip: { desc: 'Minibus-taxi route corridors (origin → destination).', fields: [{ key: 'origin', label: 'From' }, { key: 'destination', label: 'To' }] }, interactive: true,
  },
  {
    key: 'pedestrian_ways', label: 'Pedestrian Ways', group: 'Transport', geometry: 'line', file: 'pedestrian_ways.geojson',
    ml: lineMl('#2e7d32', 1), legend: { kind: 'line', color: '#2e7d32', label: 'Footpaths & crossings' },
    source: { name: 'Pedestrian ways', provider: 'OpenStreetMap', licence: 'ODbL', attribution: '© OpenStreetMap contributors' },
    tooltip: { desc: 'Pedestrian footpaths, sidewalks and crossings (OSM).', fields: [{ key: 'highway', label: 'Type' }, { key: 'surface', label: 'Surface' }, { key: 'lit', label: 'Lit' }, { key: 'wheelchair', label: 'Wheelchair' }] }, interactive: true,
  },
  {
    key: 'railway_stations', label: 'Railway Stations', group: 'Transport', geometry: 'point', file: 'railway_stations.geojson',
    ml: pointMl('#455a64'), legend: { kind: 'point', color: '#455a64' },
    source: { name: 'Railway stations', provider: 'OpenStreetMap', licence: 'ODbL', attribution: '© OpenStreetMap contributors', notes: 'Geofabrik SA extract; railway=station/halt' },
    tooltip: { desc: 'Passenger railway stations & halts.', fields: [{ key: 'name', label: 'Station' }] }, interactive: true,
  },
  {
    key: 'myciti_routes', label: 'MyCiTi Routes', group: 'Transport', geometry: 'line', file: 'myciti_routes.geojson',
    ml: lineMl('#0e86c4', 1.2), legend: { kind: 'line', color: '#0e86c4', label: 'MyCiTi BRT' },
    source: { name: 'MyCiTi routes', provider: 'OpenStreetMap', licence: 'ODbL', attribution: '© OpenStreetMap contributors', notes: 'Geofabrik SA extract; route=bus, MyCiTi network' },
    tooltip: { desc: 'MyCiTi bus rapid-transit routes.', fields: [{ key: 'name', label: 'Route' }, { key: 'ref', label: 'Ref' }] }, interactive: true,
  },
  {
    key: 'myciti_stops', label: 'MyCiTi Stops', group: 'Transport', geometry: 'point', file: 'myciti_stops.geojson',
    ml: pointMl('#0e86c4', 0.75), legend: { kind: 'point', color: '#0e86c4' },
    source: { name: 'MyCiTi stops', provider: 'OpenStreetMap', licence: 'ODbL', attribution: '© OpenStreetMap contributors', notes: 'Geofabrik SA extract; MyCiTi stops/stations' },
    tooltip: { desc: 'MyCiTi bus stops & stations.', fields: [{ key: 'name', label: 'Stop' }] }, interactive: true,
  },
  {
    key: 'uct_shuttle_routes', label: 'UCT Jammie Shuttle', group: 'Transport', geometry: 'line', file: 'uct_shuttle_routes.geojson',
    ml: lineMl('#7d3c98', 1.4), legend: { kind: 'line', color: '#7d3c98', label: 'Jammie shuttle' },
    source: { name: 'UCT Jammie shuttle routes', provider: 'OpenStreetMap', licence: 'ODbL', attribution: '© OpenStreetMap contributors', notes: 'Geofabrik SA extract; UCT/Jammie route=bus' },
    tooltip: { desc: 'UCT Jammie Shuttle routes.', fields: [{ key: 'name', label: 'Route' }, { key: 'ref', label: 'Ref' }] }, interactive: true,
  },
  {
    key: 'uct_shuttle_stops', label: 'UCT Shuttle Stops', group: 'Transport', geometry: 'point', file: 'uct_shuttle_stops.geojson',
    ml: pointMl('#7d3c98', 0.8), legend: { kind: 'point', color: '#7d3c98' },
    source: { name: 'UCT Jammie shuttle stops', provider: 'OpenStreetMap', licence: 'ODbL', attribution: '© OpenStreetMap contributors', notes: 'Geofabrik SA extract' },
    tooltip: { desc: 'UCT Jammie Shuttle stops.', fields: [{ key: 'name', label: 'Stop' }] }, interactive: true,
  },
  {
    key: 'pedestrian_crossings', label: 'Pedestrian Crossings', group: 'Transport', geometry: 'point', file: 'pedestrian_crossings.geojson',
    ml: pointMl('#00897b', 0.7), legend: { kind: 'point', color: '#00897b' },
    source: { name: 'Pedestrian crossings', provider: 'City of Cape Town' },
    tooltip: { desc: 'Pedestrian crossings (City of Cape Town).', fields: [{ key: 'owner', label: 'Owner' }, { key: 'raised', label: 'Raised' }] }, interactive: true,
  },

  // Amenities
  {
    key: 'community_centres', label: 'Community Centres', group: 'Amenities', geometry: 'point', file: 'community_centres.geojson',
    ml: pointMl('#1565c0'), legend: { kind: 'point', color: '#1565c0' }, source: { name: 'Community centres', provider: 'City of Cape Town' },
    tooltip: { desc: 'Community centres, halls and civic centres.', fields: [{ key: 'name', label: 'Name' }] }, interactive: true,
  },
  {
    key: 'monuments', label: 'Monuments', group: 'Amenities', geometry: 'point', file: 'monuments.geojson',
    ml: pointMl('#795548'), legend: { kind: 'point', color: '#795548' }, source: { name: 'Monuments & heritage', provider: 'City of Cape Town' },
    tooltip: { desc: 'Monuments, memorials and heritage markers.', fields: [{ key: 'name', label: 'Name' }, { key: 'commemorates', label: 'Commemorates' }, { key: 'heritage_status', label: 'Heritage' }, { key: 'material', label: 'Material' }, { key: 'artist', label: 'Artist' }, { key: 'date', label: 'Date' }] }, interactive: true,
  },
  {
    key: 'recreational_hubs', label: 'Recreational Hubs', group: 'Amenities', geometry: 'point', file: 'recreational_hubs.geojson',
    ml: pointMl('#00838f'), legend: { kind: 'point', color: '#00838f' }, source: { name: 'Recreational hubs', provider: 'City of Cape Town' },
    tooltip: { desc: 'Recreation centres and hubs.', fields: [{ key: 'name', label: 'Name' }] }, interactive: true,
  },
  {
    key: 'places_of_worship', label: 'Places of Worship', group: 'Amenities', geometry: 'point', file: 'places_of_worship.geojson',
    ml: pointMl('#7b1fa2'), legend: { kind: 'point', color: '#7b1fa2' }, source: { name: 'Places of worship', provider: 'City of Cape Town' },
    tooltip: { desc: 'Religious buildings and congregations.', fields: [{ key: 'name', label: 'Name' }, { key: 'religion', label: 'Religion' }, { key: 'building_type', label: 'Type' }, { key: 'suburb', label: 'Suburb' }] }, interactive: true,
  },
  {
    key: 'sports_grounds', label: 'Sports Grounds', group: 'Amenities', geometry: 'point', file: 'sports_grounds.geojson',
    ml: pointMl('#558b2f'), legend: { kind: 'point', color: '#558b2f' }, source: { name: 'Sports grounds', provider: 'City of Cape Town' },
    tooltip: { desc: 'Sports grounds and facilities.', fields: [{ key: 'name', label: 'Name' }] }, interactive: true,
  },

  {
    key: 'fuel', label: 'Fuel Stations', group: 'Amenities', geometry: 'point', file: 'fuel.geojson',
    ml: pointMl('#e65100'), legend: { kind: 'point', color: '#e65100' },
    source: { name: 'Fuel stations', provider: 'OpenStreetMap', licence: 'ODbL', attribution: '© OpenStreetMap contributors', notes: 'OSM amenity=fuel' },
    tooltip: { desc: 'Fuel / petrol stations (OpenStreetMap amenity=fuel).', fields: [{ key: 'name', label: 'Name' }, { key: 'brand', label: 'Brand' }, { key: 'operator', label: 'Operator' }] }, interactive: true,
  },

  // Environment & Terrain
  {
    key: 'parks', label: 'Parks', group: 'Environment & Terrain', geometry: 'polygon', file: 'parks.geojson',
    ml: fillMl('#a5d6a7', 0.6), legend: { kind: 'polygon', color: '#a5d6a7', label: 'Parks & gardens' },
    source: { name: 'Parks', provider: 'City of Cape Town' },
    tooltip: { desc: 'Public parks and gardens.', fields: [{ key: 'name', label: 'Name' }, { key: 'address', label: 'Address' }, { key: 'play_equipment', label: 'Play equipment' }, { key: 'area_m2', label: 'Area', suffix: ' m²' }] }, defaultOn: true, interactive: true,
  },
  {
    key: 'contours', label: 'Contours (5 m)', group: 'Environment & Terrain', geometry: 'line',
    pmtiles: { file: 'contours.pmtiles', sourceLayer: 'contours' },
    ml: [{ type: 'line', paint: { 'line-color': '#b0b0b0', 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.2, 17, 0.6], 'line-opacity': 0.75 } }],
    legend: { kind: 'line', color: '#b0b0b0', label: 'Elevation contour' },
    source: { name: 'Elevation contours (5 m)', provider: 'City of Cape Town' },
    tooltip: { desc: 'Elevation contour lines at 5 m intervals.', fields: [{ key: 'elev_num', label: 'Elevation', suffix: ' m' }, { key: 'LYR', label: 'Type' }] }, interactive: true,
  },

  // Demographics
  {
    key: 'population_census', label: 'Population', group: 'Demographics', geometry: 'polygon', file: 'census.geojson',
    ml: choroMl(POP_FILL, { text: ['to-string', ['get', 'sal_code']] }), legend: { kind: 'ramp', label: 'Population (per small area)', colors: [{ color: '#deebf7', label: 'low' }, { color: '#9ecae1', label: '' }, { color: '#3182bd', label: 'high' }] },
    source: { name: 'Census population', provider: 'Statistics South Africa', notes: 'Census small-area layer' },
    tooltip: { desc: 'Resident population per census small area.', fields: [{ key: 'sal_code', label: 'Small area' }, { key: 'total_pop', label: 'Population' }, { key: 'african', label: 'African' }, { key: 'coloured', label: 'Coloured' }, { key: 'white', label: 'White' }, { key: 'indian', label: 'Indian' }] }, interactive: true,
  },
  {
    key: 'population_density', label: 'Population Density', group: 'Demographics', geometry: 'polygon', file: 'census.geojson',
    ml: choroMl(DENS_FILL, { text: ['to-string', ['get', 'sal_code']] }), legend: { kind: 'ramp', label: 'Persons / km²', colors: [{ color: '#feedde', label: 'low' }, { color: '#fdae6b', label: '' }, { color: '#e6550d', label: 'high' }] },
    source: { name: 'Population density', provider: 'Statistics South Africa', notes: 'Derived: census population ÷ small-area km²' },
    tooltip: { desc: 'Population density (residents per km²), derived from census small areas.', fields: [{ key: 'sal_code', label: 'Small area' }, { key: 'density', label: 'Density', suffix: ' /km²' }, { key: 'total_pop', label: 'Population' }] }, interactive: true,
  },
  {
    key: 'race', label: 'Race', group: 'Demographics', geometry: 'polygon', file: 'census.geojson',
    ml: choroMl(RACE_FILL, { text: ['to-string', ['get', 'sal_code']] }), legend: { kind: 'ramp', label: 'Dominant group', colors: [{ color: '#3f7185', label: 'African' }, { color: '#c99544', label: 'Coloured' }, { color: '#bd5c4c', label: 'Indian' }, { color: '#5c8f6a', label: 'White' }, { color: '#7e6396', label: 'Other' }] },
    source: { name: 'Population group (race)', provider: 'Statistics South Africa', notes: 'Census small-area layer' },
    tooltip: { desc: 'Dominant population group per census small area, and its share.', fields: [{ key: 'sal_code', label: 'Small area' }, { key: 'group', label: 'Dominant group' }, { key: 'dominant_pct', label: 'Share', suffix: '%' }, { key: 'total_pop', label: 'Population' }] }, interactive: true,
  },
  {
    key: 'gini_index', label: 'Gini Index', group: 'Demographics', geometry: 'polygon', file: 'gini_index.geojson',
    ml: choroMl(GINI_FILL, { text: ['number-format', ['get', 'gini'], { 'min-fraction-digits': 2, 'max-fraction-digits': 2 }], bold: true, size: 15 }), legend: { kind: 'ramp', label: 'Gini (0 equal → 1 unequal)', colors: [{ color: '#efedf5', label: '0.55' }, { color: '#bcbddc', label: '' }, { color: '#756bb1', label: '0.70' }] },
    source: { name: 'Gini index', provider: USER, notes: 'H3 hexagon; income inequality' },
    tooltip: { desc: 'Income inequality (Gini coefficient: 0 = equal, 1 = unequal) per H3 hexagon.', fields: [{ key: 'hex', label: 'H3 hex' }, { key: 'gini', label: 'Gini' }, { key: 'tax_year', label: 'Tax year' }] }, interactive: true,
  },

  // Activity
  {
    key: 'airbnb', label: 'Airbnb Listings', group: 'Activity', geometry: 'point', file: 'airbnb.geojson',
    ml: pointMl('#ff5a5f', 0.9), legend: { kind: 'point', color: '#ff5a5f' },
    source: { name: 'Airbnb listings (Cape Town)', provider: 'Inside Airbnb', url: 'https://insideairbnb.com/cape-town/', licence: 'CC BY 4.0', year: '2026', attribution: '© Inside Airbnb — CC BY 4.0', notes: 'Compiled 2026-06-29; clipped to district; host details removed' },
    tooltip: { desc: 'Short-term rental listings (Inside Airbnb).', fields: [{ key: 'name', label: 'Listing' }, { key: 'room_type', label: 'Type' }, { key: 'price', label: 'Price', prefix: 'R' }, { key: 'number_of_reviews', label: 'Reviews' }, { key: 'availability_365', label: 'Avail. days' }] }, interactive: true,
  },

  // Catalytic Clusters — anchor sectors mapped across the whole Cape Town metro (OSM).
  {
    key: 'catalytic_medicine', label: 'Medicine', group: 'Catalytic Clusters', geometry: 'point', file: 'catalytic_medicine.geojson',
    ml: pointMl('#e0455e'), legend: { kind: 'point', color: '#e0455e' },
    source: { name: 'Medical & healthcare facilities', provider: 'OpenStreetMap', licence: 'ODbL', attribution: '© OpenStreetMap contributors', notes: 'OSM amenity=hospital/clinic/doctors + healthcare=* (metro-wide)' },
    tooltip: { desc: 'Medicine anchor: hospitals, clinics, doctors and healthcare facilities across the Cape Town metro.', fields: [{ key: 'name', label: 'Name' }, { key: 'type', label: 'Type' }] }, interactive: true,
  },
  {
    key: 'catalytic_technology', label: 'Data / Technology', group: 'Catalytic Clusters', geometry: 'point', file: 'catalytic_technology.geojson',
    ml: pointMl('#2b93c9'), legend: { kind: 'point', color: '#2b93c9' },
    source: { name: 'Technology & data offices', provider: 'OpenStreetMap', licence: 'ODbL', attribution: '© OpenStreetMap contributors', notes: 'OSM office=it/software/telecommunication/research/engineering + amenity=coworking_space (metro-wide; sparse in OSM)' },
    tooltip: { desc: 'Data/Technology anchor: IT, software, telecoms, research & engineering offices and coworking spaces across the Cape Town metro.', fields: [{ key: 'name', label: 'Name' }, { key: 'type', label: 'Type' }] }, interactive: true,
  },
  {
    key: 'catalytic_sports', label: 'Sports', group: 'Catalytic Clusters', geometry: 'point', file: 'catalytic_sports.geojson',
    ml: pointMl('#2fa66a'), legend: { kind: 'point', color: '#2fa66a' },
    source: { name: 'Sports venues & facilities', provider: 'OpenStreetMap', licence: 'ODbL', attribution: '© OpenStreetMap contributors', notes: 'OSM leisure=stadium/sports_centre/fitness_centre/sports_hall/track (metro-wide)' },
    tooltip: { desc: 'Sports anchor: stadiums, sports & fitness centres, tracks across the Cape Town metro.', fields: [{ key: 'name', label: 'Name' }, { key: 'type', label: 'Type' }] }, interactive: true,
  },
  {
    key: 'catalytic_arts', label: 'Arts', group: 'Catalytic Clusters', geometry: 'point', file: 'catalytic_arts.geojson',
    ml: pointMl('#9c5cc4'), legend: { kind: 'point', color: '#9c5cc4' },
    source: { name: 'Arts & culture venues', provider: 'OpenStreetMap', licence: 'ODbL', attribution: '© OpenStreetMap contributors', notes: 'OSM amenity=arts_centre/theatre/studio/cinema + tourism=museum/gallery/artwork (metro-wide)' },
    tooltip: { desc: 'Arts anchor: theatres, arts centres, studios, museums and galleries across the Cape Town metro.', fields: [{ key: 'name', label: 'Name' }, { key: 'type', label: 'Type' }] }, interactive: true,
  },
]
