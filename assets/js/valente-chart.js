// The Valente chart: what the HVAC equipment did in a zone, and whether the room followed.
//
// Shaded bands mark the time the equipment serving the zone was running, coloured by
// operation mode. The comfort range is drawn behind them only across occupied hours,
// and the room temperature and the setpoint are drawn on top.
//
// Input is the neutral "valente-chart/1" format documented in data/README.md: arrays
// at a fixed step from `start`, with running and occupied stretches as [from, to)
// index pairs. Plotly.js (global `Plotly`) does the drawing.

export const MODES = {
  cool: { label: "Cooling", fill: "rgba(74,158,255,0.35)", line: "#4a9eff" },
  heat: { label: "Heating", fill: "rgba(255,90,90,0.35)", line: "#ff5a5a" },
  fan: { label: "Fan only", fill: "rgba(46,204,138,0.32)", line: "#2ecc8a" },
  dry: { label: "Dry", fill: "rgba(155,111,255,0.35)", line: "#9b6fff" },
  auto: { label: "Auto", fill: "rgba(160,160,160,0.30)", line: "#a0a0a0" },
};
const UNKNOWN_MODE = { label: "Running", fill: "rgba(150,150,150,0.25)", line: "#888888" };

export const HOUR = 3600e3;
export const DAY = 24 * HOUR;

/** Theme colours, read from CSS custom properties so light and dark share one renderer. */
export function theme() {
  const css = getComputedStyle(document.documentElement);
  const v = (name) => css.getPropertyValue(name).trim();
  return {
    paper: v("--vc-paper"), plot: v("--vc-plot"), grid: v("--vc-grid"), ink: v("--vc-ink"),
    comfortFill: v("--vc-comfort-fill"), comfortLine: v("--vc-comfort-line"),
    temp: v("--vc-temp"), setpoint: v("--vc-setpoint"), off: v("--vc-off"),
    font: v("--font") || "system-ui, sans-serif",
  };
}

/** Time helpers for one document: index <-> epoch milliseconds (simulation wall time as UTC). */
export function clock(doc) {
  const origin = Date.parse(doc.start + "Z");
  const step = doc.step_minutes * 60e3;
  return {
    origin, step,
    at: (i) => origin + i * step,
    index: (ms) => Math.round((ms - origin) / step),
    first: origin,
    last: origin + (doc.length - 1) * step,
  };
}

export function zoneOf(doc, zoneId) {
  return doc.zones.find((z) => z.id === zoneId) || doc.zones[0];
}

/** Index window [i0, i1] covering [fromMs, toMs], padded by one step and clamped. */
function indexWindow(doc, c, fromMs, toMs) {
  const i0 = Math.max(0, Math.floor((fromMs - c.origin) / c.step) - 1);
  const i1 = Math.min(doc.length - 1, Math.ceil((toMs - c.origin) / c.step) + 1);
  return [i0, i1];
}

/** Stretches [from, to) intersecting the index window, as epoch-ms pairs (plus any payload). */
function visible(intervals, i0, i1, c) {
  const out = [];
  for (const interval of intervals) {
    const a = Math.max(interval[0], i0);
    const b = Math.min(interval[1], i1 + 1);
    if (b > a) out.push([c.at(a), c.at(b), ...interval.slice(2)]);
  }
  return out;
}

/**
 * A readable temperature range: 1st–99th percentile of what is drawn, widened to the
 * comfort band, so a stray reading cannot flatten the chart or push the band off it.
 */
export function temperatureRange(values, comfort) {
  const sorted = values.filter((v) => v !== null && Number.isFinite(v)).sort((a, b) => a - b);
  let low, high;
  if (sorted.length) {
    low = sorted[Math.max(0, Math.floor(sorted.length * 0.01) - 1)];
    high = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.99))];
  } else {
    [low, high] = comfort || [18, 26];
  }
  if (comfort) { low = Math.min(low, comfort[0]); high = Math.max(high, comfort[1]); }
  const pad = Math.max(0.5, (high - low) * 0.08);
  return [low - pad, high + pad];
}

/** The equipment state at every index of the window: a mode key, or null when off. */
function stateArray(zone, i0, i1) {
  const state = new Array(i1 - i0 + 1).fill(null);
  for (const [a, b, mode] of zone.running) {
    if (b <= i0 || a > i1) continue;
    for (let i = Math.max(a, i0); i < Math.min(b, i1 + 1); i++) state[i - i0] = mode || "unknown";
  }
  return state;
}

function occupiedArray(zone, i0, i1) {
  const occ = new Array(i1 - i0 + 1).fill(false);
  for (const [a, b] of zone.occupied) {
    if (b <= i0 || a > i1) continue;
    for (let i = Math.max(a, i0); i < Math.min(b, i1 + 1); i++) occ[i - i0] = true;
  }
  return occ;
}

/** The y-range the chart would choose for this window, so stacked charts can share one. */
export function rangeFor(doc, zoneId, fromMs, toMs) {
  const c = clock(doc);
  const zone = zoneOf(doc, zoneId);
  const [i0, i1] = indexWindow(doc, c, fromMs, toMs);
  const values = zone.temperature.slice(i0, i1 + 1).concat(zone.setpoint ? zone.setpoint.slice(i0, i1 + 1) : []);
  return temperatureRange(values, zone.comfort);
}

/**
 * Build the figure for one zone over [fromMs, toMs).
 * opts: { height, yRange, showLegend, compact }
 */
export function figure(doc, zoneId, fromMs, toMs, opts = {}) {
  const t = theme();
  const c = clock(doc);
  const zone = zoneOf(doc, zoneId);
  const [i0, i1] = indexWindow(doc, c, fromMs, toMs);

  const x = [];
  for (let i = i0; i <= i1; i++) x.push(c.at(i));
  const temperature = zone.temperature.slice(i0, i1 + 1);
  const setpoint = zone.setpoint ? zone.setpoint.slice(i0, i1 + 1) : null;
  const state = stateArray(zone, i0, i1);
  const occupied = occupiedArray(zone, i0, i1);

  const data = [{
    type: "scatter", mode: "lines", x, y: temperature, name: "Room temperature",
    line: { color: t.temp, width: 1.6 },
    hovertemplate: "Room %{y:.1f} °C<extra></extra>",
  }];
  if (setpoint) {
    data.push({
      type: "scatter", mode: "lines", x, y: setpoint, name: "Setpoint",
      line: { color: t.setpoint, width: 1.8, shape: "hv" },
      hovertemplate: "Setpoint %{y:.1f} °C<extra></extra>",
    });
  }
  // Mode in words on hover, so the band colour is never the only carrier of it.
  data.push({
    type: "scatter", mode: "lines", x, y: temperature, showlegend: false,
    line: { width: 0, color: "rgba(0,0,0,0)" },
    text: state.map((s, k) => `${s ? (MODES[s] || UNKNOWN_MODE).label : "Off"}${occupied[k] ? "" : " · closed"}`),
    hovertemplate: "Equipment: %{text}<extra></extra>",
  });

  const shapes = [];
  const [lo, hi] = zone.comfort;
  for (const [a, b] of visible(zone.occupied, i0, i1, c)) {
    shapes.push({
      type: "rect", xref: "x", yref: "y", x0: a, x1: b, y0: lo, y1: hi, layer: "below",
      fillcolor: t.comfortFill, line: { color: t.comfortLine, width: 1, dash: "dot" },
    });
  }
  const hours = {};
  for (const [a, b, mode] of visible(zone.running, i0, i1, c)) {
    const style = MODES[mode] || UNKNOWN_MODE;
    shapes.push({
      type: "rect", xref: "x", yref: "paper", x0: a, x1: b, y0: 0, y1: 1, layer: "below",
      fillcolor: style.fill, line: { width: 0 },
    });
    // The window is padded by a step, so a band can sit just outside it.
    const inView = (Math.min(b, toMs) - Math.max(a, fromMs)) / HOUR;
    if (inView > 0) {
      const key = mode || "unknown";
      hours[key] = (hours[key] || 0) + inView;
    }
  }

  // Shapes cannot appear in a legend, so a line stands in for each, longest first.
  const showLegend = opts.showLegend !== false;
  if (showLegend) {
    for (const [mode] of Object.entries(hours).sort((p, q) => q[1] - p[1])) {
      const style = MODES[mode] || UNKNOWN_MODE;
      data.push({
        type: "scatter", mode: "lines", x: [null], y: [null], hoverinfo: "skip",
        name: `Running · ${style.label.toLowerCase()}`, line: { color: style.line, width: 8 },
      });
    }
    data.push({
      type: "scatter", mode: "lines", x: [null], y: [null], hoverinfo: "skip",
      name: `Comfort ${lo}–${hi} °C (occupied)`, line: { color: t.comfortLine, width: 8, dash: "dot" },
    });
  }

  const span = toMs - fromMs;
  const tickformat = span <= 1.01 * DAY ? "%H:%M" : span <= 8 * DAY ? "%a %d\n%H:%M" : "%d %b";
  const layout = {
    paper_bgcolor: t.paper, plot_bgcolor: t.plot,
    font: { family: t.font, color: t.ink, size: 12 },
    margin: { l: 46, r: 14, t: showLegend ? 36 : 10, b: 36 },
    height: opts.height || 360,
    shapes,
    dragmode: "zoom",
    hovermode: "x unified",
    hoverlabel: { bgcolor: t.paper, bordercolor: t.grid, font: { color: t.ink } },
    showlegend: showLegend,
    legend: { orientation: "h", x: 0, y: 1.02, yanchor: "bottom", font: { size: 11, color: t.ink }, bgcolor: "rgba(0,0,0,0)" },
    xaxis: {
      type: "date", range: [fromMs, toMs], tickformat, gridcolor: t.grid, linecolor: t.grid,
      tickfont: { color: t.ink }, hoverformat: "%a %d %b %Y, %H:%M", fixedrange: false,
    },
    yaxis: {
      title: { text: "°C", standoff: 6 }, range: opts.yRange || temperatureRange(
        temperature.concat(setpoint || []), zone.comfort),
      gridcolor: t.grid, zeroline: false, tickfont: { color: t.ink }, fixedrange: false,
    },
  };
  return { data, layout, hours };
}

/** Plotly config shared by every Valente chart. */
export const CONFIG = {
  displaylogo: false,
  responsive: true,
  modeBarButtonsToRemove: ["select2d", "lasso2d", "autoScale2d"],
  toImageButtonOptions: { format: "png", scale: 2, filename: "valente-chart" },
};

/** Summary of one controller over the window: building energy, zone discomfort, run hours. */
export function windowStats(doc, zoneId, fromMs, toMs) {
  const c = clock(doc);
  const zone = zoneOf(doc, zoneId);
  const stepHours = c.step / HOUR;
  let energy = 0;
  let discomfort = 0;
  let occupiedSteps = 0;
  let insideSteps = 0;
  // Energy is metered per interval and stamped at its end; it belongs to the window
  // when the interval began inside it.
  for (let i = 0; i < doc.length; i++) {
    const begin = c.at(i) - c.step;
    if (begin < fromMs) continue;
    if (begin >= toMs) break;
    energy += doc.energy_kwh[i] || 0;
  }
  const [lo, hi] = zone.comfort;
  for (const [a, b] of zone.occupied) {
    for (let i = a; i < b; i++) {
      const at = c.at(i);
      if (at < fromMs || at >= toMs) continue;
      const v = zone.temperature[i];
      if (v === null) continue;
      occupiedSteps++;
      const gap = Math.max(lo - v, 0, v - hi);
      if (gap === 0) insideSteps++;
      discomfort += gap * stepHours;
    }
  }
  let running = 0;
  let starts = 0;
  for (const [a, b] of zone.running) {
    const from = Math.max(c.at(a), fromMs);
    const to = Math.min(c.at(b), toMs);
    if (to > from) running += (to - from) / HOUR;
    if (c.at(a) >= fromMs && c.at(a) < toMs) starts++;
  }
  return {
    energy, discomfort, running, starts,
    inside: occupiedSteps ? insideSteps / occupiedSteps : null,
  };
}

/**
 * Year at a glance: one cell per day and hour, coloured by what the equipment mostly did
 * in that hour. Codes: 0 off, 1 fan, 2 heat, 3 cool.
 */
const YEAR_CODES = { fan: 1, heat: 2, cool: 3, dry: 1, auto: 1, unknown: 1 };
const YEAR_NAMES = ["Off", "Fan only", "Heating", "Cooling"];

export function yearFigure(doc, zoneId, selectedDay) {
  const t = theme();
  const c = clock(doc);
  const zone = zoneOf(doc, zoneId);
  const firstDay = Math.floor((c.first - c.step) / DAY) * DAY;
  const days = Math.round((c.last - firstDay) / DAY);
  const counts = Array.from({ length: 24 }, () => Array.from({ length: days }, () => [0, 0, 0, 0]));
  for (const [a, b, mode] of zone.running) {
    for (let i = a; i < b; i++) {
      const begin = c.at(i) - c.step;
      const d = Math.floor((begin - firstDay) / DAY);
      const h = Math.floor(((begin - firstDay) % DAY) / HOUR);
      if (d >= 0 && d < days) counts[h][d][YEAR_CODES[mode] ?? 1]++;
    }
  }
  const stepsPerHour = HOUR / c.step;
  const z = counts.map((row) => row.map((cell) => {
    const running = cell[1] + cell[2] + cell[3];
    if (running * 2 < stepsPerHour) return 0;
    return cell.indexOf(Math.max(cell[1], cell[2], cell[3]), 1);
  }));
  const x = Array.from({ length: days }, (_, d) => firstDay + d * DAY + DAY / 2);
  const text = z.map((row) => row.map((code) => YEAR_NAMES[code]));
  const colors = [t.off, MODES.fan.line, MODES.heat.line, MODES.cool.line];
  const colorscale = [[0, colors[0]], [0.25, colors[0]], [0.25, colors[1]], [0.5, colors[1]],
    [0.5, colors[2]], [0.75, colors[2]], [0.75, colors[3]], [1, colors[3]]];
  const shapes = [];
  if (selectedDay !== undefined) {
    shapes.push({
      type: "rect", xref: "x", yref: "paper", x0: selectedDay, x1: selectedDay + DAY, y0: 0, y1: 1,
      line: { color: t.ink, width: 1.5 }, fillcolor: "rgba(0,0,0,0)",
    });
  }
  return {
    data: [{
      type: "heatmap", x, y: Array.from({ length: 24 }, (_, h) => h), z, text,
      zmin: -0.5, zmax: 3.5, colorscale, showscale: false, xgap: 0, ygap: 0, opacity: 0.85,
      hovertemplate: "%{x|%a %d %b}, %{y}:00<br>%{text}<extra>click to open the day</extra>",
    }],
    layout: {
      paper_bgcolor: t.paper, plot_bgcolor: t.paper,
      font: { family: t.font, color: t.ink, size: 11 },
      margin: { l: 40, r: 10, t: 6, b: 26 }, height: 190, shapes,
      xaxis: { type: "date", tickformat: "%b", dtick: "M1", gridcolor: "rgba(0,0,0,0)", fixedrange: true, ticklabelmode: "period" },
      yaxis: { tickvals: [0, 6, 12, 18, 23], ticktext: ["0h", "6h", "12h", "18h", "23h"], autorange: "reversed", fixedrange: true },
    },
  };
}

/** Hourly rows for the window: the chart's table twin. */
export function hourlyRows(doc, zoneId, fromMs, toMs) {
  const c = clock(doc);
  const zone = zoneOf(doc, zoneId);
  const rows = [];
  for (let start = fromMs; start < toMs; start += HOUR) {
    let tSum = 0, tN = 0, sSum = 0, sN = 0;
    const modes = {};
    for (let i = c.index(start); i < c.index(start + HOUR); i++) {
      if (i < 0 || i >= doc.length) continue;
      const v = zone.temperature[i];
      if (v !== null) { tSum += v; tN++; }
      const s = zone.setpoint ? zone.setpoint[i] : null;
      if (s !== null && s !== undefined) { sSum += s; sN++; }
    }
    for (const [a, b, mode] of zone.running) {
      const from = Math.max(c.at(a), start);
      const to = Math.min(c.at(b), start + HOUR);
      if (to > from) modes[mode] = (modes[mode] || 0) + (to - from);
    }
    const top = Object.entries(modes).sort((p, q) => q[1] - p[1])[0];
    rows.push({
      start,
      temperature: tN ? tSum / tN : null,
      setpoint: sN ? sSum / sN : null,
      equipment: top && top[1] >= HOUR / 2 ? (MODES[top[0]] || UNKNOWN_MODE).label : (top ? `Partly ${(MODES[top[0]] || UNKNOWN_MODE).label.toLowerCase()}` : "Off"),
    });
  }
  return rows;
}
