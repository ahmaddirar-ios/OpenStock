# Rovex / OpenStock chart — parity audit vs TradingView

Written 2026-11-07, after the live refresh, watermark, CSV export and bar countdown landed.
Scope is the chart product (symbol page chart, charts grid, strategy lab, screener/alerts), not the
marketing site or account flows.

Legend: ✅ shipped · 🟡 partial / weaker than TradingView · ❌ missing.

## What is already at parity

| Area | Notes |
| --- | --- |
| Chart types | ✅ candles, hollow, Heikin Ashi, bars, line, area, baseline, Renko, Kagi, Line Break, P&F (+ box/reversal inputs) |
| Drawings | ✅ 79 tools across 9 groups (lines, Fib, Gann, patterns, Elliott, forecast, shapes, annotation, brush), multi-select, lock/hide, per-drawing visibility by interval, per-drawing alert, per-drawing font override, templates of a stroke |
| Indicators | ✅ 33 studies + 1 custom formula study (SMA…Aroon, Ichimoku, SuperTrend, Donchian, Keltner, SAR, pivots by bar/week/month, MFI, Stoch RSI, Awesome Oscillator, Chaikin MF, correlation and spread against another symbol…), in-pane oscillators, per-study style/width/source |
| Formula language | ✅ Pine-lite: saved formulas, visual builder that round-trips the string, formula *as a study* |
| Strategy lab | ✅ 6 published rules + custom strategies (6 rule kinds, custom params, optimizer up to 2000 combos), next-open fills, costs, 12 metrics, benchmark, trade CSV |
| Alerts | ✅ price/RSS/ATR/52w/formula/strategy conditions, 5 rules per alert, drawing-anchored alerts, on-visit checker + Inngest cron, 200-event log, in-app toast + chime on every page, Web Push |
| Screener | ✅ market/sector/index filters, search, CSV export |
| Chart page | ✅ 10 intervals incl. 2h/4h aggregation, session breaks, log/%/indexed scale, invert, 4 time zones, palettes (presets + hand overrides), chart templates, image export, share link, fullscreen, compare (3 symbols, % share-axis), replay with paper fills + ghost bars, go to date, back to latest, watermark, CSV export, bar countdown, 1-min background refresh |
| Ruler | ✅ drag-to-measure with Δprice, Δ%, bars, elapsed time and volume, prices at both ends, clamped readout, `M` shortcut |
| Strategy library | ✅ `/strategies` lists the published rules and the trader's own shelf, opening a saved one straight in the studio |
| Optimizer surface | ✅ two parameters on the axes, objective as colour, click a cell to load it; the ranked table stays beside it |
| Charts grid | ✅ 4 layouts, shared interval/indicators/crosshair, drawings per pane, drawings list |

## Gaps that matter, in the order I would close them

### Tier 1 — a trader notices these in the first week

1. **✅ Alerts reach the trader.** A firing raises a toast with the rule that tripped and a short
   chime on any page, checked once a minute while a tab is open; Web Push covers the closed tab and
   the Inngest cron keeps the log. The alerts page carries the toast and chime switches.
2. **✅ Measure/ruler.** Shipped: drag from one point to another and the box reads Δprice, Δ%,
   bars, elapsed time and volume, with the price at each end and a readout that stays inside the
   plot. `M` arms it; the help panel lists it.
3. **✅ Right-click menu.** Shipped: a right-click on any drawing opens bring-to-front, send-to-back,
   duplicate, copy, copy/paste style, lock, hide and delete, plus *Alert on drawing* for any drawing
   that carries a line (the modal is snapshotted, so dragging the line later does not change what was
   promised). It works with no tool armed, clamps inside the viewport, and dismisses on an outside
   click, a scroll or Escape. Styling stays in the selection toolbar, which shows every control at
   once instead of hiding them behind a submenu.
4. **✅ Hotkey reference on the rail.** Every rail row shows its key beside the name (`Trend line  T`),
   with the key in the tooltip too; `?` still opens the whole-sheet reference. Searching a *setting*
   is still the settings menu's job — there is nothing to search in a six-control panel.

### Tier 2 — depth on what exists

5. **✅ Strategy library page.** `/strategies` carries the six published rules, the studio entry
   point and the trader's own shelf (browser + account, merged the same way the studio merges them);
   a saved strategy opens straight into the studio.
6. **✅ Optimizer surface.** Every combination the search ran is laid out as a two-parameter grid,
   coloured by the objective, with axis pickers and a legend; a cell click loads that combination.
   The ranked table stays, because a table is still the fastest way to read one number.
7. **✅ Indicator set is good, not complete.** Shipped: Stochastic RSI, Awesome Oscillator, Chaikin
   Money Flow, Pivot Points with a bar/week/month timeframe, the Keltner ribbon fill, Volume Profile as
   a *study* and Anchored VWAP with bands as a *study* (the anchor is a date, the bands are the
   volume-weighted deviation). DMI± already ships inside the ADX study.
8. **✅ "Compare to" for indicators.** Two studies take a ticker: **Correlation** (Pearson r over a
   window, +1 is the same move, -1 the mirror) and **Spread %** (the charted symbol against the other
   one's last close, in percent). They are deliberately different readings:

   - Correlation pairs bars **by time**, because a correlation between prices that never traded at
     the same moment is a number about nothing. Riyadh 07:00 UTC and New York 14:30 UTC still pair on
     daily bars; a Riyadh morning and a New York afternoon on 60-minute bars do not, and there the
     line stays empty rather than pairing by bar count — counting drifts by a week (a month holds
     **116 Riyadh hours against 161 New York ones**).
   - Spread needs only a price level, so it uses the other symbol's **last known close** (forward
     filled, a week at most). That keeps it readable while one market is closed, which is most of
     the day across time zones.

   Both refuse a partner series whose spacing is more than 2× off the chart's, so a stale daily fetch
   under a 60-minute chart paints nothing instead of something plausible. The pane says `%` on its
   axis and in the legend; the partner loads through the existing compare action (`getCompareCandles`),
   one request per symbol+interval per minute, and is refetched when the interval changes.

### Tier 3 — infrastructure TradingView has and we do not

9. **❌ No REST API for bars and indicators** for users' own scripts (TradingView does not have one
   either; this is a *lead*, not a gap — worth keeping in mind).
10. **✅ Extend, callout arrows, copy style.** Shipped: a trend line takes Extend left / Extend right
    (screen arithmetic, so it reaches the panel edge past the last bar); a callout aims at its anchor
    with an arrowhead; Copy style / Paste style carry colour, weight, dash, fill and type styling
    between drawings, replacing rather than merging. Right-clicking inside a box now opens the object
    menu on the box. Subtend (a second line drawn from the same origin at an angle) is not a tool
    yet — a trader gets there with the trend line and the angle readout.
11. **✅ Print / PDF.** Shipped: a print button captures the chart exactly as it looks — canvas, drawings,
    studies — and lays it on a one-page sheet with symbol, interval, last, the session move, the span
    covered and the studies on it. The browser's print dialog serves paper and "Save as PDF" alike; the
    tab is briefly renamed to rovex-SYMBOL-INTERVAL-DATE so the saved file has a sane name.
12. **✅ Keyboard replay trading and bracket orders.** Shipped: ⇧B buys at market, ⇧S sells the typed
    quantity, ⇧X closes the position, Space plays or pauses; the help sheet lists them instead of the
    drawing tools while a replay is running. A *bracket order* is one order — entry, stop and target —
    and the bracket arms on the bar that fills the entry, so a limit can carry its protection without
    a second decision after the fill. Keyed by `event.code`, so an Arabic layout places the same order.

## Suggested order

1 → 2 → 5 → 6 → 7 (indicators: Anchored VWAP bands, Stoch RSI, DMI±, Awesome Osc, Volume Profile study)
→ 3 → 10 → 11 → 12. (1 and 2 are done.)

The first two are small and land in a day each; 5 and 6 are one shared piece of work (a strategies
page that owns the lab's saved/optimised runs); 7 is a steady drip of one indicator at a time.
