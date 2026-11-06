# TradingView parity — progress ledger

Companion to `specs/2026-11-03-tradingview-parity-design.md`. One entry per workstream: what shipped,
the ruling behind anything ambiguous, the evidence, and what was deliberately left.

## A. A chart setup follows the trader to another device (commit 33fc013)

The gap: drawings and studies were one browser's localStorage keys (`openstock-drawings:<SYMBOL>`,
`openstock:chart-studies`), so a new device, another browser or cleared site data lost the work.

**Shipped.** `database/models/chart-setup.model.ts` (one row per user+symbol, unique index);
`lib/actions/chart-setup.actions.ts` (`loadChartSetup`, `saveChartSetup`, user always from the session);
`lib/chart-setup.ts` (the policy, pure and tested): `setupDecision`, `mergeSetup`, `parseChartSetup`, the
per-symbol "an unsent save is pending" flag. The chart reads localStorage first (instant) then asks the
account; a status line under the drawings list says which copy is current.

**Rulings.**
- An account copy is **merged**, never replaced: union by drawing id, one entry per study, both capped. Two
  devices therefore cannot lose each other's work. Cost if wrong: a drawing edited on two devices takes
  whichever copy arrived last (accepted; nothing is deleted).
- A browser whose account has nothing **pushes** its copy up — the migration for every chart drawn before
  today. A browser holding a failed save pushes rather than reads, so an offline session survives coming
  back online. Cost if wrong: an offline device's copy wins over a newer account copy made elsewhere.
- Signed out, nothing moves at all: localStorage only, exactly as before.
- **Interval and chart type stay local view preferences** — syncing them would change the chart's
  appearance on load for no benefit.
- The stored `drawings`/`studies` are `Mixed`, validated by the same parsers the loader and importer use.
  A `v` mismatch reads as "nothing stored", and the next save rewrites it in the current format.

**Evidence.** Unit tests for the decision table, the merge, the parser and the pending flag (13). End to
end on a local build with a real Mongo: a drawn trend line and an added SMA landed in `chartsetups`
(`{symbol: '2222.SR', v: 1, drawings: ['trend'], studies: ['sma']}`), and after removing **every**
`openstock*` key from the browser and reloading, both came back from the account with the status line
reading "Saved to your account".

**Left undone:** named templates, and syncing the compare list / alert list (both already server-side or
per-visit by design).

## B. An alert attached to a drawing (commit 9038e18)

**Shipped.** `lib/drawing-alert.ts` (anchor extraction, price-at-time, signed gap, the three rules,
`parseAnchor`), three conditions on the alert model (`DRAWING_CROSS_UP|DOWN|TOUCH`) with `anchor` and
`lastGap` stored, the modal in drawing mode (three rules + a band), a bell-with-plus in the chart toolbar
when a supported drawing is selected, and the same evaluation in both the on-visit checker and the
five-minute cron.

**Rulings.**
- The anchor is a **snapshot**, not a live reference: an alert is a promise made at a moment, so dragging
  the drawing afterwards cannot silently change what was promised. The UI says so.
- Only the straight-line family and levels can carry one (trend/ray/extended/arrow/trendangle/cross/
  pricetime, and horizontal/hray). Patterns, Fibonacci, Gann and the volume tools are refused: their
  "price at a moment" is an interpretation, and an alert on an interpretation is a broken promise.
- A cross needs the previous **gap** (a signed fraction of the line's price, so one band means the same
  thing on a 26.00 stock and a 9,876 index). The first check only records, exactly as the price crosses
  already behaved.
- A touch's band is 0.05–5%, default 0.3%, clamped on the way in and out.

**Two bugs the round trip caught that unit tests alone did not** (both now covered):
1. The mongoose model's `enum: ALERT_CONDITIONS` is compiled **once per process**; a dev process that
   predated the change rejected the new condition with `not a valid enum value`. Restarting fixed it — and
   it means a deploy must restart, which Vercel does.
2. `planCheck` was not passing the rule's `params` into the evaluator, so every touch used the default
   band. A test that is red without the fix now guards it.

**Evidence.** 17 unit tests for the geometry/rules + planner tests for the drawing path and the band.
Browser: a touch rule on a level 1.2% away **fired at 26.16** with a 5% band while the identical rule with
the default band stayed quiet; the gap was recorded on every check (`lastGap: -0.118`); the centre printed
`Touches the drawing 26.49 · Last 26.16 · Fired 26.16`.

## G. Dividends and splits on the bars (commit 562c371)

**Shipped.** `&events=div,splits` on the existing Yahoo request; `eventsFromChart` + `eventLabel` in
`lib/yahoo-candles.ts` (dropping a row with no usable date/amount/ratio, one event of each kind per
moment, oldest first); the chart paints them as series markers (a dividend as a circle below the bar
labelled `D 0.51`, a split as a square above labelled `2:1`); the event markers and the strategy's markers
now share one series through a single `syncMarkers`, so neither wipes the other.

**Rulings.** Events are drawn only on daily and longer intervals — Yahoo reports them against days, and a
five-minute chart would print the same marker dozens of times inside one session. Earnings are **not**
included: the chart endpoint does not carry them, so they need a separate quote-summary fetch (left for a
later pass rather than half-added).

**Evidence.** Yahoo returns 8 dividends for 2222.SR over two years; the weekly chart shows `D 0.34` beside
its bars with the drawings, level and legend intact.

## E (part). Baseline, and the grid's chart type (commit f789cbe)

**Shipped.** A ninth chart type, `baseline`: one colour above the base price and another below, the base
set after the data arrives (a series option can change after creation) so it lands on the first close on
screen. The `/charts` grid panes now read the same stored chart type as the single chart — they used to
draw candles whatever the trader had chosen.

**Ruling: Point & Figure is deliberately not here.** Unlike Kagi and Line break, it needs a column time
axis (a column is a reversal, not a bar) and its own pane renderer. That is a real piece of work and is
left for a pass of its own rather than guessed at.

**Evidence.** Browser: the menu offers Baseline, the series switches to a line with a dashed base, and the
stored type is `baseline`; no new console errors.

## C (part). Hiding an object, locking them all, keeping the tool armed (commit df1d4bf)

**Shipped.** `Drawing.hidden` (validated like `locked`, so a hand-edited `"yes"` cannot hide a chart) with
an eye per row — hidden drawings keep their id, their place in the list and their synced copy, and the
layer is simply not given them to paint. A "Lock all"/"Unlock all" switch. "Keep drawing" (TradingView's
"stay in drawing mode") remembered in this browser.

**Evidence.** Browser: hiding the trend line dropped the painted shapes from 2 to 1 while the row stayed
listed with a Show button; Lock all set both rows and flipped the button; with Keep drawing on, two
trendlines were drawn in a row without returning to the rail, and the tool stayed armed.

## Still on the queue (deliberately)

- **Magnet strength** (weak/strong; today one 14px tolerance and an on/off toggle).
- **Text formatting** for the note family (size, bold, background) and **named** drawing templates (a
  saved stroke per tool already exists).
- **Tool hotkeys** and a shortcut help panel.
- **Point & Figure**, and **earnings** dates on the chart (needs its own quote-summary fetch).
- **A share link** that carries a setup (reuses the transfer payload and A's storage).

## Found by testing every tool on the live chart (commit 2ac6212)

Drawing the rail's tools one by one on production, with a real mouse-move between clicks (the earlier
browser passes had placed a tool's points inside a single call, so React never painted the intermediate
state), the **fifth** tool took the whole chart down:
`TypeError: Cannot read properties of undefined (reading 'time')`.

The draft — the shape being drawn — was rendered with only the points placed so far plus the one under the
cursor. A three-click tool therefore reached its painter with two points, and any painter that reads
`points[2]` (channel, pitchfork, patterns, regression) read `undefined.time`. There is no error boundary
around the layer, so React unmounted the chart. **This affected every multi-point tool for every real
user**, and no test had it: the render tests only ever draw *stored* drawings (fully pointed), and every
browser check placed points faster than a frame.

Fix: the preview is padded up to the number of points its tool declares, by repeating the point under the
cursor — so a channel shows its first leg following the cursor, a pattern shows a degenerate preview, and
no painter can read a point that does not exist. The regression test walks eight multi-point tools, places
one point of each and moves the cursor; without the fix it fails with the exact production error.

## The live pass, and two more races (commit 1a8b70c)

Testing on the deployed site with real mouse-moves found the crash above; tidying up afterwards found two
races in the account sync, both of which would have bitten a real trader:

1. **The debounced save read its refs when it fired, not when it was scheduled.** Clearing a chart and
   switching symbol inside the debounce wrote the *next* symbol's state under the next symbol's name and
   dropped the clear — so the old copies came back on the next visit. A pending save now carries its target
   and payload from the moment it is scheduled, and leaving a symbol flushes whatever was still waiting.
2. **"Clear all" went through the debounce.** Because the merge is a union, an empty local set merged with
   the account's old copy restores every drawing: a trader who cleared and reloaded quickly would watch
   their work come back. A clear now goes straight to the account, cancelling any pending save.

Neither was reachable through a unit test (both live in the component's effect wiring), which is why the
live pass mattered: they are timing/ordering bugs, not arithmetic ones.
