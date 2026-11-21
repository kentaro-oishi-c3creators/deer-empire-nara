(() => {
  "use strict";

  const Map3D = {
    initialized: false,
    engine: "none", // "webgl" | "canvas25d"
    heightMode: "auto", // "auto" | "ratio" | "deer" | "human" | "forest"
    heightScale: 1.2,
    showTowers: true,
    autoRotate: false,
    hoveredCode: null,
    demoFlipState: 0,
  };

  function bridge() {
    return window.DEER_3D_BRIDGE || null;
  }

  function hexToThreeColor(hex) {
    return new THREE.Color(hex || "#475569");
  }

  // Projection utilities (centered on Nara Prefecture)
  function computeProjection(geojson) {
    let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
    geojson.features.forEach((f) => {
      const rings = f.geometry.type === "Polygon" ? f.geometry.coordinates : f.geometry.coordinates.flat(1);
      rings.forEach((ring) => {
        ring.forEach(([lon, lat]) => {
          if (lon < minLon) minLon = lon;
          if (lon > maxLon) maxLon = lon;
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
        });
      });
    });
    const cLon = (minLon + maxLon) / 2;
    const cLat = (minLat + maxLat) / 2;
    const cosLat = Math.cos((cLat * Math.PI) / 180);
    const spanX = (maxLon - minLon) * cosLat;
    const spanY = maxLat - minLat;
    const scale = 13.5 / Math.max(spanX, spanY);
    return {
      cLon,
      cLat,
      cosLat,
      scale,
      toShapeXY(lon, lat) {
        return [(lon - cLon) * cosLat * scale, (lat - cLat) * scale];
      },
      toWorldXZ(lon, lat) {
        // After rotating shape -90deg around X: shapeX -> X, shapeY -> -Z
        return [(lon - cLon) * cosLat * scale, -(lat - cLat) * scale];
      },
    };
  }

  function computeMunicipalityColor(m, state, b) {
    const { TIER_META, GRADE_META, getRampColor } = b;
    if (state.layer === "human") {
      return getRampColor(m.human_pop, [
        [200000, "#1d4ed8"],
        [75000, "#2563eb"],
        [30000, "#3b82f6"],
        [10000, "#60a5fa"],
        [3000, "#1e3a8a"],
        [0, "#0f172a"],
      ]);
    }
    if (state.layer === "evidence") {
      return GRADE_META[m.active_grade].color;
    }
    if (m.active_dom_code === "UNDETERMINED") {
      return "#334155";
    }
    if (state.layer === "dominance") {
      return TIER_META[m.active_dom_code].color;
    }
    if (state.layer === "ratio") {
      return getRampColor(m.active_ratio_pct, [
        [500, "#f59e0b"],
        [100, "#fbbf24"],
        [50, "#10b981"],
        [10, "#a855f7"],
        [2, "#3b82f6"],
        [0, "#1e3a8a"],
      ]);
    }
    if (state.layer === "deer") {
      return getRampColor(m.active_deer, [
        [8000, "#d97706"],
        [4000, "#f59e0b"],
        [2000, "#10b981"],
        [800, "#14b8a6"],
        [200, "#3b82f6"],
        [0, "#1e293b"],
      ]);
    }
    if (state.layer === "density") {
      const d = state.densityBasis === "forest" ? m.active_density_forest : m.active_density_admin;
      return getRampColor(d || 0, [
        [25, "#dc2626"],
        [18, "#f59e0b"],
        [12, "#10b981"],
        [6, "#06b6d4"],
        [2, "#3b82f6"],
        [0, "#1e293b"],
      ]);
    }
    if (state.layer === "depi") {
      return getRampColor(m.active_depi || 0, [
        [80, "#f59e0b"],
        [65, "#fbbf24"],
        [45, "#10b981"],
        [25, "#a855f7"],
        [0, "#3b82f6"],
      ]);
    }
    return "#334155";
  }

  function computeMunicipalityHeight(m, state) {
    let metric = Map3D.heightMode;
    if (metric === "auto") {
      if (state.layer === "human") metric = "human";
      else if (state.layer === "deer") metric = "deer";
      else if (state.layer === "density") metric = "density";
      else if (state.layer === "depi") metric = "depi";
      else if (state.layer === "evidence") metric = "forest";
      else metric = "ratio";
    }

    let rawH = 0.08;
    if (metric === "human") {
      rawH = 0.14 + Math.sqrt(m.human_pop || 0) / 145.0;
    } else if (metric === "forest") {
      rawH = 0.14 + ((m.forest_ratio_pct || 0) / 100.0) * 3.1;
    } else if (m.active_dom_code === "UNDETERMINED" || m.active_deer == null) {
      // Grade D undetermined municipalities stay flat so missing deer data is never exaggerated
      rawH = 0.07;
    } else if (metric === "ratio") {
      rawH = 0.2 + Math.log10(Math.max(m.active_ratio_pct || 0, 0) + 1.0) * 1.15;
    } else if (metric === "deer") {
      rawH = 0.2 + Math.sqrt(m.active_deer || 0) / 28.0;
    } else if (metric === "density") {
      const d = state.densityBasis === "forest" ? m.active_density_forest : m.active_density_admin;
      rawH = 0.2 + Math.min(4.2, (d || 0) / 7.5);
    } else if (metric === "depi") {
      rawH = 0.2 + ((m.active_depi || 0) / 100.0) * 3.6;
    }

    return Math.max(0.05, rawH * Map3D.heightScale);
  }

  // =========================================================================
  // THREE.JS WEBGL 3D ENGINE
  // =========================================================================
  function initWebGLMap(host, b) {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    const rect = host.getBoundingClientRect();
    const w = Math.max(320, rect.width || host.clientWidth || 720);
    const h = Math.max(320, rect.height || host.clientHeight || 600);
    renderer.setSize(w, h);
    host.innerHTML = "";
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 200);

    // Lighting
    const hemiLight = new THREE.HemisphereLight(0xe2e8f0, 0x0f172a, 0.95);
    scene.add(hemiLight);
    const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.95);
    dirLight1.position.set(12, 22, 14);
    scene.add(dirLight1);
    const dirLight2 = new THREE.DirectionalLight(0xfbbf24, 0.42);
    dirLight2.position.set(-14, 12, -10);
    scene.add(dirLight2);

    // Ground Holo Grid & Radar Rings
    const groundGroup = new THREE.Group();
    const gridHelper = new THREE.GridHelper(24, 24, 0x334155, 0x1e293b);
    gridHelper.position.y = -0.02;
    gridHelper.material.opacity = 0.38;
    gridHelper.material.transparent = true;
    groundGroup.add(gridHelper);

    [4.5, 8.2, 11.5].forEach((r, idx) => {
      const ringGeo = new THREE.RingGeometry(r - 0.025, r, 72);
      const ringMat = new THREE.MeshBasicMaterial({
        color: idx === 1 ? 0xf59e0b : 0x38bdf8,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: idx === 1 ? 0.2 : 0.13,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = -0.015;
      groundGroup.add(ring);
    });
    scene.add(groundGroup);

    const proj = computeProjection(b.RAW.geojson);
    const muniItems = [];
    const pickables = [];
    const meshGroup = new THREE.Group();
    const towerGroup = new THREE.Group();
    const beaconGroup = new THREE.Group();
    scene.add(meshGroup);
    scene.add(towerGroup);
    scene.add(beaconGroup);

    // Build 39 Extruded Municipality Prisms
    b.RAW.geojson.features.forEach((feat) => {
      const code = feat.properties.jis_code;
      const polygons = feat.geometry.type === "Polygon" ? [feat.geometry.coordinates] : feat.geometry.coordinates;

      const group = new THREE.Group();
      const mat = new THREE.MeshPhongMaterial({
        color: 0x3b82f6,
        emissive: 0x000000,
        emissiveIntensity: 0.35,
        specular: 0x334155,
        shininess: 42,
        transparent: true,
        opacity: 0.94,
      });

      const subMeshes = [];
      const outlines = [];

      polygons.forEach((poly) => {
        const shape = new THREE.Shape();
        poly[0].forEach(([lon, lat], i) => {
          const [sx, sy] = proj.toShapeXY(lon, lat);
          if (i === 0) shape.moveTo(sx, sy);
          else shape.lineTo(sx, sy);
        });
        for (let hi = 1; hi < poly.length; hi++) {
          const hole = new THREE.Path();
          poly[hi].forEach(([lon, lat], i) => {
            const [sx, sy] = proj.toShapeXY(lon, lat);
            if (i === 0) hole.moveTo(sx, sy);
            else hole.lineTo(sx, sy);
          });
          shape.holes.push(hole);
        }

        const geo = new THREE.ExtrudeGeometry(shape, {
          depth: 1.0,
          bevelEnabled: false,
          curveSegments: 1,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.userData = { jis_code: code };
        group.add(mesh);
        subMeshes.push(mesh);
        pickables.push(mesh);

        // Top outline loop
        const pts = poly[0].map(([lon, lat]) => {
          const [wx, wz] = proj.toWorldXZ(lon, lat);
          return new THREE.Vector3(wx, 0, wz);
        });
        const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
        const lineMat = new THREE.LineBasicMaterial({
          color: 0x0f172a,
          transparent: true,
          opacity: 0.85,
        });
        const line = new THREE.LineLoop(lineGeo, lineMat);
        group.add(line);
        outlines.push(line);
      });

      // Twin Towers at Centroid (Cyan Human vs Gold Deer)
      const [cx, cz] = proj.toWorldXZ(feat.properties.centroid_lon, feat.properties.centroid_lat);
      const cylGeo = new THREE.CylinderGeometry(0.075, 0.088, 1.0, 6);
      cylGeo.translate(0, 0.5, 0);

      const humMat = new THREE.MeshPhongMaterial({
        color: 0x38bdf8,
        emissive: 0x0284c7,
        emissiveIntensity: 0.45,
        transparent: true,
        opacity: 0.9,
      });
      const humTower = new THREE.Mesh(cylGeo, humMat);
      humTower.position.set(cx - 0.095, 0, cz);
      humTower.userData = { jis_code: code };
      towerGroup.add(humTower);
      pickables.push(humTower);

      const deerMat = new THREE.MeshPhongMaterial({
        color: 0xfbbf24,
        emissive: 0xd97706,
        emissiveIntensity: 0.5,
        transparent: true,
        opacity: 0.92,
      });
      const deerTower = new THREE.Mesh(cylGeo, deerMat);
      deerTower.position.set(cx + 0.095, 0, cz);
      deerTower.userData = { jis_code: code };
      towerGroup.add(deerTower);
      pickables.push(deerTower);

      scene.add(group);
      muniItems.push({
        code,
        cx,
        cz,
        group,
        mat,
        subMeshes,
        outlines,
        humTower,
        deerTower,
        curH: 0.2,
        targetH: 0.5,
        curColor: new THREE.Color("#3b82f6"),
        targetColor: new THREE.Color("#3b82f6"),
        curHumH: 0.1,
        targetHumH: 0.4,
        curDeerH: 0.1,
        targetDeerH: 0.4,
        isSensitive: false,
      });
    });

    // Build 171 5km Projected Mesh Overlay (floating translucent cells)
    const meshBoxes = [];
    if (b.RAW.mesh && b.RAW.mesh.features) {
      b.RAW.mesh.features.forEach((feat) => {
        const p = feat.properties;
        const d = p.projected_density_km2;
        const colorHex = p.is_nara_park
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

        const ring = feat.geometry.coordinates[0];
        const shape = new THREE.Shape();
        ring.forEach(([lon, lat], i) => {
          const [sx, sy] = proj.toShapeXY(lon, lat);
          if (i === 0) shape.moveTo(sx, sy);
          else shape.lineTo(sx, sy);
        });
        const hVal = d == null ? 0.06 : Math.max(0.12, d / 9.5);
        const geo = new THREE.ExtrudeGeometry(shape, { depth: hVal, bevelEnabled: false });
        const mat = new THREE.MeshBasicMaterial({
          color: colorHex,
          transparent: true,
          opacity: d == null ? 0.14 : 0.34,
          depthWrite: false,
        });
        const m = new THREE.Mesh(geo, mat);
        m.rotation.x = -Math.PI / 2;
        m.position.y = 3.6; // float cleanly as a tactical holo-grid above terrain
        meshGroup.add(m);

        const edgePts = ring.map(([lon, lat]) => {
          const [wx, wz] = proj.toWorldXZ(lon, lat);
          return new THREE.Vector3(wx, 3.6 + hVal, wz);
        });
        const edge = new THREE.LineLoop(
          new THREE.BufferGeometry().setFromPoints(edgePts),
          new THREE.LineBasicMaterial({ color: colorHex, transparent: true, opacity: 0.65 })
        );
        meshGroup.add(edge);
        meshBoxes.push(m);
      });
    }

    // Build Special Zone Beacons (Nara Park & Odaigahara)
    function makeBeacon(lon, lat, colorHex, label) {
      const [bx, bz] = proj.toWorldXZ(lon, lat);
      const g = new THREE.Group();
      g.position.set(bx, 0, bz);

      const beamGeo = new THREE.CylinderGeometry(0.035, 0.11, 5.2, 16);
      beamGeo.translate(0, 2.6, 0);
      const beamMat = new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
      });
      const beam = new THREE.Mesh(beamGeo, beamMat);
      g.add(beam);

      const ringGeo = new THREE.RingGeometry(0.22, 0.32, 32);
      const ringMat = new THREE.MeshBasicMaterial({
        color: colorHex,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 4.6;
      g.add(ring);

      const orbGeo = new THREE.SphereGeometry(0.14, 16, 16);
      const orbMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const orb = new THREE.Mesh(orbGeo, orbMat);
      orb.position.y = 4.6;
      g.add(orb);

      beaconGroup.add(g);
      return { group: g, bx, bz, ring, orb, label };
    }
    const beacons = [
      makeBeacon(135.843, 34.6851, "#ef4444", "⛩️ 奈良公園 1,687頭(A)"),
      makeBeacon(136.108, 34.184, "#10b981", "⛰️ 大台ヶ原 特別管理域"),
    ];

    // Custom Orbit Camera Controller
    const camState = {
      theta: 0.34,      // horizontal angle (0 = looking from South toward North)
      phi: 0.78,        // polar angle from Y axis (0.25 top-down .. 1.38 low)
      radius: 20.6,
      tx: 0,
      ty: 0.95,
      tz: 0.45,
    };
    const camGoal = { ...camState, active: false };

    function setCameraPreset(preset) {
      camGoal.active = true;
      if (preset === "overview") {
        Object.assign(camGoal, { theta: 0.34, phi: 0.78, radius: 20.6, tx: 0, ty: 0.95, tz: 0.45 });
      } else if (preset === "yoshino") {
        Object.assign(camGoal, { theta: -0.45, phi: 1.14, radius: 13.8, tx: 0.4, ty: 1.3, tz: 3.1 });
      } else if (preset === "basin") {
        Object.assign(camGoal, { theta: 0.78, phi: 1.04, radius: 13.5, tx: -1.1, ty: 1.0, tz: -3.6 });
      } else if (preset === "park") {
        const naraItem = muniItems.find((x) => x.code === "29201");
        const tx = naraItem ? naraItem.cx : 0.4;
        const tz = naraItem ? naraItem.cz : -3.8;
        Object.assign(camGoal, { theta: 0.35, phi: 0.92, radius: 9.2, tx, ty: 1.0, tz });
      }
    }

    function focusMunicipalityCamera(code) {
      const item = muniItems.find((x) => x.code === code);
      if (!item) return;
      camGoal.active = true;
      camGoal.tx = item.cx;
      camGoal.tz = item.cz;
      camGoal.ty = Math.min(2.2, item.targetH * 0.55);
      camGoal.radius = Math.min(camState.radius, 11.2);
    }

    function updateCameraPosition() {
      const sinPhi = Math.sin(camState.phi);
      camera.position.set(
        camState.tx + camState.radius * sinPhi * Math.sin(camState.theta),
        camState.ty + camState.radius * Math.cos(camState.phi),
        camState.tz + camState.radius * sinPhi * Math.cos(camState.theta)
      );
      camera.lookAt(camState.tx, camState.ty, camState.tz);
    }

    // Mouse / Touch Interaction + Raycasting
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let dragging = false;
    let panMode = false;
    let dragDist = 0;
    let lastX = 0;
    let lastY = 0;

    const tooltipEl = document.getElementById("tooltip3d");
    const labelsEl = document.getElementById("labels3dOverlay");

    host.addEventListener("contextmenu", (e) => e.preventDefault());

    host.addEventListener("pointerdown", (e) => {
      dragging = true;
      panMode = e.button === 2 || e.shiftKey;
      dragDist = 0;
      lastX = e.clientX;
      lastY = e.clientY;
      camGoal.active = false;
      host.setPointerCapture && host.setPointerCapture(e.pointerId);
    });

    host.addEventListener("pointermove", (e) => {
      const r = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;

      if (dragging) {
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        dragDist += Math.hypot(dx, dy);
        lastX = e.clientX;
        lastY = e.clientY;
        if (panMode) {
          const panSpeed = camState.radius * 0.0014;
          const cosT = Math.cos(camState.theta);
          const sinT = Math.sin(camState.theta);
          camState.tx -= (dx * cosT + dy * sinT) * panSpeed;
          camState.tz -= (-dx * sinT + dy * cosT) * panSpeed;
        } else {
          camState.theta -= dx * 0.0075;
          camState.phi = Math.max(0.24, Math.min(1.42, camState.phi - dy * 0.0065));
        }
        return;
      }

      // Hover raycast
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(pickables, false);
      if (hits.length > 0) {
        const code = hits[0].object.userData.jis_code;
        Map3D.hoveredCode = code;
        host.style.cursor = "pointer";
        show3DTooltip(code, e.clientX - r.left, e.clientY - r.top);
      } else {
        Map3D.hoveredCode = null;
        host.style.cursor = "grab";
        if (tooltipEl) tooltipEl.classList.add("hidden");
      }
    });

    host.addEventListener("pointerup", (e) => {
      const wasClick = dragging && dragDist < 6;
      dragging = false;
      if (wasClick) {
        const r = renderer.domElement.getBoundingClientRect();
        pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
        pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);
        const hits = raycaster.intersectObjects(pickables, false);
        if (hits.length > 0 && b) {
          const code = hits[0].object.userData.jis_code;
          b.selectMunicipality(code);
        }
      }
    });

    host.addEventListener("pointerleave", () => {
      dragging = false;
      Map3D.hoveredCode = null;
      if (tooltipEl) tooltipEl.classList.add("hidden");
    });

    host.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        camGoal.active = false;
        camState.radius = Math.max(5.5, Math.min(34, camState.radius * (1 + e.deltaY * 0.001)));
      },
      { passive: false }
    );

    host.addEventListener("dblclick", () => setCameraPreset("overview"));

    function show3DTooltip(code, px, py) {
      if (!tooltipEl || !b) return;
      const state = b.getState();
      const m = state.computedByCode[code];
      if (!m) return;
      const t = b.TIER_META[m.active_dom_code];
      const deerTxt = m.active_deer == null ? "未判定（区分D）" : `${b.fmtInt(m.active_deer)} 頭`;
      const ratioTxt = m.active_ratio_pct == null ? "算出除外" : `${b.fmtDec(m.active_ratio_pct, 1)}%`;
      tooltipEl.innerHTML = `
        <div style="font-weight:800;font-size:13px;margin-bottom:3px">${m.name_ja} <span style="color:var(--text-muted);font-weight:500">(${m.active_grade})</span></div>
        <div style="color:${t.color};font-weight:700;margin-bottom:5px">${t.label}</div>
        <div>👥 人間人口: <strong class="mono">${b.fmtInt(m.human_pop)} 人</strong></div>
        <div>🦌 鹿推定数: <strong class="mono">${deerTxt}</strong></div>
        <div>⚔️ 鹿人比率: <strong class="mono">${ratioTxt}</strong></div>
        <div>🌲 森林率: <strong class="mono">${m.forest_ratio_pct}%</strong></div>
      `;
      tooltipEl.classList.remove("hidden");
      const wrapW = host.clientWidth || 700;
      const leftPos = px + 225 > wrapW ? Math.max(8, px - 215) : px + 14;
      const topPos = Math.max(8, py - 24);
      tooltipEl.style.left = `${leftPos}px`;
      tooltipEl.style.top = `${topPos}px`;
    }

    // Floating 3D HTML Labels
    const SPARSE_CORE_CODES = new Set([
      "29201", "29204", "29205", "29207", "29212",
      "29385", "29446", "29447", "29449", "29450", "29451", "29452", "29453",
    ]);
    const projVec = new THREE.Vector3();

    function updateProjectedLabels(state) {
      if (!labelsEl) return;
      if (!state.showLabels) {
        labelsEl.innerHTML = "";
        return;
      }
      const wNow = renderer.domElement.clientWidth;
      const hNow = renderer.domElement.clientHeight;
      if (!wNow || !hNow) return;

      const htmlParts = [];
      const isNarrow = window.innerWidth <= 768;

      muniItems.forEach((item) => {
        const isSel = state.selectedCode === item.code;
        if (!isSel && !SPARSE_CORE_CODES.has(item.code)) return;
        const m = state.computedByCode[item.code];
        if (!m) return;
        if (isNarrow && !isSel && m.active_dom_code !== "EMPIRE" && item.code !== "29201") return;

        const topOffset = Map3D.showTowers ? Math.max(item.curHumH, item.curDeerH) + 0.16 : 0.12;
        projVec.set(item.cx, item.curH + topOffset, item.cz).project(camera);
        if (projVec.z < -1 || projVec.z > 1) return;
        const x = (projVec.x * 0.5 + 0.5) * wNow;
        const y = (-projVec.y * 0.5 + 0.5) * hNow;
        if (x < 24 || x > wNow - 24 || y < 24 || y > hNow - 24) return;

        const cls = isSel
          ? "label-3d-tag is-selected"
          : m.active_dom_code === "EMPIRE"
          ? "label-3d-tag is-empire"
          : "label-3d-tag";
        const suffix = isSel && m.active_ratio_pct != null ? ` ${b.fmtDec(m.active_ratio_pct, 0)}%` : "";
        htmlParts.push(`<div class="${cls}" style="left:${x.toFixed(1)}px;top:${y.toFixed(1)}px">${m.name_ja}${suffix}</div>`);
      });

      if (state.showZones && !isNarrow) {
        beacons.forEach((bk) => {
          projVec.set(bk.bx, 4.9, bk.bz).project(camera);
          if (projVec.z < -1 || projVec.z > 1) return;
          const x = (projVec.x * 0.5 + 0.5) * wNow;
          const y = (-projVec.y * 0.5 + 0.5) * hNow;
          if (x < 30 || x > wNow - 30 || y < 20 || y > hNow - 20) return;
          htmlParts.push(`<div class="label-3d-tag is-beacon" style="left:${x.toFixed(1)}px;top:${y.toFixed(1)}px">${bk.label}</div>`);
        });
      }

      labelsEl.innerHTML = htmlParts.join("");
    }

    // Sync state from main app.js
    function syncState(state) {
      if (!b) return;
      meshGroup.visible = !!state.showMesh;
      beaconGroup.visible = !!state.showZones;
      towerGroup.visible = Map3D.showTowers;

      muniItems.forEach((item) => {
        const m = state.computedByCode[item.code];
        if (!m) return;
        const hex = computeMunicipalityColor(m, state, b);
        item.targetColor.copy(hexToThreeColor(hex));
        item.targetH = computeMunicipalityHeight(m, state);
        item.isSensitive = !!(state.showSensitive && m.tier_shift_sensitive);

        item.targetHumH = Math.max(0.08, Math.sqrt(m.human_pop || 0) / 245.0 * Math.min(1.6, Map3D.heightScale));
        if (m.active_deer == null) {
          item.deerTower.visible = false;
          item.targetDeerH = 0.01;
        } else {
          item.deerTower.visible = Map3D.showTowers;
          item.targetDeerH = Math.max(0.08, Math.sqrt(m.active_deer) / 48.0 * Math.min(1.6, Map3D.heightScale));
        }

        const isSel = state.selectedCode === item.code;
        const isHov = Map3D.hoveredCode === item.code;
        item.mat.emissive.copy(
          isSel ? hexToThreeColor("#fde68a") : isHov ? hexToThreeColor("#ffffff") : item.isSensitive ? hexToThreeColor("#f43f5e") : hexToThreeColor("#000000")
        );
        item.mat.emissiveIntensity = isSel ? 0.36 : isHov ? 0.25 : item.isSensitive ? 0.38 : 0.0;

        const strokeColor = isSel ? 0xffffff : item.isSensitive ? 0xf43f5e : 0x0b1220;
        item.outlines.forEach((ln) => ln.material.color.setHex(strokeColor));
      });
    }

    // Theme adaptation
    function onThemeChange() {
      const mode = getComputedStyle(document.documentElement).getPropertyValue("--mode").trim();
      const isLight = mode === "light";
      gridHelper.material.opacity = isLight ? 0.22 : 0.38;
      hemiLight.intensity = isLight ? 1.15 : 0.95;
    }

    // Animation loop
    let animTick = 0;
    function animate() {
      requestAnimationFrame(animate);
      animTick += 0.025;

      // Smooth camera presets
      if (camGoal.active) {
        const k = 0.12;
        camState.theta += (camGoal.theta - camState.theta) * k;
        camState.phi += (camGoal.phi - camState.phi) * k;
        camState.radius += (camGoal.radius - camState.radius) * k;
        camState.tx += (camGoal.tx - camState.tx) * k;
        camState.ty += (camGoal.ty - camState.ty) * k;
        camState.tz += (camGoal.tz - camState.tz) * k;
        if (Math.abs(camGoal.theta - camState.theta) < 0.002 && Math.abs(camGoal.radius - camState.radius) < 0.03) {
          camGoal.active = false;
        }
      } else if (Map3D.autoRotate && !dragging) {
        camState.theta += 0.0032;
      }

      updateCameraPosition();

      const curState = b.getState();
      // Smooth height & color morphing
      muniItems.forEach((item) => {
        item.curH += (item.targetH - item.curH) * 0.16;
        item.curColor.lerp(item.targetColor, 0.18);
        item.mat.color.copy(item.curColor);

        const isSel = curState.selectedCode === item.code;
        const isHov = Map3D.hoveredCode === item.code;
        item.mat.emissive.copy(
          isSel ? hexToThreeColor("#fde68a") : isHov ? hexToThreeColor("#ffffff") : item.isSensitive ? hexToThreeColor("#f43f5e") : hexToThreeColor("#000000")
        );
        item.mat.emissiveIntensity = isSel ? 0.35 : isHov ? 0.22 : item.isSensitive ? 0.35 : 0.0;

        item.subMeshes.forEach((sm) => {
          sm.scale.z = item.curH; // Because mesh is rotated -90deg X, local Z = world Y height!
        });
        item.outlines.forEach((ln) => {
          ln.position.y = item.curH + 0.015;
        });

        item.curHumH += (item.targetHumH - item.curHumH) * 0.16;
        item.humTower.position.y = item.curH;
        item.humTower.scale.y = item.curHumH;

        item.curDeerH += (item.targetDeerH - item.curDeerH) * 0.16;
        item.deerTower.position.y = item.curH;
        item.deerTower.scale.y = item.curDeerH;
      });

      // Animate special zone beacons
      beacons.forEach((bk, idx) => {
        const s = 1.0 + Math.sin(animTick * 2.1 + idx) * 0.24;
        bk.ring.scale.set(s, s, 1);
        bk.orb.position.y = 4.6 + Math.sin(animTick * 2.1 + idx) * 0.14;
      });

      updateProjectedLabels(curState);
      renderer.render(scene, camera);
    }

    function resize() {
      const r = host.getBoundingClientRect();
      const nw = r.width || host.clientWidth;
      const nh = r.height || host.clientHeight;
      if (nw > 40 && nh > 40) {
        camera.aspect = nw / nh;
        camera.updateProjectionMatrix();
        renderer.setSize(nw, nh);
      }
    }

    animate();

    return {
      engine: "webgl",
      sync: syncState,
      setCameraPreset,
      focusMunicipalityCamera,
      onThemeChange,
      resize,
    };
  }

  // =========================================================================
  // CANVAS 2.5D FALLBACK (If WebGL context is unavailable)
  // =========================================================================
  function initCanvas25DFallback(host, b) {
    const canvas = document.createElement("canvas");
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    host.innerHTML = "";
    host.appendChild(canvas);
    const ctx = canvas.getContext("2d");
    const proj = computeProjection(b.RAW.geojson);

    let yaw = 0.35;
    let pitch = 0.65;
    let zoom = 1.0;
    let dragging = false;
    let lastX = 0, lastY = 0, dragDist = 0;
    const hitPolys = [];

    const polys = b.RAW.geojson.features.map((feat) => ({
      code: feat.properties.jis_code,
      rings: feat.geometry.coordinates[0].map(([lon, lat]) => proj.toWorldXZ(lon, lat)),
      cx: proj.toWorldXZ(feat.properties.centroid_lon, feat.properties.centroid_lat)[0],
      cz: proj.toWorldXZ(feat.properties.centroid_lon, feat.properties.centroid_lat)[1],
      curH: 0.4,
      targetH: 0.4,
      color: "#3b82f6",
    }));

    function projectPt(x, y, z, w, h) {
      const cy = Math.cos(yaw), sy = Math.sin(yaw);
      const rx = x * cy - z * sy;
      const rz = x * sy + z * cy;
      const sc = Math.min(w, h) * 0.046 * zoom;
      return [w / 2 + rx * sc, h * 0.56 + (rz * Math.sin(pitch) - y * Math.cos(pitch)) * sc * 1.15, rz];
    }

    host.addEventListener("pointerdown", (e) => { dragging = true; lastX = e.clientX; lastY = e.clientY; dragDist = 0; });
    host.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      dragDist += Math.hypot(dx, dy);
      lastX = e.clientX; lastY = e.clientY;
      yaw += dx * 0.008;
      pitch = Math.max(0.28, Math.min(1.25, pitch + dy * 0.006));
    });
    host.addEventListener("pointerup", () => { dragging = false; });

    function draw() {
      requestAnimationFrame(draw);
      const r = host.getBoundingClientRect();
      const w = Math.max(300, r.width), h = Math.max(300, r.height);
      if (canvas.width !== Math.round(w) || canvas.height !== Math.round(h)) {
        canvas.width = Math.round(w);
        canvas.height = Math.round(h);
      }
      ctx.clearRect(0, 0, w, h);
      const state = b.getState();
      polys.forEach((p) => {
        const m = state.computedByCode[p.code];
        if (!m) return;
        p.targetH = computeMunicipalityHeight(m, state);
        p.curH += (p.targetH - p.curH) * 0.16;
        p.color = computeMunicipalityColor(m, state, b);
        p.depth = projectPt(p.cx, 0, p.cz, w, h)[2];
      });
      polys.sort((a, b2) => a.depth - b2.depth);
      polys.forEach((p) => {
        const topPts = p.rings.map(([x, z]) => projectPt(x, p.curH, z, w, h));
        ctx.beginPath();
        topPts.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
        ctx.closePath();
        ctx.fillStyle = p.color;
        ctx.fill();
        ctx.strokeStyle = state.selectedCode === p.code ? "#ffffff" : "#0b1220";
        ctx.lineWidth = state.selectedCode === p.code ? 2.4 : 1.0;
        ctx.stroke();
      });
    }
    draw();

    return {
      engine: "canvas25d",
      sync() {},
      setCameraPreset(preset) {
        if (preset === "overview") { yaw = 0.35; pitch = 0.65; zoom = 1.0; }
        else if (preset === "yoshino") { yaw = -0.45; pitch = 0.42; zoom = 1.3; }
        else if (preset === "basin") { yaw = 0.78; pitch = 0.5; zoom = 1.25; }
        else if (preset === "park") { yaw = 0.3; pitch = 0.55; zoom = 1.65; }
      },
      focusMunicipalityCamera() {},
      onThemeChange() {},
      resize() {},
    };
  }

  // =========================================================================
  // 3D MULTI-AXIS CORRELATION CUBE (Analysis Hub Tab 1)
  // =========================================================================
  function initCorrelationCube(b) {
    const wrap = document.getElementById("chart3dCube");
    if (!wrap || typeof THREE === "undefined" || !b) return null;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch (e) {
      wrap.innerHTML = "<div style='padding:24px;color:var(--text-muted)'>WebGL非対応環境のため3Dキューブを省略しました（下方の2Dグラフをご利用ください）。</div>";
      return null;
    }

    const rect = wrap.getBoundingClientRect();
    const w = Math.max(320, rect.width || 680);
    const h = Math.max(280, rect.height || 390);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h);
    wrap.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 100);
    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const dl = new THREE.DirectionalLight(0xffffff, 0.9);
    dl.position.set(8, 14, 10);
    scene.add(dl);

    // Wireframe bounding cube: X (-3.2..3.2 = Forest 0..100%), Y (-2.4..2.4 = Log Ratio 0.5..2000%), Z (-3.2..3.2 = PopChange -25..+5%)
    const boxGeo = new THREE.BoxGeometry(6.4, 4.8, 6.4);
    const edges = new THREE.EdgesGeometry(boxGeo);
    const boxLines = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: 0x64748b, transparent: true, opacity: 0.45 })
    );
    scene.add(boxLines);

    // 100% Deer-Human Ratio Threshold Plane (Deer Empire threshold)
    const logMin = Math.log10(0.5);
    const logMax = Math.log10(2000);
    const ratioToY = (rPct) => {
      const lv = Math.log10(Math.max(0.5, Math.min(2000, rPct)));
      return ((lv - logMin) / (logMax - logMin) - 0.5) * 4.8;
    };
    const empireY = ratioToY(100);
    const planeGeo = new THREE.PlaneGeometry(6.4, 6.4);
    const planeMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
    });
    const empirePlane = new THREE.Mesh(planeGeo, planeMat);
    empirePlane.rotation.x = -Math.PI / 2;
    empirePlane.position.y = empireY;
    scene.add(empirePlane);

    const planeBorder = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-3.2, empireY, -3.2),
        new THREE.Vector3(3.2, empireY, -3.2),
        new THREE.Vector3(3.2, empireY, 3.2),
        new THREE.Vector3(-3.2, empireY, 3.2),
      ]),
      new THREE.LineBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.75 })
    );
    scene.add(planeBorder);

    // Data spheres for valid municipalities (excluding Grade D)
    const spheres = [];
    const sphereGeo = new THREE.SphereGeometry(1, 20, 16);
    const valid = b.RAW.municipalities.filter((m) => m.evidence_grade !== "D");

    valid.forEach((m) => {
      const x = (m.forest_ratio_pct / 100 - 0.5) * 6.0;
      const y = ratioToY(m.deer_human_ratio_pct);
      const popClamped = Math.max(-25, Math.min(5, m.pop_change_pct_2020_2026));
      const z = ((popClamped + 25) / 30 - 0.5) * 6.0;
      const rad = 0.09 + Math.cbrt(m.deer_std || 100) / 115.0;

      const mat = new THREE.MeshPhongMaterial({
        color: m.dominance_color,
        emissive: m.dominance_color,
        emissiveIntensity: 0.25,
        shininess: 60,
      });
      const sp = new THREE.Mesh(sphereGeo, mat);
      sp.position.set(x, y, z);
      sp.scale.setScalar(rad);
      sp.userData = { jis_code: m.jis_code, muni: m };
      scene.add(sp);
      spheres.push(sp);
    });

    const cubeCam = { theta: 0.65, phi: 1.05, radius: 11.2, autoSpin: true };
    let dragging = false, lastX = 0, lastY = 0, dragDist = 0;
    const tip = document.getElementById("cube3dTooltip");
    const ray = new THREE.Raycaster();
    const ptr = new THREE.Vector2();

    wrap.addEventListener("pointerdown", (e) => {
      if (e.target.closest("button")) return;
      dragging = true;
      cubeCam.autoSpin = false;
      dragDist = 0;
      lastX = e.clientX;
      lastY = e.clientY;
    });
    wrap.addEventListener("pointermove", (e) => {
      const r = renderer.domElement.getBoundingClientRect();
      ptr.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      ptr.y = -((e.clientY - r.top) / r.height) * 2 + 1;
      if (dragging) {
        const dx = e.clientX - lastX, dy = e.clientY - lastY;
        dragDist += Math.hypot(dx, dy);
        lastX = e.clientX;
        lastY = e.clientY;
        cubeCam.theta -= dx * 0.008;
        cubeCam.phi = Math.max(0.25, Math.min(1.45, cubeCam.phi - dy * 0.007));
        return;
      }
      ray.setFromCamera(ptr, camera);
      const hits = ray.intersectObjects(spheres, false);
      if (hits.length > 0 && tip) {
        const m = hits[0].object.userData.muni;
        wrap.style.cursor = "pointer";
        tip.innerHTML = `<strong>${m.name_ja}</strong> (${m.dominance_label})<br>森林率: <strong class="mono">${m.forest_ratio_pct}%</strong> | 人口増減: <strong class="mono">${m.pop_change_pct_2020_2026}%</strong><br>鹿人比率: <strong class="mono">${m.deer_human_ratio_pct}%</strong> | 鹿推定: <strong class="mono">${b.fmtInt(m.deer_std)}頭</strong>`;
        tip.classList.remove("hidden");
        tip.style.left = `${Math.min(r.width - 230, Math.max(8, e.clientX - r.left + 12))}px`;
        tip.style.top = `${Math.max(8, e.clientY - r.top - 22)}px`;
      } else {
        wrap.style.cursor = "grab";
        if (tip) tip.classList.add("hidden");
      }
    });
    wrap.addEventListener("pointerup", (e) => {
      const isClick = dragging && dragDist < 6;
      dragging = false;
      if (isClick) {
        const r = renderer.domElement.getBoundingClientRect();
        ptr.x = ((e.clientX - r.left) / r.width) * 2 - 1;
        ptr.y = -((e.clientY - r.top) / r.height) * 2 + 1;
        ray.setFromCamera(ptr, camera);
        const hits = ray.intersectObjects(spheres, false);
        if (hits.length > 0) {
          b.selectMunicipality(hits[0].object.userData.jis_code);
        }
      }
    });
    wrap.addEventListener("pointerleave", () => {
      dragging = false;
      if (tip) tip.classList.add("hidden");
    });

    const resetBtn = document.getElementById("btnResetCube");
    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        Object.assign(cubeCam, { theta: 0.65, phi: 1.05, radius: 11.2, autoSpin: true });
      });
    }

    function animateCube() {
      requestAnimationFrame(animateCube);
      if (cubeCam.autoSpin && !dragging) cubeCam.theta += 0.0025;
      camera.position.set(
        cubeCam.radius * Math.sin(cubeCam.phi) * Math.sin(cubeCam.theta),
        cubeCam.radius * Math.cos(cubeCam.phi),
        cubeCam.radius * Math.sin(cubeCam.phi) * Math.cos(cubeCam.theta)
      );
      camera.lookAt(0, 0, 0);

      const selCode = b.getState().selectedCode;
      spheres.forEach((sp) => {
        const isSel = sp.userData.jis_code === selCode;
        sp.material.emissiveIntensity = isSel ? 0.95 : 0.25;
      });
      renderer.render(scene, camera);
    }
    animateCube();

    return {
      resize() {
        const r = wrap.getBoundingClientRect();
        if (r.width > 40 && r.height > 40) {
          camera.aspect = r.width / r.height;
          camera.updateProjectionMatrix();
          renderer.setSize(r.width, r.height);
        }
      },
    };
  }

  // =========================================================================
  // BOOTSTRAP & UI WIRING
  // =========================================================================
  function boot3D() {
    const b = bridge();
    const host = document.getElementById("map3dCanvas");
    if (!b || !host) return;

    let ctrl = null;
    if (typeof THREE !== "undefined") {
      try {
        ctrl = initWebGLMap(host, b);
      } catch (err) {
        console.warn("WebGL unavailable, falling back to Canvas 2.5D:", err);
        ctrl = initCanvas25DFallback(host, b);
      }
    } else {
      ctrl = initCanvas25DFallback(host, b);
    }

    Map3D.initialized = true;
    Map3D.engine = ctrl.engine;
    const engBadge = document.getElementById("engine3dBadge");
    if (engBadge) {
      engBadge.textContent = ctrl.engine === "webgl" ? "WebGL 3D (Three.js)" : "Canvas 2.5D Fallback";
    }

    let cubeCtrl = initCorrelationCube(b);

    // Wire 3D HUD Height Pills
    document.querySelectorAll("#hudHeightMetric .hud-pill").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#hudHeightMetric .hud-pill").forEach((p) => p.classList.remove("active"));
        btn.classList.add("active");
        Map3D.heightMode = btn.dataset.hmetric;
        ctrl.sync(b.getState());
      });
    });

    // Wire 3D Camera Presets
    document.querySelectorAll("#hudCameraPresets .hud-pill[data-cam]").forEach((btn) => {
      btn.addEventListener("click", () => {
        ctrl.setCameraPreset(btn.dataset.cam);
      });
    });

    const rotBtn = document.getElementById("btnAutoRotate3d");
    if (rotBtn) {
      rotBtn.addEventListener("click", () => {
        Map3D.autoRotate = !Map3D.autoRotate;
        rotBtn.classList.toggle("active", Map3D.autoRotate);
      });
    }

    const towerBtn = document.getElementById("btnToggleTowers");
    if (towerBtn) {
      towerBtn.addEventListener("click", () => {
        Map3D.showTowers = !Map3D.showTowers;
        towerBtn.classList.toggle("active", Map3D.showTowers);
        ctrl.sync(b.getState());
      });
    }

    const demoBtn = document.getElementById("btnFlipDemo3d");
    if (demoBtn) {
      demoBtn.addEventListener("click", () => {
        Map3D.demoFlipState = 1 - Map3D.demoFlipState;
        const nextMetric = Map3D.demoFlipState === 1 ? "human" : "ratio";
        const nextCam = Map3D.demoFlipState === 1 ? "basin" : "yoshino";
        Map3D.heightMode = nextMetric;
        document.querySelectorAll("#hudHeightMetric .hud-pill").forEach((p) => {
          p.classList.toggle("active", p.dataset.hmetric === nextMetric);
        });
        demoBtn.textContent =
          Map3D.demoFlipState === 1 ? "⚡ 反転中: 人間盆地 → 次で鹿帝国へ" : "⚡ 人vs鹿 3D反転デモ";
        ctrl.setCameraPreset(nextCam);
        ctrl.sync(b.getState());
      });
    }

    const scaleSlider = document.getElementById("sliderHeight3d");
    const scaleLabel = document.getElementById("valHeight3d");
    if (scaleSlider) {
      scaleSlider.addEventListener("input", () => {
        Map3D.heightScale = parseFloat(scaleSlider.value);
        if (scaleLabel) scaleLabel.textContent = `${Map3D.heightScale.toFixed(1)}x`;
        ctrl.sync(b.getState());
      });
    }

    Map3D.sync = (st) => ctrl.sync(st);
    Map3D.setCameraPreset = (preset) => ctrl.setCameraPreset(preset);
    Map3D.focusMunicipality = (code) => ctrl.focusMunicipalityCamera(code);
    Map3D.onThemeChange = () => ctrl.onThemeChange();
    Map3D.resize = () => {
      ctrl.resize();
      if (cubeCtrl) cubeCtrl.resize();
    };

    window.addEventListener("resize", Map3D.resize);
    ctrl.sync(b.getState());
    ctrl.onThemeChange();
  }

  window.Map3D = Map3D;
  document.addEventListener("DOMContentLoaded", () => {
    setTimeout(boot3D, 0);
  });
})();
