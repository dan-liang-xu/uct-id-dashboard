"""Ingest UCT Innovation District layers -> FULL-EXTENT web layers for the dashboard.

No district clipping — layers show their full extent. Output format per layer:
  * heavy geometry (Google buildings 2.1M, contours, OSM buildings) -> **PMTiles**
    vector tiles via `ogr2ogr -f PMTiles` (tiled, streamed on demand by the map).
  * census small-areas -> a single shared `census.geojson` (race/population/density
    layers all style the same polygons).
  * everything else -> simplified GeoJSON (EPSG:4326).
`available.json` (what the frontend enables) is rewritten from what exists.

Run from the cities-dataset uv env (needs geopandas; ogr2ogr must be on PATH):
    cd ../../cities-dataset && uv run python ../apps/id-dashboard/scripts/build_layers.py
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

import geopandas as gpd
import numpy as np
import pyogrio
from shapely.geometry import Point, box
from shapely.ops import unary_union

APP = Path(__file__).resolve().parents[1]  # .../apps/id-dashboard
REPO = APP.parents[1]  # .../uct-innovation-district
LAYERS_DIR = APP / "public/data/layers"
DROP_DIR = APP / "data_sources"

WGS84 = 4326
UTM34S = 32734
SIMPLIFY_DEG = 0.00002  # ~2 m — trims vertices on full-extent lines/polygons

KNOWN: dict[str, Path] = {
    "building_footprints": REPO / "apps/geojson/uct-bldngs-cl.geojson",
    "street_network": REPO / "apps/geojson/uct-network-clipped.geojson",
}
PRESHIPPED = ["uct_campuses", "innovation_district"]
DROP_EXTS = [".gpkg", ".shp", ".geojson", ".json", ".csv"]

SOURCE_FILE: dict[str, str] = {"google_buildings": "google_open_buildings_footprints.gpkg", "contours": "contours_5m.gpkg"}

# Heavy geometry -> PMTiles vector tiles (full extent). sql renames fields (kept
# minimal). {layer} is filled with the source layer name.
# maxzoom kept modest: vector tiles overzoom crisply, so z14 looks identical when
# zoomed in but is ~16x smaller than z16 — keeps files small + Cloudflare-deployable.
PMTILES: dict[str, dict] = {
    "google_buildings": {"minzoom": 10, "maxzoom": 14, "select": "area_mtrs,confidence"},
    "contours": {"minzoom": 10, "maxzoom": 14, "select": "elev_num,LYR"},
    "building_footprints": {"minzoom": 11, "maxzoom": 15},
}
CENSUS_KEYS = ["race", "population_census", "population_density"]

# per-key GeoJSON shaping: columns to keep (post-derive) + friendly renames.
SHAPE: dict[str, dict] = {
    "airbnb": {"keep": ["name", "room_type", "price", "minimum_nights", "number_of_reviews", "availability_365"]},
    "community_centres": {"keep": ["NAME"], "rename": {"NAME": "name"}},
    "recreational_hubs": {"keep": ["NAME"], "rename": {"NAME": "name"}},
    "sports_grounds": {"keep": ["FCLT_NAME"], "rename": {"FCLT_NAME": "name"}},
    "monuments": {"keep": ["NAME", "DSTR", "HRTG_STS", "MTVT", "LCTN", "MDM_MTRL", "DATE_PRDC", "ARTS"], "rename": {"NAME": "name", "DSTR": "area", "HRTG_STS": "heritage_status", "MTVT": "commemorates", "LCTN": "location", "MDM_MTRL": "material", "DATE_PRDC": "date", "ARTS": "artist"}},
    "places_of_worship": {"keep": ["NAME", "RLGN_TYPE", "BLDG_TYPE", "ADR_SBRB"], "rename": {"NAME": "name", "RLGN_TYPE": "religion", "BLDG_TYPE": "building_type", "ADR_SBRB": "suburb"}},
    "taxi_routes": {"keep": ["ORGN", "DSTN"], "rename": {"ORGN": "origin", "DSTN": "destination"}},
    "railway_lines": {"keep": ["NAME", "USG", "TYPE"], "rename": {"NAME": "name", "USG": "usage", "TYPE": "line_type"}},
    "pedestrian_ways": {"keep": ["highway", "surface", "lit", "wheelchair", "name", "bicycle", "foot"]},
    "gini_index": {"keep": ["gini", "TaxYear"], "rename": {"TaxYear": "tax_year"}},
    "parks": {"keep": ["PARK_NAME", "ACS_ADR", "PLAY_EQPM", "area_m2"], "rename": {"PARK_NAME": "name", "ACS_ADR": "address", "PLAY_EQPM": "play_equipment"}},
}
GEOJSON_KEYS = [*SHAPE.keys(), "street_network"]


def read_source(path: Path, key: str) -> gpd.GeoDataFrame:
    if path.suffix == ".csv":
        import pandas as pd

        df = pd.read_csv(path)
        lon = next((c for c in df.columns if c.lower() in ("longitude", "lon", "lng", "x")), None)
        lat = next((c for c in df.columns if c.lower() in ("latitude", "lat", "y")), None)
        return gpd.GeoDataFrame(df, geometry=gpd.points_from_xy(df[lon], df[lat]), crs=WGS84)
    if path.suffix == ".gpkg":
        layer = pyogrio.list_layers(path)[0][0]
        return gpd.read_file(path, layer=layer)
    return gpd.read_file(path)


def find_drop(key: str) -> Path | None:
    if key in SOURCE_FILE:
        p = DROP_DIR / SOURCE_FILE[key]
        return p if p.exists() else None
    for ext in DROP_EXTS:
        p = DROP_DIR / f"{key}{ext}"
        if p.exists():
            return p
    return None


def _finalise(g: gpd.GeoDataFrame, out: Path) -> int:
    is_point = g.geom_type.iloc[0] in ("Point", "MultiPoint")
    if not is_point:
        g["geometry"] = g.geometry.simplify(SIMPLIFY_DEG)
    g["geometry"] = g.geometry.make_valid()
    g = g[~g.geometry.is_empty & g.geometry.notna()]
    out.unlink(missing_ok=True)
    g.to_file(out, driver="GeoJSON")
    return len(g)


def process_geojson(key: str, src: Path) -> bool:
    try:
        g = read_source(src, key)
        g = g.set_crs(WGS84, allow_override=True) if g.crs is None else g.to_crs(WGS84)
        cfg = SHAPE.get(key, {})
        keep = [c for c in cfg.get("keep", [c for c in g.columns if c != "geometry"]) if c in g.columns]
        g = g[keep + ["geometry"]]
        if cfg.get("rename"):
            g = g.rename(columns=cfg["rename"])
        n = _finalise(g, LAYERS_DIR / f"{key}.geojson")
        print(f"  ✓ {key:20s} {n:>7,} feats (geojson)  <- {src.name}")
        return True
    except Exception as e:  # noqa: BLE001
        print(f"  ✗ {key}: {type(e).__name__}: {str(e)[:140]}")
        return False


def make_census(src: Path) -> bool:
    try:
        g = read_source(src, "census").to_crs(WGS84)
        g["group"] = g["dominant_race"].astype(str).str.replace("_pct", "", regex=False).str.title()
        g["dominant_pct"] = g["dominant_race_pct"].round(1)
        g["density"] = (g["Total"] / (g.to_crs(UTM34S).area / 1e6)).round(0)
        for c in ("african_pct", "coloured_pct", "indian_pct", "white_pct", "other_pct"):
            if c in g.columns:
                g[c] = g[c].round(1)
        keep = ["group", "dominant_pct", "density", "Total", "african", "coloured", "indian", "white", "other", "african_pct", "coloured_pct", "indian_pct", "white_pct", "other_pct"]
        g = g[[c for c in keep if c in g.columns] + ["geometry"]].rename(columns={"Total": "total_pop"})
        n = _finalise(g, LAYERS_DIR / "census.geojson")
        print(f"  ✓ census (race/pop/density) {n:>5,} areas (geojson)  <- {src.name}")
        return True
    except Exception as e:  # noqa: BLE001
        print(f"  ✗ census: {type(e).__name__}: {str(e)[:140]}")
        return False


def make_pmtiles(key: str, src: Path, cfg: dict) -> bool:
    try:
        out = LAYERS_DIR / f"{key}.pmtiles"
        out.unlink(missing_ok=True)
        cmd = ["ogr2ogr", "-f", "PMTiles", "-nln", key,
               "-dsco", f"MINZOOM={cfg['minzoom']}", "-dsco", f"MAXZOOM={cfg['maxzoom']}"]
        if cfg.get("select"):
            cmd += ["-select", cfg["select"]]
        cmd += [str(out), str(src)]
        r = subprocess.run(cmd, capture_output=True, text=True)
        if r.returncode != 0:
            print(f"  ✗ {key} (pmtiles): {r.stderr.strip()[:200]}")
            return False
        print(f"  ✓ {key:20s} {out.stat().st_size / 1e6:>6.1f} MB (pmtiles)  <- {src.name}")
        return True
    except Exception as e:  # noqa: BLE001
        print(f"  ✗ {key} (pmtiles): {type(e).__name__}: {str(e)[:140]}")
        return False


def make_scale_grid(cell_m: int = 500, half_km: int = 10) -> bool:
    """A metric square grid (default 500 m) around the district — a scale reference."""
    try:
        c = gpd.GeoSeries([Point(18.464, -33.9484)], crs=WGS84).to_crs(UTM34S).iloc[0]
        x0 = np.floor((c.x - half_km * 1000) / cell_m) * cell_m
        y0 = np.floor((c.y - half_km * 1000) / cell_m) * cell_m
        xs = np.arange(x0, c.x + half_km * 1000, cell_m)
        ys = np.arange(y0, c.y + half_km * 1000, cell_m)
        cells = [box(x, y, x + cell_m, y + cell_m) for x in xs for y in ys]
        g = gpd.GeoDataFrame(geometry=cells, crs=UTM34S).to_crs(WGS84)
        out = LAYERS_DIR / "scale_grid.geojson"
        out.unlink(missing_ok=True)
        g.to_file(out, driver="GeoJSON")
        print(f"  ✓ scale_grid          {len(g):>7,} cells ({cell_m} m)")
        return True
    except Exception as e:  # noqa: BLE001
        print(f"  ✗ scale_grid: {type(e).__name__}: {str(e)[:120]}")
        return False


def make_fuel_osm() -> bool:
    """Fuel stations (OSM amenity=fuel) across greater Cape Town, as points."""
    try:
        import osmnx as ox

        poly = box(18.30, -34.15, 18.95, -33.70)  # greater Cape Town
        feats = ox.features_from_polygon(poly, tags={"amenity": "fuel"})
        feats = feats.to_crs(WGS84)
        feats["geometry"] = feats.to_crs(UTM34S).geometry.centroid.to_crs(WGS84)
        keep = [c for c in ("name", "brand", "operator") if c in feats.columns]
        feats = feats[keep + ["geometry"]]
        out = LAYERS_DIR / "fuel.geojson"
        out.unlink(missing_ok=True)
        feats.to_file(out, driver="GeoJSON")
        print(f"  ✓ fuel                {len(feats):>7,} stations (OSM amenity=fuel)")
        return True
    except Exception as e:  # noqa: BLE001
        print(f"  ✗ fuel (osm): {type(e).__name__}: {str(e)[:120]}")
        return False


def make_study_extract(buffer_m: int = 800) -> list[str]:
    """Buffer the corridor by buffer_m + union UCT campuses; extract the buildings
    (Google Open Buildings) that fall in that study area. Writes study_area +
    study_buildings; returns the keys that succeeded."""
    done: list[str] = []
    try:
        corridor = gpd.read_file(LAYERS_DIR / "innovation_district.geojson").to_crs(UTM34S)
        campuses = gpd.read_file(LAYERS_DIR / "uct_campuses.geojson").to_crs(UTM34S)
        study_utm = unary_union([corridor.union_all().buffer(buffer_m), campuses.union_all()])
        study_gdf = gpd.GeoDataFrame({"name": ["study area"]}, geometry=[study_utm], crs=UTM34S).to_crs(WGS84)
        (LAYERS_DIR / "study_area.geojson").unlink(missing_ok=True)
        study_gdf.to_file(LAYERS_DIR / "study_area.geojson", driver="GeoJSON")
        done.append("study_area")

        study_poly = study_gdf.geometry.iloc[0]
        gsrc = DROP_DIR / "google_open_buildings_footprints.gpkg"
        b = gpd.read_file(gsrc, bbox=study_poly.bounds).to_crs(WGS84)
        b = b[b.intersects(study_poly)]
        keep = [c for c in ("area_mtrs", "confidence") if c in b.columns]
        b = b[keep + ["geometry"]]
        b["geometry"] = b.geometry.make_valid()
        (LAYERS_DIR / "study_buildings.geojson").unlink(missing_ok=True)
        b.to_file(LAYERS_DIR / "study_buildings.geojson", driver="GeoJSON")
        print(f"  ✓ study_buildings     {len(b):>7,} buildings (corridor+{buffer_m}m ∪ campuses)")
        done.append("study_buildings")
    except Exception as e:  # noqa: BLE001
        print(f"  ✗ study_extract: {type(e).__name__}: {str(e)[:120]}")
    return done


def make_corridor_arrows() -> bool:
    """Merge two end-arrow points (kind='arrow', outward `bearing`) INTO
    innovation_district.geojson so they show/hide with the corridor layer.
    Idempotent: strips any prior arrow points before recomputing."""
    try:
        import itertools
        import math

        import pandas as pd
        from shapely.ops import linemerge

        f = LAYERS_DIR / "innovation_district.geojson"
        g = gpd.read_file(f).to_crs(WGS84)
        lines = g[g.geom_type.isin(["LineString", "MultiLineString"])][["geometry"]].copy()
        merged = linemerge(unary_union(list(lines.geometry)))
        parts = [merged] if merged.geom_type == "LineString" else list(merged.geoms)
        # (endpoint, inward-neighbour) for every part's two ends
        ends = []
        for p in parts:
            c = list(p.coords)
            if len(c) >= 2:
                ends.append((c[0], c[1]))
                ends.append((c[-1], c[-2]))

        def brg(a, b):
            lon1, lat1, lon2, lat2 = map(math.radians, [a[0], a[1], b[0], b[1]])
            dlon = lon2 - lon1
            y = math.sin(dlon) * math.cos(lat2)
            x = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(dlon)
            return (math.degrees(math.atan2(y, x)) + 360) % 360

        # The corridor's two ends = the farthest-apart pair of segment endpoints.
        (e0, n0), (e1, n1) = max(
            itertools.combinations(ends, 2),
            key=lambda pr: (pr[0][0][0] - pr[1][0][0]) ** 2 + (pr[0][0][1] - pr[1][0][1]) ** 2,
        )
        b0 = brg(n0, e0)  # outward at each end
        b1 = brg(n1, e1)
        lines["kind"] = "corridor"
        lines["bearing"] = None
        arrows = gpd.GeoDataFrame(
            {"kind": ["arrow", "arrow"], "bearing": [round(b0, 1), round(b1, 1)]},
            geometry=[Point(e0), Point(e1)],
            crs=WGS84,
        )
        combined = gpd.GeoDataFrame(pd.concat([lines, arrows], ignore_index=True), crs=WGS84)
        f.unlink(missing_ok=True)
        combined.to_file(f, driver="GeoJSON")
        (LAYERS_DIR / "corridor_arrows.geojson").unlink(missing_ok=True)  # retire old separate file
        print(f"  ✓ innovation_district +2 arrows (bearings {round(b0)}°, {round(b1)}°)")
        return True
    except Exception as e:  # noqa: BLE001
        print(f"  ✗ corridor_arrows: {type(e).__name__}: {str(e)[:120]}")
        return False


def main() -> None:
    LAYERS_DIR.mkdir(parents=True, exist_ok=True)
    # Clear stale clipped outputs now replaced by PMTiles / shared census.
    for stale in ("google_buildings.geojson", "contours.geojson", "race.geojson", "population_census.geojson", "population_density.geojson", "building_footprints.geojson"):
        (LAYERS_DIR / stale).unlink(missing_ok=True)
    available = [k for k in PRESHIPPED if (LAYERS_DIR / f"{k}.geojson").exists()]
    print("Full-extent ingest (no clipping)\n")

    for key, cfg in PMTILES.items():
        src = find_drop(key) or KNOWN.get(key)
        if src and src.exists() and make_pmtiles(key, src, cfg):
            available.append(key)

    csrc = DROP_DIR / "census_race.gpkg"
    if csrc.exists() and make_census(csrc):
        available += CENSUS_KEYS

    for key in GEOJSON_KEYS:
        src = find_drop(key) or KNOWN.get(key)
        if src and src.exists() and process_geojson(key, src):
            available.append(key)

    if make_scale_grid():
        available.append("scale_grid")
    if make_fuel_osm():
        available.append("fuel")
    make_corridor_arrows()  # merges into innovation_district.geojson (no separate key)
    available += make_study_extract()

    (LAYERS_DIR / "available.json").write_text(json.dumps(sorted(set(available)), indent=0))
    print(f"\navailable.json -> {sorted(set(available))}")


if __name__ == "__main__":
    main()
