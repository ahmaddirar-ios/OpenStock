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
| Indicators | ✅ 26 studies + 1 custom formula study (SMA…Aroon, Ichimoku, SuperTrend, Donchian, Keltner, SAR, pivots, MFI…), in-pane oscillators, per-study style/width/source |
| Formula language | ✅ Pine-lite: saved formulas, visual builder that round-trips the string, formula *as a study* |
| Strategy lab | ✅ 6 published rules + custom strategies (6 rule kinds, custom params, optimizer up to 2000 combos), next-open fills, costs, 12 metrics, benchmark, trade CSV |
| Alerts | ✅ price/RSS/ATR/52w/formula/strategy conditions, 5 rules per alert, drawing-anchored alerts, on-visit checker + Inngest cron, 200-event log |
| Screener | ✅ market/sector/index filters, search, CSV export |
| Chart page | ✅ 10 intervals incl. 2h/4h aggregation, session breaks, log/%/indexed scale, invert, 4 time zones, palettes (presets + hand overrides), chart templates, image export, share link, fullscreen, compare (3 symbols, % share-axis), replay with paper fills + ghost bars, go to date, back to latest, watermark, CSV export, bar countdown, 1-min background refresh |
| Charts grid | ✅ 4 layouts, shared interval/indicators/crosshair, drawings per pane, drawings list |

## Gaps that matter, in the order I would close them

### Tier 1 — a trader notices these in the first week

1. **❌ Alerts do not reach the phone.** The log is a page you visit; TradingView pops a toast and
   plays a sound. We already have a cron and a log table, so this is a notification surface, not a
   new backend: in-app toast/beep while a Rovex tab is open, web push for when it is not (needs a
   service worker + VAPID keys), and an email digest as the fallback. *Recommended next.*
2. **❌ No measure/ruler on the chart.** Drawing a box reads price and time, but there is no
   drag-to-measure that shows Δprice, Δ%, bars, and elapsed time while the mouse moves. Pure overlay,
   reuses `measureSpan`.
3. **🟡 No right-click menu.** Every TradingView object has one (delete, clone, alert, style, lock,
   visibility). Ours is a selection toolbar — fine, but a context menu on right-click is the muscle
   memory most traders bring with them.
4. **❌ No hotkey reference for the drawing rail** beyond `?`; no way to search a *setting* (only the
   tool palette searches).

### Tier 2 — depth on what exists

5. **❌ Strategy library has no page of its own.** Saved/optimised strategies live inside the chart
   menu; TradingView's strategy tabs are first-class pages with a comparison table.
6. **🟡 Optimizer is a list, not a picture.** TradingView shows the parameter surface and lets you
   click a cell back into the lab; ours ranks rows.
7. **🟡 Indicator set is good, not complete.** Missing the ones Saudi/US desks actually ask for:
   Keltner channel fill width, Awesome Oscillator, Chaikin MF, DMI±, Stochastic RSI, Pivot Points
   (weekly/monthly), Volume Profile as a *study* (we have it as a drawing), VWAP anchored bands.
8. **🟡 No "compare to" for indicators** (correlation / spread panes).

### Tier 3 — infrastructure TradingView has and we do not

9. **❌ No REST API for bars and indicators** for users' own scripts (TradingView does not have one
   either; this is a *lead*, not a gap — worth keeping in mind).
10. **❌ Extend/subtend line tools, callouts with arrows, and "copy style" across drawings.**
11. **🟡 Print/PDF of the chart** (image export exists; print layout does not).
12. **🟡 No keyboard-driven trading** in replay (buy/sell by hotkey), no bracket orders (replay has
    bracket intents, not entry+stop+target as one order).

## Suggested order

1 → 2 → 5 → 6 → 7 (indicators: Anchored VWAP bands, Stoch RSI, DMI±, Awesome Osc, Volume Profile study)
→ 3 → 10 → 11 → 12.

The first two are small and land in a day each; 5 and 6 are one shared piece of work (a strategies
page that owns the lab's saved/optimised runs); 7 is a steady drip of one indicator at a time.
