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
| `tools/check_anonymity.py` | Pre-publish check |
| `tools/make_gallery.py`, `tools/gallery.json` | Builds `img/gallery/` from the chosen trip photos, with no location or camera metadata |

## Before every commit

```
python tools/check_anonymity.py
```

It must report 0 findings. It reads its patterns from `tools/denylist.local.txt`, which is
deliberately not in the repository and fails if that file is missing.

## After changing CSS or JavaScript

Pages load `site.css` and the scripts with a version tag (for example `?v=2026100604`) so browsers do not
keep an old copy. When a stylesheet or script changes, replace that date with the new one in
every `.html` file.

## Regenerating the PDF

With the local server running, from this folder in a Command Prompt:

```
"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --headless=new --disable-gpu --no-pdf-header-footer --virtual-time-budget=25000 --print-to-pdf="%CD%\Elisa_Valente_Portfolio.pdf" http://127.0.0.1:8765/print.html
```

Edge returns immediately and writes the file a few seconds later.

## Travel photos

The originals live in `img/trips/` and are not published (they carry GPS data and are
large). Keep them there, not in `img/gallery/`, which only holds the generated JPEGs. To
choose, caption or reorder the photos, edit the list in `tools/gallery.json` (the gallery
follows its order) and run:

```
python -m pip install --user pillow-heif rawpy
python tools/make_gallery.py
```
