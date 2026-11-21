(() => {
  "use strict";

  const DATA = window.NARA_SLIDES_DATA;
  const stage = document.getElementById("slideStage");
  const slides = Array.from(document.querySelectorAll(".slide"));
  const counterEl = document.getElementById("hudCounter");
  const notesDrawer = document.getElementById("notesDrawer");
  const notesBody = document.getElementById("notesBody");
  const gridOverlay = document.getElementById("gridOverlay");
  const thumbGrid = document.getElementById("thumbGrid");

  let currentIndex = 0;

  function updateScale() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const scale = Math.min((vw - 32) / 1920, (vh - 86) / 1080);
    stage.style.transform = `translate(-50%, -50%) scale(${Math.max(0.15, scale)})`;
  }

  function showSlide(idx) {
    currentIndex = (idx + slides.length) % slides.length;
    slides.forEach((s, i) => s.classList.toggle("active", i === currentIndex));
    counterEl.textContent = `${String(currentIndex + 1).padStart(2, "0")} / ${String(slides.length).padStart(2, "0")}`;

    const aside = slides[currentIndex].querySelector(".speaker-notes");
    notesBody.textContent = aside ? aside.textContent.trim() : "";

    thumbGrid.querySelectorAll(".thumb-item").forEach((item, i) => {
      item.classList.toggle("current", i === currentIndex);
    });
  }

  function buildOverviewGrid() {
    thumbGrid.innerHTML = slides
      .map(
        (s, i) => `
      <div class="thumb-item ${i === currentIndex ? "current" : ""}" data-idx="${i}">
        <div class="thumb-num">SLIDE ${String(i + 1).padStart(2, "0")}</div>
        <div class="thumb-title">${s.dataset.title || ""}</div>
      </div>`
      )
      .join("");
    thumbGrid.querySelectorAll(".thumb-item").forEach((el) => {
      el.addEventListener("click", () => {
        showSlide(parseInt(el.dataset.idx, 10));
        gridOverlay.classList.remove("open");
      });
    });
  }

  // Slide 3: Exact GeoJSON SVG Map
  function renderSlide3Map() {
    const container = document.getElementById("slide3MapContainer");
    if (!container || !DATA) return;
    const { width, height } = DATA.svgBox;
    const coreLabels = new Set(["29201", "29205", "29207", "29212", "29447", "29449", "29451", "29452", "29453", "29385"]);

    const polys = DATA.mapFeatures
      .map((f) => {
        const fill = f.evidence_grade === "D" ? "url(#slideHatch)" : f.dominance_color;
        const ratioTxt = f.ratio == null ? "未判定(D)" : `${f.ratio}%`;
        return `<path d="${f.path}" fill="${fill}" fill-opacity="0.9" stroke="#091322" stroke-width="1.4"><title>${f.name_ja}: ${ratioTxt}</title></path>`;
      })
      .join("");

    const labels = DATA.mapFeatures
      .filter((f) => coreLabels.has(f.jis_code))
      .map(
        (f) =>
          `<text x="${f.cx}" y="${f.cy}" text-anchor="middle" dominant-baseline="central" fill="#ffffff" font-size="14" font-weight="800" stroke="#040810" stroke-width="3.5" paint-order="stroke">${f.name_ja}</text>`
      )
      .join("");

    const { naraPark, odaigahara } = DATA.markers;
    container.innerHTML = `
      <svg viewBox="0 0 ${width} ${height}" style="width:100%;height:100%;max-height:730px">
        <defs>
          <pattern id="slideHatch" patternUnits="userSpaceOnUse" width="10" height="10" patternTransform="rotate(45)">
            <rect width="10" height="10" fill="#2a3444"/>
            <line x1="0" y1="0" x2="0" y2="10" stroke="#64748b" stroke-width="3"/>
          </pattern>
        </defs>
        ${polys}
        ${labels}
        <circle cx="${naraPark.x}" cy="${naraPark.y}" r="9" fill="#ef4444" stroke="#fde68a" stroke-width="2.5"/>
        <circle cx="${odaigahara.x}" cy="${odaigahara.y}" r="8" fill="#10b981" stroke="#ffffff" stroke-width="2"/>
      </svg>
    `;
  }

  // Slide 4: Top 10 Deer Empire Horizontal Bars
  function renderSlide4Bars() {
    const container = document.getElementById("slide4Bars");
    if (!container || !DATA) return;
    const empires = DATA.municipalities
      .filter((m) => m.dominance_code === "EMPIRE")
      .sort((a, b) => b.deer_human_ratio_pct - a.deer_human_ratio_pct);

    const maxRatio = empires[0]?.deer_human_ratio_pct || 1400;
    container.innerHTML = empires
      .map((m, idx) => {
        const w = Math.max(8, (m.deer_human_ratio_pct / maxRatio) * 100);
        const color = idx < 4 ? "#d97706" : idx < 9 ? "#f59e0b" : "#a855f7";
        return `
          <div class="hbar-row">
            <span style="font-weight:800;color:#0e2841">${idx + 1}. ${m.name_ja}</span>
            <div class="hbar-track">
              <div class="hbar-fill" style="width:${w.toFixed(1)}%;background:${color}"></div>
            </div>
            <span class="mono" style="text-align:right;font-weight:800;color:${idx === 9 ? "#7c3aed" : "#b45309"}">
              ${m.deer_human_ratio_pct.toFixed(1)}% <small style="font-weight:500;color:#64748b">(${m.deer_std.toLocaleString()}頭)</small>
            </span>
          </div>
        `;
      })
      .join("");
  }

  // Slide 6: 2-Axis Timeseries SVG Chart
  function renderSlide6Chart() {
    const container = document.getElementById("slide6ChartContainer");
    if (!container || !DATA) return;
    const parkPts = [
      [1945, 79], [1955, 378], [1975, 925], [1995, 1192], [2005, 1166],
      [2010, 1096], [2015, 1191], [2019, 1388], [2021, 1105], [2024, 1325], [2025, 1465], [2026, 1687],
    ];
    const popPts = [
      [1980, 120.9], [1990, 137.5], [2000, 144.3], [2005, 142.1], [2010, 140.1],
      [2015, 136.4], [2020, 132.4], [2025, 126.8], [2026, 126.4],
    ];

    const W = 1040, H = 560;
    const padL = 82, padR = 88, padT = 32, padB = 56;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    const xOf = (yr) => padL + ((yr - 1945) / (2026 - 1945)) * plotW;
    const yDeer = (v) => padT + plotH - (v / 1800) * plotH;
    const yPop = (v) => padT + plotH - ((v - 100) / (155 - 100)) * plotH;

    const deerPath = parkPts.map((p, i) => `${i === 0 ? "M" : "L"}${xOf(p[0]).toFixed(1)},${yDeer(p[1]).toFixed(1)}`).join(" ");
    const popPath = popPts.map((p, i) => `${i === 0 ? "M" : "L"}${xOf(p[0]).toFixed(1)},${yPop(p[1]).toFixed(1)}`).join(" ");

    const gridLines = [0, 450, 900, 1350, 1800]
      .map(
        (v) =>
          `<line x1="${padL}" y1="${yDeer(v)}" x2="${W - padR}" y2="${yDeer(v)}" stroke="#dce6ef" stroke-dasharray="4,4"/>` +
          `<text x="${padL - 12}" y="${yDeer(v) + 6}" text-anchor="end" font-size="18" fill="#d97706" font-weight="700">${v}</text>`
      )
      .join("");

    const popAxis = [110, 125, 140, 155]
      .map((v) => `<text x="${W - padR + 12}" y="${yPop(v) + 6}" text-anchor="start" font-size="18" fill="#0f6fa3" font-weight="700">${v}万</text>`)
      .join("");

    const xTicks = [1945, 1960, 1980, 2000, 2015, 2026]
      .map((yr) => `<text x="${xOf(yr)}" y="${padT + plotH + 34}" text-anchor="middle" font-size="19" fill="#475569" font-weight="700">${yr}</text>`)
      .join("");

    const deerCircles = parkPts
      .map(([yr, v]) => `<circle cx="${xOf(yr)}" cy="${yDeer(v)}" r="6" fill="#d97706" stroke="#fff" stroke-width="2"/>`)
      .join("");
    const popCircles = popPts
      .map(([yr, v]) => `<circle cx="${xOf(yr)}" cy="${yPop(v)}" r="6" fill="#0f6fa3" stroke="#fff" stroke-width="2"/>`)
      .join("");

    container.innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:100%">
        ${gridLines}
        ${popAxis}
        ${xTicks}
        <path d="${popPath}" fill="none" stroke="#0f6fa3" stroke-width="4.5"/>
        <path d="${deerPath}" fill="none" stroke="#d97706" stroke-width="4.5"/>
        ${popCircles}
        ${deerCircles}
        <text x="${xOf(1945) + 12}" y="${yDeer(79) - 14}" font-size="20" font-weight="800" fill="#b45309">79頭</text>
        <text x="${xOf(2026) - 14}" y="${yDeer(1687) - 14}" text-anchor="end" font-size="22" font-weight="900" fill="#b45309">2026: 1,687頭 (過去最多)</text>
        <text x="${xOf(2000)}" y="${yPop(144.3) - 14}" text-anchor="middle" font-size="20" font-weight="800" fill="#0f6fa3">2000ピーク: 144.3万人</text>
        <text x="${xOf(2026) - 10}" y="${yPop(126.4) + 28}" text-anchor="end" font-size="20" font-weight="800" fill="#0f6fa3">2026: 126.4万人</text>
      </svg>
    `;
  }

  // Slide 7: Forest Ratio vs Log Deer-Human Ratio SVG Scatter
  function renderSlide7Scatter() {
    const container = document.getElementById("slide7ScatterContainer");
    if (!container || !DATA) return;
    const valid = DATA.municipalities.filter((m) => m.evidence_grade !== "D");
    const W = 980, H = 560;
    const padL = 86, padR = 36, padT = 32, padB = 58;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    const xOf = (f) => padL + (f / 100) * plotW;
    const logMin = Math.log10(0.008);
    const logMax = Math.log10(2200);
    const yOf = (r) => padT + plotH - ((Math.log10(Math.max(r, 0.008)) - logMin) / (logMax - logMin)) * plotH;

    const yTicks = [0.1, 1, 10, 100, 1000]
      .map((v) => {
        const y = yOf(v);
        const isEmpireLine = v === 100;
        return (
          `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="${isEmpireLine ? "#d97706" : "#dce6ef"}" stroke-width="${isEmpireLine ? 2.5 : 1}" stroke-dasharray="${isEmpireLine ? "8,5" : "4,4"}"/>` +
          `<text x="${padL - 12}" y="${y + 6}" text-anchor="end" font-size="18" font-weight="700" fill="${isEmpireLine ? "#b45309" : "#475569"}">${v}%</text>`
        );
      })
      .join("");

    const xTicks = [0, 25, 50, 75, 100]
      .map((v) => {
        const x = xOf(v);
        return (
          `<line x1="${x}" y1="${padT}" x2="${x}" y2="${padT + plotH}" stroke="${v === 75 ? "#059669" : "#dce6ef"}" stroke-dasharray="4,4"/>` +
          `<text x="${x}" y="${padT + plotH + 26}" text-anchor="middle" font-size="18" font-weight="700" fill="#475569">${v}%</text>`
        );
      })
      .join("");

    const dots = valid
      .map((m) => {
        const cx = xOf(m.forest_ratio_pct);
        const cy = yOf(m.deer_human_ratio_pct);
        return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="9" fill="${m.dominance_color}" fill-opacity="0.88" stroke="#0e2841" stroke-width="1.5"/>`;
      })
      .join("");

    const callouts = [
      { code: "29451", dx: -24, dy: -20, anchor: "end", leader: true },    // 上北山村 (1395.6%) top-left
      { code: "29447", dx: -155, dy: 4, anchor: "end", leader: true },     // 野迫川村 (957.3%) far left in empty space
      { code: "29449", dx: -155, dy: 10, anchor: "end", leader: true },    // 十津川村 (516.4%) far left clear of dots
      { code: "29385", dx: -34, dy: -26, anchor: "end", leader: true },    // 曽爾村 (107.8%) above border
      { code: "29201", dx: 14, dy: -10, anchor: "start", leader: false },  // 奈良市 (1.3%)
      { code: "29205", dx: 14, dy: -14, anchor: "start", leader: false },  // 橿原市 (0.01%)
    ]
      .map((c) => {
        const m = valid.find((x) => x.jis_code === c.code);
        if (!m) return "";
        const px = xOf(m.forest_ratio_pct);
        const py = yOf(m.deer_human_ratio_pct);
        const tx = px + c.dx;
        const ty = py + c.dy;
        const line = c.leader
          ? `<line x1="${px.toFixed(1)}" y1="${py.toFixed(1)}" x2="${(tx + (c.anchor === "end" ? 6 : -6)).toFixed(1)}" y2="${(ty - 4).toFixed(1)}" stroke="#64748b" stroke-width="1.5" stroke-dasharray="3,2"/>`
          : "";
        return (
          line +
          `<text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" text-anchor="${c.anchor}" font-size="18" font-weight="800" fill="#0e2841">${m.name_ja} (${m.deer_human_ratio_pct.toFixed(1)}%)</text>`
        );
      })
      .join("");

    // Soni tipping point ghost 2020 -> 2026
    const soni = valid.find((x) => x.jis_code === "29385");
    const soniArrow = soni
      ? `<circle cx="${xOf(soni.forest_ratio_pct)}" cy="${yOf(91.2)}" r="7" fill="none" stroke="#a855f7" stroke-width="2.5" stroke-dasharray="3,2"/>` +
        `<line x1="${xOf(soni.forest_ratio_pct)}" y1="${yOf(91.2) - 4}" x2="${xOf(soni.forest_ratio_pct)}" y2="${yOf(107.76) + 8}" stroke="#a855f7" stroke-width="2.5"/>`
      : "";

    container.innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:100%">
        ${yTicks}
        ${xTicks}
        <text x="${padL + 14}" y="${yOf(100) - 10}" text-anchor="start" font-size="18" font-weight="800" fill="#b45309">👑 鹿帝国領ボーダー (100%)</text>
        ${dots}
        ${soniArrow}
        ${callouts}
        <text x="${padL + plotW / 2}" y="${H - 4}" text-anchor="middle" font-size="18" fill="#64748b">森林率（%）→</text>
      </svg>
    `;
  }

  function wireControls() {
    document.getElementById("btnPrev").addEventListener("click", () => showSlide(currentIndex - 1));
    document.getElementById("btnNext").addEventListener("click", () => showSlide(currentIndex + 1));
    document.getElementById("btnNotes").addEventListener("click", () => notesDrawer.classList.toggle("open"));
    document.getElementById("btnGrid").addEventListener("click", () => gridOverlay.classList.toggle("open"));
    document.getElementById("btnCloseGrid").addEventListener("click", () => gridOverlay.classList.remove("open"));
    document.getElementById("btnPrint").addEventListener("click", () => window.print());
    document.getElementById("btnFullscreen").addEventListener("click", () => {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
      else document.exitFullscreen?.();
    });

    window.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") {
        e.preventDefault();
        showSlide(currentIndex + 1);
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        showSlide(currentIndex - 1);
      } else if (e.key.toLowerCase() === "g") {
        gridOverlay.classList.toggle("open");
      } else if (e.key.toLowerCase() === "n") {
        notesDrawer.classList.toggle("open");
      } else if (e.key.toLowerCase() === "f") {
        if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
        else document.exitFullscreen?.();
      } else if (e.key.toLowerCase() === "p") {
        window.print();
      } else if (e.key === "Escape") {
        gridOverlay.classList.remove("open");
        notesDrawer.classList.remove("open");
      }
    });

    window.addEventListener("resize", updateScale);
  }

  function init() {
    updateScale();
    renderSlide3Map();
    renderSlide4Bars();
    renderSlide6Chart();
    renderSlide7Scatter();
    buildOverviewGrid();
    wireControls();
    showSlide(0);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
