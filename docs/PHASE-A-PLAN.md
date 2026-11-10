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

## Follow-ups (Phase B/C, not in this phase)

- Watchlist sorting; full alert edit (condition + symbol); multi-symbol backtest; bar replay.
- An FX rate, if one is ever added, would let a single account-wide total exist — until then the
  per-currency rule stands.
