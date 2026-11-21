#!/usr/bin/env python3
"""
Automated data integrity and Red Team compliance verification script
for Deer Empire NARA (鹿帝国プロジェクト).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from build_deer_empire_data import point_in_geometry

ROOT_DIR = Path(__file__).resolve().parent.parent
PROC_DIR = ROOT_DIR / "data" / "processed"
RAW_DIR = ROOT_DIR / "data" / "raw"
DOCS_DIR = ROOT_DIR / "docs"
REPORTS_DIR = ROOT_DIR / "reports"
DASH_2D_DIR = ROOT_DIR / "2d" / "dashboard"
DASH_3D_DIR = ROOT_DIR / "3d" / "dashboard"
SLIDES_2D_DIR = ROOT_DIR / "2d" / "slides"
SLIDES_3D_DIR = ROOT_DIR / "3d" / "slides"


def run_checks() -> int:
    errors: list[str] = []

    with (PROC_DIR / "municipalities_master.json").open(encoding="utf-8") as f:
        munis = json.load(f)
    with (PROC_DIR / "nara_empire_map.geojson").open(encoding="utf-8") as f:
        geo = json.load(f)
    with (PROC_DIR / "nara_deer_mesh.geojson").open(encoding="utf-8") as f:
        mesh = json.load(f)
    with (PROC_DIR / "summary_kpis.json").open(encoding="utf-8") as f:
        kpis = json.load(f)

    # 1. Exact 39 municipalities check
    if len(munis) != 39:
        errors.append(f"Expected 39 municipalities, found {len(munis)}")
    if len(geo.get("features", [])) != 39:
        errors.append(f"Expected 39 GeoJSON features, found {len(geo.get('features', []))}")

    codes_m = {m["jis_code"] for m in munis}
    codes_g = {f["properties"]["jis_code"] for f in geo["features"]}
    if codes_m != codes_g:
        errors.append(f"JIS code mismatch between JSON and GeoJSON: {codes_m ^ codes_g}")

    # 2. Official population and forest sums
    pop_sum = sum(m["human_pop"] for m in munis)
    if pop_sum != 1263770:
        errors.append(f"2026 human population sum {pop_sum} != official 1263770")

    forest_sum = sum(m["forest_area_ha"] for m in munis)
    if forest_sum != 283671:
        errors.append(f"Forest area sum {forest_sum} != official 283671 ha")

    # 3. Grade D (undetermined) must NOT have deer numbers or ratio calculated
    d_munis = [m for m in munis if m["evidence_grade"] == "D"]
    if len(d_munis) != 7:
        errors.append(f"Expected 7 Grade D municipalities, found {len(d_munis)}")
    for m in d_munis:
        for k in ("deer_std", "deer_low", "deer_high", "deer_human_ratio_pct", "depi_score"):
            if m[k] is not None:
                errors.append(f"Grade D municipality {m['name_ja']} must have null {k}, got {m[k]}")
        if m["dominance_code"] != "UNDETERMINED":
            errors.append(f"Grade D municipality {m['name_ja']} dominance_code != UNDETERMINED")

    # 4. Double counting check for Nara City (29201)
    nara_city = next(m for m in munis if m["jis_code"] == "29201")
    if nara_city["evidence_grade"] != "B":
        errors.append(f"Nara City evidence_grade expected B, got {nara_city['evidence_grade']}")
    std_scen = kpis["scenarios"]["std"]
    expected_wild = std_scen["total_deer_estimated"] - 1687
    if std_scen["wild_deer_estimated"] != expected_wild:
        errors.append("Double counting check failed in summary KPIs")
    if nara_city["deer_std"] < 1687:
        errors.append("Nara City total must include the 1,687 Nara Park measured deer")

    # 5. Consistency of ratio and classification
    for m in munis:
        if m["evidence_grade"] != "D":
            calc_ratio = round((m["deer_std"] / m["human_pop"]) * 100.0, 2)
            if abs(calc_ratio - m["deer_human_ratio_pct"]) > 0.02:
                errors.append(f"Ratio mismatch in {m['name_ja']}: {calc_ratio} vs {m['deer_human_ratio_pct']}")
            if m["deer_low"] > m["deer_std"] or m["deer_std"] > m["deer_high"]:
                errors.append(f"Scenario ordering violated in {m['name_ja']}")

    # 6. Mesh & GIS Geometry Integrity Checks
    if len(mesh.get("features", [])) < 100:
        errors.append(f"Too few 5km mesh cells inside Nara: {len(mesh.get('features', []))}")

    # 6a. Every municipality's centroid must lie strictly inside its own polygon
    geom_by_code = {f["properties"]["jis_code"]: f["geometry"] for f in geo["features"]}
    for m in munis:
        if not point_in_geometry(m["centroid_lon"], m["centroid_lat"], geom_by_code[m["jis_code"]]):
            errors.append(f"Centroid outside own polygon for {m['name_ja']} ({m['jis_code']})")

    # 6b. All Grade B/C municipalities must appear in at least one 5km mesh cell
    covered_codes = set()
    for cell in mesh["features"]:
        p = cell["properties"]
        covered_codes.update(p.get("covered_jis_codes", []))
        if p["primary_jis_code"] in {d["jis_code"] for d in d_munis} and p["projected_density_km2"] is not None:
            errors.append(f"Grade D mesh cell {p['mesh_id']} must have null projected_density_km2")
    missing_bc = {m["jis_code"] for m in munis if m["evidence_grade"] in ("B", "C")} - covered_codes
    if missing_bc:
        errors.append(f"Grade B/C municipalities missing from 5km mesh coverage: {missing_bc}")

    # 7. Required files existence check
    required_files = [
        ROOT_DIR / "README.md",
        ROOT_DIR / "index.html",
        ROOT_DIR / ".nojekyll",
        DOCS_DIR / "research.md",
        DOCS_DIR / "sources.md",
        DOCS_DIR / "methodology.md",
        DOCS_DIR / "limitations.md",
        DOCS_DIR / "red-team-review.md",
        DOCS_DIR / "research-record.md",
        DOCS_DIR / "antigravity-usage-report.md",
        REPORTS_DIR / "findings.md",
        RAW_DIR / "nara_population_raw.csv",
        RAW_DIR / "nara_forest_raw.csv",
        RAW_DIR / "nara_deer_parameters.json",
        RAW_DIR / "nara_N03_raw.geojson",
        PROC_DIR / "municipalities_master.csv",
        PROC_DIR / "municipalities_master.json",
        PROC_DIR / "nara_empire_map.geojson",
        PROC_DIR / "nara_deer_mesh.geojson",
        PROC_DIR / "summary_kpis.json",
        DASH_2D_DIR / "index.html",
        DASH_2D_DIR / "styles.css",
        DASH_2D_DIR / "app.js",
        DASH_2D_DIR / "data_bundle.js",
        SLIDES_2D_DIR / "index.html",
        DASH_3D_DIR / "index.html",
        DASH_3D_DIR / "styles.css",
        DASH_3D_DIR / "styles3d.css",
        DASH_3D_DIR / "app.js",
        DASH_3D_DIR / "map3d.js",
        DASH_3D_DIR / "data_bundle.js",
        SLIDES_3D_DIR / "index.html",
    ]
    for rf in required_files:
        if not rf.exists() or (rf.name != ".nojekyll" and rf.stat().st_size == 0):
            errors.append(f"Missing or empty artifact: {rf}")

    if errors:
        print("VERIFICATION FAILED:")
        for e in errors:
            print("  -", e)
        return 1

    print("ALL DATA & RED-TEAM INTEGRITY CHECKS PASSED!")
    print(f"  - Municipalities verified: {len(munis)} (Grade B: 1, Grade C: 31, Grade D: 7)")
    print(f"  - 2026 Human Population: {pop_sum:,}")
    print(f"  - 2020 Actual Forest Area: {forest_sum:,} ha ({round(forest_sum/100, 2)} km2)")
    print(f"  - Std Deer Total: {std_scen['total_deer_estimated']:,} (Nara Park 1,687 + Wild {std_scen['wild_deer_estimated']:,})")
    print(f"  - Empire Municipalities (Std): {std_scen['tier_counts']['EMPIRE']} ({std_scen['empire_area_share_pct']}% of area)")
    print(f"  - 5km Mesh Cells: {len(mesh['features'])}")
    return 0


if __name__ == "__main__":
    sys.exit(run_checks())
