import re
from pathlib import Path

import geopandas as gpd
import pandas as pd

PBF = "/private/tmp/claude-503/-Users-nfi-Documents-acc-dev/0e46bcb8-fa04-4820-8651-91ae0c5ca495/scratchpad/south-africa.osm.pbf"
LAYERS = Path("/Users/nfi/Documents/acc-dev/uct-innovation-district/apps/id-dashboard/public/data/layers")
BBOX = (18.30, -34.40, 19.05, -33.45)
UTM = 32734
results = {}


def parse(s):
    return dict(re.findall(r'"([^"]+)"=>"([^"]*)"', s)) if isinstance(s, str) else {}


def enrich(g, keys):
    tags = g["other_tags"].apply(parse) if "other_tags" in g.columns else pd.Series([{}] * len(g), index=g.index)
    for k in keys:
        col = g[k] if k in g.columns else pd.Series([None] * len(g), index=g.index)
        g[k] = col.where(col.notna(), tags.apply(lambda d: d.get(k)))
    return g


def ci(df, cols, pat):
    m = pd.Series(False, index=df.index)
    for c in cols:
        if c in df.columns:
            m = m | df[c].astype(str).str.contains(pat, case=False, na=False, regex=True)
    return df[m]


def centroids(g):
    g = g[g.geometry.notna() & ~g.geometry.is_empty].copy()
    g["geometry"] = g.to_crs(UTM).geometry.centroid.to_crs(4326)
    return g


def write(g, name, keep):
    keep = [c for c in keep if c in g.columns]
    g = g[keep + ["geometry"]].reset_index(drop=True)
    p = LAYERS / f"{name}.geojson"
    p.unlink(missing_ok=True)
    if len(g):
        g.to_file(p, driver="GeoJSON")
    results[name] = len(g)
    print(f"  {name}: {len(g)}", flush=True)


# ---- points (one scan) ----
pts_where = (
    "other_tags LIKE '%\"railway\"=>\"station\"%' OR other_tags LIKE '%\"railway\"=>\"halt\"%' "
    "OR highway = 'bus_stop' OR other_tags LIKE '%\"public_transport\"%' OR other_tags LIKE '%\"amenity\"=>\"bus_station\"%' "
    "OR other_tags LIKE '%\"office\"=>%' OR other_tags LIKE '%\"amenity\"=>\"coworking_space\"%'"
)
pts = gpd.read_file(PBF, layer="points", bbox=BBOX, where=pts_where, engine="pyogrio")
print("points read:", len(pts), flush=True)
pts = enrich(pts, ["railway", "highway", "public_transport", "amenity", "office", "operator", "network", "name"])

write(centroids(pts[pts["railway"].isin(["station", "halt"])]), "railway_stations", ["name"])

stops = pts[(pts["highway"] == "bus_stop") | pts["public_transport"].notna() | (pts["amenity"] == "bus_station")]
write(centroids(ci(stops, ["name", "operator", "network"], "myciti")), "myciti_stops", ["name", "operator", "network"])
write(centroids(ci(stops, ["name", "operator", "network"], "jammie|university of cape town")), "uct_shuttle_stops", ["name", "operator"])

tech = pts[pts["office"].isin(["it", "software", "telecommunication", "research", "engineering"]) | (pts["amenity"] == "coworking_space")].copy()
tech["type"] = tech["office"].where(tech["office"].notna(), tech["amenity"])
write(centroids(tech), "catalytic_technology", ["name", "type"])

# ---- routes (multilinestrings = route relations, one scan) ----
routes = gpd.read_file(PBF, layer="multilinestrings", bbox=BBOX, where="other_tags LIKE '%\"route\"=>\"bus\"%'", engine="pyogrio")
print("routes read:", len(routes), flush=True)
routes = enrich(routes, ["operator", "network", "ref", "name"])
write(ci(routes, ["name", "operator", "network", "ref"], "myciti"), "myciti_routes", ["name", "ref", "operator"])
write(ci(routes, ["name", "operator", "network", "ref"], "jammie|university of cape town"), "uct_shuttle_routes", ["name", "ref", "operator"])

print("LOCAL_DONE", results, flush=True)
