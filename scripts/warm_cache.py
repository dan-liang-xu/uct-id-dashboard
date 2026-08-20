#!/usr/bin/env python3
"""Pre-warm the CDN cache for the (fully static) UCT Innovation District atlas.

CityPulse's `warm_tile_cache.py` warms a Supabase `tile_cache` table because it
generates vector tiles on demand behind an edge function. This atlas is 100% static
on GitHub Pages, so the equivalent is warming the **CDN edge cache**: fetch every
asset the app loads — the JS/CSS bundle, all GeoJSON layers, label glyphs, and the
exact PMTiles byte-ranges the map requests for the district across common zooms.
Priming Fastly (GitHub Pages' CDN) makes first loads fast, and the run doubles as an
asset healthcheck (any 404 / unexpected status is surfaced).

Usage:
    python scripts/warm_cache.py                              # warm the live site
    python scripts/warm_cache.py --base http://localhost:5175/   # warm a local/preview build
    python scripts/warm_cache.py --max-zoom 15

Deps:  uv pip install requests pmtiles   (or: pip install requests pmtiles)
"""
from __future__ import annotations

import argparse
import math
import re
import time
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import quote, urljoin

import requests
from pmtiles.reader import Reader

DEFAULT_BASE = "https://dan-liang-xu.github.io/uct-id-dashboard/"
CONCURRENCY = 8

# bbox = (min_lng, min_lat, max_lng, max_lat)
DISTRICT = (18.42, -33.985, 18.51, -33.915)  # Main Road corridor + campuses + margin
METRO = (18.30, -34.15, 18.85, -33.75)  # greater Cape Town (basemap panning)

PMTILES = [
    {"path": "data/basemap/ct-basemap.pmtiles", "bbox": METRO, "min_z": 11, "max_z": 13},
    {"path": "data/layers/google_buildings.pmtiles", "bbox": DISTRICT, "min_z": 13, "max_z": 15},
    {"path": "data/layers/contours.pmtiles", "bbox": DISTRICT, "min_z": 13, "max_z": 15},
]
FONTS = ["Inter Regular", "JetBrains Mono Regular", "Noto Sans Regular", "Noto Sans Medium", "Noto Sans Italic"]
FONT_RANGES = ["0-255", "256-511", "8192-8447"]

session = requests.Session()
session.headers["User-Agent"] = "uct-atlas-cache-warmer"


def _lng2x(lng: float, z: int) -> int:
    return int((lng + 180.0) / 360.0 * (1 << z))


def _lat2y(lat: float, z: int) -> int:
    r = math.radians(lat)
    return int((1.0 - math.log(math.tan(r) + 1.0 / math.cos(r)) / math.pi) / 2.0 * (1 << z))


def tiles_in_bbox(bbox, z):
    mnx, mny, mxx, mxy = bbox
    x0, x1 = _lng2x(mnx, z), _lng2x(mxx, z)
    y0, y1 = _lat2y(mxy, z), _lat2y(mny, z)  # north = smaller y
    return [(z, x, y) for x in range(x0, x1 + 1) for y in range(y0, y1 + 1)]


def collect_assets(base: str) -> list[str]:
    urls = [base]
    try:
        html = session.get(base, timeout=30).text
        for p in re.findall(r'(?:src|href)="(/[^"]+\.(?:js|css|png|svg|webmanifest|ico))"', html):
            urls.append(urljoin(base, p))
    except Exception as e:  # noqa: BLE001
        print(f"  (could not read index.html: {e})")
    urls += [base + "data/layers/available.json", base + "data/layers/counts.json", base + "data/layers/ct_metro.geojson"]
    try:
        for k in session.get(base + "data/layers/available.json", timeout=30).json():
            urls.append(base + f"data/layers/{k}.geojson")  # pmtiles keys 404 -> skipped
    except Exception:  # noqa: BLE001
        pass
    for f in FONTS:
        for rng in FONT_RANGES:
            urls.append(base + f"data/basemap/fonts/{quote(f)}/{rng}.pbf")
    return list(dict.fromkeys(urls))


def warm_asset(url: str):
    try:
        r = session.get(url, timeout=60)
        if r.status_code == 200:
            return "warm", len(r.content)
        return ("skip", 0) if r.status_code == 404 else ("error", r.status_code)
    except Exception:  # noqa: BLE001
        return "error", 0


def _source(url: str):
    # identity encoding: the CDN gzip-encodes .pmtiles, and auto-decompressing a
    # byte-range corrupts it — we need the raw bytes for the pmtiles reader.
    def get_bytes(offset: int, length: int) -> bytes:
        r = session.get(
            url,
            headers={"Range": f"bytes={offset}-{offset + length - 1}", "Accept-Encoding": "identity"},
            timeout=60,
        )
        r.raise_for_status()
        return r.content

    return get_bytes


def warm_pmtiles(base: str, cfg: dict):
    warmed = empty = errors = 0
    try:
        reader = Reader(_source(base + cfg["path"]))
        for z in range(cfg["min_z"], cfg["max_z"] + 1):
            for tz, tx, ty in tiles_in_bbox(cfg["bbox"], z):
                try:
                    if reader.get(tz, tx, ty):
                        warmed += 1
                    else:
                        empty += 1
                except Exception:  # noqa: BLE001
                    errors += 1
    except Exception as e:  # noqa: BLE001
        print(f"  {cfg['path']}: reader error: {e}")
        errors += 1
    return cfg["path"], warmed, empty, errors


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default=DEFAULT_BASE)
    ap.add_argument("--max-zoom", type=int, default=None)
    args = ap.parse_args()
    base = args.base if args.base.endswith("/") else args.base + "/"
    if args.max_zoom:
        for p in PMTILES:
            p["max_z"] = args.max_zoom

    print(f"Warming CDN cache for {base}\n")
    t0 = time.time()

    assets = collect_assets(base)
    print(f"Static assets: {len(assets)} URLs")
    warm = skip = err = 0
    total_bytes = 0
    with ThreadPoolExecutor(max_workers=CONCURRENCY) as pool:
        for status, n in pool.map(warm_asset, assets):
            if status == "warm":
                warm += 1
                total_bytes += n
            elif status == "skip":
                skip += 1
            else:
                err += 1
    print(f"  {warm} warmed ({total_bytes / 1e6:.1f} MB), {skip} skipped (404), {err} errors")

    print("\nPMTiles tile ranges:")
    with ThreadPoolExecutor(max_workers=len(PMTILES)) as pool:
        for path, w, e2, er in pool.map(lambda c: warm_pmtiles(base, c), PMTILES):
            print(f"  {path}: {w} tiles warmed, {e2} empty, {er} errors")

    print(f"\nDone in {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
