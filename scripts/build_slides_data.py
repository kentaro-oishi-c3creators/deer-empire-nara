#!/usr/bin/env python3
"""
Generate exact SVG map paths and verified chart datasets for slides/slides_data.js
directly from data/processed/nara_empire_map.geojson and summary_kpis.json.
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

ROOT_DIR = Path(__file__).resolve().parent.parent
PROC_DIR = ROOT_DIR / "data" / "processed"
SLIDES_DIR = ROOT_DIR / "slides"


def project_point(lon: float, lat: float, min_lon: float, max_lon: float, min_lat: float, max_lat: float, w: float, h: float, pad: float) -> tuple[float, float]:
    # Equirectangular with cos(34.3 deg) aspect correction
    cos_lat = math.cos(math.radians(34.3))
    span_x = (max_lon - min_lon) * cos_lat
    span_y = max_lat - min_lat
    scale = min((w - 2 * pad) / span_x, (h - 2 * pad) / span_y)
    ox = (w - span_x * scale) / 2.0
    oy = (h - span_y * scale) / 2.0
    x = ox + (lon - min_lon) * cos_lat * scale
    y = oy + (max_lat - lat) * scale
    return (round(x, 1), round(y, 1))


def ring_to_path(ring: list[list[float]], *proj_args: Any) -> str:
    pts = [project_point(p[0], p[1], *proj_args) for p in ring]
    if not pts:
        return ""
    parts = [f"M{pts[0][0]},{pts[0][1]}"]
    for x, y in pts[1:]:
        parts.append(f"L{x},{y}")
    parts.append("Z")
    return "".join(parts)


def geom_to_svg_path(geom: dict[str, Any], *proj_args: Any) -> str:
    if geom["type"] == "Polygon":
        return " ".join(ring_to_path(r, *proj_args) for r in geom["coordinates"])
    paths = []
    for poly in geom["coordinates"]:
        for r in poly:
            paths.append(ring_to_path(r, *proj_args))
    return " ".join(paths)


def main() -> None:
    SLIDES_DIR.mkdir(parents=True, exist_ok=True)
    with (PROC_DIR / "nara_empire_map.geojson").open(encoding="utf-8") as f:
        geo = json.load(f)
    with (PROC_DIR / "summary_kpis.json").open(encoding="utf-8") as f:
        kpis = json.load(f)
    with (PROC_DIR / "municipalities_master.json").open(encoding="utf-8") as f:
        munis = json.load(f)

    # Bounding box from all geometry coordinates
    all_lons: list[float] = []
    all_lats: list[float] = []
    for feat in geo["features"]:
        g = feat["geometry"]
        polys = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
        for poly in polys:
            for ring in poly:
                for p in ring:
                    all_lons.append(p[0])
                    all_lats.append(p[1])

    min_lon, max_lon = min(all_lons), max(all_lons)
    min_lat, max_lat = min(all_lats), max(all_lats)
    svg_w, svg_h, pad = 680.0, 820.0, 22.0
    proj_args = (min_lon, max_lon, min_lat, max_lat, svg_w, svg_h, pad)

    svg_features = []
    for feat in geo["features"]:
        p = feat["properties"]
        cx, cy = project_point(p["centroid_lon"], p["centroid_lat"], *proj_args)
        svg_features.append(
            {
                "jis_code": p["jis_code"],
                "name_ja": p["name_ja"],
                "dominance_code": p["dominance_code"],
                "dominance_color": p["dominance_color"],
                "evidence_grade": p["evidence_grade"],
                "human_pop": p["human_pop"],
                "deer_std": p["deer_std"],
                "deer_low": p["deer_low"],
                "deer_high": p["deer_high"],
                "ratio": p["deer_human_ratio_pct"],
                "forest_ratio": p["forest_ratio_pct"],
                "depi": p["depi_score"],
                "area_km2": p["area_km2"],
                "cx": cx,
                "cy": cy,
                "path": geom_to_svg_path(feat["geometry"], *proj_args),
            }
        )

    # Park & Odaigahara projected markers
    park_x, park_y = project_point(135.8430, 34.6851, *proj_args)
    odai_x, odai_y = project_point(136.108, 34.184, *proj_args)

    payload = {
        "svgBox": {"width": int(svg_w), "height": int(svg_h)},
        "markers": {
            "naraPark": {"x": park_x, "y": park_y},
            "odaigahara": {"x": odai_x, "y": odai_y},
        },
        "mapFeatures": svg_features,
        "kpis": kpis,
        "municipalities": munis,
    }

    out_path = SLIDES_DIR / "slides_data.js"
    with out_path.open("w", encoding="utf-8") as f:
        f.write("window.NARA_SLIDES_DATA = ")
        json.dump(payload, f, ensure_ascii=False)
        f.write(";\n")

    print(f"Generated {out_path} with {len(svg_features)} SVG municipality polygons.")


if __name__ == "__main__":
    main()
