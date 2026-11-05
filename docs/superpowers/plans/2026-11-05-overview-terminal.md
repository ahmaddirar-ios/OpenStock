# Plan — overview terminal

1. **Board totals** — `lib/saudi-market.ts`: `turnover` (price × volume summed) and `volume`
   added to `SaudiBoard`; tests in `__tests__/saudi-market.test.ts`.
2. **Ribbon formatting** — `lib/market-ribbon.ts`: pick indices from a board payload, format last
   and signed change with the reader's digits; tests first.
3. **Ribbon component** — `components/markets/MarketRibbon.tsx` (server), statistics slot streamed
   by the page; CSS `.terminal-ribbon`.
4. **Density** — `Panel` gains `dense`; overview passes it; `.overview` scopes gap/head/table rules.
5. **Watch table** — sorting state in `MarketWatch` (last, change), `aria-sort` on headers, change
   cell as `.watch-block`; tests for the sort comparator and the rendered order.
6. **Quote header** — `YahooChart` renders it when `fill`: symbol, last close, change, phase, chip.
7. **Status bar** — single line, mono digits (shell-level, scoped to overview if the shell is shared).
8. **Verify** — vitest, tsc, eslint, build; browser at 1440/1280/390; commit; deploy; handoff note.
