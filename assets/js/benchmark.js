// Savings benchmark explainer: how a defensible baseline is chosen and what a saving is worth.
//
// A synthetic building is generated in the browser (no real data): a baseline year and a
// reporting year of monthly consumption against mean outdoor temperature. The ASHRAE inverse
// change-point models are fitted to the baseline year, held to ASHRAE Guideline 14
// (CV(RMSE) <= 15 %, |NMBE| <= 5 % for monthly data), and the best compliant one projects
// what the reporting year would have used. The saving is reported with its Guideline 14
// fractional savings uncertainty, so it can be told apart from model noise.

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Student t, two-sided 90 % (0.95 quantile), by degrees of freedom.
const T90 = [6.314, 2.920, 2.353, 2.132, 2.015, 1.943, 1.895, 1.860, 1.833, 1.812, 1.796, 1.782];
const t90 = (dof) => T90[Math.min(Math.max(dof, 1), T90.length) - 1];

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(r) {
  const u = Math.max(r(), 1e-12), v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// The "true" building behind the synthetic data, kWh per day as a function of °C.
const TRUTH = {
  heating: (t) => 120 + 14 * Math.max(15 - t, 0),
  cooling: (t) => 140 + 18 * Math.max(t - 18, 0),
  both: (t) => 110 + 12 * Math.max(14 - t, 0) + 16 * Math.max(t - 20, 0),
};

function synthesize({ shape, noise, saving, seed }) {
  const r = rng(seed);
  const months = [];
  for (let k = 0; k < 24; k++) {
    const m = k % 12;
    // Lisbon-like monthly means: about 11 °C in January to 24 °C in August.
    const temp = 17.5 - 6.5 * Math.cos((2 * Math.PI * (m - 0.5)) / 12) + 1.1 * gauss(r);
    const perDay = TRUTH[shape](temp) * (1 + (noise / 100) * gauss(r)) * (k >= 12 ? 1 - saving / 100 : 1);
    months.push({ k, m, year: k < 12 ? 1 : 2, temp, perDay, energy: perDay * DAYS[m] });
  }
  return months;
}

// Least squares for y ~ X b with an intercept column already in X; 2 or 3 columns.
function solve(X, y, w) {
  const p = X[0].length;
  const A = Array.from({ length: p }, () => new Array(p).fill(0));
  const b = new Array(p).fill(0);
  X.forEach((row, i) => {
    for (let a = 0; a < p; a++) {
      b[a] += w[i] * row[a] * y[i];
      for (let c = 0; c < p; c++) A[a][c] += w[i] * row[a] * row[c];
    }
  });
  // Gaussian elimination with partial pivoting.
  for (let col = 0; col < p; col++) {
    let pivot = col;
    for (let r = col + 1; r < p; r++) if (Math.abs(A[r][col]) > Math.abs(A[pivot][col])) pivot = r;
    if (Math.abs(A[pivot][col]) < 1e-9) return null;
    [A[col], A[pivot]] = [A[pivot], A[col]];
    [b[col], b[pivot]] = [b[pivot], b[col]];
    for (let r = col + 1; r < p; r++) {
      const f = A[r][col] / A[col][col];
      for (let c = col; c < p; c++) A[r][c] -= f * A[col][c];
      b[r] -= f * b[col];
    }
  }
  const x = new Array(p).fill(0);
  for (let r = p - 1; r >= 0; r--) {
    let s = b[r];
    for (let c = r + 1; c < p; c++) s -= A[r][c] * x[c];
    x[r] = s / A[r][r];
  }
  return x;
}

const neg = (v) => Math.max(-v, 0);   // (τ − T)⁺ written as neg(T − τ)
const pos = (v) => Math.max(v, 0);

// Candidate forms. `p` counts change points as parameters, as Guideline 14 does.
const FORMS = [
  { id: "3PH", label: "3-parameter heating", p: 3, grid: [[8, 22]],
    features: (t, [c]) => [1, neg(t - c)], valid: (b) => b[1] > 0 },
  { id: "3PC", label: "3-parameter cooling", p: 3, grid: [[12, 24]],
    features: (t, [c]) => [1, pos(t - c)], valid: (b) => b[1] > 0 },
  { id: "4P", label: "4-parameter", p: 4, grid: [[10, 22]],
    features: (t, [c]) => [1, neg(t - c), pos(t - c)], valid: (b) => b[1] > 0 || b[2] > 0 },
  { id: "5P", label: "5-parameter", p: 5, grid: [[8, 20], [12, 26]],
    features: (t, [c1, c2]) => [1, neg(t - c1), pos(t - c2)], valid: (b) => b[1] > 0 && b[2] > 0 },
];

function changePoints(form) {
  const step = 0.25;
  const [first, second] = form.grid;
  const out = [];
  for (let a = first[0]; a <= first[1]; a += step) {
    if (!second) { out.push([a]); continue; }
    for (let b = Math.max(second[0], a + 1); b <= second[1]; b += 0.5) out.push([a, b]);
  }
  return out;
}

function fit(form, months) {
  const t = months.map((m) => m.temp);
  const y = months.map((m) => m.perDay);
  const w = months.map((m) => DAYS[m.m]);  // per-day model, weighted by days in the month
  let best = null;
  for (const cps of changePoints(form)) {
    const X = t.map((v) => form.features(v, cps));
    const b = solve(X, y, w);
    if (!b || !form.valid(b)) continue;
    const sse = X.reduce((s, row, i) => s + w[i] * (y[i] - row.reduce((a, x, j) => a + x * b[j], 0)) ** 2, 0);
    if (!best || sse < best.sse) best = { cps, b, sse };
  }
  if (!best) return null;
  const predict = (temp) => form.features(temp, best.cps).reduce((a, x, j) => a + x * best.b[j], 0);
  // Guideline 14 statistics on the monthly totals.
  const n = months.length;
  const actual = months.map((m) => m.energy);
  const fitted = months.map((m) => predict(m.temp) * DAYS[m.m]);
  const mean = actual.reduce((a, v) => a + v, 0) / n;
  const resid = actual.map((v, i) => v - fitted[i]);
  const dof = n - form.p;
  const rmse = Math.sqrt(resid.reduce((a, r) => a + r * r, 0) / dof);
  const cv = rmse / mean;
  const nmbe = resid.reduce((a, r) => a + r, 0) / (dof * mean);
  let id = form.id;
  if (form.id === "4P") id = best.b[1] >= best.b[2] ? "4PH" : "4PC";
  return { ...form, id, cps: best.cps, b: best.b, predict, cv, nmbe, rmse, dof, compliant: cv <= 0.15 && Math.abs(nmbe) <= 0.05 };
}

function evaluate(months) {
  const baseline = months.filter((m) => m.year === 1);
  const reporting = months.filter((m) => m.year === 2);
  const models = FORMS.map((f) => fit(f, baseline)).filter(Boolean);
  const compliant = models.filter((m) => m.compliant).sort((a, b) => a.cv - b.cv);
  const winner = compliant[0] || null;
  let saving = null;
  if (winner) {
    const expected = reporting.reduce((a, m) => a + winner.predict(m.temp) * DAYS[m.m], 0);
    const used = reporting.reduce((a, m) => a + m.energy, 0);
    const F = (expected - used) / expected;
    // Guideline 14 fractional savings uncertainty, no autocorrelation (n' = n),
    // expressed as points of the baseline: t · 1.26 · CV · sqrt((1 + 2/n) / m).
    const n = baseline.length, m = reporting.length;
    const u = t90(winner.dof) * 1.26 * winner.cv * Math.sqrt((1 + 2 / n) / m);
    saving = { expected, used, F, u };
  }
  return { models, winner, saving };
}

// A value that rounds to zero prints as 0, never as "-0.00".
const pct = (v, d = 1) => `${(Math.abs(v * 100) < 0.5 * 10 ** -d ? 0 : v * 100).toFixed(d)}%`;

function draw(root, state) {
  const months = synthesize(state);
  const { models, winner, saving } = evaluate(months);
  const P = {
    ink: css("--ink"), ink2: css("--ink-2"), muted: css("--muted"), grid: css("--line"), axis: css("--line-strong"),
    surface: css("--surface"), s1: css("--series-1"), s2: css("--series-2"), soft: css("--series-muted"), font: css("--font"),
  };
  const layout = (extra) => ({
    paper_bgcolor: P.surface, plot_bgcolor: P.surface, font: { family: P.font, color: P.ink2, size: 12 },
    hoverlabel: { bgcolor: P.surface, bordercolor: P.axis, font: { color: P.ink } },
    legend: { orientation: "h", x: 0, y: -0.24, font: { color: P.ink2 } }, ...extra,
  });
  const config = { displaylogo: false, responsive: true, displayModeBar: false };

  // 1. Energy per day against outdoor temperature, with every candidate fit.
  const sweep = Array.from({ length: 81 }, (_, i) => 6 + i * 0.25);
  const base = months.filter((m) => m.year === 1);
  const rep = months.filter((m) => m.year === 2);
  const traces = models.filter((m) => m !== winner).map((m, i) => ({
    type: "scatter", mode: "lines", name: i === 0 ? "Other candidate models" : m.id, legendgroup: "others",
    showlegend: i === 0, x: sweep, y: sweep.map(m.predict), line: { color: P.soft, width: 1.5 },
    hovertemplate: `${m.id}: %{y:.0f} kWh/day at %{x:.1f} °C<extra></extra>`,
  }));
  if (winner) {
    traces.push({
      type: "scatter", mode: "lines", name: `Selected baseline: ${winner.id}`, x: sweep, y: sweep.map(winner.predict),
      line: { color: P.s1, width: 2.5 }, hovertemplate: `${winner.id}: %{y:.0f} kWh/day at %{x:.1f} °C<extra></extra>`,
    });
  }
  traces.push({
    type: "scatter", mode: "markers", name: "Baseline year", x: base.map((m) => m.temp), y: base.map((m) => m.perDay),
    text: base.map((m) => `${MONTHS[m.m]}, year 1`), marker: { size: 9, color: P.s1, line: { color: P.surface, width: 2 } },
    hovertemplate: "%{text}<br>%{x:.1f} °C · %{y:.0f} kWh/day<extra></extra>",
  }, {
    type: "scatter", mode: "markers", name: "Reporting year (after go-live)", x: rep.map((m) => m.temp), y: rep.map((m) => m.perDay),
    text: rep.map((m) => `${MONTHS[m.m]}, year 2`), marker: { size: 9, color: P.s2, line: { color: P.surface, width: 2 } },
    hovertemplate: "%{text}<br>%{x:.1f} °C · %{y:.0f} kWh/day<extra></extra>",
  });
  window.Plotly.react(root.querySelector("[data-bm=fit]"), traces, layout({
    height: 340, margin: { l: 56, r: 12, t: 10, b: 70 },
    xaxis: { title: { text: "Mean outdoor temperature of the month (°C)", font: { size: 12, color: P.muted } }, gridcolor: P.grid, zeroline: false, tickfont: { color: P.muted } },
    yaxis: { title: { text: "kWh per day", font: { size: 12, color: P.muted } }, gridcolor: P.grid, zeroline: false, tickfont: { color: P.muted }, rangemode: "tozero" },
  }), config);

  // 2. The two years as a time line, with the projected baseline and its noise band.
  const labels = months.map((m) => `${MONTHS[m.m]} Y${m.year}`);
  const series = [{
    type: "scatter", mode: "lines+markers", name: "Measured", x: labels, y: months.map((m) => m.energy),
    line: { color: P.s1, width: 2 }, marker: { size: 6, color: P.s1 },
    hovertemplate: "%{x}: %{y:,.0f} kWh<extra>measured</extra>",
  }];
  if (winner) {
    const projected = rep.map((m) => winner.predict(m.temp) * DAYS[m.m]);
    const band = t90(winner.dof) * winner.rmse;
    const repLabels = rep.map((m) => `${MONTHS[m.m]} Y2`);
    series.unshift({
      type: "scatter", mode: "lines", x: repLabels.concat([...repLabels].reverse()),
      y: projected.map((v) => v + band).concat(projected.map((v) => v - band).reverse()),
      fill: "toself", fillcolor: css("--accent-wash"), line: { width: 0 }, hoverinfo: "skip", name: "Model noise band (90%)",
    });
    series.push({
      type: "scatter", mode: "lines", name: "Projected baseline (what it would have used)", x: repLabels, y: projected,
      line: { color: P.s2, width: 2, dash: "dash" }, hovertemplate: "%{x}: %{y:,.0f} kWh<extra>projected</extra>",
    });
  }
  window.Plotly.react(root.querySelector("[data-bm=time]"), series, layout({
    height: 300, margin: { l: 64, r: 12, t: 10, b: 76 },
    shapes: [{ type: "line", xref: "x", yref: "paper", x0: 11.5, x1: 11.5, y0: 0, y1: 1, line: { color: P.axis, width: 1.5 } }],
    annotations: [{ x: 11.6, y: 1, xref: "x", yref: "paper", text: "go-live", showarrow: false, xanchor: "left", yanchor: "top", font: { size: 11, color: P.muted } }],
    // Fixed order: the band trace comes first and holds only year 2, which would
    // otherwise make Plotly list year 2 before year 1.
    xaxis: { type: "category", categoryorder: "array", categoryarray: labels, tickangle: -45, tickfont: { color: P.muted, size: 10 }, gridcolor: "rgba(0,0,0,0)" },
    yaxis: { title: { text: "kWh per month", font: { size: 12, color: P.muted } }, gridcolor: P.grid, zeroline: false, tickfont: { color: P.muted }, rangemode: "tozero" },
  }), config);

  // 3. The tournament table: the accessible twin of the fit chart.
  const rows = [...models].sort((a, b) => a.cv - b.cv).map((m) => `
    <tr class="${m === winner ? "win" : ""}">
      <td>${m.id}${m === winner ? " <span class=\"pass\">✓ selected</span>" : ""}</td>
      <td class="n">${m.cps.map((c) => `${c.toFixed(2)} °C`).join(" · ")}</td>
      <td class="n">${pct(m.cv)}</td><td class="n">${pct(m.nmbe, 2)}</td>
      <td>${m.compliant ? "<span class=\"pass\">✓ meets Guideline 14</span>" : "<span class=\"fail\">✗ outside the limits</span>"}</td>
    </tr>`).join("");
  root.querySelector("[data-bm=table]").innerHTML = `<table><thead><tr><th>Model</th><th class="n">Change point(s)</th>
    <th class="n">CV(RMSE)</th><th class="n">NMBE</th><th>Guideline 14 (≤15% / ±5%)</th></tr></thead><tbody>${rows}</tbody></table>`;

  const verdict = root.querySelector("[data-bm=verdict]");
  if (!winner) {
    verdict.innerHTML = "<strong>No model meets Guideline 14.</strong> With this much noise the benchmark is rejected: no saving is invoiced against it, and the report falls back to comparing against a peer building.";
  } else {
    const lo = saving.F - saving.u, hi = saving.F + saving.u;
    const clear = lo > 0;
    verdict.innerHTML = `<strong>Saving ${pct(saving.F)} ± ${(saving.u * 100).toFixed(1)} pts</strong> at 90% confidence. `
      + (clear ? `It lies between ${pct(lo)} and ${pct(hi)}, clear of the model's noise.`
        : `The interval reaches zero, so the saving cannot be told apart from the model's noise and would not be claimed.`)
      + ` Baseline: ${winner.id}, CV(RMSE) ${pct(winner.cv)}.`;
  }
}

function init() {
  const root = document.querySelector("[data-benchmark]");
  if (!root || !window.Plotly) return;
  const state = { shape: "both", noise: 4, saving: 15, seed: 7 };
  const shapes = root.querySelector("[data-bm=shape]");
  const noise = root.querySelector("[data-bm=noise]");
  const saving = root.querySelector("[data-bm=saving]");
  const redraw = () => {
    for (const b of shapes.querySelectorAll("button")) b.setAttribute("aria-pressed", String(b.dataset.value === state.shape));
    root.querySelector("[data-bm=noise-out]").textContent = `${state.noise}%`;
    root.querySelector("[data-bm=saving-out]").textContent = `${state.saving}%`;
    draw(root, state);
  };
  shapes.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { state.shape = b.dataset.value; redraw(); } });
  noise.addEventListener("input", () => { state.noise = Number(noise.value); redraw(); });
  saving.addEventListener("input", () => { state.saving = Number(saving.value); redraw(); });
  root.querySelector("[data-bm=reseed]").addEventListener("click", () => { state.seed = Math.floor(Math.random() * 1e9); redraw(); });
  noise.value = state.noise; saving.value = state.saving;
  redraw();
}

init();
