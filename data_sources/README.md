# Data drop inbox — UCT Innovation District dashboard

Drop your layer files **here**, then run the ingest to publish them to the map.

## How to hand over a layer
1. Put the file in this folder, named **exactly** by its `key` from `layers.manifest.csv`
   (e.g. `median_income.gpkg`, `community_centres.gpkg`, `airbnb.gpkg`).
   - **GeoPackage** (`.gpkg`) or **Shapefile** (`.shp` + sidecars) are both fine.
   - Any CRS is fine — the ingest reprojects to WGS84 and clips to the district.
   - For a `.gpkg` with several layers, either name the layer the same as the key, or
     note the layer name in the manifest `notes` column.
2. For the **demographics choropleths** (Gini, Median Income, Race, Population/Census,
   Population Density): also fill the manifest's `value_field` (the column to colour by)
   and `join_key` (if the values live in a separate table that joins to boundary polygons).
3. Run the ingest:
   ```bash
   cd ../../cities-dataset && uv run python ../apps/id-dashboard/scripts/build_layers.py
   ```
   Each processed layer is written to `../public/data/layers/<key>.geojson` and its toggle
   goes live (the "pending" tag disappears).

## Status of the 23 layers
See `layers.manifest.csv`. Summary:
- **ready** (already wired): Building Footprints, Street Network, UCT Campuses, Innovation District.
- **builtin**: ESRI Satellite (tiles, no file).
- **extractable** (I can pull from existing OSM GeoPackages if you don't have your own):
  Parks, Trees, Outdoor Gyms, Swimming Pools, Fuel.
- **provide** (need your files): Railway lines, Taxi routes, Pedestrian crossings, Mobility,
  Community Centres, Monuments, Places of Worship, Recreational Hubs, Sports Grounds,
  Population/Census, Population Density, Median Income, Gini, Race, Airbnb.

This folder's contents are gitignored (raw data stays local); only the manifest + this
README are tracked.
