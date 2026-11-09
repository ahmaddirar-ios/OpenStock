# Code structure: what is where, and what is still owed

Date: 2026-11-09

## The layout

| Layer | Rule |
|---|---|
| `app/` | Routes only. Route groups `(auth)`, `(marketing)`, `(root)`. Pages read props and render; no business logic. |
| `lib/actions/` | `*.actions.ts` — the only client-callable writes. Each one re-checks its capability. |
| `lib/<domain>/` | Domain logic, pure where possible: `chart/`, `market/`, `formula/`, `strategy/`, plus `better-auth/`, `shell/`, `ops/`, `seo/`, `tools/`, `inngest/`, `nodemailer/`. |
| `components/<feature>/` | One folder per route family, matching `app/(root)` names. |
| `database/models/` | One file per collection. |
| `__tests__/` | One test file per module, named after it. |

The chart cluster (39 files) now lives in `lib/chart/`, the market cluster (15) in `lib/market/`,
formulas (4) in `lib/formula/`, strategies (5) in `lib/strategy/`. `lib/` itself went from 100 loose
files to 37, and imports are the only thing that changed — behaviour and tests are untouched.

## Still owed (in priority order)

1. **`lib/i18n.ts` (≈3,950 lines)** — split into `lib/i18n/en.ts`, `lib/i18n/ar.ts` and a small
   `index.ts` that keeps `tx`, `arDigits` and the `StringKey` type. The keys already fall into blocks
   (nav, admin, ops, tools); the split is mechanical and type-checked.
2. **`components/stocks/YahooChart.tsx` (≈3,920 lines)** — the chart host. Extract, in this order:
   data/series wiring, then overlays, then the toolbar, then the panel menu. Each extraction should
   move its own tests with it.
3. **`lib/chart/drawings.ts` + `components/stocks/ChartDrawings.tsx` (≈1,980 + 1,900)** — split
   model, hit-testing and rendering apart. Model first; it has the most test coverage.
4. **`lib/chart/studies.ts` (≈1,075)** — one file per study family, keeping `define()` in an `index`.
5. **`lib/actions/`** — 22 files is fine; only `adanos.actions.ts` carries a helper file, so the
   suffix convention holds.

Do these one at a time, with `tsc`, the full suite and a production build after each. Nothing above
changes behaviour, so every step must keep the 1,535 tests green.
