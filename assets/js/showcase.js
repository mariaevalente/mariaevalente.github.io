// The home page's live charts: one day under the predictive controller in the window
// that overlaps the hero, and the year-at-a-glance strip for the Valente chart row.

import * as vc from "./valente-chart.js";

const BUILDING = "quick_service_restaurant_modified";
const ZONE = 2;
const DAY = Date.parse("2021-11-05T00:00:00Z");

async function main() {
  const day = document.querySelector("[data-showcase-day]");
  const year = document.querySelector("[data-showcase-year]");
  if (!day && !year) return;
  // "no-cache" revalidates with the server, so updated data is never hidden behind an old copy.
  const doc = await fetch(`data/valente/${BUILDING}/arrow.json`, { cache: "no-cache" }).then((r) => r.json());

  if (day) {
    const fig = vc.figure(doc, ZONE, DAY, DAY + vc.DAY, { height: Number(day.dataset.height) || 380, showLegend: false });
    window.Plotly.react(day, fig.data, fig.layout, { ...vc.CONFIG, displayModeBar: false });
    const stats = vc.windowStats(doc, ZONE, DAY, DAY + vc.DAY);
    const kpis = document.querySelector("[data-showcase-kpis]");
    if (kpis) {
      kpis.innerHTML = `<span class="kpi">energy <b>${stats.energy.toFixed(1)} kWh</b></span>`
        + `<span class="kpi">in comfort <b>${Math.round(stats.inside * 100)}%</b></span>`
        + `<span class="kpi">discomfort <b>${stats.discomfort.toFixed(1)} °C·h</b></span>`;
    }
  }
  if (year) {
    const fig = vc.yearFigure(doc, ZONE);
    fig.layout.height = year.clientHeight || 260;
    fig.layout.margin = { l: 34, r: 8, t: 8, b: 24 };
    window.Plotly.react(year, fig.data, fig.layout, { displayModeBar: false, responsive: true, staticPlot: true });
  }
}

main().catch(() => {
  for (const el of document.querySelectorAll("[data-showcase-day], [data-showcase-year]")) {
    el.textContent = location.protocol === "file:" ? "Open the site through a web server to see the live chart." : "The chart could not be loaded.";
  }
});
