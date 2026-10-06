// The interactive explorer around the Valente chart: building, zone, controller,
// window and date, a year-at-a-glance strip to jump to any day, and a table twin.
//
// Markup contract (see index.html / valente.html): an element with [data-explorer]
// holding the controls named below. Data comes from `data-base` (default
// "data/valente/"), one folder per building with meta.json and one file per controller.

import * as vc from "./valente-chart.js";

const CONTROLLER_ORDER = ["arrow", "reactive", "schedule"];
const SHORT = { arrow: "Predictive (Arrow v2)", reactive: "Reactive rule-based", schedule: "Fixed schedule" };

const cache = new Map();
function fetchJson(url) {
  if (!cache.has(url)) {
    // "no-cache" revalidates with the server, so updated data is never hidden behind an old copy.
    cache.set(url, fetch(url, { cache: "no-cache" }).then((r) => {
      if (!r.ok) throw new Error(`${r.status} ${url}`);
      return r.json();
    }).catch((err) => { cache.delete(url); throw err; }));
  }
  return cache.get(url);
}

const fmt = {
  kwh: (v) => `${v >= 100 ? Math.round(v).toLocaleString("en-GB") : v.toFixed(1)} kWh`,
  degh: (v) => `${v.toFixed(1)} °C·h`,
  pct: (v) => (v === null ? "—" : `${Math.round(v * 100)}%`),
  h: (v) => `${v.toFixed(1)} h`,
  date: (ms) => new Date(ms).toISOString().slice(0, 10),
  time: (ms) => new Date(ms).toISOString().slice(11, 16),
  day: (ms) => new Date(ms).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }),
};

function windowFor(span, dayMs) {
  const d = new Date(dayMs);
  if (span === "week") {
    const monday = dayMs - ((d.getUTCDay() + 6) % 7) * vc.DAY;
    return [monday, monday + 7 * vc.DAY];
  }
  if (span === "month") {
    const from = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
    return [from, Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)];
  }
  return [dayMs, dayMs + vc.DAY];
}

function shift(span, dayMs, direction) {
  if (span === "month") {
    const d = new Date(dayMs);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + direction, 1);
  }
  return dayMs + direction * (span === "week" ? 7 : 1) * vc.DAY;
}

function setPressed(group, value) {
  for (const button of group.querySelectorAll("button")) {
    button.setAttribute("aria-pressed", String(button.dataset.value === value));
  }
}

export class Explorer {
  constructor(root) {
    this.root = root;
    this.base = root.dataset.base || "data/valente/";
    this.syncUrl = root.hasAttribute("data-sync-url");
    const q = this.syncUrl ? new URLSearchParams(location.search) : new URLSearchParams();
    this.state = {
      building: q.get("b") || root.dataset.building,
      zone: Number(q.get("z") || root.dataset.zone),
      controller: q.get("c") || root.dataset.controller || "compare",
      span: q.get("s") || root.dataset.span || "day",
      day: Date.parse((q.get("d") || root.dataset.date) + "T00:00:00Z"),
    };
    this.el = (name) => root.querySelector(`[data-${name}]`);
    this.charts = [];
    this.bound = new WeakSet();
    this.syncing = false;
    this.bind();
    this.loadBuildings();
  }

  bind() {
    this.el("building").addEventListener("change", (e) => {
      this.state.building = e.target.value;
      this.state.zone = NaN;
      this.loadBuilding();
    });
    this.el("zone").addEventListener("change", (e) => { this.state.zone = Number(e.target.value); this.render(); });
    this.el("controller").addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      this.state.controller = b.dataset.value; this.render();
    });
    this.el("span").addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      this.state.span = b.dataset.value; this.render();
    });
    this.el("date").addEventListener("change", (e) => {
      const ms = Date.parse(e.target.value + "T00:00:00Z");
      if (Number.isFinite(ms)) { this.state.day = ms; this.render(); }
    });
    this.el("prev").addEventListener("click", () => this.step(-1));
    this.el("next").addEventListener("click", () => this.step(1));
    this.root.addEventListener("keydown", (e) => {
      if (e.target.matches("input, select")) return;
      if (e.key === "ArrowLeft") { this.step(-1); e.preventDefault(); }
      if (e.key === "ArrowRight") { this.step(1); e.preventDefault(); }
    });
  }

  step(direction) {
    const next = shift(this.state.span, this.state.day, direction);
    if (next < this.bounds[0] || next > this.bounds[1]) return;
    this.state.day = next;
    this.render();
  }

  async loadBuildings() {
    const list = JSON.parse(this.root.dataset.buildings || "[]");
    const select = this.el("building");
    select.innerHTML = list.map((b) => `<option value="${b.id}">${b.label}</option>`).join("");
    if (!list.some((b) => b.id === this.state.building)) this.state.building = list[0].id;
    select.value = this.state.building;
    await this.loadBuilding();
  }

  async loadBuilding() {
    this.status("Loading the simulated year…");
    try {
      const folder = `${this.base}${this.state.building}/`;
      this.meta = await fetchJson(`${folder}meta.json`);
      const docs = await Promise.all(CONTROLLER_ORDER.map((c) => fetchJson(`${folder}${c}.json`)));
      this.docs = Object.fromEntries(CONTROLLER_ORDER.map((c, i) => [c, docs[i]]));
    } catch (err) {
      this.status(location.protocol === "file:"
        ? "Open this page through a web server (see the README). Browsers block data files opened straight from disk."
        : `Could not load the data (${err.message}).`);
      return;
    }
    const zones = this.meta.zones;
    const zoneSelect = this.el("zone");
    zoneSelect.innerHTML = zones.map((z) => `<option value="${z.id}">${z.label} · ${z.comfort[0]}–${z.comfort[1]} °C</option>`).join("");
    if (!zones.some((z) => z.id === this.state.zone)) this.state.zone = zones[0].id;
    zoneSelect.value = String(this.state.zone);
    const c = vc.clock(this.docs.arrow);
    this.bounds = [Math.floor((c.first - c.step) / vc.DAY) * vc.DAY, Math.floor((c.last - c.step) / vc.DAY) * vc.DAY];
    const dateInput = this.el("date");
    dateInput.min = fmt.date(this.bounds[0]);
    dateInput.max = fmt.date(this.bounds[1]);
    const note = this.el("building-note");
    if (note) note.textContent = `${this.meta.building.note} ${this.meta.weather}. Opening hours: ${zones[0].schedule_label}.`;
    this.render();
  }

  status(message) {
    const panels = this.el("panels");
    for (const chart of this.charts) window.Plotly.purge(chart);
    this.charts = [];
    // The message replaces the chart panels, so the next render must rebuild them.
    delete panels.dataset.shown;
    panels.innerHTML = `<div class="vc-panel"><div class="vc-status">${message}</div></div>`;
  }

  render() {
    if (!this.docs) return;
    const s = this.state;
    s.day = Math.min(Math.max(s.day, this.bounds[0]), this.bounds[1]);
    const [from, to] = windowFor(s.span, s.day);
    setPressed(this.el("controller"), s.controller);
    setPressed(this.el("span"), s.span);
    this.el("date").value = fmt.date(s.day);
    const q = new URLSearchParams({ b: s.building, z: s.zone, c: s.controller, s: s.span, d: fmt.date(s.day) });
    if (this.syncUrl) history.replaceState(null, "", `?${q}`);
    const full = this.el("fullscreen");
    if (full) full.href = `valente.html?${q}`;
    const shown = s.controller === "compare" ? CONTROLLER_ORDER : [s.controller];
    this.renderLegend();
    this.renderYear(shown[0], from);
    this.renderPanels(shown, from, to);
    this.renderTable(shown, from, to);
  }

  renderLegend() {
    const target = this.el("legend");
    if (!target || target.childElementCount) return;
    const line = (colour) => `<i style="height:3px;background:${colour}"></i>`;
    const fill = (mode) => `<i style="background:${vc.MODES[mode].fill};outline:1px solid ${vc.MODES[mode].line}"></i>`;
    target.innerHTML = [
      `<span>${line("var(--vc-temp)")}Room temperature</span>`,
      `<span>${line("var(--vc-setpoint)")}Setpoint</span>`,
      `<span><i style="background:var(--vc-comfort-fill);outline:1px dotted var(--vc-comfort-line)"></i>Comfort range, during opening hours</span>`,
      ...["cool", "heat", "fan"].map((m) => `<span>${fill(m)}Running · ${vc.MODES[m].label.toLowerCase()}</span>`),
      `<span><i style="background:var(--vc-off);outline:1px solid var(--line)"></i>Off (year strip)</span>`,
    ].join("");
  }

  renderYear(controller, from) {
    const target = this.el("year");
    const title = this.el("year-title");
    const zone = this.meta.zones.find((z) => z.id === this.state.zone);
    if (title) title.textContent = `${zone.label} · ${SHORT[controller]}`;
    const fig = vc.yearFigure(this.docs[controller], this.state.zone, this.state.span === "day" ? from : undefined);
    window.Plotly.react(target, fig.data, fig.layout, { displayModeBar: false, responsive: true });
    if (!target.dataset.bound) {
      target.dataset.bound = "1";
      target.on("plotly_click", (event) => {
        const point = event.points && event.points[0];
        if (!point) return;
        const ms = typeof point.x === "number" ? point.x : Date.parse(String(point.x).replace(" ", "T") + "Z");
        this.state.day = Math.floor(ms / vc.DAY) * vc.DAY;
        this.state.span = "day";
        this.render();
      });
    }
  }

  renderPanels(shown, from, to) {
    const panels = this.el("panels");
    const compact = shown.length > 1;
    // One y-range for the stack, so the panels can be compared by eye.
    const ranges = shown.map((c) => vc.rangeFor(this.docs[c], this.state.zone, from, to));
    const yRange = [Math.min(...ranges.map((r) => r[0])), Math.max(...ranges.map((r) => r[1]))];

    if (panels.children.length !== shown.length || panels.dataset.shown !== shown.join()) {
      for (const chart of this.charts) window.Plotly.purge(chart);
      panels.innerHTML = shown.map((c) => `
        <div class="vc-panel" data-controller-panel="${c}">
          <div class="vc-head"><h4>${this.docs[c].controller.label}</h4><div class="vc-kpis"></div></div>
          <div class="vc-chart${compact ? " compact" : ""}" role="img"></div>
        </div>`).join("");
      panels.dataset.shown = shown.join();
      this.charts = [...panels.querySelectorAll(".vc-chart")];
      this.bound = new WeakSet();
    }

    shown.forEach((c, k) => {
      const doc = this.docs[c];
      const stats = vc.windowStats(doc, this.state.zone, from, to);
      const panel = panels.children[k];
      panel.querySelector(".vc-kpis").innerHTML =
        `<span>Building HVAC energy <b>${fmt.kwh(stats.energy)}</b></span>` +
        `<span>Zone discomfort <b>${fmt.degh(stats.discomfort)}</b></span>` +
        `<span>In comfort band <b>${fmt.pct(stats.inside)}</b> of occupied time</span>` +
        `<span>Zone equipment running <b>${fmt.h(stats.running)}</b></span>`;
      // One HTML legend above the stack instead of one per chart: Plotly's
      // legend has no room of its own in a 250px panel and lands on the plot.
      const fig = vc.figure(doc, this.state.zone, from, to, {
        height: compact ? Number(this.root.dataset.compactHeight) || 250 : 340, yRange, showLegend: false,
      });
      const chart = this.charts[k];
      chart.setAttribute("aria-label",
        `${doc.controller.label}, ${fmt.day(from)}: building HVAC energy ${fmt.kwh(stats.energy)}, zone discomfort ${fmt.degh(stats.discomfort)}.`);
      window.Plotly.react(chart, fig.data, fig.layout, vc.CONFIG);
      if (compact && !this.bound.has(chart)) {
        this.bound.add(chart);
        chart.on("plotly_relayout", (event) => this.syncZoom(chart, event));
      }
    });
  }

  // Zooming one stacked panel zooms the others to the same stretch of time.
  syncZoom(source, event) {
    if (this.syncing) return;
    let update = null;
    if (event["xaxis.range[0]"] !== undefined) {
      update = { "xaxis.range": [event["xaxis.range[0]"], event["xaxis.range[1]"]] };
    } else if (event["xaxis.range"]) {
      update = { "xaxis.range": event["xaxis.range"] };
    } else if (event["xaxis.autorange"]) {
      update = { "xaxis.range": windowFor(this.state.span, this.state.day) };
    }
    if (!update) return;
    this.syncing = true;
    Promise.all(this.charts.filter((c) => c !== source).map((c) => window.Plotly.relayout(c, update)))
      .finally(() => { this.syncing = false; });
  }

  renderTable(shown, from, to) {
    const target = this.el("table");
    if (!target) return;
    const columns = shown.map((c) => ({ c, rows: vc.hourlyRows(this.docs[c], this.state.zone, from, to) }));
    const head = `<tr><th>Hour</th>${shown.map((c) => `<th class="n">${SHORT[c]} · room °C</th><th>${SHORT[c]} · equipment</th>`).join("")}</tr>`;
    const body = columns[0].rows.map((row, i) => `<tr><td>${fmt.day(row.start)} ${fmt.time(row.start)}</td>${columns.map(({ rows }) => {
      const r = rows[i];
      return `<td class="n">${r.temperature === null ? "—" : r.temperature.toFixed(1)}</td><td>${r.equipment}</td>`;
    }).join("")}</tr>`).join("");
    target.innerHTML = `<table><thead>${head}</thead><tbody>${body}</tbody></table>`;
  }
}

for (const root of document.querySelectorAll("[data-explorer]")) {
  new Explorer(root);
}
