(() => {
  "use strict";

  const RAW = window.DEER_EMPIRE_DATA;
  if (!RAW) {
    document.body.innerHTML = "<div style='padding:40px;color:#fff'>データ読み込みエラー: data_bundle.js が見つかりません。</div>";
    return;
  }

  const TIER_META = {
    EMPIRE: { label: "👑 鹿帝国領", short: "鹿帝国領", color: "#f59e0b", desc: "鹿人比率 ≧ 100%（鹿が人間を上回る）" },
    DEER_DOMINANT: { label: "🦌 鹿優勢地域", short: "鹿優勢", color: "#10b981", desc: "鹿人比率 50%〜100%未満" },
    CONTESTED: { label: "⚔️ 勢力均衡地域", short: "勢力均衡", color: "#a855f7", desc: "鹿人比率 10%〜50%未満" },
    HUMAN_DOMINANT: { label: "🏙️ 人間優勢地域", short: "人間優勢", color: "#3b82f6", desc: "鹿人比率 10%未満" },
    UNDETERMINED: { label: "❓ 未判定地域", short: "未判定", color: "#475569", desc: "データ不足 / 定住森林なし (区分D等)" },
  };

  const GRADE_META = {
    A: { label: "区分A", color: "#10b981", desc: "公的・直接的な観測または統計" },
    B: { label: "区分B", color: "#3b82f6", desc: "公的資料に基づく推定（奈良公園実測＋D地区密度）" },
    C: { label: "区分C", color: "#f59e0b", desc: "追加仮定を伴う独自推定（森林面積×地域密度）" },
    D: { label: "区分D", color: "#64748b", desc: "データ不足（定住森林なし／推定対象外）" },
  };

  const LAYER_TITLES = {
    dominance: "勢力支配図（5段階分類）",
    ratio: "鹿人比率ヒートマップ（%）",
    deer: "鹿の推定生息数（頭）",
    human: "人間人口ヒートマップ（人）",
    density: "鹿の生息密度（頭/km²）",
    depi: "鹿帝国勢力指数 DEPI（帝国pt）",
    evidence: "証拠区分マップ（A / B / C / D）",
  };

  const DEFAULT_SLIDERS = { east: 26.0, south: 20.0, nw: 16.0 };

  const state = {
    layer: "dominance",
    densityBasis: "admin", // "admin" | "forest"
    scenario: "std", // "std" | "low" | "high" | "strict" | "custom"
    tileMode: "dark", // "dark" | "light" | "off"
    sliders: { ...DEFAULT_SLIDERS },
    showMesh: false,
    showZones: true,
    showSensitive: false,
    showLabels: true,
    selectedCode: null,
    computed: [],
    computedByCode: {},
  };

  let map = null;
  let geoLayer = null;
  let meshLayer = null;
  let zoneLayer = null;
  let labelLayer = null;
  const chartInstances = {};

  function fmtInt(v) {
    return v == null ? "—" : Math.round(v).toLocaleString("ja-JP");
  }
  function fmtDec(v, d = 1) {
    return v == null ? "—" : Number(v).toLocaleString("ja-JP", { minimumFractionDigits: d, maximumFractionDigits: d });
  }

  function classifyDominance(ratioPct) {
    if (ratioPct == null) return "UNDETERMINED";
    if (ratioPct >= 100.0) return "EMPIRE";
    if (ratioPct >= 50.0) return "DEER_DOMINANT";
    if (ratioPct >= 10.0) return "CONTESTED";
    return "HUMAN_DOMINANT";
  }

  function computeDepi(forestRatioPct, deerDensityAdmin, ratioPct) {
    if (deerDensityAdmin == null || ratioPct == null) return null;
    const cForest = Math.min(35.0, (forestRatioPct / 100.0) * 35.0);
    const cDens = Math.min(35.0, (deerDensityAdmin / 30.0) * 35.0);
    const cRatio = Math.min(30.0, Math.max(0.0, (Math.log10(Math.max(ratioPct, 0.1) + 1.0) / Math.log10(1501.0)) * 30.0));
    return Math.round((cForest + cDens + cRatio) * 10) / 10;
  }

  function recalculateModel() {
    const scen = state.scenario;
    const results = RAW.municipalities.map((m) => {
      const copy = { ...m };
      let deer = null;
      let activeGrade = m.evidence_grade;

      if (m.evidence_grade === "D") {
        deer = null;
      } else if (scen === "strict" && m.evidence_grade === "C") {
        // Strict mode hides Grade C estimates and treats them as undetermined
        deer = null;
        activeGrade = "D";
      } else if (scen === "std" || scen === "strict") {
        deer = m.deer_std;
      } else if (scen === "low") {
        deer = m.deer_low;
      } else if (scen === "high") {
        deer = m.deer_high;
      } else if (scen === "custom") {
        if (m.jis_code === "29201") {
          // Nara City: keep Nara Park 1,687 measured + scale D-zone (2,852) proportional to East slider
          const dScale = state.sliders.east / DEFAULT_SLIDERS.east;
          deer = Math.round(1687 + 2852 * dScale);
        } else {
          let base = state.sliders.nw;
          if (m.region_block === "東部") base = state.sliders.east;
          else if (m.region_block === "南部") base = state.sliders.south;
          deer = Math.round(m.forest_area_km2 * base * m.model_factor);
        }
      }

      if (deer == null) {
        copy.active_deer = null;
        copy.active_ratio_pct = null;
        copy.active_density_admin = null;
        copy.active_density_forest = null;
        copy.active_dom_code = "UNDETERMINED";
        copy.active_depi = null;
        copy.active_grade = activeGrade;
      } else {
        const ratio = Math.round((deer / m.human_pop) * 10000) / 100;
        const dAdmin = Math.round((deer / m.area_km2) * 100) / 100;
        const dForest = m.forest_area_km2 > 0 ? Math.round((deer / m.forest_area_km2) * 100) / 100 : null;
        copy.active_deer = deer;
        copy.active_ratio_pct = ratio;
        copy.active_density_admin = dAdmin;
        copy.active_density_forest = dForest;
        copy.active_dom_code = classifyDominance(ratio);
        copy.active_depi = computeDepi(m.forest_ratio_pct, dAdmin, ratio);
        copy.active_grade = activeGrade;
      }
      return copy;
    });

    state.computed = results;
    state.computedByCode = Object.fromEntries(results.map((r) => [r.jis_code, r]));
  }

  function updateKPIsAndBars() {
    const list = state.computed;
    const totalHuman = list.reduce((acc, r) => acc + r.human_pop, 0);
    const estList = list.filter((r) => r.active_deer != null);
    const totalDeer = estList.reduce((acc, r) => acc + r.active_deer, 0);
    const totalArea = list.reduce((acc, r) => acc + r.area_km2, 0);

    const tierAreas = { EMPIRE: 0, DEER_DOMINANT: 0, CONTESTED: 0, HUMAN_DOMINANT: 0, UNDETERMINED: 0 };
    const tierCounts = { EMPIRE: 0, DEER_DOMINANT: 0, CONTESTED: 0, HUMAN_DOMINANT: 0, UNDETERMINED: 0 };
    for (const r of list) {
      tierAreas[r.active_dom_code] += r.area_km2;
      tierCounts[r.active_dom_code] += 1;
    }

    const prefRatio = totalDeer > 0 ? (totalDeer / totalHuman) * 100 : 0;
    const empireAreaPct = (tierAreas.EMPIRE / totalArea) * 100;
    const wildDeer = Math.max(0, totalDeer - 1687);

    // Header Balance Bars
    const humanPct = (totalHuman / (totalHuman + totalDeer)) * 100;
    const deerPct = 100 - humanPct;
    document.getElementById("balPopSummary").textContent = `人間 ${fmtInt(totalHuman)}人 vs 鹿推定 ${fmtInt(totalDeer)}頭`;
    document.getElementById("balRatioBadge").textContent = `人間 ${humanPct.toFixed(1)}% / 鹿 ${deerPct.toFixed(1)}%`;
    document.getElementById("barHumanShare").style.width = `${humanPct}%`;
    document.getElementById("barDeerShare").style.width = `${deerPct}%`;

    document.getElementById("balAreaSummary").textContent =
      state.scenario === "strict"
        ? `厳格証拠モード：区分A/Bの奈良市のみ表示（区分Cの31市町村は推計除外）`
        : `👑 鹿帝国領 ${tierCounts.EMPIRE}市町村が県面積の ${empireAreaPct.toFixed(1)}% を占拠`;
    document.getElementById("balEmpireAreaBadge").textContent = `鹿帝国領 ${empireAreaPct.toFixed(1)}%`;
    document.getElementById("barAreaEmpire").style.width = `${(tierAreas.EMPIRE / totalArea) * 100}%`;
    document.getElementById("barAreaDeerDom").style.width = `${(tierAreas.DEER_DOMINANT / totalArea) * 100}%`;
    document.getElementById("barAreaContested").style.width = `${(tierAreas.CONTESTED / totalArea) * 100}%`;
    document.getElementById("barAreaHumanDom").style.width = `${(tierAreas.HUMAN_DOMINANT / totalArea) * 100}%`;
    document.getElementById("barAreaUndet").style.width = `${(tierAreas.UNDETERMINED / totalArea) * 100}%`;

    // KPI Cards
    document.getElementById("kpiDeerTotal").innerHTML = `${fmtInt(totalDeer)}<span class="kpi-unit">頭</span>`;
    document.getElementById("kpiDeerSub").textContent =
      state.scenario === "strict"
        ? `奈良市のみ算出（公園実測1,687＋D管理区等）`
        : `公園実測 1,687頭 + 野生推定 ${fmtInt(wildDeer)}頭（目標 58,000頭）`;
    document.getElementById("kpiDeerGrade").textContent = state.scenario === "strict" ? "区分A+Bのみ" : "区分A+B+C";

    document.getElementById("kpiPrefRatio").innerHTML = `${prefRatio.toFixed(2)}<span class="kpi-unit">%</span>`;
    const humansPerDeer = totalDeer > 0 ? Math.round(totalHuman / totalDeer) : "—";
    document.getElementById("kpiPrefRatioSub").textContent =
      state.scenario === "strict" ? `県全域の鹿総数は推計対象外` : `レンジ 3.63%〜6.43%（人間約${humansPerDeer}人に1頭）`;

    document.getElementById("kpiEmpireCount").innerHTML = `${tierCounts.EMPIRE}<span class="kpi-unit"> / 39</span>`;
    document.getElementById("kpiEmpireSub").textContent = `県土面積の ${empireAreaPct.toFixed(1)}%（${fmtDec(tierAreas.EMPIRE, 1)} km²）を支配※`;

    const strongest = estList.length ? estList.reduce((a, b) => (a.active_ratio_pct > b.active_ratio_pct ? a : b)) : null;
    if (strongest) {
      document.getElementById("kpiStrongestName").textContent = strongest.name_ja;
      document.getElementById("kpiStrongestSub").textContent =
        `鹿人比率 ${fmtDec(strongest.active_ratio_pct, 1)}%（人間${fmtInt(strongest.human_pop)} vs 鹿${fmtInt(strongest.active_deer)}）`;
    }

    document.getElementById("kpiEstimatedCount").innerHTML = `${estList.length}<span class="kpi-unit"> / 39</span>`;
    document.getElementById("kpiEstimatedSub").textContent =
      state.scenario === "strict"
        ? `厳格モード：区分B:1 / 未表示(C+D):38`
        : `区分B:1 / C:31 / 定住森林なし未判定D:7`;

    const scenNames = {
      std: "標準モデル",
      low: "保守的モデル（下限）",
      high: "高密度モデル（上限）",
      strict: "厳格証拠モード（A/Bのみ）",
      custom: "カスタムWhat-Ifシミュレーション",
    };
    document.getElementById("activeLayerLabel").textContent = `${LAYER_TITLES[state.layer]} — ${scenNames[state.scenario]}`;
  }

  // Color scales
  function getRampColor(val, stops) {
    for (const [threshold, color] of stops) {
      if (val >= threshold) return color;
    }
    return stops[stops.length - 1][1];
  }

  function injectSvgHatchPattern() {
    const svg = document.querySelector("#map svg");
    if (!svg || svg.querySelector("#hatch-undet")) return;
    const ns = "http://www.w3.org/2000/svg";
    let defs = svg.querySelector("defs");
    if (!defs) {
      defs = document.createElementNS(ns, "defs");
      svg.insertBefore(defs, svg.firstChild);
    }
    const pat = document.createElementNS(ns, "pattern");
    pat.setAttribute("id", "hatch-undet");
    pat.setAttribute("patternUnits", "userSpaceOnUse");
    pat.setAttribute("width", "8");
    pat.setAttribute("height", "8");
    pat.setAttribute("patternTransform", "rotate(45)");

    const bg = document.createElementNS(ns, "rect");
    bg.setAttribute("width", "8");
    bg.setAttribute("height", "8");
    bg.setAttribute("fill", "#2a3444");
    pat.appendChild(bg);

    const line = document.createElementNS(ns, "line");
    line.setAttribute("x1", "0");
    line.setAttribute("y1", "0");
    line.setAttribute("x2", "0");
    line.setAttribute("y2", "8");
    line.setAttribute("stroke", "#64748b");
    line.setAttribute("stroke-width", "2.4");
    pat.appendChild(line);

    defs.appendChild(pat);
  }

  function getFeatureStyle(feature) {
    const code = feature.properties.jis_code;
    const m = state.computedByCode[code];
    const isSelected = state.selectedCode === code;
    const isSensitive = state.showSensitive && m.tier_shift_sensitive;

    let fillColor = "#334155";
    let fillOpacity = 0.78;
    let isUndet = false;

    if (state.layer === "human") {
      fillColor = getRampColor(m.human_pop, [
        [200000, "#1d4ed8"],
        [75000, "#2563eb"],
        [30000, "#3b82f6"],
        [10000, "#60a5fa"],
        [3000, "#1e3a8a"],
        [0, "#0f172a"],
      ]);
    } else if (state.layer === "evidence") {
      fillColor = GRADE_META[m.active_grade].color;
    } else if (m.active_dom_code === "UNDETERMINED") {
      isUndet = true;
      fillColor = "url(#hatch-undet)";
      fillOpacity = 0.85;
    } else if (state.layer === "dominance") {
      fillColor = TIER_META[m.active_dom_code].color;
    } else if (state.layer === "ratio") {
      fillColor = getRampColor(m.active_ratio_pct, [
        [500, "#f59e0b"],
        [100, "#fbbf24"],
        [50, "#10b981"],
        [10, "#a855f7"],
        [2, "#3b82f6"],
        [0, "#1e3a8a"],
      ]);
    } else if (state.layer === "deer") {
      fillColor = getRampColor(m.active_deer, [
        [8000, "#d97706"],
        [4000, "#f59e0b"],
        [2000, "#10b981"],
        [800, "#14b8a6"],
        [200, "#3b82f6"],
        [0, "#1e293b"],
      ]);
    } else if (state.layer === "density") {
      const d = state.densityBasis === "forest" ? m.active_density_forest : m.active_density_admin;
      fillColor = getRampColor(d || 0, [
        [25, "#dc2626"],
        [18, "#f59e0b"],
        [12, "#10b981"],
        [6, "#06b6d4"],
        [2, "#3b82f6"],
        [0, "#1e293b"],
      ]);
    } else if (state.layer === "depi") {
      fillColor = getRampColor(m.active_depi || 0, [
        [80, "#f59e0b"],
        [65, "#fbbf24"],
        [45, "#10b981"],
        [25, "#a855f7"],
        [0, "#3b82f6"],
      ]);
    }

    return {
      fillColor: isUndet ? "#334155" : fillColor,
      fillOpacity,
      color: isSelected ? "#ffffff" : isSensitive ? "#f43f5e" : "#0b1220",
      weight: isSelected ? 3.2 : isSensitive ? 2.5 : 1.3,
      dashArray: isSensitive ? "5,4" : isUndet ? "3,3" : null,
      className: isUndet ? "poly-undet" : "",
    };
  }

  function applyHatchToSvgPolygons() {
    injectSvgHatchPattern();
    document.querySelectorAll("#map path.poly-undet").forEach((el) => {
      el.setAttribute("fill", "url(#hatch-undet)");
    });
  }

  function renderLegend() {
    const el = document.getElementById("mapLegend");
    let html = "";
    if (state.layer === "dominance") {
      html = `
        <div class="legend-title">👑 勢力支配分類（鹿人比率）</div>
        <div class="legend-row"><span class="legend-swatch" style="background:#f59e0b"></span><span>👑 鹿帝国領（≧100%）</span></div>
        <div class="legend-row"><span class="legend-swatch" style="background:#10b981"></span><span>🦌 鹿優勢地域（50〜100%）</span></div>
        <div class="legend-row"><span class="legend-swatch" style="background:#a855f7"></span><span>⚔️ 勢力均衡（10〜50%）</span></div>
        <div class="legend-row"><span class="legend-swatch" style="background:#3b82f6"></span><span>🏙️ 人間優勢（&lt;10%）</span></div>
        <div class="legend-row"><span class="legend-swatch hatched"></span><span>❓ 未判定（区分D：森林なし等）</span></div>
      `;
    } else if (state.layer === "ratio") {
      html = `
        <div class="legend-title">⚔️ 鹿人比率（鹿÷人間 %）</div>
        <div class="legend-row"><span class="legend-swatch" style="background:#f59e0b"></span><span>500%〜（超鹿帝国）</span></div>
        <div class="legend-row"><span class="legend-swatch" style="background:#fbbf24"></span><span>100〜500%（鹿帝国領）</span></div>
        <div class="legend-row"><span class="legend-swatch" style="background:#10b981"></span><span>50〜100%</span></div>
        <div class="legend-row"><span class="legend-swatch" style="background:#a855f7"></span><span>10〜50%</span></div>
        <div class="legend-row"><span class="legend-swatch" style="background:#3b82f6"></span><span>&lt;10%（人間優勢）</span></div>
        <div class="legend-row"><span class="legend-swatch hatched"></span><span>未判定（算出除外）</span></div>
      `;
    } else if (state.layer === "deer") {
      html = `
        <div class="legend-title">🦌 鹿の推定生息数（頭）</div>
        <div class="legend-row"><span class="legend-swatch" style="background:#d97706"></span><span>8,000頭以上</span></div>
        <div class="legend-row"><span class="legend-swatch" style="background:#f59e0b"></span><span>4,000〜8,000頭</span></div>
        <div class="legend-row"><span class="legend-swatch" style="background:#10b981"></span><span>2,000〜4,000頭</span></div>
        <div class="legend-row"><span class="legend-swatch" style="background:#14b8a6"></span><span>800〜2,000頭</span></div>
        <div class="legend-row"><span class="legend-swatch" style="background:#3b82f6"></span><span>200〜800頭</span></div>
        <div class="legend-row"><span class="legend-swatch hatched"></span><span>未判定（区分D）</span></div>
      `;
    } else if (state.layer === "human") {
      html = `
        <div class="legend-title">👥 人間人口（2026-10-01）</div>
        <div class="legend-row"><span class="legend-swatch" style="background:#1d4ed8"></span><span>200,000人以上（奈良市）</span></div>
        <div class="legend-row"><span class="legend-swatch" style="background:#2563eb"></span><span>75,000〜200,000人</span></div>
        <div class="legend-row"><span class="legend-swatch" style="background:#3b82f6"></span><span>30,000〜75,000人</span></div>
        <div class="legend-row"><span class="legend-swatch" style="background:#60a5fa"></span><span>10,000〜30,000人</span></div>
        <div class="legend-row"><span class="legend-swatch" style="background:#1e3a8a"></span><span>3,000〜10,000人</span></div>
        <div class="legend-row"><span class="legend-swatch" style="background:#0f172a"></span><span>3,000人未満</span></div>
      `;
    } else if (state.layer === "density") {
      const basisLbl = state.densityBasis === "forest" ? "森林面積あたり" : "行政面積あたり";
      html = `
        <div class="legend-title">🌲 鹿密度（${basisLbl} 頭/km²）</div>
        <div class="legend-row"><span class="legend-swatch" style="background:#dc2626"></span><span>25頭/km²以上</span></div>
        <div class="legend-row"><span class="legend-swatch" style="background:#f59e0b"></span><span>18〜25頭/km²</span></div>
        <div class="legend-row"><span class="legend-swatch" style="background:#10b981"></span><span>12〜18頭/km²</span></div>
        <div class="legend-row"><span class="legend-swatch" style="background:#06b6d4"></span><span>6〜12頭/km²</span></div>
        <div class="legend-row"><span class="legend-swatch" style="background:#3b82f6"></span><span>&lt;6頭/km²</span></div>
        <div class="legend-row"><span class="legend-swatch hatched"></span><span>未判定（区分D）</span></div>
      `;
    } else if (state.layer === "depi") {
      html = `
        <div class="legend-title">⚡ 鹿帝国勢力指数 DEPI（帝国pt）</div>
        <div class="legend-row"><span class="legend-swatch" style="background:#f59e0b"></span><span>80〜100 pt（帝国中核）</span></div>
        <div class="legend-row"><span class="legend-swatch" style="background:#fbbf24"></span><span>65〜80 pt（高勢力帯）</span></div>
        <div class="legend-row"><span class="legend-swatch" style="background:#10b981"></span><span>45〜65 pt（中勢力帯）</span></div>
        <div class="legend-row"><span class="legend-swatch" style="background:#a855f7"></span><span>25〜45 pt（混在帯）</span></div>
        <div class="legend-row"><span class="legend-swatch" style="background:#3b82f6"></span><span>&lt;25 pt（人間優位）</span></div>
        <div class="legend-note">※森林率・鹿密度・対人口圧の独自複合指数（%と別指標）</div>
      `;
    } else if (state.layer === "evidence") {
      html = `
        <div class="legend-title">🛡️ プロジェクト証拠区分</div>
        <div class="legend-row"><span class="legend-swatch" style="background:#3b82f6"></span><span>区分B：公的資料統合推定（奈良市※公園A含）</span></div>
        <div class="legend-row"><span class="legend-swatch" style="background:#f59e0b"></span><span>区分C：森林・地域ブロック空間推定（31市町村）</span></div>
        <div class="legend-row"><span class="legend-swatch" style="background:#64748b"></span><span>区分D：データ不足/定住森林なし（7市町）</span></div>
      `;
    }

    if (state.showMesh) {
      html += `<div class="legend-note">▦ 破線枠＝5km投影メッシュ（171区画）。点線は境界敏感自治体。</div>`;
    } else {
      html += `<div class="legend-note">基準：人口2026-10 / 森林2020-02 / 鹿2022–2026</div>`;
    }
    el.innerHTML = html;
  }

  function initMap() {
    if (typeof L === "undefined") {
      document.getElementById("map").innerHTML =
        "<div style='padding:30px;color:var(--accent-text)'>Leafletの読み込みに失敗しました。ネットワーク接続を確認してください。</div>";
      return;
    }

    map = L.map("map", {
      zoomControl: true,
      preferCanvas: false,
      minZoom: 8,
      maxZoom: 14,
    }).setView([34.32, 135.86], 9);

    L.tileLayer("https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png", {
      attribution: "<a href='https://maps.gsi.go.jp/development/ichiran.html' target='_blank' rel='noopener'>国土地理院</a> | 境界: 国土数値情報(N03)",
      minZoom: 5,
      maxZoom: 18,
    }).addTo(map);

    geoLayer = L.geoJSON(RAW.geojson, {
      style: getFeatureStyle,
      onEachFeature: (feature, layer) => {
        layer.on({
          mouseover: (e) => {
            const target = e.target;
            target.setStyle({ weight: 2.8, color: "#fde68a" });
            if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) target.bringToFront();
            updateTooltip(feature.properties.jis_code, target);
          },
          mouseout: (e) => {
            geoLayer.resetStyle(e.target);
            applyHatchToSvgPolygons();
          },
          click: () => {
            selectMunicipality(feature.properties.jis_code);
          },
        });
      },
    }).addTo(map);

    map.fitBounds(geoLayer.getBounds(), { padding: [18, 18] });

    // Build 5km projected mesh overlay
    meshLayer = L.geoJSON(RAW.mesh, {
      style: (feat) => {
        const d = feat.properties.projected_density_km2;
        const isPark = feat.properties.is_nara_park;
        const color = isPark
          ? "#ef4444"
          : d == null
          ? "#64748b"
          : d >= 22
          ? "#f59e0b"
          : d >= 15
          ? "#fbbf24"
          : d >= 7
          ? "#10b981"
          : d > 0
          ? "#38bdf8"
          : "#475569";
        return {
          color,
          weight: isPark ? 2.2 : 0.9,
          opacity: 0.75,
          dashArray: d == null ? "3,3" : null,
          fillColor: color,
          fillOpacity: d != null && d > 0 ? 0.22 : 0.06,
        };
      },
      onEachFeature: (feat, layer) => {
        const p = feat.properties;
        const cov = (p.covered_municipalities || [p.primary_municipality]).join("・");
        const dTxt = p.projected_density_km2 == null ? "未判定（算出対象外）" : `${p.projected_density_km2} 頭/km²`;
        layer.bindTooltip(
          `<strong>${p.mesh_id}</strong>（${cov}）<br>` +
            `区分: ${p.density_tier}<br>投影密度: ${dTxt}`,
          { className: "muni-tooltip", sticky: true }
        );
      },
    });

    // Special zones (Nara Park & Odaigahara)
    zoneLayer = L.layerGroup();
    const parkMarker = L.circleMarker([34.6851, 135.8430], {
      radius: 9,
      color: "#fde68a",
      weight: 2.5,
      fillColor: "#ef4444",
      fillOpacity: 0.9,
    }).bindPopup(
      `<strong>⛩️ 奈良公園 A/B保護地区（天然記念物 奈良のシカ）</strong><br>` +
        `2026年7月実測：<strong>1,687頭</strong>（過去最多・証拠区分A）<br>` +
        `<small>オス411 / メス990 / 子鹿286（奈良の鹿愛護会調査）<br>※奈良市D管理地区(2,852頭)とは分離合算済</small>`
    );
    const odaiMarker = L.circleMarker([34.184, 136.108], {
      radius: 8,
      color: "#34d399",
      weight: 2,
      fillColor: "#059669",
      fillOpacity: 0.9,
    }).bindPopup(
      `<strong>⛰️ 大台ヶ原 特別管理域（環境省計画）</strong><br>` +
        `H13ピーク 35.8頭/km² → 管理下 <strong>5.6〜10頭/km²</strong>（目標5頭/km²以下）`
    );
    parkMarker.addTo(zoneLayer);
    odaiMarker.addTo(zoneLayer);
    zoneLayer.addTo(map);

    // Municipality labels layer (zoom-aware decluttering)
    labelLayer = L.layerGroup();
    const SPARSE_CORE_CODES = new Set([
      "29201", "29204", "29205", "29206", "29207", "29209", "29212",
      "29322", "29385", "29386", "29441", "29446", "29447", "29449",
      "29450", "29451", "29452", "29453",
    ]);
    const MOBILE_CORE_CODES = new Set([
      "29201", "29205", "29207", "29212", "29447", "29449", "29451", "29452", "29453",
    ]);
    function rebuildLabels() {
      labelLayer.clearLayers();
      const z = map.getZoom();
      const isNarrow = window.innerWidth <= 768;
      RAW.municipalities.forEach((m) => {
        const showAll = z >= 11;
        const showMid = z >= 10 && !isNarrow && m.area_km2 >= 22;
        const showCore = isNarrow ? (z >= 10 ? SPARSE_CORE_CODES.has(m.jis_code) : MOBILE_CORE_CODES.has(m.jis_code)) : SPARSE_CORE_CODES.has(m.jis_code);
        if (!showAll && !showMid && !showCore) return;
        L.marker([m.centroid_lat, m.centroid_lon], {
          interactive: false,
          icon: L.divIcon({
            className: "map-muni-label",
            html: `<span data-label-code="${m.jis_code}">${m.name_ja}</span>`,
            iconSize: [70, 16],
            iconAnchor: [35, 8],
          }),
        }).addTo(labelLayer);
      });
    }
    rebuildLabels();
    labelLayer.addTo(map);
    map.on("zoomend", rebuildLabels);

    applyHatchToSvgPolygons();
  }

  function updateTooltip(code, layer) {
    const m = state.computedByCode[code];
    const t = TIER_META[m.active_dom_code];
    const deerTxt = m.active_deer == null ? "未判定（データ不足）" : `${fmtInt(m.active_deer)} 頭`;
    const ratioTxt = m.active_ratio_pct == null ? "算出除外（区分D）" : `${fmtDec(m.active_ratio_pct, 1)}%`;
    const html = `
      <div style="min-width:190px">
        <div style="font-weight:800;font-size:13px;margin-bottom:3px">${m.name_ja} <span style="color:var(--text-muted);font-weight:500">(${m.active_grade})</span></div>
        <div style="color:${t.color};font-weight:700;margin-bottom:5px">${t.label}</div>
        <div>👥 人間人口: <strong class="mono">${fmtInt(m.human_pop)} 人</strong></div>
        <div>🦌 鹿推定数: <strong class="mono">${deerTxt}</strong></div>
        <div>⚔️ 鹿人比率: <strong class="mono">${ratioTxt}</strong></div>
        <div>🌲 森林率: <strong class="mono">${m.forest_ratio_pct}%</strong></div>
      </div>
    `;
    layer.bindTooltip(html, { className: "muni-tooltip", sticky: true }).openTooltip();
  }

  function refreshMap() {
    if (!geoLayer) return;
    geoLayer.setStyle(getFeatureStyle);
    applyHatchToSvgPolygons();

    if (state.showMesh) {
      if (!map.hasLayer(meshLayer)) meshLayer.addTo(map);
    } else {
      if (map.hasLayer(meshLayer)) map.removeLayer(meshLayer);
    }

    if (state.showZones) {
      if (!map.hasLayer(zoneLayer)) zoneLayer.addTo(map);
    } else {
      if (map.hasLayer(zoneLayer)) map.removeLayer(zoneLayer);
    }

    if (state.showLabels) {
      if (!map.hasLayer(labelLayer)) labelLayer.addTo(map);
    } else {
      if (map.hasLayer(labelLayer)) map.removeLayer(labelLayer);
    }
    renderLegend();
  }

  function selectMunicipality(code) {
    state.selectedCode = code;
    document.getElementById("quickSelect").value = code || "";
    refreshMap();
    renderInspector();
    renderTable();
  }

  function renderInspector() {
    const body = document.getElementById("inspectorBody");
    const titleEl = document.getElementById("inspTitle");
    const codeEl = document.getElementById("inspCode");

    if (!state.selectedCode) {
      titleEl.textContent = "📜 帝国情勢ブリーフィング";
      codeEl.textContent = "NARA-ALL";

      const empires = state.computed
        .filter((r) => r.active_dom_code === "EMPIRE")
        .sort((a, b) => b.active_ratio_pct - a.active_ratio_pct);
      const sensitives = state.computed.filter((r) => r.tier_shift_sensitive);

      body.innerHTML = `
        <div class="insp-banner tier-EMPIRE">
          <div class="insp-tier-line">
            <span class="tier-badge">👑 調査総括サマリー</span>
            <span class="grade-chip grade-bc">39市町村統合済</span>
          </div>
          <p style="font-size:12px;color:var(--text-soft);line-height:1.55">
            人口では<strong>人間が約20倍（95.3%）</strong>と圧倒する一方、面積では<strong>鹿帝国領10村（標準モデル）が県土の53.8%</strong>を占めます。地図の市町村をクリックすると計算式と証拠区分を検証できます。
          </p>
        </div>

        <div>
          <div class="ctrl-title" style="margin-bottom:6px">🏆 鹿帝国領 勢力ランキング（クリックで表示）</div>
          <div class="rank-list">
            ${
              empires.length === 0
                ? `<div class="info-card"><p>厳格証拠モードでは区分C推計が非表示のため、鹿帝国領と判定される自治体はありません。</p></div>`
                : empires
                    .slice(0, 6)
                    .map(
                      (e, idx) => `
                  <div class="rank-item" data-jump="${e.jis_code}">
                    <span><strong>#${idx + 1} ${e.name_ja}</strong> <small style="color:var(--text-muted)">(${fmtInt(e.human_pop)}人)</small></span>
                    <span class="mono" style="color:var(--accent-text);font-weight:700">${fmtDec(e.active_ratio_pct, 1)}%</span>
                  </div>`
                    )
                    .join("")
            }
          </div>
        </div>

        <div class="info-card">
          <h4>⚠️ Red Team：境界敏感自治体（${sensitives.length}町村）</h4>
          <p>保守〜高密度モデルの間で分類が変動するのは39市町村中わずか3町村のみです（他36市町村は階級不変）。</p>
          <div class="rank-list" style="margin-top:7px">
            ${sensitives
              .map(
                (s) => `
              <div class="rank-item" data-jump="${s.jis_code}">
                <span>${s.name_ja} <small style="color:var(--text-muted)">(${s.deer_human_ratio_low_pct}%〜${s.deer_human_ratio_high_pct}%)</small></span>
                <span style="color:#f43f5e;font-size:11px;font-weight:700">${TIER_META[s.active_dom_code].short}</span>
              </div>`
              )
              .join("")}
          </div>
        </div>

        <div class="info-card">
          <h4>⛩️ 奈良市クリック推奨：二重構造の検証</h4>
          <p>奈良公園の「神鹿（1,687頭・実測A）」と東部D管理地区の「野生鹿（2,852頭・推定B）」を重複なく合算した全国唯一のハイブリッド推計を確認できます。</p>
          <button class="chip-btn" style="margin-top:8px;width:100%" data-jump="29201">奈良市（29201）の詳細を開く →</button>
        </div>
      `;

      body.querySelectorAll("[data-jump]").forEach((el) => {
        el.addEventListener("click", () => selectMunicipality(el.getAttribute("data-jump")));
      });
      return;
    }

    const m = state.computedByCode[state.selectedCode];
    const t = TIER_META[m.active_dom_code];
    const g = GRADE_META[m.active_grade];
    titleEl.textContent = `${m.name_ja}（${m.district_or_area}）`;
    codeEl.textContent = m.jis_code;

    const perHumanText =
      m.active_ratio_pct == null
        ? "未判定"
        : m.active_ratio_pct >= 100
        ? `人間1人あたり 鹿 ${(m.active_ratio_pct / 100).toFixed(2)}頭`
        : `鹿1頭あたり 人間 ${Math.round(100 / Math.max(m.active_ratio_pct, 0.01))}人`;

    const naraBreakdown =
      m.jis_code === "29201"
        ? `
        <div class="info-card" style="border-color:rgba(59,130,246,0.45)">
          <h4>⛩️ 奈良市 二重計上防止の内訳（区分B統合）</h4>
          <p>県全体の野生鹿と重複しないよう、奈良市管理計画のA/B保護地区とD管理地区を分離合算しています（C緩衝地区の未根拠仮定値は排除）。</p>
          <div class="stat-grid-2" style="margin-top:7px">
            <div class="stat-box"><label>A/B保護地区(愛護会2026)</label><div class="sv" style="color:var(--green-text)">1,687頭</div><small>オス411 / メス990 / 子286</small></div>
            <div class="stat-box"><label>D管理地区(184km²×15.5)</label><div class="sv" style="color:var(--blue-text)">${fmtInt(m.active_deer - 1687)}頭</div><small>R3:11.7 / R5:15.5 / H30:22.8</small></div>
          </div>
        </div>`
        : "";

    body.innerHTML = `
      <div class="insp-banner tier-${m.active_dom_code}">
        <div class="insp-tier-line">
          <span class="tier-badge" style="color:${t.color}">${t.label}</span>
          <span class="grade-chip" style="background:${g.color}25;color:${g.color};border:1px solid ${g.color}60">${g.label}</span>
        </div>
        <div style="font-size:11.5px;color:var(--text-soft)">${g.desc}</div>
        <button id="btnClearSelect" class="mini-link" style="margin-top:6px">← 県全体ブリーフィングへ戻る</button>
      </div>

      <div class="stat-grid-2">
        <div class="stat-box">
          <label>👥 人間人口 (2026-10)</label>
          <div class="sv">${fmtInt(m.human_pop)}</div>
          <small>2020比 ${m.pop_change_pct_2020_2026 > 0 ? "+" : ""}${m.pop_change_pct_2020_2026}%</small>
        </div>
        <div class="stat-box">
          <label>🦌 鹿の推定生息数</label>
          <div class="sv" style="color:${t.color}">${m.active_deer == null ? "未判定" : fmtInt(m.active_deer) + "頭"}</div>
          <small>${m.deer_low == null ? "区分D 算出対象外" : `レンジ ${fmtInt(m.deer_low)}〜${fmtInt(m.deer_high)}頭`}</small>
        </div>
        <div class="stat-box">
          <label>⚔️ 鹿人比率</label>
          <div class="sv" style="color:${t.color}">${m.active_ratio_pct == null ? "—" : fmtDec(m.active_ratio_pct, 1) + "%"}</div>
          <small>${perHumanText}</small>
        </div>
        <div class="stat-box">
          <label>⚡ DEPI 勢力指数</label>
          <div class="sv">${m.active_depi == null ? "—" : fmtDec(m.active_depi, 1) + " pt"}</div>
          <small>森林率 ${m.forest_ratio_pct}% (${fmtDec(m.forest_area_km2, 2)} km²)</small>
        </div>
        <div class="stat-box">
          <label>🗺️ 鹿密度（行政面積）</label>
          <div class="sv">${m.active_density_admin == null ? "—" : fmtDec(m.active_density_admin, 1)}</div>
          <small>頭/km²（面積 ${fmtDec(m.area_km2, 2)} km²）</small>
        </div>
        <div class="stat-box">
          <label>🌲 鹿密度（森林面積）</label>
          <div class="sv">${m.active_density_forest == null ? "—" : fmtDec(m.active_density_forest, 1)}</div>
          <small>頭/km²（人密度 ${fmtInt(m.human_density_km2)}/km²）</small>
        </div>
      </div>

      ${naraBreakdown}

      <div class="info-card">
        <h4>📐 推定式・算出根拠</h4>
        <div class="formula-box">${m.method_formula}</div>
      </div>

      <div class="info-card">
        <h4>🌿 生息環境・被害・捕獲メモ</h4>
        <p style="margin-bottom:5px">${m.habitat_note}</p>
        <p>${m.damage_capture_note}</p>
      </div>
    `;

    document.getElementById("btnClearSelect").addEventListener("click", () => selectMunicipality(null));
  }

  // Charts
  function initCharts() {
    if (typeof Chart === "undefined") return;
    const cs = getComputedStyle(document.documentElement);
    Chart.defaults.color = cs.getPropertyValue("--chart-text").trim() || "#94a3b8";
    Chart.defaults.borderColor = cs.getPropertyValue("--chart-grid").trim() || "rgba(148,163,184,0.12)";
    Chart.defaults.font.family = "'Inter', 'Noto Sans JP', sans-serif";

    const valid = RAW.municipalities.filter((m) => m.evidence_grade !== "D");

    // 1. Forest Ratio vs Deer-Human Ratio
    chartInstances.forest = new Chart(document.getElementById("chartForestRatio"), {
      type: "scatter",
      data: {
        datasets: ["EMPIRE", "DEER_DOMINANT", "CONTESTED", "HUMAN_DOMINANT"].map((tier) => ({
          label: TIER_META[tier].short,
          backgroundColor: TIER_META[tier].color + "cc",
          borderColor: TIER_META[tier].color,
          pointRadius: 6,
          pointHoverRadius: 8,
          data: valid
            .filter((m) => m.dominance_code === tier)
            .map((m) => ({ x: m.forest_ratio_pct, y: m.deer_human_ratio_pct, name: m.name_ja })),
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { title: { display: true, text: "森林率（%）" }, min: 0, max: 100 },
          y: {
            type: "logarithmic",
            title: { display: true, text: "鹿人比率（%・対数軸）" },
            min: 0.5,
            max: 2000,
          },
        },
        plugins: {
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.raw.name}: 森林率 ${ctx.raw.x}% / 鹿人比率 ${ctx.raw.y}%`,
            },
          },
        },
      },
    });

    // 2. Pop Change vs Ratio
    chartInstances.decline = new Chart(document.getElementById("chartPopDecline"), {
      type: "scatter",
      data: {
        datasets: ["EMPIRE", "DEER_DOMINANT", "CONTESTED", "HUMAN_DOMINANT"].map((tier) => ({
          label: TIER_META[tier].short,
          backgroundColor: TIER_META[tier].color + "cc",
          borderColor: TIER_META[tier].color,
          pointRadius: 6,
          data: valid
            .filter((m) => m.dominance_code === tier)
            .map((m) => ({ x: m.pop_change_pct_2020_2026, y: m.deer_human_ratio_pct, name: m.name_ja })),
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { title: { display: true, text: "人口増減率 2020→2026（%）" } },
          y: { type: "logarithmic", title: { display: true, text: "鹿人比率（%・対数軸）" }, min: 0.5, max: 2000 },
        },
        plugins: {
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.raw.name}: 人口増減 ${ctx.raw.x}% / 鹿人比率 ${ctx.raw.y}%`,
            },
          },
        },
      },
    });

    // 3. Timeseries: Nara Park Deer vs Nara Human Pop
    const parkTs = RAW.kpis.parameters.nara_park_aigokai.timeseries.filter((d) => d.year >= 1975);
    const humTs = RAW.kpis.parameters.human_population_timeseries_nara;
    const years = Array.from(new Set([...parkTs.map((d) => d.year), ...humTs.map((d) => d.year)])).sort((a, b) => a - b);
    const parkMap = Object.fromEntries(parkTs.map((d) => [d.year, d.total]));
    const humMap = Object.fromEntries(humTs.map((d) => [d.year, Math.round(d.population / 10000 * 10) / 10]));

    chartInstances.ts = new Chart(document.getElementById("chartTimeseries"), {
      type: "line",
      data: {
        labels: years.map(String),
        datasets: [
          {
            label: "奈良公園の鹿（実測・頭）",
            data: years.map((y) => parkMap[y] ?? null),
            borderColor: "#f59e0b",
            backgroundColor: "rgba(245,158,11,0.18)",
            yAxisID: "yDeer",
            spanGaps: true,
            tension: 0.28,
            pointRadius: 4,
          },
          {
            label: "奈良県 総人口（万人）",
            data: years.map((y) => humMap[y] ?? null),
            borderColor: "#3b82f6",
            backgroundColor: "rgba(59,130,246,0.12)",
            yAxisID: "yHuman",
            spanGaps: true,
            tension: 0.25,
            pointRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          yDeer: { type: "linear", position: "left", title: { display: true, text: "奈良公園 鹿（頭）" } },
          yHuman: { type: "linear", position: "right", title: { display: true, text: "奈良県 人口（万人）" }, grid: { drawOnChartArea: false } },
        },
      },
    });

    // 4. Top 12 Deer Populations
    const top12 = [...valid].sort((a, b) => b.deer_std - a.deer_std).slice(0, 12);
    chartInstances.top = new Chart(document.getElementById("chartTopDeer"), {
      type: "bar",
      data: {
        labels: top12.map((m) => m.name_ja),
        datasets: [
          {
            label: "保守的（下限）",
            data: top12.map((m) => m.deer_low),
            backgroundColor: "rgba(56, 189, 248, 0.55)",
          },
          {
            label: "標準モデル",
            data: top12.map((m) => m.deer_std),
            backgroundColor: top12.map((m) => m.dominance_color),
          },
          {
            label: "高密度（上限）",
            data: top12.map((m) => m.deer_high),
            backgroundColor: "rgba(251, 191, 36, 0.35)",
          },
        ],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { title: { display: true, text: "推定生息数（頭）" } },
        },
      },
    });
  }

  // Table
  function renderTable() {
    const query = document.getElementById("tblSearch").value.trim().toLowerCase();
    const fTier = document.getElementById("tblFilterTier").value;
    const fGrade = document.getElementById("tblFilterGrade").value;
    const sortBy = document.getElementById("tblSort").value;

    let rows = state.computed.filter((m) => {
      if (query && !m.name_ja.includes(query) && !m.name_kana.includes(query) && !m.district_or_area.includes(query)) return false;
      if (fTier !== "ALL" && m.active_dom_code !== fTier) return false;
      if (fGrade !== "ALL" && m.active_grade !== fGrade) return false;
      return true;
    });

    const numDesc = (a, b, key) => (b[key] ?? -1) - (a[key] ?? -1);
    rows.sort((a, b) => {
      if (sortBy === "ratio_desc") return numDesc(a, b, "active_ratio_pct");
      if (sortBy === "deer_desc") return numDesc(a, b, "active_deer");
      if (sortBy === "human_desc") return b.human_pop - a.human_pop;
      if (sortBy === "density_desc") return numDesc(a, b, "active_density_admin");
      if (sortBy === "forest_desc") return b.forest_ratio_pct - a.forest_ratio_pct;
      if (sortBy === "depi_desc") return numDesc(a, b, "active_depi");
      return a.jis_code.localeCompare(b.jis_code);
    });

    const tbody = document.getElementById("muniTableBody");
    tbody.innerHTML = rows
      .map((m) => {
        const t = TIER_META[m.active_dom_code];
        const g = GRADE_META[m.active_grade];
        const selClass = state.selectedCode === m.jis_code ? "selected-row" : "";
        return `
          <tr class="${selClass}" data-code="${m.jis_code}">
            <td class="mono">${m.jis_code}</td>
            <td><strong>${m.name_ja}</strong><br><small style="color:var(--text-dim)">${m.district_or_area}</small></td>
            <td>${m.region_block}</td>
            <td><span class="grade-chip" style="background:${g.color}22;color:${g.color};border:1px solid ${g.color}55">${m.active_grade}</span></td>
            <td class="mono">${fmtInt(m.human_pop)}</td>
            <td class="mono" style="color:${m.pop_change_pct_2020_2026 < -10 ? "#ef4444" : "var(--text-muted)"}">${m.pop_change_pct_2020_2026 > 0 ? "+" : ""}${m.pop_change_pct_2020_2026}%</td>
            <td class="mono">${fmtDec(m.area_km2, 2)}</td>
            <td class="mono">${fmtDec(m.forest_ratio_pct, 1)}%</td>
            <td class="mono">${m.active_deer == null ? "未判定" : `${fmtInt(m.active_deer)}<br><small style="color:var(--text-dim)">(${fmtInt(m.deer_low)}〜${fmtInt(m.deer_high)})</small>`}</td>
            <td class="mono" style="color:${t.color};font-weight:700">${m.active_ratio_pct == null ? "—" : fmtDec(m.active_ratio_pct, 1) + "%"}</td>
            <td class="mono">${m.active_density_admin == null ? "—" : `${fmtDec(m.active_density_admin, 1)} / ${fmtDec(m.active_density_forest, 1)}`}</td>
            <td class="mono">${m.active_depi == null ? "—" : fmtDec(m.active_depi, 1)}</td>
            <td><span style="color:${t.color};font-weight:700">${t.label}</span></td>
          </tr>
        `;
      })
      .join("");

    tbody.querySelectorAll("tr").forEach((tr) => {
      tr.addEventListener("click", () => {
        const code = tr.getAttribute("data-code");
        selectMunicipality(code);
        const feat = RAW.geojson.features.find((f) => f.properties.jis_code === code);
        if (map && feat) {
          const b = L.geoJSON(feat).getBounds();
          map.fitBounds(b, { padding: [40, 40], maxZoom: 12 });
        }
      });
    });
  }

  function renderRedTeamAndVerdict() {
    const rt = document.getElementById("redTeamContent");
    const checks = [
      {
        title: "① 推定生息数と実測頭数の混同防止",
        status: "PASS",
        body: "愛護会の早朝目視実測（奈良公園 1,687頭）のみを区分Aとし、奈良市D地区の糞粒法平均密度適用を区分B、31市町村の森林配分モデルを区分Cとして明確に分離表記しています。",
      },
      {
        title: "② 捕獲数を生息数として誤使用していないか",
        status: "PASS",
        body: "奈良県の捕獲実績（R5年度 10,296頭、H12年度 1,945頭）や奈良市D地区捕獲上限（450頭）は管理圧力の参照指標として扱い、生息頭数の代替値として流用していません。",
      },
      {
        title: "③ 分布確認地点を生息密度として扱っていないか",
        status: "PASS",
        body: "生息密度パラメータは奈良市D地区糞粒法（15.5頭/km²）、森林技術センターRESTモデル（高取30.15・野迫川14.07頭/km²）、大台ヶ原調査（5.6〜35.8頭/km²）に基づく単位面積密度のみを採用。",
      },
      {
        title: "④ 奈良公園と県全域の二重計上排除",
        status: "PASS",
        body: "奈良市（29201）は保護地区A/B（1,687頭）＋管理地区D（2,852頭）＝4,539頭を分離合算し、県合計 62,517頭 ＝ 公園1,687＋野生60,830 でテーブル・5kmメッシュ双方の重複を排除済です。",
      },
      {
        title: "⑤ 人間と鹿・森林の基準年度ズレの明示",
        status: "WARN / 明示",
        body: "人間人口は2026-10-01、森林センサスは2020-02-01、鹿調査は2022–2026の混合基準です。曽爾村は2020年人口基準（91.2%）なら鹿優勢ですが、2026年人口減により107.8%（鹿帝国領）へ転じています。",
      },
      {
        title: "⑥ 市町村空間集計の仮定の妥当性",
        status: "WARN / 制約明記",
        body: "公式な市町村別生息数は非公表のため、現況森林面積重み×地域密度で配分（区分C）。五條市等のポリゴン内代表点保証や全区分Cのメッシュ網羅を自動検証しています。",
      },
      {
        title: "⑦ 推定方法による結果逆転の感度監査",
        status: "PASS (36/39階級不変)",
        body: "保守的（4.59万頭）〜高密度（8.12万頭）間で階級が変化するのは曽爾村・山添村・吉野町の3町村のみ。ただし大台ヶ原の低密度(5.6頭/km²)を反映すると上北山村は首位→野迫川村と交代し得ます。",
      },
      {
        title: "⑧ 出典不明・捏造数値の排除",
        status: "PASS",
        body: "奈良市C地区の仮定値(120頭)を撤廃しR3/R5/H30公的実測密度のみを採用。県R2公式推計中央値(65,049頭)、2026人口(1,263,770人差0)、森林面積(283,671ha差0)を自動検証しています。",
      },
    ];
    rt.innerHTML = checks
      .map(
        (c) => `
      <article class="audit-card">
        <h4><span>${c.title}</span><span class="${c.status.startsWith("PASS") ? "audit-pass" : "audit-warn"}">${c.status}</span></h4>
        <p>${c.body}</p>
      </article>`
      )
      .join("");

    document.getElementById("verdictContent").innerHTML = `
      <div class="verdict-hero">
        <h3>👑 最終結論：奈良県は「人間の県」であり、同時に「半国土の鹿帝国」である</h3>
        <p>
          <strong>【統計的に言えること】</strong> 県全体の人口総数で見れば、人間は <strong>1,263,770人</strong>（区分A）、鹿の推定総数は標準モデルで <strong>62,517頭</strong>（保守45,908〜高密度81,243頭、区分A+B+C統合／県R2公式中央値65,049頭と整合）であり、頭数比（鹿人比率 <strong>4.95%</strong>）においては奈良県は明確に<strong>「人間の県」</strong>である（人間が約20倍）。
        </p>
        <p>
          <strong>【空間的に起きている衝撃】</strong> しかし奈良県は面積の76.9%を森林が占め、人間の大部分が北西部の奈良盆地（県土の約2割）に集中している。結果として、南部・東部の山間10市町村（標準モデル）では鹿の推定生息数が人間人口を上回る<strong>「👑 鹿帝国領」</strong>となり、その支配面積は <strong>1,986.5 km²（県土全体の53.8%）</strong> に達する。保守的下限モデルでも9村・県土の <strong>52.5%</strong> が鹿多数派であり、この空間構造は強固に成立する。
        </p>
        <p>
          <strong>【科学的限界】</strong> ただし31市町村の数値は森林面積に基づく空間配分推定（区分C）であり、自治体内での局所的な群れの偏在（例：高取町人工林30.15頭/km² vs 大台ヶ原管理域5.6〜10頭/km²）による±25〜30%の誤差幅が存在する。
        </p>
      </div>
      <div class="findings-list">
        <div class="finding-pill">
          <strong>発見1：住民は人間(95.3%)、県土の過半(53.8%)は鹿帝国領</strong>
          <span>「都市の奈良」と「奥吉野・大和高原の鹿の帝国」という極端な二重構造が奈良県の本質。</span>
        </div>
        <div class="finding-pill">
          <strong>発見2：最強の鹿帝国は「上北山村」（鹿人比率 1,395.6%）</strong>
          <span>人間362人に対し鹿推定5,052頭（1人あたり約14頭）。次いで野迫川村（957.3%）、川上村（523.5%）、十津川村（516.4%）。総合勢力指数DEPIでは東吉野村（88.1帝国pt）が首位。</span>
        </div>
        <div class="finding-pill">
          <strong>発見3：奈良公園の「神鹿」は2026年 過去最多の1,687頭へ急増</strong>
          <span>戦後79頭から復活しコロナ禍後急増。ただし県全体の推定鹿数に占める割合はわずか 2.7% に過ぎない。</span>
        </div>
        <div class="finding-pill">
          <strong>発見4：人口減少だけで境界村が「鹿帝国領」へ移行する現象</strong>
          <span>曽爾村は2020年人口基準（91.2%）では鹿優勢だったが、2026年までの人口減少(-15.4%)により107.8%へ上昇。県の捕獲数(R5:10,296頭)は目標16,000頭に未達。</span>
        </div>
      </div>
    `;
  }

  function exportCsv() {
    const headers = [
      "jis_code", "name_ja", "region_block", "evidence_grade",
      "human_pop_2026", "pop_change_pct_2020_2026", "area_km2", "forest_ratio_pct",
      "deer_estimated", "deer_human_ratio_pct", "deer_density_admin_km2",
      "deer_density_forest_km2", "depi_score", "dominance_label"
    ];
    const lines = [headers.join(",")];
    for (const m of state.computed) {
      lines.push([
        m.jis_code,
        m.name_ja,
        m.region_block,
        m.active_grade,
        m.human_pop,
        m.pop_change_pct_2020_2026,
        m.area_km2,
        m.forest_ratio_pct,
        m.active_deer ?? "",
        m.active_ratio_pct ?? "",
        m.active_density_admin ?? "",
        m.active_density_forest ?? "",
        m.active_depi ?? "",
        TIER_META[m.active_dom_code].label,
      ].join(","));
    }
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `deer_empire_nara_${state.scenario}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function wireEvents() {
    // Quick select dropdown
    const sel = document.getElementById("quickSelect");
    [...RAW.municipalities]
      .sort((a, b) => a.jis_code.localeCompare(b.jis_code))
      .forEach((m) => {
        const opt = document.createElement("option");
        opt.value = m.jis_code;
        opt.textContent = `${m.name_ja}（${m.district_or_area}）`;
        sel.appendChild(opt);
      });
    sel.addEventListener("change", () => {
      const code = sel.value || null;
      selectMunicipality(code);
      if (map && code) {
        const feat = RAW.geojson.features.find((f) => f.properties.jis_code === code);
        if (feat) map.fitBounds(L.geoJSON(feat).getBounds(), { padding: [45, 45], maxZoom: 12 });
      }
    });

    // Layer buttons
    document.querySelectorAll("#layerButtons .layer-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#layerButtons .layer-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        state.layer = btn.dataset.layer;
        document.getElementById("densityBasisBox").classList.toggle("hidden", state.layer !== "density");
        updateKPIsAndBars();
        refreshMap();
      });
    });

    // Density basis toggle
    document.querySelectorAll("#densityBasisBox .chip-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#densityBasisBox .chip-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        state.densityBasis = btn.dataset.basis;
        refreshMap();
      });
    });

    // Scenario buttons
    document.querySelectorAll("#scenarioButtons .scen-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#scenarioButtons .scen-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        state.scenario = btn.dataset.scenario;
        recalculateModel();
        updateKPIsAndBars();
        refreshMap();
        renderInspector();
        renderTable();
      });
    });

    // What-If Sliders
    const sliderBindings = [
      ["sliderEast", "valEast", "east"],
      ["sliderSouth", "valSouth", "south"],
      ["sliderNW", "valNW", "nw"],
    ];
    sliderBindings.forEach(([id, lblId, key]) => {
      const inp = document.getElementById(id);
      inp.addEventListener("input", () => {
        state.sliders[key] = parseFloat(inp.value);
        document.getElementById(lblId).textContent = `${state.sliders[key].toFixed(1)} 頭/km²`;
        document.querySelectorAll("#scenarioButtons .scen-btn").forEach((b) => b.classList.remove("active"));
        state.scenario = "custom";
        recalculateModel();
        updateKPIsAndBars();
        refreshMap();
        renderInspector();
        renderTable();
      });
    });

    document.getElementById("btnResetSliders").addEventListener("click", () => {
      state.sliders = { ...DEFAULT_SLIDERS };
      document.getElementById("sliderEast").value = DEFAULT_SLIDERS.east;
      document.getElementById("sliderSouth").value = DEFAULT_SLIDERS.south;
      document.getElementById("sliderNW").value = DEFAULT_SLIDERS.nw;
      document.getElementById("valEast").textContent = "26.0 頭/km²";
      document.getElementById("valSouth").textContent = "20.0 頭/km²";
      document.getElementById("valNW").textContent = "16.0 頭/km²";
      document.querySelector('#scenarioButtons .scen-btn[data-scenario="std"]').click();
    });

    // Overlays
    document.getElementById("chkMesh").addEventListener("change", (e) => {
      state.showMesh = e.target.checked;
      refreshMap();
    });
    document.getElementById("chkZones").addEventListener("change", (e) => {
      state.showZones = e.target.checked;
      refreshMap();
    });
    document.getElementById("chkSensitive").addEventListener("change", (e) => {
      state.showSensitive = e.target.checked;
      refreshMap();
    });
    document.getElementById("chkLabels").addEventListener("change", (e) => {
      state.showLabels = e.target.checked;
      refreshMap();
    });

    // Map Tile Mode toggle & Zoom presets
    const tileBtn = document.getElementById("btnTileMode");
    const mapEl = document.getElementById("map");
    const TILE_LABELS = { dark: "🗺️ 地理院(暗)", light: "🗺️ 地理院(淡)", off: "🗺️ 無地(SVG)" };
    function setTileMode(mode) {
      state.tileMode = mode;
      mapEl.classList.remove("gsi-dark-tiles", "tiles-off");
      if (mode === "dark") mapEl.classList.add("gsi-dark-tiles");
      if (mode === "off") mapEl.classList.add("tiles-off");
      tileBtn.textContent = TILE_LABELS[mode];
    }
    window.__setTileMode = setTileMode;
    tileBtn.addEventListener("click", () => {
      setTileMode(state.tileMode === "dark" ? "light" : state.tileMode === "light" ? "off" : "dark");
    });

    document.getElementById("btnZoomNara").addEventListener("click", () => {
      if (map && geoLayer) map.fitBounds(geoLayer.getBounds(), { padding: [18, 18] });
    });
    document.getElementById("btnZoomPark").addEventListener("click", () => {
      if (map) map.setView([34.685, 135.845], 12);
      selectMunicipality("29201");
    });
    document.getElementById("btnZoomSouth").addEventListener("click", () => {
      if (map) map.setView([34.09, 135.87], 10);
    });

    // Ensure charts and map resize cleanly across viewport changes
    window.addEventListener("resize", () => {
      if (map) map.invalidateSize();
      Object.values(chartInstances).forEach((ch) => {
        if (ch && typeof ch.resize === "function") ch.resize();
      });
    });

    // Reset All
    document.getElementById("btnResetAll").addEventListener("click", () => {
      state.selectedCode = null;
      document.getElementById("quickSelect").value = "";
      document.getElementById("btnResetSliders").click();
      document.querySelector('#layerButtons .layer-btn[data-layer="dominance"]').click();
      if (map && geoLayer) map.fitBounds(geoLayer.getBounds(), { padding: [18, 18] });
    });

    // Tabs
    document.querySelectorAll(".hub-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        document.querySelectorAll(".hub-tab").forEach((t) => t.classList.remove("active"));
        document.querySelectorAll(".hub-pane").forEach((p) => p.classList.remove("active"));
        tab.classList.add("active");
        document.getElementById(`tab-${tab.dataset.tab}`).classList.add("active");
      });
    });

    // Table filters & export
    ["tblSearch", "tblFilterTier", "tblFilterGrade", "tblSort"].forEach((id) => {
      document.getElementById(id).addEventListener("input", renderTable);
      document.getElementById(id).addEventListener("change", renderTable);
    });
    document.getElementById("btnExportCsv").addEventListener("click", exportCsv);
  }

  function boot() {
    recalculateModel();
    initMap();
    wireEvents();
    updateKPIsAndBars();
    renderLegend();
    renderInspector();
    renderTable();
    initCharts();
    renderRedTeamAndVerdict();
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
