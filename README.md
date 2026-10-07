# Portfolio of Elisa Valente

Source of https://mariaevalente.github.io. A static site with no build step: plain HTML,
CSS and JavaScript, with Plotly.js for the charts.

## Run it locally

Browsers block data files when a page is opened straight from disk, so serve the folder:

```
python -m http.server 8765
```

Then open http://127.0.0.1:8765.

## Layout

| Path | What it is |
|---|---|
| `index.html` | Home: introduction, selected work, about, contact |
| `work/*.html` | One page per project; `work/valente.html` is the interactive explorer |
| `report/bandora-4all-demo.html` | A client report exported from the production renderer, on simulated data |
| `assets/css/site.css` | All styles |
| `assets/js/valente-chart.js` | The Valente chart renderer |
| `assets/js/explorer.js` | Explorer controls, year strip, linked zoom and table view |
| `assets/js/showcase.js` | The live chart on the home page |
| `assets/js/results.js` | Charts of the predictive-controller study |
| `assets/js/benchmark.js` | ASHRAE Guideline 14 explainer, on synthetic data generated in the browser |
| `assets/js/isotherms.js` | The contour-line background |
| `assets/js/gallery.js` | Travel photo grid and full-size viewer |
| `assets/vendor/plotly.min.js` | Plotly.js 2.35.2, MIT licence |
| `data/` | Frozen simulated and anonymised data; formats in `data/README.md` |
| `print.html` | Source of `Elisa_Valente_Portfolio.pdf` |
| `Elisa_Valente_CV.pdf` | CV |
| `tools/check_anonymity.py` | Pre-publish check |
| `tools/make_gallery.py`, `tools/gallery.json` | Builds the photo gallery |
