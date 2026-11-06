# SDD ledger — plan: alert-centre review minors (OpenStock-arabic)

Scope: the seven minors from the fresh-context review of commit `4a79e70`
(recorded in `HANDOFF-openstock-chart.md` → Notes → "deferred minors").
Repo: `/Users/ahmadqasim/Desktop/AI Agint work/OpenStock-arabic`, branch
`demo/blocked-market-charts`. Spec: `specs/2026-11-01-alert-centre-design.md`
(the binding authority).

Worktree ruling: no new worktree — `demo/blocked-market-charts` is the demo branch
and the dev server (:3001) and Vercel project are wired to this checkout; a worktree
would break the browser pass and the deploy. The branch is already isolated from
`main`. Cost if wrong: the work shares a checkout with the previous slices (already
the case for this whole demo).

Tasks:
1. `planCheck()` in `lib/alerts.ts`: the fire/skip/remember decision, pure, shared by
   the on-visit action and the Inngest cron (kills the drift M3/M4 assert). Drop
   `distanceToTarget` (unspecced, used nowhere).
2. Align the two write-backs: a firing closes the rule (`active: false`) in both paths;
   both paths judge a quote with `Number.isFinite`.
3. `updateAlert`: only a *condition change* clears the remembered price; reactivating a
   fired rule re-arms it exactly like `rearmAlert`.
4. `AlertsCentre.errorKey`: an empty error code must not map to "unsupported symbol".
5. Remove the dead Cloud-era i18n keys and the unused new ones.
6. Checker index carries `userId`.
7. Pin the unpinned behaviour: `rearmAlert`'s full payload, `lastPrice` on firing,
   cross at equality.

Ruling: minors are in scope this pass (the human asked to continue OpenStock and the
review block is the agreed next slice) even though the executing-plans skill would
normally defer them; each is verified the same way (test RED→GREEN + green suite).
Cost if wrong: a slightly larger diff than a pure features pass.

Task 1-7: complete (commit 5e7206d; tests: `npx vitest run __tests__/alerts.test.ts
__tests__/alert-actions.test.ts` → 38 passed, then `npm test` 443/4 skipped, `next build`
ok, dev browser pass).

Feature 2 (indicator & volume alerts) executed inline in the same session on its own
spec (`specs/2026-11-02-indicator-alerts-design.md`) and plan
(`specs/2026-11-02-indicator-alerts-plan.md`): commit 268dda0 — 463 passed / 4 skipped,
`tsc` + eslint clean, `next build` ok, dev + live browser passes, deployed `ngmz688pv`.
Ruling: the plan's slice 6 (modal) got the five families in a select rather than a
radiogroup, because seven options no longer fit two buttons. Cost if wrong: a slightly
bigger diff in `CreateAlertModal`.

Feature 3 (notification channel) on `specs/2026-11-02-alert-push-design.md` + plan:
commit d629aee — 484 passed / 4 skipped, dev + live page pass, `/sw.js` public (the
middleware was redirecting it to sign-in), VAPID keys on Vercel, deployed `qjh3vo1nr`.
Ruling: the spec's `alertPushPayload({ …, lang })` signature dropped `lang` — the label
and value arrive already written in the reader's language, so a second language argument
would be dead weight. Cost if wrong: a caller has to pass a pre-written label.
Ruling: `sendToUser(userId, build)` takes a *builder* rather than one payload, because a
user may have two devices subscribed in two languages and one payload cannot serve both.
Cost if wrong: a slightly less obvious signature.
Ruling: the page shows a notification only when `document.visibilityState === 'hidden'`
(the toast covers a visible page) — so the automatic hidden-tab trigger could not be
exercised by automation, which cannot hide the tab. Cost if wrong: the fired→notification
path is covered by tests, not by a browser run (stated in the handoff).

Feature 4 (order types & brackets in paper trading) on
`specs/2026-11-02-replay-orders-design.md` + plan: commit f4daaa7 — 506 passed / 4 skipped,
`tsc` + eslint clean, `next build` ok, dev + live browser passes (limit fill at a gap, the
stop on dev and the target live), deployed `e1vv8w1jo`.
Ruling: `OrderFailure` gained `wrongSideOfMarket` rather than keeping a second refusal type,
so the panel's existing failure map covers every refusal with one key set. Cost if wrong: one
more member in an existing union.
Ruling: the bracket and the pending order carry a `placedAt` bar time and `settleBar` ignores
any bar at or before it, which is what makes "an order placed on this bar waits for the next
one" a tested rule instead of a calling convention. Cost if wrong: an intent placed at the
cursor can never fill on that same bar (intended).

Feature 5 (replay the `/charts` grid in sync) on the same agreed order: commit a84e97a —
512 passed / 4 skipped, `tsc` + eslint clean, `next build` ok, dev (AR) + live (EN) browser
passes, deployed `3qpaoal9x`.
Ruling: one shared cursor **time**, not one shared index — each pane clips to the same instant,
so two symbols with different histories still show the same date, and the readout counts bars on
the longest series (the anchor). Cost if wrong: "bar 800" means the anchor's bar, not every
pane's.
Ruling: the cursor is kept in a ref beside the state, because playback ticks faster than React
repaints two TradingView panes; reading only painted state advanced ~1.7 bars a second at the
10/s setting (measured 24 in 2.5 s after the fix). Cost if wrong: two sources of truth for one
number, kept in order by `moveCursor`.
Ruling: the start re-anchors forward until the trader touches the transport, because a pane that
reports its series late can carry a later warm-up bar; the first step/jump/play freezes it. Cost
if wrong: the readout can shift once, early, without a click.
Bug worth remembering: the "start the cursor" effect depended on `cursorTime` and a ref, so the
panes' reports never re-ran it — the readout sat on "Loading the panes…" with no console error
until a `seriesVersion` counter joined the dependency list.

Chart-feature program (chosen by the user after an audit against TradingView): A. legend → B.
indicators → C. chart types/scale → D. drawings → E. quick tools → F. chart alerts → G. details.

Feature A (legend) on that list: commit 5812e2e — 519 passed / 4 skipped, `tsc` + eslint clean,
`next build` ok, dev (AR) + live (EN) browser passes, deployed `cme70rqkx`.
Ruling: the legend is fed by the **host**, not recomputed in the component. The host already owns the
series it draws, so `subscribeReadout` fires on crosshair moves and on every `setData`, which makes
"the legend follows a replay step" a consequence instead of a special case. Cost if wrong: the host
API grows two members and the legend cannot be rendered without a host.
Ruling: `readoutAt` clamps outside the series (first/last bar) rather than returning null, because a
cursor past the last candle is still a question about the last candle. Cost if wrong: a hover far to
the right reads as the last bar instead of blank.
Ruling: `O/H/L/C` stay Latin in both languages (market convention, compact) with the full translated
name as the accessible label; digits still localise. Cost if wrong: Arabic readers get Latin
letters they mostly already read on charts.

Feature B1 (studies: registry + menu + Bollinger/VWAP/ATR) — commits cc5bf58, 402c46a, 273770c,
5deb36b, 44d6324, de166f4. Gates: 543 passed / 4 skipped, `tsc` clean, eslint clean on touched
files, `next build` ok, dev (AR) + live (EN) browser passes, deployed `9rr0wolib`.
Ruling: one **registry** owns every study's parameters, lines and compute; the host, menu, legend and
storage all read it. Adding a study is one entry + i18n keys. Cost if wrong: an irregular study
(one needing a non-numeric option, like a source or a colour) does not fit until `StudyParam` grows.
Ruling: studies are a **list with duplicates** (`StudyConfig[]`), not a set of flags — two SMAs are
two studies. Readout keys are `${index}:${line}` so the legend never merges them. Cost if wrong: a
stored list can hold the same study twice, which is exactly what traders ask for.
Ruling: `parseStudies` **drops and clamps** rather than throwing — an unknown id or a renamed
parameter must not blank a chart. Cost if wrong: a corrupt list silently loses entries.
Ruling: a parameter is **applied as it is typed** (clamped, draft kept for the box) instead of on
blur. Closing the panel by clicking away unmounts the input before `blur`, which lost the number in
the first build. Cost if wrong: typing "1" toward "120" briefly applies the minimum.
Ruling: changing a study must not **rebuild** the chart. `YahooChart` reads the list through a ref
and calls `setStudies` in its own effect; putting the list in the creation deps reset zoom, pan and
the replay position on every keystroke. Cost if wrong: one extra effect and a ref.
Ruling: a study whose window exceeds the loaded history draws nothing and opens no empty pane.
Verified: an SMA 200 on a ~180-bar history is silent, which is correct, not a bug.

B2 batch 1 (Stochastic, ADX/DMI, Williams %R, CCI, OBV) — commits 3dfedf4, 8caf982. Gates: 556
passed / 4 skipped, `tsc` clean, eslint clean, `next build` ok, dev (AR) + live (EN) passes,
deployed `m1jx13wms`.
Ruling: each batch is **one registry entry per study plus i18n keys** — no host, menu, legend or
storage change. The five studies proved the seam: neither `candle-host.ts` nor the legend's
structure needed touching, only the legend's number formatting (one decimal for the scores, compact
volume for OBV). Cost if wrong: a study that needs a new kind of input (a source, a colour, a
threshold line) will force `StudyParam` to grow, which is the next shape change.
Ruling: the ADX pair starts at index `period`, not at index `period − 1`. Bar 0 has no previous high
or low, so seeding the smoothed sums with it understates `+DI` (46.4 instead of 50 on a straight
rise). Documented in the function and pinned by a test with `plusDi[period] ≈ 50` and
`plusDi[period − 1] === null`. Cost if wrong: we are one bar behind platforms that count bar 0.
Ruling: a window with **no range** reads a neutral value rather than `NaN`: stochastic 50, Williams 0,
CCI 0. Cost if wrong: a flat market shows a plausible-looking number instead of "undefined".
Ruling: OBV is drawn as its own (`brand`) pane with no parameters and is formatted like volume;
it is the one study whose value is a running total, so a price-style two decimals would be noise.

B2 batch 2 (Ichimoku, Supertrend, Donchian, Keltner, SAR, Pivots) — commits 74febe2, 589e84d.
Gates: 567 passed / 4 skipped, `tsc` clean, eslint clean, `next build` ok, dev (AR) + live (EN)
passes, deployed `nulr2nk7k`. Catalog is now 18 studies.
Ruling: Ichimoku's cloud is computed `shift` bars back and **drawn up to the last candle**, not
projected into empty future bars; the lagging span is the close `shift` bars later and is therefore
absent on the last bars. Cost if wrong: no forward projection into whitespace (TradingView draws it),
but nothing is faked and replay cannot see an unrevealed close.
Ruling: pivots come from the **previous bar**, not from a "previous day". The chart does not know the
interval's calendar (a 4h bar is not a day), and a wrong session assumption is worse than a simple
rule. Cost if wrong: on weekly candles the levels are last week's, which is the same rule.
Ruling: SAR is clamped under the last two lows (or over the last two highs) before the flip check —
without it a fast acceleration reverses on the bar after a step. Cost if wrong: SAR trails slightly
further than some platforms.
Ruling: the warm-up test now names the four studies that legitimately answer early (`vwap`, `obv`,
`sar`, `pivots`) instead of inferring it from "has parameters" — SAR has parameters but no window.
Cost if wrong: adding a windowed study that answers early needs its name in that set.

B2 batch 3 (WMA, HMA, VWMA) — commit d7a332f. Gates: 574 passed / 4 skipped, `tsc` clean, eslint
clean, `next build` ok, dev (AR) + live (EN) passes, deployed `bfhctg8sq`. Catalog is now 21 studies.
Ruling: HMA is implemented as WMA(2·WMA(n/2) − WMA(n)) then WMA over round(√n) of that inner line,
and the final smoothing skips any window that still contains a null — the alternative (treating a
null as 0) paints a false spike at the start of every chart. Cost if wrong: HMA starts a few bars
later than platforms that seed the inner line.
Ruling: VWMA takes `{ close, volume }` rather than `VolumeBar`, so the maths can be tested without a
synthetic `time`, and it returns null for a window whose volume sums to zero instead of dividing by
zero. Cost if wrong: a symbol that reports zero volume everywhere shows no VWMA line.
Ruling: WMA/HMA/VWMA are registered with no host, menu or storage change — batch 3 is the proof that
the registry shape from B1 carries weight. Cost if wrong: none observed; a future study that needs a
new drawing kind (histogram band, fill) must extend `LineKind`, not the registry shape.

Per-study style (stroke 1–3, colour on single-line studies) — commit 0e584af. Gates: 579 passed /
4 skipped, `tsc` clean, eslint clean, `next build` ok, dev (AR) + live (EN) passes, deployed
`mmnegavgh`.
Ruling: colour is honoured only on a **single-line** study; on a multi-line study colour is
structure (upper/middle/lower, DI+/DI−), so `studyColor()` ignores the override and `parseStudies`
drops it instead of persisting a setting that will never be drawn. Cost if wrong: a trader cannot
recolour all three Bollinger lines at once; the alternative was losing which line is which.
Ruling: width applies to every line of the study (the trader asked for "a heavier study", not
per-line strokes). Cost if wrong: an Ichimoku with five heavy lines may be crowded, but that is a
visible, reversible choice.
Ruling: `STUDY_COLOR_SOURCES` moved into the registry so the chart (CSS resolution) and the menu
(swatch background) read one table; the host's private copy was deleted. Cost if wrong: none.
Ruling: storage stays `v: 1` — `color`/`width` are optional and the parser fills defaults, so a
payload written before this change parses untouched. Cost if wrong: a v2 would have needed a
migration for no gain.

Price source (close/open/high/low/HL2/HLC3/OHLC4 on nine studies) — commit 677787c. Gates:
589 passed / 4 skipped, `tsc` clean, eslint clean, `next build` ok, dev (AR) + live (EN) passes,
deployed `90qzreas6`. B closed.
Ruling: `StudyParam` became a discriminated union (`NumberParam | ChoiceParam`) instead of a
`values?: string[]` field on the number type. Cost if wrong: every consumer must narrow, but the
compiler now prevents a select from reading `min` and a numeric box from reading `choices`.
Ruling: source is offered only on studies whose maths is an average of price (SMA/EMA/WMA/HMA/BB/
RSI/MACD/Keltner/VWMA), not on range/volume studies (ATR, Donchian, Stochastic, ADX, Ichimoku,
Supertrend, SAR, pivots, VWAP, OBV, Williams %R) where a "source" would be a lie. Cost if wrong: a
trader who expects a source box on ATR does not get one.
Ruling: `priceSeries()` falls back to the close for an unknown name; `parseStudies` repairs the
stored value to the default. Belt and braces, because a blank study is worse than a defaulted one.
Cost if wrong: a corrupted payload silently reads the close rather than announcing itself.
Ruling: the legend shows the source label (`SMA 20 · HLC/3`) even though it lengthens the line.
Cost if wrong: a crowded legend on narrow screens; the numbers are the same as TradingView's.

C1 chart types (candles, hollow, Heikin Ashi, bars, line, area) — commit 47d342b. Gates: 597 passed /
4 skipped, `tsc` clean, eslint clean, `next build` ok, dev (AR) + live (EN) passes, deployed
`qwku1ri25`.
Ruling: Heikin Ashi feeds its smoothed bars to the **studies, volume colours and legend**, not just
the candle bodies. Cost if wrong: study values differ from the strategy lab/alerts, which always
work on real candles; the alternative was a legend that disagrees with the axis it sits on.
Ruling: a series' type is fixed at creation, so `setChartType` **replaces the price series** and the
page re-attaches markers via `onPriceSeries`; volume and panes are untouched. Cost if wrong: any
future consumer caching `host.price` must use the callback — `host.price` is a getter.
Ruling: Heikin Ashi's first bar opens at `(open+close)/2` (there is no previous smooth bar) and the
high/low contain both smoothed prices. Cost if wrong: the first HA candle differs by a few ticks
from an implementation that starts from the raw open; every later bar is unaffected.
Ruling: hollow candles are a candlestick with an unfilled up body, not a custom renderer. Cost if
wrong: the outline thickness follows lightweight-charts' defaults and is not adjustable yet.
Ruling: chart type is a browser preference (`openstock:chart-type`), like the interval; it applies to
the symbol page only for now, the grid panes keep candles. Cost if wrong: a trader who wants an HA
grid does not get one until C is revisited.

C2 price scale (linear / log / percent) — commit 1530b1f. Gates: 599 passed / 4 skipped, `tsc` clean,
eslint clean, `next build` ok, dev (AR) + live (EN) passes, deployed `8zohnu7oe`. C closed.
Ruling: the scale is applied to the **right axis only**; the volume scale keeps its own units.
Applying percent/log to volume would make volume bars meaningless. Cost if wrong: a trader cannot
see volume in percent terms — nobody asks for that.
Ruling: the scale is an axis option, so `setScaleMode` never rebuilds the series or the studies.
Cost if wrong: none observed; the drawing coordinates stay valid because they are price-based.
Ruling: percent labels come from lightweight-charts' Percentage mode, i.e. relative to the base bar
the library picks, not to a user-chosen anchor. Cost if wrong: the trader cannot set "percent from
the open of the session" until a custom anchor is built; the axis still answers "how far from the
base am I".
Ruling: scale is stored per browser (`openstock:chart-scale`), like the interval and the chart type.
Cost if wrong: two tabs can disagree until reload; the same is already true of the interval.

D1 drawing undo/redo + lock — commit bd474f2. Gates: 607 passed / 4 skipped, `tsc` clean, eslint
clean, `next build` ok, dev + live Playwright passes, deployed `pjuybjvdt`.
Ruling: history stores **whole list snapshots**, not diffs. A drawing is a small plain object and a
snapshot cannot desync from the drawings it restores. Cost if wrong: 50 snapshots × ≤200 drawings is
more memory than a diff — bounded and acceptable.
Ruling: a drag is **one** step: `beginGesture` snapshots, pointermove mutates the present without
recording, `endGesture` checkpoints. Cost if wrong: the intermediate pointer positions are not
individually undoable — which is the point.
Ruling: loading a symbol's stored drawings **replaces** the timeline instead of being an edit, so
undo on a fresh chart is disabled and cannot wipe the stored set. Cost if wrong: undo cannot go
"back" to the previous symbol's drawings — correct, those were never an edit.
Ruling: a locked drawing still selects (so it can be unlocked or deleted) but loses its handles and
refuses the drag. Cost if wrong: the lock is not a full "read-only object" — the colour cycle from
the list still works, which nobody expects to be destructive.
Ruling: the keyboard handler ignores INPUT/TEXTAREA/SELECT so the note editor keeps its own undo.
Cost if wrong: a global Ctrl+Z inside a select does nothing, which matches the platform.

D2 drawing magnet — commit 01025ba. Gates: 614 passed / 4 skipped, `tsc` clean, eslint clean,
`next build` ok, deployed `fc72ptziy`; live placement aimed at a level landed on `26.600000381`.
Ruling: weak magnet, 14 px reach, not "always snap". Cost if wrong: a trader placing in empty space
keeps the exact price instead of being yanked to a far level — the alternative fights every placement.
Ruling: snapping pulls **both** axes (bar time and level price). Cost if wrong: a drawing cannot sit
between bars while the magnet is on; that is what turning it off is for.
Ruling: the magnet is session state, not a stored preference. Cost if wrong: it resets on reload;
a saved mode that silently moves points later is worse.
Ruling: the live re-check could not measure a burst of placements because the chart re-fits as the
drawing list changes the page size (same pixel → different price). The first targeted placement was
measured exactly; the pure rule has seven unit cases. Cost if wrong: a regression in the drag path
would only be caught by the unit tests plus the first placement check.

D3 per-object stroke/dash + copy-paste — commit 97de171. Gates: 618 passed / 4 skipped, `tsc`
clean, eslint clean, `next build` ok, dev + live Playwright passes, deployed `rfuumrzvk`.
Ruling: width/dash live on the **drawing**, not the tool, so two trend lines can differ; the
selection adds 0.8 px on top instead of overwriting the chosen weight. Cost if wrong: the selected
object looks one step heavier than its saved style — deliberate feedback.
Ruling: the dash is set on the SVG group and inherited; primitives that draw structural dashes
(a level's guide, Gann diagonals) set their own and keep it. Cost if wrong: choosing "dotted" on a
level changes its body but not the horizontal guide.
Ruling: paste offsets by **0.5 % of price** and drops the lock. Cost if wrong: a pasted level on a
low-priced symbol moves by a fraction of a currency unit (bounded) — hiding one object exactly
under another is worse.
Ruling: the clipboard is in-memory per page, not stored. Cost if wrong: copying between tabs or
after a reload does not work; a persisted clipboard would surprise a user who expected the system
one.

D4 four new drawing tools (extended box, parallel channel, arrow, price/time) — commit 520c401.
Gates: 623 passed / 4 skipped, `tsc` clean, eslint clean, `next build` ok, dev + live passes,
deployed `11ds9p91f`.
Ruling: each new tool is a registry entry plus one SVG branch; the maths that can silently be wrong
(channel rails, a measured span, the arrow barbs) lives in pure helpers with tests. Cost if wrong:
the SVG branch itself is only exercised in the browser pass.
Ruling: the extended box extends its **price edges** to the right edge, not the whole rectangle to
the left: that is the reading traders use for support/resistance zones. Cost if wrong: a user who
expected a symmetric extension gets a right-anchored one.
Ruling: the price/time box prints its own measurement (`−0.71 · 38.0D`) instead of a separate label
tool, and uses a sign for the price but an absolute span for the time. Cost if wrong: the label is
not translatable text (it is numbers and a unit letter) — deliberately, because it is a measurement.
Ruling: the channel's third click sets the offset as a vector from the second point, so dragging the
second point moves the parallel rail with it. Cost if wrong: a channel drawn from a different habit
may need its third point placed differently than TradingView's.

D5 per-line study colour + line style — commit a0257e6. Gates: 627 passed / 4 skipped, `tsc` clean,
eslint clean, `next build` ok, dev + live passes (green pixels 3786 → 4111 on colour, → 3891 on
dash), deployed `8v8oqr10a`.
Ruling: the override is **per line** (`lines: { [key]: { color, dash } }`), and the definition's
palette stays the default. Cost if wrong: a trader can now recolour every Bollinger band the same,
losing the band meaning — their choice, and reversible.
Ruling: the legacy study-level `color` is still honoured on a single-line study, and a per-line
entry wins over it. Cost if wrong: two ways to colour one study; the migration is deliberate so
stored payloads keep working without a version bump.
Ruling: an unusable stored entry (unknown key, bad token, bad dash) is dropped, and an entry left
empty by that repair is not stored at all. Cost if wrong: the menu shows the default rather than the
broken value — the safe direction.
Ruling: dash maps to lightweight-charts' `lineStyle` (Solid/Dashed/Dotted) rather than an SVG pattern,
so the library keeps control of dash spacing at any zoom. Cost if wrong: the exact dash lengths are
not ours to tune.

E measure + PNG export — commit dc552ed. Gates: 627 passed / 4 skipped, `tsc` clean, eslint clean,
`next build` ok, dev + live passes (`+1.18 (+4.52%) · 49.0D`; `openstock-2222SR-1d.png`, 27,171
bytes), deployed `okdyoy94l`.
Ruling: the measure is **transient**, not a drawing — Escape or another tool clears it and nothing is
stored. Cost if wrong: a trader cannot keep a measurement on the chart; they can drop a price/time
box instead, which is the stored version of the same idea.
Ruling: export composes `takeScreenshot()` with the **serialised drawings SVG** (viewBox-scaled to
device pixels), so drawings appear in the image without a second renderer. HTML the SVG cannot carry
(the legend, the toolbar) is deliberately absent. Cost if wrong: the exported image lacks the legend
readout; the numbers are on the chart's own axis labels.
Ruling: the image is stamped `SYMBOL · interval · OpenStock` in canvas text, not a logo file. Cost if
wrong: a colour change of the stamp needs a code change, not an asset swap.

F alerts from the chart — commit 860461d. Gates: 627 passed / 4 skipped, `tsc` clean, eslint clean,
`next build` ok, dev (submit wrote a real rule, then deleted) + live (no rule left), deployed
`2gf817zsb`.
Ruling: the chart button reuses `CreateAlertModal`/`createAlert` rather than a chart-specific alert
path, so there is one alert model. Cost if wrong: the chart cannot offer a condition the centre does
not; that is the point.
Ruling: the default target is the **selected one-point drawing**, else the last close. Cost if wrong:
a trader with a selected note/level gets that price as the default even when they wanted the close —
one field to retype.
Ruling: the button is hidden where `alertSource(symbol)` is null (indices, unsourced symbols), same
as the header. Cost if wrong: a symbol the centre could technically poll shows no button.

G time zone + session breaks — commit 0a0e45e. Gates: 635 passed / 4 skipped, `tsc` clean, eslint
clean, `next build` ok, dev + live passes (Tokyo relabels; Intl trace shows Asia/Tokyo; breaks change
the chart), deployed `if6y526u0`.
Ruling: the zone drives **both** axis ticks and the crosshair stamp through Intl with an explicit
timeZone; `local` means the browser's zone. Cost if wrong: a trader comparing two devices in
different zones sees different labels for the same chart — that is what "local" means.
Ruling: the session-break interval is the **smallest** positive gap, not the median: gaps only grow,
so the smallest gap is the interval. Cost if wrong: a symbol whose data has a genuinely shorter
cadence at the open would fill too aggressively.
Ruling: breaks apply to the **price and volume series only**; studies and the legend read real bars,
so a gap never changes an indicator value. Cost if wrong: an indicator line will not stretch across
the inserted space the way the candles do — it simply has no points there.
Ruling: session breaks are a session toggle, not stored; the zone is stored. Cost if wrong: a trader
who wants breaks on by default re-enables them each visit; a stored zone that silently reinterpreted
history would be harder to notice.

Expansion 1: momentum, ROC, Aroon, TRIX, MFI — commit c953f93. Gates: 641 passed / 4 skipped,
`tsc` clean, eslint clean, `next build` ok, dev + live passes (26 studies, Aroon 71.43/57.14, MFI
47.77, 27 canvases), deployed `80cvh8fqw`.
Ruling: TRIX smooths through **three chained EMAs that each wait for their own warm-up** (an
`emaOn` helper pads the nulls), rather than seeding the second/third EMA with the first value.
Cost if wrong: TRIX answers a few bars later than a seeded implementation; the early values it would
have produced were not mathematically triple-smoothed.
Ruling: Aroon's window is `period + 1` bars ending at the current one, and its clock starts at
`period` (the bar before the window is not a comparison). Cost if wrong: one bar of extra warm-up.
Ruling: MFI answers **50** when the whole window has zero money flow and **100** when there is only
positive flow; no division by zero ever escapes. Cost if wrong: a flat, volume-less stretch reads as
neutral rather than undefined.
Ruling: Momentum/ROC/TRIX take a source, Aroon/MFI do not. Cost if wrong: a trader looking for a
source selector on Aroon does not get one — its maths is a range, not an average of price.

Expansion 2: Renko — commit 43fe6d7. Gates: 646 passed / 4 skipped, `tsc` clean, eslint clean,
`next build` ok, dev + live passes (7 chart types; brick legend O 25.96 C 26.10; filled 7786 → 7342),
deployed `2f9ud2pas`.
Ruling: a Renko brick carries the **time of the bar that printed it**, with one-second increments
when a single bar prints several, so times stay strictly increasing and each brick is traceable.
Cost if wrong: a burst of bricks appears as seconds apart on a daily chart; the axis is not the point
of a Renko chart, but the labels can look odd.
Ruling: the box defaults to **0.5 % of the first close** because the type menu has no numeric field
yet. Cost if wrong: a volatile symbol gets too many bricks and a quiet one too few until a box input
exists — the immediate next improvement for this type.
Ruling: because the host's `bars()` returns bricks for Renko, **studies and the legend read bricks**
(consistent with the axis), and session breaks are skipped for this type. Cost if wrong: an indicator
on a Renko chart differs from the same indicator on candles; that matches the "chart type is data"
choice already made for Heikin Ashi.

Expansion 3: Indexed-to-100 scale, inverted axis, Renko box input — commit 140a40e. Gates: 647
passed / 4 skipped, `tsc` clean, eslint clean, `next build` ok, dev + live passes (indexed changes
and Linear restores the exact hash; invert flips and restores; box 0.5 reprints bricks), deployed
`2rfoqpau4`.
Ruling: Indexed and Invert are **separate controls** (mode vs axis flip) rather than a fifth mode,
because they combine: a flipped indexed chart is a legitimate reading. Cost if wrong: two places to
look instead of one.
Ruling: the Renko box is an **absolute price** stored per browser, not a percentage. Cost if wrong:
switching symbols with very different prices keeps a box that is too big or too small; the input
makes that visible and one edit fixes it.
Ruling: an empty box means "half a percent of the first close", so the user can return to auto.
Cost if wrong: the auto box moves with the symbol; the field shows the resolved value only after
typing one.

Expansion 4: Kagi as a custom series — commit 4d5a1c9. Gates: 652 passed / 4 skipped, `tsc` clean,
eslint clean, `next build` ok, dev + live passes (8 chart types; candles replaced by the staircase;
Reversal 1% changes the geometry), deployed `j2yw1extg`.
Ruling: Kagi is a **custom series**, not a line series with duplicated points — the thickness and
colour of each leg carry the meaning, and a line series cannot vary either along one run. Cost if
wrong: the renderer is ours to maintain, and it draws in device pixels with the chart's ratios.
Ruling: the corner keeps the **time of the bar that caused it**, and a corner level is emitted before
the direction flips so the staircase never cuts a diagonal. Cost if wrong: one extra point per turn,
invisible but necessary.
Ruling: the reversal is entered as a **percentage** in the UI and stored as a fraction. Cost if
wrong: two units in code; the input shows the same percent the trader typed.
Ruling: for Kagi the host still returns **real bars** for studies, legend and readout (unlike
Heikin/Renko, where the rendered series is the data). Cost if wrong: the legend's OHLC belongs to the
bar under the cursor rather than to the Kagi leg; that is what a Kagi chart means — the legs are not
bars.

Expansion 5: Line Break — commit 586a583. Gates: 656 passed / 4 skipped, `tsc` clean, eslint
clean, `next build` ok, dev + live passes (9 chart types; boxes replace candles; count 2 changes the
geometry), deployed `8yeqwfra5`.
Ruling: the break compares the close with the **extreme of the last `count` box levels**, the simple
and predictable reading. Cost if wrong: a purist N-line break compares only same-direction boxes;
the difference appears in choppy stretches.
Ruling: each box is a **vertical bar at the forming bar's time**, one second apart for extra boxes
from the same bar (same convention as Renko and Kagi). Cost if wrong: boxes from one bar bunch on the
same x instead of marching right; the count and colours stay correct.
Ruling: studies and the legend stay on the **real bars**, like Kagi, because a box is not a bar.
Cost if wrong: an indicator does not visually follow the boxes; it follows the underlying market.
