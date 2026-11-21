(function () {
  "use strict";
  const THEMES = [
    { id: "command", name: "司令室", c1: "#f59e0b", c2: "#0f1623", dark: true },
    { id: "paper", name: "和紙", c1: "#c0392b", c2: "#f4efe4", dark: false },
    { id: "snow", name: "スノー", c1: "#0e7ac8", c2: "#eef4fb", dark: false },
    { id: "forest", name: "深緑", c1: "#a3e635", c2: "#0e1c16", dark: true },
    { id: "neon", name: "ネオン", c1: "#22d3ee", c2: "#d946ef", dark: true },
  ];
  const root = document.documentElement;
  const box = document.getElementById("themeSwitch");
  if (!box) return;

  const nameEl = document.createElement("span");
  nameEl.className = "theme-name";

  function current() {
    const t = root.getAttribute("data-theme");
    return THEMES.find((x) => x.id === t) || THEMES[0];
  }

  function refreshCharts() {
    if (typeof Chart === "undefined") return;
    const cs = getComputedStyle(root);
    const text = cs.getPropertyValue("--chart-text").trim();
    const grid = cs.getPropertyValue("--chart-grid").trim();
    Chart.defaults.color = text;
    Chart.defaults.borderColor = grid;
    Object.values(Chart.instances || {}).forEach((ch) => {
      const o = ch.options;
      if (o.plugins && o.plugins.legend && o.plugins.legend.labels) o.plugins.legend.labels.color = text;
      Object.values(o.scales || {}).forEach((sc) => {
        if (sc.ticks) sc.ticks.color = text;
        if (sc.grid) sc.grid.color = grid;
        if (sc.title) sc.title.color = text;
      });
      ch.update("none");
    });
  }

  function apply(id, persist) {
    root.setAttribute("data-theme", id);
    if (persist) { try { localStorage.setItem("deer-theme", id); } catch (e) {} }
    const t = current();
    root.style.colorScheme = t.dark ? "dark" : "light";
    box.querySelectorAll(".theme-dot").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.id === id)));
    nameEl.textContent = t.name;
    // Map base tiles: dark filter on dark themes, pale on light themes (unless user chose "off")
    if (window.__setTileMode) window.__setTileMode(t.dark ? "dark" : "light");
    refreshCharts();
  }

  THEMES.forEach((t) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "theme-dot";
    b.dataset.id = t.id;
    b.setAttribute("role", "radio");
    b.setAttribute("aria-label", t.name + " テーマ");
    b.title = t.name;
    b.style.setProperty("--c1", t.c1);
    b.style.setProperty("--c2", t.c2);
    b.addEventListener("click", () => apply(t.id, true));
    box.appendChild(b);
  });
  box.appendChild(nameEl);

  // app.js registers its DOMContentLoaded boot first; run after it so the map/charts exist
  document.addEventListener("DOMContentLoaded", () => apply(current().id, false));
})();
