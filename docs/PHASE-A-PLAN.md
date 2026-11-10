# Phase A — trustworthy numbers

Goal: no headline number on the portfolio or the screener may be wrong or misleading.

## A1 · Portfolio never adds currencies together

- [x] `lib/portfolio.ts`: `normalizeCurrency`, `groupByCurrency`, `sumByCurrency` (pure).
- [x] Portfolio page: per-currency groups, dominant currency chosen by value (not by a `sar` boolean),
      benchmark + headline return computed on the dominant group only, realised P&L per currency.
- [x] `TradeLedger`: each trade/sale priced in its own symbol's currency, not one blanket currency.
- [x] `BenchmarkCard` + `PortfolioTable`: state which currency the comparison speaks for when the
      account is mixed, and that the currencies are never added together.
- [x] `getPortfolioSummary` (dashboard): dominant currency only, `mixed` flag, no silent addition.

## A2 · Cash and buying power

- [x] `database/models/portfolio-cash.model.ts` — one document per user, balances per currency.
- [x] `getCashBalances` / `setCashBalance` server actions, validated and bounded (`parseCashBalance`).
- [x] `components/portfolio/CashCard.tsx` — cash, invested, equity, buying power per currency.
- [x] Wired into `/portfolio`; `portfoliocashes` added to `scripts/e2e/reset.mjs`.

## A3 · Screener says how much it actually knows

- [x] `lib/screener.ts`: `coverage(priced, total)` (pure).
- [x] `ScreenerTable`: honest `priced / total` line, explicit missing count, actionable "price the rest".
- [x] `scr.sub` no longer claims every company is priced (en + ar).

## Tests / gate

- [x] Vitest for `normalizeCurrency`, `groupByCurrency`, `sumByCurrency`, `parseCashBalance`, `coverage`.
- [x] `npm run test:e2e` green: 82/82 (chart-tools 34, tools 26, depth 11, boards 11), no page errors.
- [x] `tsc`, `lint` (new files), `vitest` (1610 passed / 4 skipped), `build`.

## Phase B · The three workflow gaps the sweep found

- [x] **Full alert edit.** `updateAlert` accepts `symbol`, `condition` and `params`; a client-sent
      symbol is validated exactly as on create, a drawing alert refuses to move (its line belongs to
      one chart), a symbol change clears the stale cross and firing, and `rules[0]` is kept in step
      with the document. The edit row now has a symbol field and a condition select; a text rule
      (formula/strategy) hides the number inputs, and a drawing rule keeps its own condition.
- [x] **Watchlist sorting.** `sortWatchlist` (pure) orders by symbol, price, today, change or market
      cap; unpriced rows always sort last in both directions and ties keep their incoming order.
      Headers are buttons with `aria-sort`, and the chosen order is remembered in `localStorage`.
- [x] **Multi-symbol backtest.** `parseBasket` (comma/space/semicolon/newline, de-duplicated, capped
      at `MAX_BASKET_SYMBOLS = 10`) and `basketSummary` (pooled trades, averaged equity curve,
      best/worst). The studio runs the same rules across the basket, shows the aggregate KPI grid and
      a per-symbol table, and lists symbols it could not price instead of counting them as flat runs.

## Tests / gate (Phase B)

- [x] Vitest: 1,627 passed / 4 skipped (104 files) — +6 `updateAlert`, +5 `sortWatchlist`,
      +4 `parseBasket`/`basketSummary`.
- [x] `npm run test:e2e` green: 86/86 (chart-tools 34, tools 30, depth 11, boards 11), no page errors.
- [x] `tsc`, `lint` (new files), `build`.

## Follow-ups (Phase C, not done)

- Bar replay (step through history bar by bar) — the one remaining gap a discretionary trader named.
- An FX rate, if one is ever added, would let a single account-wide total exist — until then the
  per-currency rule stands.
