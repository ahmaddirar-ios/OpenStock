# The overview becomes a terminal — design

Date: 2026-11-05 · Status: approved (conversation), ready for a plan

## The problem

The overview is a chart pane and a watch pane with generous white space and two stacked
toolbars. The reference the owner keeps coming back to — TickerChart — is not prettier; it is
**denser and more informative in the same pixels**: a market ribbon, a row of session statistics,
a chart with its own quote header, and a table whose change column is a filled block. Our screen
asks the eye to travel between cards to answer questions the reference answers in one glance.

Approved goal: raise the overview to that level, without touching other pages and without new
data sources.

## What the terminal shows (five slices)

1. **Market ribbon** — one 28px row above the grid: TASI and three regional indices with last and
   change, then today's turnover, share volume, and advancers/decliners. Prices come from the
   world board already loaded for the watch pane; the statistics come from the Saudi board, streamed
   in its own `Suspense` so the chart never waits for the scanner.
2. **Chart quote header** — inside the chart pane, above the toolbar: symbol, last, change, the
   session phase, and the delay chip. It answers "what am I looking at" without a trip to the
   stock page.
3. **Density** — panel headers 30px (from 44) at 11px type, grid gap 8px (from 12), table rows
   24px (from 30), tabular numerals, and no hatch texture on the overview's panels.
4. **Watch table** — the change cell becomes a filled block (green/red, quiet when flat), and
   last/change sort on click with `aria-sort`. Sector grouping stays.
5. **Status bar** — one line, 10.5px, monospace digits, no repeated prose.

Both themes must work; dark is the default and the one the reference uses.

## Boundaries

- No new endpoints, no new providers. Reuse `loadWorldBoard`, `loadSaudiBoard`, `YahooChart`'s
  candles, and the existing session helpers.
- The Saudi board may be stale or missing: the ribbon renders the indices and simply omits the
  statistics it does not have. It never shows a skeleton that pushes the layout.
- Other pages keep their current spacing; the density rules are scoped to the overview shell.
- No drag-resizing, tabs, or watchlist groups — that is the next slice, not this one.

## Files

- `components/markets/MarketRibbon.tsx` (new, server), `lib/market-ribbon.ts` (new, pure
  formatting + tests)
- `lib/saudi-market.ts` — add `turnover` and `volume` to the board (additive)
- `app/(root)/dashboard/page.tsx` — ribbon, pane props, suspense
- `components/Panel.tsx` — a `dense` variant, used by the overview only
- `components/markets/MarketWatch.tsx` + `MarketWatchTable.tsx` — sorting, change block
- `components/stocks/YahooChart.tsx` — quote header in `fill` mode
- `app/globals.css` — `.terminal-*` rules scoped under `.overview`
- `lib/i18n.ts` — ribbon labels

## Testing

- Pure tests: `market-ribbon` formatting (Arabic digits, signed change, missing quotes), board
  totals, table sorting (stable, directional, `aria-sort`).
- Component tests: ribbon renders indices and omits missing stats; table sorts on header click;
  quote header shows the delay chip.
- Visual: 1440×900 and 1280×800 dark, 390×844 dark, one light pass. No page scroll at 1440.
