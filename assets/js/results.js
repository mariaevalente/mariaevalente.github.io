// Results of the predictive-controller study, drawn from data/results/arrow_results.json.
// Three charts and one table twin. Colours come from the stylesheet's custom properties.

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function palette() {
  return {
    ink: css("--ink"), ink2: css("--ink-2"), muted: css("--muted"), grid: css("--line"),
    axis: css("--line-strong"), surface: css("--surface"), s1: css("--series-1"),
    s2: css("--series-2"), soft: css("--series-muted"), wash: css("--accent-wash"),
    font: css("--font"),
  };
}

// Charts take their height from the container, so the print version can be shorter.
// "fill" takes the height of the container the charts sit in (the home page's frames).
function heightOf(root) {
  if (root.dataset.height === "fill") {
    const style = getComputedStyle(root);
    return Math.max(220, root.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom));
  }
  return Number(root.dataset.height) || 360;
}

function base(p, extra = {}) {
  return {
    paper_bgcolor: p.surface, plot_bgcolor: p.surface,
    font: { family: p.font, color: p.ink2, size: 12 },
    hoverlabel: { bgcolor: p.surface, bordercolor: p.axis, font: { color: p.ink } },
    margin: { l: 10, r: 16, t: 10, b: 44 },
    ...extra,
  };
}

const CONFIG = { displaylogo: false, responsive: true, displayModeBar: false };
const signed = (v) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}%`;
const kindLabel = { calibrated: "Calibrated twin of a real building", prototype: "ASHRAE prototype" };

// Short names for narrow charts, where the full ones would leave no room for the bars.
const SHORT_NAMES = {
  "Hotel": "Hotel", "Restaurant A": "Rest. A", "Restaurant B": "Rest. B", "Retail with VRF + DOAS": "VRF+DOAS retail",
  "Full-service restaurant": "Full-service rest.", "Medium office": "Office", "Quick-service restaurant": "Quick-service rest.",
  "Quick-service restaurant, degraded": "QSR, degraded", "Stand-alone retail": "Retail",
};
let narrow = false;
function nameOf(b) {
  const label = narrow ? SHORT_NAMES[b.label] || b.label : b.label;
  return `${label}${b.kind === "calibrated" ? " · twin" : ""}`;
}

function energyVsSchedule(el, data, p) {
  const rows = [...data.buildings].sort((a, b) => b.arrow_vs_schedule.energy_pct - a.arrow_vs_schedule.energy_pct);
  const x = rows.map((b) => b.arrow_vs_schedule.energy_pct);
  window.Plotly.react(el, [{
    type: "bar", orientation: "h", x, y: rows.map(nameOf),
    marker: { color: p.s1, line: { width: 0 } },
    // Inside the bar when it fits, outside otherwise: a fixed position collides with
    // the building names once the chart is narrow.
    // Long bars carry their label inside, short ones outside, so no label is cut.
    text: x.map(signed), textposition: x.map((v) => (Math.abs(v) >= 15 ? "inside" : "outside")),
    insidetextanchor: "end", constraintext: "none", cliponaxis: false,
    insidetextfont: { color: "#ffffff", size: 12 }, outsidetextfont: { color: p.ink, size: 12 },
    customdata: rows.map((b) => [kindLabel[b.kind], b.controllers.schedule.hvac_kwh, b.controllers.arrow.hvac_kwh]),
    hovertemplate: "<b>%{y}</b><br>%{customdata[0]}<br>Fixed schedule %{customdata[1]:,.0f} kWh/yr<br>Predictive %{customdata[2]:,.0f} kWh/yr<br>Change %{text}<extra></extra>",
  }], base(p, {
    height: p.height, bargap: 0.35,
    margin: { l: 10, r: 56, t: 6, b: 40 },
    // Room on both sides for the value labels, so a long bar's label cannot reach the names.
    xaxis: { range: [Math.min(...x) * 1.12 - 4, Math.max(0, ...x) + 16], ticksuffix: "%", zeroline: true, zerolinecolor: p.axis, zerolinewidth: 1.5, gridcolor: p.grid, tickfont: { color: p.muted }, title: { text: narrow ? "Energy vs fixed schedule" : "Annual HVAC energy, predictive vs fixed schedule", font: { size: 12, color: p.muted } } },
    yaxis: { automargin: true, tickfont: { color: p.ink, size: 12 } },
  }), CONFIG);
}

function comfortVsReactive(el, data, p) {
  const traces = ["calibrated", "prototype"].map((kind, k) => {
    const rows = data.buildings.filter((b) => b.kind === kind);
    return {
      type: "scatter", mode: "markers", name: kindLabel[kind],
      x: rows.map((b) => b.arrow_vs_reactive.energy_pct),
      y: rows.map((b) => b.arrow_vs_reactive.discomfort_pct),
      text: rows.map((b) => b.label),
      marker: { size: 12, color: k === 0 ? p.s1 : p.s2, line: { color: p.surface, width: 2 } },
      hovertemplate: "<b>%{text}</b><br>Energy %{x:+.1f}%<br>Discomfort %{y:+.1f}%<extra></extra>",
    };
  });
  const xs = data.buildings.map((b) => b.arrow_vs_reactive.energy_pct);
  const xmax = Math.max(25, ...xs.map(Math.abs)) * 1.15;
  window.Plotly.react(el, traces, base(p, {
    height: p.height,
    margin: { l: 56, r: 16, t: 34, b: 48 },
    legend: { orientation: "h", x: 0, y: 1.02, yanchor: "bottom", font: { color: p.ink2 } },
    shapes: [{ type: "rect", xref: "x", yref: "y", x0: -xmax, x1: 0, y0: -105, y1: 0, fillcolor: p.wash, line: { width: 0 }, layer: "below" }],
    xaxis: { range: [-xmax, xmax], ticksuffix: "%", zeroline: true, zerolinecolor: p.axis, zerolinewidth: 1.5, gridcolor: p.grid, tickfont: { color: p.muted }, title: { text: narrow ? "Energy vs reactive" : "Annual HVAC energy vs reactive controller", font: { size: 12, color: p.muted } } },
    yaxis: { range: [-105, 10], ticksuffix: "%", zeroline: true, zerolinecolor: p.axis, zerolinewidth: 1.5, gridcolor: p.grid, tickfont: { color: p.muted }, title: { text: narrow ? "Discomfort vs reactive" : "Discomfort (°C·h) vs reactive", font: { size: 12, color: p.muted } } },
  }), CONFIG);
}

function searchV1V2(el, data, p) {
  const rows = [...data.buildings].sort((a, b) => a.v1_to_v2.solved_pct_v2 - b.v1_to_v2.solved_pct_v2);
  const y = rows.map(nameOf);
  const v1 = rows.map((b) => b.v1_to_v2.solved_pct_v1);
  const v2 = rows.map((b) => b.v1_to_v2.solved_pct_v2);
  const links = {
    type: "scatter", mode: "lines", showlegend: false, hoverinfo: "skip",
    x: rows.flatMap((b, i) => [v1[i], v2[i], null]), y: rows.flatMap((b, i) => [y[i], y[i], null]),
    line: { color: p.soft, width: 2 },
  };
  const dot = (x, name, color) => ({
    type: "scatter", mode: "markers", name, x, y,
    marker: { size: 11, color, line: { color: p.surface, width: 2 } },
    customdata: rows.map((b) => [b.v1_to_v2.reduction_factor]),
    hovertemplate: `<b>%{y}</b><br>${name}: %{x:.1f}% of decisions<br>Candidates evaluated per decision: %{customdata[0]:.1f}× fewer in v2<extra></extra>`,
  });
  window.Plotly.react(el, [links, dot(v1, "Generation 1", p.soft), dot(v2, "Generation 2", p.s1)], base(p, {
    height: p.height,
    margin: { l: 10, r: 16, t: 34, b: 48 },
    legend: { orientation: "h", x: 0, y: 1.02, yanchor: "bottom", font: { color: p.ink2 } },
    xaxis: { range: [-2, 104], ticksuffix: "%", gridcolor: p.grid, zeroline: false, tickfont: { color: p.muted }, title: { text: narrow ? "Fully comfortable decisions" : "Decisions where a fully comfortable action was found", font: { size: 12, color: p.muted } } },
    yaxis: { automargin: true, tickfont: { color: p.ink, size: 12 } },
  }), CONFIG);
}

function table(el, data) {
  const rows = data.buildings.map((b) => `<tr>
    <td>${b.label}</td><td>${kindLabel[b.kind]}</td><td class="n">${b.zones}</td>
    <td class="n">${signed(b.arrow_vs_schedule.energy_pct)}</td>
    <td class="n">${signed(b.arrow_vs_reactive.energy_pct)}</td>
    <td class="n">${signed(b.arrow_vs_reactive.discomfort_pct)}</td>
    <td class="n">${b.v1_to_v2.solved_pct_v1.toFixed(1)}% → ${b.v1_to_v2.solved_pct_v2.toFixed(1)}%</td>
    <td class="n">${b.v1_to_v2.reduction_factor.toFixed(1)}×</td></tr>`).join("");
  el.innerHTML = `<table><thead><tr><th>Building</th><th>Model</th><th class="n">Zones</th>
    <th class="n">Energy vs schedule</th><th class="n">Energy vs reactive</th><th class="n">Discomfort vs reactive</th>
    <th class="n">Fully comfortable decisions, gen 1 → 2</th><th class="n">Fewer candidates per decision</th></tr></thead><tbody>${rows}</tbody></table>`;
}

let cached = null;
async function draw() {
  const root = document.querySelector("[data-results]");
  if (!root || !window.Plotly) return;
  try {
    // "no-cache" revalidates with the server, so updated data is never hidden behind an old copy.
    cached = cached || await fetch(root.dataset.results, { cache: "no-cache" }).then((r) => r.json());
  } catch (err) {
    root.querySelectorAll(".chart").forEach((el) => { el.textContent = "Could not load the results."; });
    return;
  }
  const p = { ...palette(), height: heightOf(root) };
  const charts = [["energy", energyVsSchedule], ["comfort", comfortVsReactive], ["search", searchV1V2]];
  for (const [name, drawChart] of charts) {
    const el = root.querySelector(`[data-chart=${name}]`);
    if (!el) continue;  // the print version leaves some out
    narrow = el.clientWidth < 520;
    drawChart(el, cached, p);
  }
  const t = root.querySelector("[data-table]");
  if (t && !t.childElementCount) table(t, cached);
}

draw();
