# Building Operations Analytics | Front-End Engineering Showcase

**Route:** [`/building-analytics`](../app/building-analytics/page.jsx) · [View dashboard source](../app/building-analytics/page.jsx)

A hands-on React interface for exploring time-series equipment signals across **12 fictional properties and 216 fictional assets**, with 96 deterministic 15-minute samples per asset (up to 20,736 measurements). This feature is intentionally distinct from Service Health Console's real local probe ingestion and incident APIs.

## Why this project

The UI addresses a product architecture problem common to data-intensive enterprise dashboards: transform high-volume operational measurements into clear, prioritized and reviewable decisions without hiding missing data or implying that advisory actions control equipment.

## Features

- **Cross-property command view:** multi-building KPIs, active signal coverage, warning/critical counts, and aggregated average power demand.
- **Time-series visualization:** reusable, screen-reader-labeled SVG charts for 90-minute, 6-hour and 24-hour windows, with portfolio/property scope and asset drilldown.
- **Interactive workflows:** combine building, equipment type, status, keyword search and sorting; navigate large inventories using 18-row pagination.
- **Operational safety:** stale and missing signals remain explicitly unknown; they are never treated as healthy, zero consumption, or safe to control.
- **Human-in-the-loop review:** note entry requires a deliberate confirmation step; the log is ephemeral browser-session state. There is **no equipment actuation or external service integration**.
- **React engineering:** isolated pure analytics functions, memoized derivations, one-way data flow, accessible status text, accessible focus rings, and reduced-motion CSS.
- **Responsible simulations:** advancing the timer only advances a deterministic synthetic model, not live physical-world monitoring.

## Run

Requires Node 24+. From repository root:

```sh
npm ci
npm test
npm run build
npm run dev
```

Open `http://localhost:3102/building-analytics`. The route requires **no token**, **no paid API**, and **no environment secret**. Use **Start simulation** to advance the generated signal model every 8 seconds. The existing operations console remains at `/`.

## Test coverage and CI

`tests/building-analytics.test.mjs` checks reproducibility, bounded sample generation, missing and stale conditions, state classification, conservative aggregation, windows, filters and sort order. The existing CI workflow runs `npm test`, a Next production build, smoke checks and a container build on push and pull request.

## Architecture decisions and trade-offs

| Decision | Rationale | Limitation |
| --- | --- | --- |
| Pure deterministic data model | Reproducible reviews and precise tests | Not actual IoT or BMS integration |
| React `useMemo` around derivations | Avoid repeat filtering and portfolio aggregation on unrelated interactions | Not streaming server aggregation |
| SVG time-series chart | Accessible, dependency-free vector visualization | Not Highcharts, KendoReact or a charting license claim |
| 18-row pagination | Bounded DOM cost in large inventories | No server-side pagination |
| Local review log | Demonstrates deliberate operator workflow without side effects | Not auditable permanent storage |
| Visible unknown state | Prevents false sense of normal operation | Basic thresholds are illustrative, not calibrated |
| Synthetic 15-minute readings | Enables deterministic demonstration of trends | No energy-savings claim or actual hardware control |

**Security and provenance:** Data, thresholds, sites, readings and guidance are fictional. The UI does not connect to, authenticate with, or operate physical building equipment. Do not use it to direct safety-critical decisions. Real deployments would need validated IoT telemetry, retained history, RBAC, monitoring, audited control approvals, user research, performance budgets and server-side aggregation.
