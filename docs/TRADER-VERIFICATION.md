# Trader verification

What a professional trader would exercise on the terminal, checked against a production build with
a real browser, and the result of each pass. The suites behind it live in `scripts/e2e/` and run
with `npm run test:e2e`.

This is a behavioural pass, not a replacement for `npm test` (Vitest, unit and component level) or
`npx tsc --noEmit`.

## How it was run

- Production build (`npm run build` → `npm start`), headless Chromium, desktop viewport 1600×950,
  plus a separate RTL/mobile pass at a phone viewport.
- A disposable review account on the `pro` plan, reset to an empty state before every run.
- Page errors are collected on every route; a crash banner (`Something broke on this page`) fails
  the check. Two third-party errors are filtered as pre-existing and unrelated to the app: a
  TradingView `querySelector` `TypeError` and a `SyntaxError: Unexpected token '<'`.

## Result

| Suite | Checks | Result |
| --- | --- | --- |
| `chart-tools.mjs` | 34 | 34/34 |
| `tools.mjs` | 23 | 23/23 |
| `depth.mjs` | 10 | 10/10 |
| `boards.mjs` | 11 | 11/11 |
| **Total** | **78** | **78/78, zero page errors** |

Alongside these, the repository's own gate is green: `npm test` (1,598 passed / 4 skipped across 104
files), `npx tsc --noEmit`, `npm run lint`, `npm run build`.

## What was checked

### Destinations

`/dashboard`, `/watchlist`, `/portfolio`, `/alerts`, `/screener`, `/scanner`, `/saudi`, `/world`,
`/charts`, `/strategies`, `/strategies/custom`, `/tools`, `/profile`, `/help`, `/api-docs` — all
render with the expected content and no crash. The plan gate was verified separately: a locked page
answers a real `307` to `/tools?locked=…` before the shell streams, and a `pro` account renders all
of them.

### Chart

Add a study (SMA), switch the chart type (Heikin Ashi), draw a trend line, undo/redo, pan, measure,
the right-click object menu with no tool armed (alert on the drawing, bring to front / send to back,
duplicate, copy, lock, hide, layers), lock-all, copy + paste, templates, CSV export, and the
four-pane grid. A separate RTL/mobile pass confirms `dir=rtl`, `lang=ar`, no horizontal overflow,
Arabic-Indic digits and all rail controls present.

### Portfolio

Add a position (symbol, quantity, average cost) and remove it; record a trade (buy/sell, quantity,
price, fee, date, note) and delete it. The position metrics, the benchmark card and the equity curve
render with a real holding.

### Alerts

Create a rule from the centre, pause it, resume it, delete it. Create a rule that is already true and
watch it fire on `Check now` (a fired rule stays removable). Conditions come from the shared label
list, including candle-based and formula rules.

### Custom-strategy studio

Run a backtest on real candles and read the KPI grid (total return, CAGR, Sharpe, Sortino, max
drawdown, profit factor, expectancy, win rate, exposure, trades) and the equity/drawdown charts. Run
the parameter-grid optimizer (a full grid of 1,386 combinations), take the best row, save the
strategy to the account and delete it.

### Watchlist and screener

Add a symbol from its stock page, see it on the watchlist, remove it. On the screener: filter, run a
formula over each symbol's history (`close > sma(close, 20)` → "9 of 12 matched"), and export the
current results as CSV.

### Boards and palette

The command palette opens with `⌘K` and finds a symbol. The dashboard board arranges, moves and
resets. The Saudi board shows TASI and breadth and a row opens its chart. The pattern scanner runs
over a one-symbol universe and reports how many symbols answered.

## Notes

- Alerts are priced when the alerts page opens (there is no background cron in the demo), so a rule
  whose target is already met fires on the first check. That is intended, and the fired rule is
  still removable.
- The chart's export lives in the chart-settings menu as `Export chart data (CSV)`.
- The stock page's watch control is the text variant (`Watch` / `Watching`); the watchlist rows use
  the icon variant, whose accessible name carries the symbol (`Watching AAPL`).
