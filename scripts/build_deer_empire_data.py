#!/usr/bin/env python3
"""
Deer Empire NARA (鹿帝国プロジェクト)
Reproducible data integration, spatial modeling, 3-scenario sensitivity analysis,
5km regional mesh synthesis, and GeoJSON/CSV/JSON export script.
"""

from __future__ import annotations

import csv
import json
import math
from pathlib import Path
from typing import Any

ROOT_DIR = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT_DIR / "data" / "raw"
PROC_DIR = ROOT_DIR / "data" / "processed"
META_DIR = ROOT_DIR / "data" / "metadata"
DASH_DIR = ROOT_DIR / "dashboard"

# Undetermined municipalities (Evidence Grade D):
# 0 ha actual forest in 2020 Forestry Census, or < 50 ha fragmented basin flatland (<5% forest)
UNDETERMINED_CODES = {
    "29202",  # 大和高田市 (0 ha)
    "29345",  # 安堵町 (0 ha)
    "29361",  # 川西町 (0 ha)
    "29362",  # 三宅町 (0 ha)
    "29363",  # 田原本町 (0 ha)
    "29426",  # 広陵町 (23 ha, 1.4%)
    "29427",  # 河合町 (39 ha, 4.7%)
}

# Regional base density per km2 of forest (head / km2 forest)
# Derived from Nara 7th Management Plan regional blocks, REST camera surveys, and Odaigahara reports
BLOCK_BASE_DENSITY = {
    "東部": {"low": 19.0, "std": 26.0, "high": 33.5},
    "南部": {"low": 14.5, "std": 20.0, "high": 26.0},
    "北西部": {"low": 11.0, "std": 16.0, "high": 22.5},
}

# Municipality-specific habitat / isolation / empirical calibration factor & rationale
MUNICIPALITY_FACTORS: dict[str, dict[str, Any]] = {
    "29203": {
        "factor": 0.45,
        "habitat_note": "矢田丘陵東縁の小規模森林（3.90 km²）。市街地との分断が強く周縁侵入中心。",
        "damage_capture_note": "北部丘陵縁辺で出没確認はあるが定住群は限定的。",
    },
    "29204": {
        "factor": 0.90,
        "habitat_note": "大和高原西縁（福住・山田等）に連続森林（33.15 km²）を有し東方からの高密度圧を受ける。",
        "damage_capture_note": "山間部農地被害・捕獲報告が継続。",
    },
    "29205": {
        "factor": 0.45,
        "habitat_note": "大和三山等の孤立丘陵・南東縁辺森林（2.12 km²）。都市化率が高く定住密度は限定的。",
        "damage_capture_note": "盆地中央部に近く、定住森林は極小で偶発侵入中心。",
    },
    "29206": {
        "factor": 0.92,
        "habitat_note": "初瀬・笠・音羽山系など連続山林（59.57 km²）を有し、宇陀・東部山系と接続。",
        "damage_capture_note": "東部山間地域の農業被害対策重点域。",
    },
    "29207": {
        "factor": 1.02,
        "habitat_note": "旧西吉野・大塔村を含む広大な南部山林（216.83 km²）。紀伊山地の高密度連続帯。",
        "damage_capture_note": "森林管理署報告で被害深刻地域に指定。ジビエ処理施設等で捕獲活用推進。",
    },
    "29208": {
        "factor": 0.95,
        "habitat_note": "金剛・葛城山系東斜面（30.68 km²）を抱え、近年北西部への分布拡大が顕著。",
        "damage_capture_note": "金剛・葛城山系の侵入・被害拡大域（林野庁・県資料）。",
    },
    "29209": {
        "factor": 0.65,
        "habitat_note": "生駒山系東斜面および北部の里山（18.94 km²）。近年侵入が確認されるも都市帯による分断あり。",
        "damage_capture_note": "生駒山系への分布拡大・出没確認域。",
    },
    "29210": {
        "factor": 0.60,
        "habitat_note": "二上山北麓〜丘陵地（5.90 km²）。大阪府境山系との接続部だが都市隣接。",
        "damage_capture_note": "二上山周辺での分布拡大縁辺域。",
    },
    "29211": {
        "factor": 0.85,
        "habitat_note": "葛城・二上山系東麓（13.23 km²）。山麓部の連続林を伝った侵入帯。",
        "damage_capture_note": "葛城山系東麓の農地隣接部で出没増加。",
    },
    "29212": {
        "factor": 1.08,
        "habitat_note": "大和高原・室生山系を含む広大な東部森林（183.25 km²）。県内で最も被害意識・密度が高い中核域の一つ。",
        "damage_capture_note": "全域で水稲・野菜食害・林業剥皮・冬期集落侵入が深刻（宇陀市鳥獣被害防止計画）。",
    },
    "29322": {
        "factor": 1.02,
        "habitat_note": "大和高原北部の山間林（41.31 km²）。奈良市D地区・伊賀市と隣接し連続生息。",
        "damage_capture_note": "鳥獣被害対策実施隊によるわな・銃器捕獲を重点推進。",
    },
    "29342": {
        "factor": 0.72,
        "habitat_note": "矢田丘陵・生駒山系南部の谷合森林（11.28 km²）。",
        "damage_capture_note": "北西部拡大ゾーンに含まれる。",
    },
    "29343": {
        "factor": 0.55,
        "habitat_note": "信貴山麓の小面積森林（2.86 km²）。都市開発との混在域。",
        "damage_capture_note": "生駒・信貴山系の周縁帯。",
    },
    "29344": {
        "factor": 0.55,
        "habitat_note": "矢田丘陵南端の森林（3.46 km²）。分断性あり。",
        "damage_capture_note": "丘陵縁辺部の限定的利用域。",
    },
    "29385": {
        "factor": 1.10,
        "habitat_note": "曽爾高原と室生・倶留尊山系の草原・森林（41.28 km²、森林率86.4%）。採餌適地が豊富。",
        "damage_capture_note": "東部高密度山間地域の代表例。",
    },
    "29386": {
        "factor": 1.10,
        "habitat_note": "三重県境の高見・三峰山系森林（70.12 km²、森林率88.1%）。人工林と広葉樹林が混在。",
        "damage_capture_note": "東部山間部の高密度・深刻被害地域。",
    },
    "29401": {
        "factor": 1.25,
        "habitat_note": "高取山系・竜門山塊西縁（16.80 km²）。県森林技術センターRESTモデルで人工林 30.15 頭/km² の高密度を実測。",
        "damage_capture_note": "学術調査（RESTカメラトラップ：30.15頭/km²、糞塊46.49/km）の参照自治体。",
    },
    "29402": {
        "factor": 0.85,
        "habitat_note": "飛鳥南部の山麓森林（13.52 km²）。高取山・竜門山地と連続。",
        "damage_capture_note": "里山林縁部の農業被害警戒域。",
    },
    "29424": {
        "factor": 0.45,
        "habitat_note": "馬見丘陵縁辺の小規模林（0.97 km²）。住宅地比率が極めて高く、隣接山系から孤立。",
        "damage_capture_note": "森林面積1km²未満の都市近郊丘陵。",
    },
    "29425": {
        "factor": 0.50,
        "habitat_note": "明神山北麓の狭小森林（1.72 km²）。大和川狭窄部に面する。",
        "damage_capture_note": "生駒・信貴山系〜二上山系連絡部の狭小帯。",
    },
    "29441": {
        "factor": 1.05,
        "habitat_note": "吉野山〜竜門山系の広大な森林（79.04 km²、森林率82.6%）。",
        "damage_capture_note": "林業（吉野杉・ヒノキ）被害と捕獲強化の重点地域。",
    },
    "29442": {
        "factor": 0.85,
        "habitat_note": "吉野川北岸の丘陵・山地林（19.64 km²、森林率51.5%）。",
        "damage_capture_note": "中南和移行帯の山林域。",
    },
    "29443": {
        "factor": 1.00,
        "habitat_note": "吉野川南岸の森林（49.03 km²、森林率79.1%）。黒滝・天川へ連なる林業地帯。",
        "damage_capture_note": "中山間農林業被害対策域。",
    },
    "29444": {
        "factor": 1.05,
        "habitat_note": "吉野中央部の急峻森林（46.10 km²、森林率96.6%）。",
        "damage_capture_note": "全域が森林地帯に近く高率で生息。",
    },
    "29446": {
        "factor": 1.00,
        "habitat_note": "大峯山脈中核の広大森林（170.81 km²、森林率97.2%）。高標高亜高山帯を含む。",
        "damage_capture_note": "大峯山系・洞川〜天川域の広域生息帯。",
    },
    "29447": {
        "factor": 0.95,
        "habitat_note": "高野竜神・伯母子岳山系（152.14 km²、森林率98.2%）。県森林技術センターRESTモデルで天然林 14.07 頭/km² を測定。",
        "damage_capture_note": "森林率県内最高クラス。REST調査点（14.07頭/km²）を含みつつ広大面積を有する。",
    },
    "29449": {
        "factor": 1.02,
        "habitat_note": "日本最大の村・644.71 km²の広大森林（95.9%）。果無山脈・玉置山・大塔山系を含む。",
        "damage_capture_note": "十津川村鳥獣被害防止計画：防護柵なしでは作付困難な常態的被害地域。",
    },
    "29450": {
        "factor": 0.98,
        "habitat_note": "前鬼・池原ダム周辺の奥吉野森林（123.67 km²、森林率92.7%）。",
        "damage_capture_note": "南部・北山川流域の連続生息帯。",
    },
    "29451": {
        "factor": 0.95,
        "habitat_note": "大台ヶ原を抱える広大森林（265.91 km²、森林率97.0%）。大台ヶ原管理地区（環境省管理下5.6〜10頭/km²）と周辺人工林が混在。",
        "damage_capture_note": "環境省大台ヶ原ニホンジカ管理計画の中核域。過去の過密35.8頭/km²から管理下へ低下も広大な森林を有する。",
    },
    "29452": {
        "factor": 1.00,
        "habitat_note": "吉野杉の源流・大滝〜大台ヶ原北側森林（255.73 km²、森林率95.0%）。",
        "damage_capture_note": "造林木剥皮被害・水源林植生保全の重点域。",
    },
    "29453": {
        "factor": 1.08,
        "habitat_note": "高見山・台高山脈西斜面の森林（126.02 km²、森林率95.7%）。",
        "damage_capture_note": "森林管理事務所資料で被害深刻・高密度域として明記。",
    },
}


def classify_dominance(ratio_pct: float | None) -> tuple[str, str, str]:
    """Classify municipality dominance tier strictly per Section 3.3."""
    if ratio_pct is None:
        return ("UNDETERMINED", "❓ 未判定地域", "#475569")
    if ratio_pct >= 100.0:
        return ("EMPIRE", "👑 鹿帝国領", "#F59E0B")
    if ratio_pct >= 50.0:
        return ("DEER_DOMINANT", "🦌 鹿優勢地域", "#10B981")
    if ratio_pct >= 10.0:
        return ("CONTESTED", "⚔️ 勢力均衡地域", "#A855F7")
    return ("HUMAN_DOMINANT", "🏙️ 人間優勢地域", "#3B82F6")


def compute_depi(
    forest_ratio_pct: float,
    deer_density_admin: float | None,
    ratio_pct: float | None,
    evidence_grade: str,
) -> float | None:
    """
    Compute Deer Empire Power Index (DEPI, unit: 帝国pt [0-100]).
    Distinct from鹿人比率(%), integrating habitat share, density intensity, and log demographic pressure.
    """
    if evidence_grade == "D" or deer_density_admin is None or ratio_pct is None:
        return None
    # Component 1: Forest dominance (0-35 pt)
    c_forest = min(35.0, (forest_ratio_pct / 100.0) * 35.0)
    # Component 2: Administrative deer density intensity (0-35 pt, saturates around 30 head/km2)
    c_density = min(35.0, (deer_density_admin / 30.0) * 35.0)
    # Component 3: Log demographic confrontation pressure (0-30 pt, 1000%+ -> ~30 pt)
    c_ratio = min(30.0, max(0.0, (math.log10(max(ratio_pct, 0.1) + 1.0) / math.log10(1501.0)) * 30.0))
    return round(c_forest + c_density + c_ratio, 1)


def point_in_ring(lon: float, lat: float, ring: list[list[float]]) -> bool:
    """Ray-casting point-in-polygon check."""
    inside = False
    n = len(ring)
    j = n - 1
    for i in range(n):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if ((yi > lat) != (yj > lat)) and (lon < (xj - xi) * (lat - yi) / ((yj - yi) or 1e-12) + xi):
            inside = not inside
        j = i
    return inside


def point_in_geometry(lon: float, lat: float, geom: dict[str, Any]) -> bool:
    """Check if (lon, lat) is inside Polygon or MultiPolygon."""
    gtype = geom["type"]
    if gtype == "Polygon":
        rings = geom["coordinates"]
        if not point_in_ring(lon, lat, rings[0]):
            return False
        for hole in rings[1:]:
            if point_in_ring(lon, lat, hole):
                return False
        return True
    if gtype == "MultiPolygon":
        for poly in geom["coordinates"]:
            if point_in_ring(lon, lat, poly[0]):
                if not any(point_in_ring(lon, lat, hole) for hole in poly[1:]):
                    return True
    return False


def geometry_centroid(geom: dict[str, Any]) -> tuple[float, float]:
    """Compute a representative point guaranteed to lie inside the polygon."""
    if geom["type"] == "Polygon":
        ring = geom["coordinates"][0]
    else:
        ring = max(geom["coordinates"], key=lambda p: len(p[0]))[0]
    xs = [p[0] for p in ring]
    ys = [p[1] for p in ring]
    cx = sum(xs) / len(xs)
    cy = sum(ys) / len(ys)
    if point_in_geometry(cx, cy, geom):
        return (round(cx, 5), round(cy, 5))

    # Fallback for concave polygons (e.g., Gojo City): grid search inside bbox
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)
    best_pt: tuple[float, float] | None = None
    best_score = -1.0
    steps = 28
    for i in range(1, steps):
        px = min_x + (max_x - min_x) * (i / steps)
        for j in range(1, steps):
            py = min_y + (max_y - min_y) * (j / steps)
            if point_in_geometry(px, py, geom):
                # Prefer interior point near bounding-box center with clearance from vertices
                min_dist = min((px - vx) ** 2 + (py - vy) ** 2 for vx, vy in ring[::max(1, len(ring) // 40)])
                center_dist = ((px - cx) ** 2 + (py - cy) ** 2) + 1e-6
                score = min_dist / (center_dist ** 0.25)
                if score > best_score:
                    best_score = score
                    best_pt = (px, py)
    if best_pt is not None:
        return (round(best_pt[0], 5), round(best_pt[1], 5))
    return (round(cx, 5), round(cy, 5))


def main() -> None:
    PROC_DIR.mkdir(parents=True, exist_ok=True)
    META_DIR.mkdir(parents=True, exist_ok=True)
    DASH_DIR.mkdir(parents=True, exist_ok=True)

    # 1. Load raw data
    pop_rows: dict[str, dict[str, Any]] = {}
    with (RAW_DIR / "nara_population_raw.csv").open(encoding="utf-8") as f:
        for row in csv.DictReader(f):
            pop_rows[row["jis_code"]] = row

    forest_rows: dict[str, dict[str, Any]] = {}
    with (RAW_DIR / "nara_forest_raw.csv").open(encoding="utf-8") as f:
        for row in csv.DictReader(f):
            forest_rows[row["jis_code"]] = row

    with (RAW_DIR / "nara_deer_parameters.json").open(encoding="utf-8") as f:
        deer_params = json.load(f)

    with (RAW_DIR / "nara_N03_raw.geojson").open(encoding="utf-8") as f:
        n03_geojson = json.load(f)

    assert len(pop_rows) == 39, f"Expected 39 pop rows, got {len(pop_rows)}"
    assert len(forest_rows) == 39, f"Expected 39 forest rows, got {len(forest_rows)}"
    assert len(n03_geojson["features"]) == 39, f"Expected 39 geo features, got {len(n03_geojson['features'])}"

    # 2. Compute integrated municipality dataset
    records: list[dict[str, Any]] = []
    record_by_code: dict[str, dict[str, Any]] = {}

    for jis_code, p in pop_rows.items():
        fr = forest_rows[jis_code]
        pop_2026 = int(p["pop_2026_10"])
        pop_2020 = int(p["pop_2020_10"])
        area_km2 = float(p["area_km2"])
        forest_ha = int(fr["actual_forest_area_ha"])
        forest_km2 = round(forest_ha / 100.0, 2)
        forest_ratio_pct = round((forest_km2 / area_km2) * 100.0, 1) if forest_ha > 0 else 0.0
        human_density = round(pop_2026 / area_km2, 1)
        pop_change_pct = round(((pop_2026 - pop_2020) / pop_2020) * 100.0, 2)

        # Estimation logic by municipality category
        if jis_code == "29201":
            # Nara City special non-overlapping composite (Grade B: Grade A park + Grade B D-zone)
            # Uses 100% documented official densities (FY2021: 11.7 / FY2023: 15.5 / FY2018: 22.8)
            # C buffer zone is NOT assigned an arbitrary unverified number to avoid confusion with FY2017 120-cap.
            park_deer = deer_params["nara_park_aigokai"]["latest_total"]  # 1,687
            d_area = 184.0
            d_dens_low = 11.7
            d_dens_std = 15.5
            d_dens_high = 22.8
            deer_low = int(round(park_deer + d_area * d_dens_low))
            deer_std = int(round(park_deer + d_area * d_dens_std))
            deer_high = int(round(park_deer + d_area * d_dens_high))
            evidence_grade = "B"
            evidence_label = "区分B：公的資料に基づく推定（奈良公園1,687頭は区分A実測・重複除外済）"
            method_formula = (
                f"保護地区A/B(愛護会2026年実測: {park_deer:,}頭) + "
                f"管理D地区({d_area:.0f}km² × R5糞粒法平均密度{d_dens_std}頭/km² = {int(round(d_area * d_dens_std)):,}頭) "
                f"[保守: R3実測11.7頭/km² / 高密度: H30実測22.8頭/km²／C緩衝地区の未根拠加算は排除]"
            )
            habitat_note = (
                "A/B保護地区(奈良公園・春日山)の1,687頭と、東部D管理地区(田原・柳生等約184km²)の野生群を重複なく合算。"
                "※森林面積ベース見かけ密度には公園平坦部個体が含まれるため、野生換算森林密度(21.54頭/km²)と区別。"
            )
            damage_capture_note = "D地区で年間捕獲上限450頭の指定管理鳥獣捕獲等事業を実施。保護地区は捕獲禁止。"
            model_factor = 1.0
            base_forest_density_std = round((deer_std - park_deer) / forest_km2, 2)
        elif jis_code in UNDETERMINED_CODES:
            deer_low = None
            deer_std = None
            deer_high = None
            evidence_grade = "D"
            evidence_label = "区分D：データ不足（定住森林なし／極小の盆地市街・農地帯のため推定対象外）"
            method_formula = "推定対象外（2020年農林業センサス現況森林面積 = 0〜39 ha、定住生息域外）"
            habitat_note = (
                "奈良盆地中央部の平坦な市街地・農地地域。森林面積が0 haまたは0.5 km²未満であり、"
                "環境省メッシュ上の継続的定住生息域に該当しないため頭数を算出しない。"
            )
            damage_capture_note = "河川敷等を伝う偶発的迷入を除き、定住個体群は確認されていない。"
            model_factor = 0.0
            base_forest_density_std = None
        else:
            block = p["region_block"]
            dens = BLOCK_BASE_DENSITY[block]
            m_info = MUNICIPALITY_FACTORS[jis_code]
            factor = float(m_info["factor"])
            deer_low = int(round(forest_km2 * dens["low"] * factor))
            deer_std = int(round(forest_km2 * dens["std"] * factor))
            deer_high = int(round(forest_km2 * dens["high"] * factor))
            evidence_grade = "C"
            evidence_label = "区分C：追加仮定を伴う独自推定（現況森林面積×地域ブロック密度×環境係数）"
            base_forest_density_std = round(dens["std"] * factor, 2)
            method_formula = (
                f"現況森林面積({forest_km2:.2f} km²) × {block}ブロック基準密度({dens['std']} 頭/km²) × "
                f"自治体補正係数({factor:.2f}) = {deer_std:,} 頭"
            )
            habitat_note = m_info["habitat_note"]
            damage_capture_note = m_info["damage_capture_note"]
            model_factor = factor

        def metrics_for(deer_val: int | None) -> dict[str, Any]:
            if deer_val is None:
                return {
                    "deer": None,
                    "ratio_pct": None,
                    "density_admin": None,
                    "density_forest": None,
                    "dom_code": "UNDETERMINED",
                    "dom_label": "❓ 未判定地域",
                    "dom_color": "#475569",
                }
            ratio = round((deer_val / pop_2026) * 100.0, 2)
            d_admin = round(deer_val / area_km2, 2)
            d_forest = round(deer_val / forest_km2, 2) if forest_km2 > 0 else None
            dom_code, dom_label, dom_color = classify_dominance(ratio)
            return {
                "deer": deer_val,
                "ratio_pct": ratio,
                "density_admin": d_admin,
                "density_forest": d_forest,
                "dom_code": dom_code,
                "dom_label": dom_label,
                "dom_color": dom_color,
            }

        m_std = metrics_for(deer_std)
        m_low = metrics_for(deer_low)
        m_high = metrics_for(deer_high)
        depi_std = compute_depi(forest_ratio_pct, m_std["density_admin"], m_std["ratio_pct"], evidence_grade)

        # Check sensitivity stability across low / std / high
        scenario_classes = {m_low["dom_code"], m_std["dom_code"], m_high["dom_code"]}
        tier_shift_sensitive = len(scenario_classes) > 1

        rec = {
            "jis_code": jis_code,
            "name_ja": p["name_ja"],
            "name_kana": p["name_kana"],
            "municipality_type": p["municipality_type"],
            "district_or_area": p["district_or_area"],
            "region_block": p["region_block"],
            "human_pop": pop_2026,
            "human_pop_2020": pop_2020,
            "pop_change_pct_2020_2026": pop_change_pct,
            "area_km2": area_km2,
            "human_density_km2": human_density,
            "forest_area_ha": forest_ha,
            "forest_area_km2": forest_km2,
            "forest_ratio_pct": forest_ratio_pct,
            "evidence_grade": evidence_grade,
            "evidence_label": evidence_label,
            "deer_std": m_std["deer"],
            "deer_low": m_low["deer"],
            "deer_high": m_high["deer"],
            "deer_human_ratio_pct": m_std["ratio_pct"],
            "deer_human_ratio_low_pct": m_low["ratio_pct"],
            "deer_human_ratio_high_pct": m_high["ratio_pct"],
            "deer_density_admin_km2": m_std["density_admin"],
            "deer_density_forest_km2": m_std["density_forest"],
            "dominance_code": m_std["dom_code"],
            "dominance_label": m_std["dom_label"],
            "dominance_color": m_std["dom_color"],
            "dominance_low_code": m_low["dom_code"],
            "dominance_high_code": m_high["dom_code"],
            "tier_shift_sensitive": tier_shift_sensitive,
            "depi_score": depi_std,
            "model_factor": model_factor,
            "base_forest_density_std": base_forest_density_std,
            "method_formula": method_formula,
            "habitat_note": habitat_note,
            "damage_capture_note": damage_capture_note,
            "pop_ref_date": "2026-10-01",
            "forest_ref_date": "2020-02-01",
            "deer_ref_period": "2022-2026(混合:奈良公園2026-07/D地区FY2023/県計画第7次)",
        }
        records.append(rec)
        record_by_code[jis_code] = rec

    # 3. Attach attributes and centroids to GeoJSON features
    enriched_features = []
    geom_by_code: dict[str, dict[str, Any]] = {}
    for feat in n03_geojson["features"]:
        code = feat["properties"]["N03_007"]
        rec = record_by_code[code]
        lon, lat = geometry_centroid(feat["geometry"])
        rec["centroid_lon"] = lon
        rec["centroid_lat"] = lat
        geom_by_code[code] = feat["geometry"]
        enriched_features.append(
            {
                "type": "Feature",
                "properties": dict(rec),
                "geometry": feat["geometry"],
            }
        )

    empire_geojson = {
        "type": "FeatureCollection",
        "name": "nara_empire_39_municipalities",
        "crs": {"type": "name", "properties": {"name": "urn:ogc:def:crs:OGC:1.3:CRS84"}},
        "features": enriched_features,
    }

    # 4. Generate 5km Standard Mesh Overlay (2nd mesh quarter grid: dlat=2.5min, dlon=3.75min)
    dlat = 2.5 / 60.0   # ~4.62 km N-S
    dlon = 3.75 / 60.0  # ~5.68 km E-W at 34.3N
    lat_start = 33.833333
    lon_start = 135.500000
    n_rows = 24
    n_cols = 14
    mesh_features = []

    for r in range(n_rows):
        y0 = lat_start + r * dlat
        y1 = y0 + dlat
        cy = (y0 + y1) / 2.0
        for c in range(n_cols):
            x0 = lon_start + c * dlon
            x1 = x0 + dlon
            cx = (x0 + x1) / 2.0

            # Sample 9 points inside cell + check any municipality centroid falling inside this cell
            sample_pts = [
                (cx, cy),
                (x0 + 0.2 * dlon, y0 + 0.2 * dlat),
                (x0 + 0.8 * dlon, y0 + 0.2 * dlat),
                (x0 + 0.2 * dlon, y0 + 0.8 * dlat),
                (x0 + 0.8 * dlon, y0 + 0.8 * dlat),
                (x0 + 0.5 * dlon, y0 + 0.2 * dlat),
                (x0 + 0.5 * dlon, y0 + 0.8 * dlat),
                (x0 + 0.2 * dlon, y0 + 0.5 * dlat),
                (x0 + 0.8 * dlon, y0 + 0.5 * dlat),
            ]
            hits: list[str] = []
            for sx, sy in sample_pts:
                for code, geom in geom_by_code.items():
                    if point_in_geometry(sx, sy, geom):
                        hits.append(code)
                        break

            # Ensure small municipalities whose representative centroid falls in this cell are recorded
            centroid_hits = [
                rec["jis_code"]
                for rec in records
                if x0 <= rec["centroid_lon"] <= x1 and y0 <= rec["centroid_lat"] <= y1
            ]
            all_covered_codes = sorted(set(hits) | set(centroid_hits))
            if not all_covered_codes:
                continue

            # Primary municipality = most frequent among sample hits, or centroid hit fallback
            if hits:
                primary_code = max(set(hits), key=hits.count)
            else:
                primary_code = centroid_hits[0]
            rec = record_by_code[primary_code]

            # Special Nara Park highlight mesh
            is_nara_park_mesh = (34.66 <= cy <= 34.715) and (135.81 <= cx <= 135.875)
            # Odaigahara core mesh (Kamikitayama eastern high plateau)
            is_odaigahara_mesh = (34.16 <= cy <= 34.23) and (136.07 <= cx <= 136.15)

            mesh_density: float | None
            if rec["evidence_grade"] == "D":
                # Keep Grade D cells strictly null (not 0.0) to avoid confusion with verified zero deer
                mesh_density = None
                density_tier = "未判定(区分D：算出対象外)"
            elif is_nara_park_mesh:
                # Concentrated Nara Park herd (~1,687 deer in A/B protection core)
                mesh_density = 35.0
                density_tier = "神鹿超密保護帯(奈良公園)"
            elif is_odaigahara_mesh:
                mesh_density = 7.5  # Env Ministry managed density ~5.6-10/km2
                density_tier = "大台ヶ原管理抑制帯(5.6〜10頭/km²)"
            elif primary_code == "29201":
                # Non-park Nara City cells: avoid double-projecting the 1,687 Nara Park herd!
                # Eastern half (lon >= 135.87) corresponds to Management Zone D (15.5 head/km2)
                if cx >= 135.87:
                    mesh_density = 15.5
                    density_tier = "奈良市D管理地区(R5糞粒法 15.5頭/km²)"
                else:
                    mesh_density = 3.0
                    density_tier = "奈良市西部市街・縁辺帯(低密度)"
            else:
                mesh_density = float(rec["deer_density_admin_km2"] or 0.0)
                if mesh_density >= 22.0:
                    density_tier = "超高密度帯(22頭/km²〜)"
                elif mesh_density >= 15.0:
                    density_tier = "高密度帯(15〜22頭/km²)"
                elif mesh_density >= 7.0:
                    density_tier = "中密度帯(7〜15頭/km²)"
                else:
                    density_tier = "低密度・周縁拡大帯(<7頭/km²)"

            mesh_id = f"M5K_{r:02d}_{c:02d}"
            mesh_features.append(
                {
                    "type": "Feature",
                    "properties": {
                        "mesh_id": mesh_id,
                        "primary_jis_code": primary_code,
                        "primary_municipality": rec["name_ja"],
                        "covered_jis_codes": all_covered_codes,
                        "covered_municipalities": [record_by_code[k]["name_ja"] for k in all_covered_codes],
                        "region_block": rec["region_block"],
                        "projected_density_km2": round(mesh_density, 2) if mesh_density is not None else None,
                        "density_tier": density_tier,
                        "is_nara_park": is_nara_park_mesh,
                        "is_odaigahara": is_odaigahara_mesh,
                        "note": "本メッシュは市町村別推定密度および地域区分を標準5kmメッシュに空間投影した参考オーバーレイです（環境省非公開実測メッシュ原値ではありません）。",
                    },
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [
                            [
                                [round(x0, 5), round(y0, 5)],
                                [round(x1, 5), round(y0, 5)],
                                [round(x1, 5), round(y1, 5)],
                                [round(x0, 5), round(y1, 5)],
                                [round(x0, 5), round(y0, 5)],
                            ]
                        ],
                    },
                }
            )

    mesh_geojson = {
        "type": "FeatureCollection",
        "name": "nara_deer_projected_5km_mesh",
        "features": mesh_features,
    }

    # 5. Compute Summary KPIs & Scenario Totals
    def summarize_scenario(key: str) -> dict[str, Any]:
        total_deer = sum(r[f"deer_{key}"] for r in records if r[f"deer_{key}"] is not None)
        total_human = sum(r["human_pop"] for r in records)
        estimated_human = sum(r["human_pop"] for r in records if r[f"deer_{key}"] is not None)
        tier_counts = {"EMPIRE": 0, "DEER_DOMINANT": 0, "CONTESTED": 0, "HUMAN_DOMINANT": 0, "UNDETERMINED": 0}
        empire_area = 0.0
        for r in records:
            if key == "std":
                dc = r["dominance_code"]
            elif key == "low":
                dc = r["dominance_low_code"]
            else:
                dc = r["dominance_high_code"]
            tier_counts[dc] += 1
            if dc == "EMPIRE":
                empire_area += r["area_km2"]

        ratio_key = "deer_human_ratio_pct" if key == "std" else f"deer_human_ratio_{key}_pct"
        valid_ratios = [r for r in records if r[ratio_key] is not None]
        strongest = max(valid_ratios, key=lambda r: r[ratio_key])
        most_deer = max(valid_ratios, key=lambda r: r[f"deer_{key}"])
        total_area = sum(r["area_km2"] for r in records)
        return {
            "total_deer_estimated": total_deer,
            "nara_park_deer_measured": 1687,
            "wild_deer_estimated": total_deer - 1687,
            "total_human_pop": total_human,
            "estimated_area_human_pop": estimated_human,
            "pref_deer_human_ratio_pct": round((total_deer / total_human) * 100.0, 2),
            "tier_counts": tier_counts,
            "empire_area_km2": round(empire_area, 2),
            "empire_area_share_pct": round((empire_area / total_area) * 100.0, 1),
            "strongest_municipality": {
                "jis_code": strongest["jis_code"],
                "name_ja": strongest["name_ja"],
                "ratio_pct": strongest[ratio_key],
                "deer": strongest[f"deer_{key}"],
                "human_pop": strongest["human_pop"],
            },
            "most_populous_deer_municipality": {
                "jis_code": most_deer["jis_code"],
                "name_ja": most_deer["name_ja"],
                "deer": most_deer[f"deer_{key}"],
            },
        }

    summary_kpis = {
        "generated_at": "2026-11-21",
        "prefecture_human_pop_2026_10": sum(r["human_pop"] for r in records),
        "prefecture_human_pop_2020_10": sum(r["human_pop_2020"] for r in records),
        "prefecture_total_area_km2": round(sum(r["area_km2"] for r in records), 2),
        "prefecture_forest_area_ha": sum(r["forest_area_ha"] for r in records),
        "prefecture_forest_ratio_pct": round(
            (sum(r["forest_area_km2"] for r in records) / sum(r["area_km2"] for r in records)) * 100.0, 1
        ),
        "estimated_municipality_count": sum(1 for r in records if r["evidence_grade"] != "D"),
        "undetermined_municipality_count": sum(1 for r in records if r["evidence_grade"] == "D"),
        "grade_counts": {
            "A_hybrid_in_B": 1,  # Nara City includes Grade A Nara Park inside Grade B hybrid
            "B": sum(1 for r in records if r["evidence_grade"] == "B"),
            "C": sum(1 for r in records if r["evidence_grade"] == "C"),
            "D": sum(1 for r in records if r["evidence_grade"] == "D"),
        },
        "tier_shift_sensitive_municipalities": [
            {
                "jis_code": r["jis_code"],
                "name_ja": r["name_ja"],
                "low": r["dominance_low_code"],
                "std": r["dominance_code"],
                "high": r["dominance_high_code"],
                "ratios": [r["deer_human_ratio_low_pct"], r["deer_human_ratio_pct"], r["deer_human_ratio_high_pct"]],
            }
            for r in records
            if r["tier_shift_sensitive"]
        ],
        "scenarios": {
            "std": summarize_scenario("std"),
            "low": summarize_scenario("low"),
            "high": summarize_scenario("high"),
        },
        "parameters": deer_params,
    }

    # 6. Export CSV, JSON, GeoJSON, and Dashboard JS Bundle
    csv_fields = list(records[0].keys())
    with (PROC_DIR / "municipalities_master.csv").open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=csv_fields)
        writer.writeheader()
        writer.writerows(records)

    with (PROC_DIR / "municipalities_master.json").open("w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False, indent=2)

    with (PROC_DIR / "nara_empire_map.geojson").open("w", encoding="utf-8") as f:
        json.dump(empire_geojson, f, ensure_ascii=False)

    with (PROC_DIR / "nara_deer_mesh.geojson").open("w", encoding="utf-8") as f:
        json.dump(mesh_geojson, f, ensure_ascii=False)

    with (PROC_DIR / "summary_kpis.json").open("w", encoding="utf-8") as f:
        json.dump(summary_kpis, f, ensure_ascii=False, indent=2)

    # Create self-contained JS data bundle for both file:// and http:// execution
    bundle_payload = {
        "kpis": summary_kpis,
        "municipalities": records,
        "geojson": empire_geojson,
        "mesh": mesh_geojson,
    }
    with (DASH_DIR / "data_bundle.js").open("w", encoding="utf-8") as f:
        f.write("window.DEER_EMPIRE_DATA = ")
        json.dump(bundle_payload, f, ensure_ascii=False)
        f.write(";\n")

    print("Build complete!")
    print("Total 2026 Human Pop:", summary_kpis["prefecture_human_pop_2026_10"])
    print("Total Forest (ha):", summary_kpis["prefecture_forest_area_ha"])
    print("5km Mesh cells inside Nara:", len(mesh_features))
    for sc in ("low", "std", "high"):
        s = summary_kpis["scenarios"][sc]
        print(
            f"[{sc.upper()}] Total Deer: {s['total_deer_estimated']:,} "
            f"(Park {s['nara_park_deer_measured']:,} + Wild {s['wild_deer_estimated']:,}), "
            f"Ratio: {s['pref_deer_human_ratio_pct']}%, "
            f"Empire Munis: {s['tier_counts']['EMPIRE']} ({s['empire_area_share_pct']}% of Nara area), "
            f"Strongest: {s['strongest_municipality']['name_ja']} ({s['strongest_municipality']['ratio_pct']}%)"
        )
    print("Tier-shift sensitive municipalities across low/std/high:", len(summary_kpis["tier_shift_sensitive_municipalities"]))
    for m in summary_kpis["tier_shift_sensitive_municipalities"]:
        print("  -", m["name_ja"], m["low"], "->", m["std"], "->", m["high"], m["ratios"])


if __name__ == "__main__":
    main()
