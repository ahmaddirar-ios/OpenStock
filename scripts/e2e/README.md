# Trader sweep (end-to-end)

The suites a trader would run by hand, scripted: every destination, the chart tools, the portfolio,
the alerts centre, the custom-strategy studio, the watchlist and the screener. They drive a real
browser against a running server and report PASS/FAIL per check, with page errors collected along
the way.

They are **not** part of `npm test` (Vitest, no browser). Run them against a production build.

## One-time setup

```bash
npm install                     # playwright-core is a dev dependency
npx playwright install chromium # the browser playwright-core does not bundle
```

Seed a **disposable** review account (any plan you want to exercise) and export its credentials:

```bash
export E2E_EMAIL='trader-review@rovex.test'
export E2E_PASSWORD='…'
```

## Running

```bash
npm run build
npm run start            # http://localhost:3000, in another shell
npm run test:e2e         # reset, all suites, reset
```

A single suite:

```bash
node scripts/e2e/tools.mjs
```

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `E2E_BASE_URL` | `http://localhost:3000` | Where the app is running |
| `E2E_EMAIL` | — (required) | Review account e-mail |
| `E2E_PASSWORD` | — (required) | Review account password |
| `E2E_LANG` | `en` | UI language, `en` or `ar` |
| `E2E_CHROMIUM` | auto-detected | Chromium/Chrome binary for `playwright-core` |
| `MONGODB_URI` | from `.env` | Only read by `reset.mjs` |

## Suites

| File | What it covers |
| --- | --- |
| `chart-tools.mjs` | 15 destinations; add a study, chart type, draw/undo, the object menu, lock/hide/layers, copy-paste, templates, CSV export, the four-pane grid |
| `tools.mjs` | Portfolio (position + trade add/remove, cash set/clear), alerts (create, pause, resume, edit symbol + condition, delete, a rule that fires), custom-strategy studio (run, save, delete, basket run), watchlist (add/remove, column sort, remembered order), screener (filter, coverage line, CSV export) |
| `depth.mjs` | Screener formula filter over history, strategy KPIs and charts, the parameter-grid optimizer, the portfolio curve, and mixed currencies staying separate |
| `boards.mjs` | The command palette, the dashboard board (arrange/move/reset), the Saudi board, the pattern scanner |

## Housekeeping

`reset.mjs` deletes the review account's own rows (positions, trades, alerts, watchlist, saved
strategies, chart setups, dashboard layout) and clears the shared rate-limit buckets. The suites
also clean up after themselves through the UI; `reset.mjs` is the belt to that suspenders, and it
is what makes a re-run deterministic.

**Point this at a disposable account and database only.** It creates and deletes records, and
`reset.mjs` deletes rows by `userId`.
