# Data formats

Everything here is frozen data: simulated (EnergyPlus 24.2, ASHRAE 90.1 prototype
buildings, Lisbon weather, year 2021) or anonymised aggregate results. The site's own
JavaScript reads these files; nothing here depends on any other code base.

## `valente/<building>/` — format `valente-chart/1`

One folder per building, with `meta.json` and one file per controller
(`arrow.json`, `reactive.json`, `schedule.json`).

### `meta.json`

| Field | Meaning |
|---|---|
| `building.id`, `building.label`, `building.note` | Identifier, display name, one-line description |
| `weather` | Weather source and simulated year |
| `start` | Timestamp of index 0, ISO 8601, wall-clock time (no time zone, no DST) |
| `step_minutes` | Spacing of every array |
| `controllers[]` | `{id, label}` for each controller file |
| `zones[]` | `{id, label, comfort: [low, high], schedule_label}` |
| `outdoor_c` | Outdoor dry-bulb temperature, °C, one value per step |

### `<controller>.json`

| Field | Meaning |
|---|---|
| `controller.id`, `controller.label` | Which controller produced the run |
| `start`, `step_minutes`, `length` | Time axis: value `i` is at `start + i × step` |
| `totals.hvac_kwh`, `totals.discomfort_degree_hours` | Whole-year totals, as published in the results |
| `energy_kwh[]` | Building HVAC energy of the interval ending at each step, kWh |
| `zones[]` | One record per conditioned zone (below) |

Each zone:

| Field | Meaning |
|---|---|
| `id`, `label`, `comfort` | Zone and its comfort range in °C |
| `schedule[]`, `schedule_label` | Opening hours: `{days: [ISO weekday…], hours: ["HH:MM", "HH:MM"]}` |
| `occupied[]` | `[from, to)` index pairs when the zone is open |
| `temperature[]` | Room temperature, °C, `null` where missing |
| `setpoint[]` | Setpoint, °C, or `null` for the whole zone when there is none |
| `running[]` | `[from, to, mode)` index stretches when equipment serving the zone ran; mode is `cool`, `heat`, `fan`, `dry`, `auto` or `null` |
| `units` | Number of units serving the zone |

Discomfort is degree-hours outside the comfort range during opening hours. To add a
building, write files in this format and add it to the `data-buildings` list in
`work/valente.html`.

## `results/arrow_results.json` — format `arrow-results/1`

The predictive-controller study, ten buildings, anonymised: `headline` (the figures
quoted on the page) and `buildings[]` with energy and comfort per controller, the
changes against both baselines, and the first-to-second-generation comparison.
