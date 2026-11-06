# SDD ledger — plan: /Users/ahmadqasim/Desktop/AI Agint work/specs/2026-11-03-drawing-toolkit-plan.md

Spec: /Users/ahmadqasim/Desktop/AI Agint work/specs/2026-11-03-drawing-toolkit-tradingview-design.md
Branch: feat/drawing-rail (base = 8778e26)
Skill scripts (sdd-workspace/task-start/task-done/review-package) are not installed on this machine; ledger and briefs are maintained by hand.

Pre-flight: Task 1 produces ToolGroup/ToolDef group values consumed by Task 2's DrawingRail (RAIL_GROUPS + TOOL_LABEL_KEYS live in lib/drawing-groups.ts) and by Task 3's mount. Task 4 produces ShapeKind helpers consumed by Task 5's shapeFor. Checked at Task-1 commit 56af94c: groups are the ten names the rail lists, toolsInGroup('shapes'|'forecast'|'brush') are empty today → rail filters them (railGroupsWithTools).

Task 1: complete (commit 56af94c, tests: npx vitest run __tests__/chart-drawings.test.ts __tests__/drawing-groups.test.ts → pass)

Task 2: complete (commit a2a9f63, tests: npx vitest run __tests__/drawing-rail.test.tsx → 4 passed; npm test → 673 passed)
  Ruling: the plan's `__tests__/drawing-rail.test.tsx` needed a runner the repo did not have (jsdom + @testing-library/react, and `"jsx": "preserve"` in tsconfig leaves .tsx untransformed). Added jsdom, @testing-library/react, @testing-library/dom as devDependencies and `oxc: { jsx: { runtime: 'automatic' } }` to vitest.config.ts; the jsdom environment is opt-in per file. Cost if wrong: two dev-only deps and one config line the next reader must understand; component tests can now exist at all.
  Ruling: the plan gave DrawingRail `onPick: (tool: ShapeTool) => void`; shipped as `ActiveTool` (adds 'select' | 'measure') because the cursor cluster is part of the same rail. Cost if wrong: a caller passing a non-drawing "tool" — the chart's startTool already accepts ActiveTool.
Task 3: complete (commit 9a4d8f3, tests: npm test → 673 passed, tsc clean, eslint 1 pre-existing warning)
  Browser pass on http://localhost:3001/stocks/2222.SR (the charts grid uses ChartGrid, not YahooChart): flyouts open one at a time; picking Trend line drew a line that persisted to `openstock-drawings:2222.SR`; select showed 2 handles and enabled Delete; Delete → 0 shapes, Undo restored it, Redo enabled; Arabic docks the rail at right:8px with every label translated.
  Ruling: dev server restarted with `BETTER_AUTH_URL=http://localhost:3001` (env only, .env untouched) because better-auth rejects a sign-up whose Origin is not the configured base URL; a throwaway user was signed up in the local MongoDB for the pass. Cost if wrong: nothing persists — the flag lives only in the running dev process.
  Finding (pre-existing, not from this diff): a hydration mismatch is logged on /stocks/[symbol] and equally on /watchlist; the three TradingView embed errors come from s3.tradingview.com scripts.
Task 4: complete (commit 46d06a9, tests: npx vitest run __tests__/chart-drawings-shapes.test.ts → 12 passed; plus chart-drawings + drawing-groups + i18n → 88 passed)
  Ruling: the plan puts the i18n keys in Task 5, but `TOOL_LABEL_KEYS` is `Record<ShapeTool, StringKey>`, so registering the seven tools and adding their labels are one compile-coupled step. Shipped the labels with the registry. Cost if wrong: two tasks share a commit boundary, no behaviour difference.
  Ruling: `trendAngleDeg` measures the line left to right (a line clicked right-to-left reads the same slope, signed by the left-to-right direction) instead of using the click direction. Cost if wrong: a trader who draws a line backwards sees +45 where the click direction would have said -45; the slope they see on screen is what the number now reports.
  Ruling: two of my own RED fixtures were wrong before the implementation existed (a "vertical" pair whose times differed, an angle case whose scale made 11.3° and not 45°, and a "falling" line with equal prices). Fixed the fixtures; the helpers were then written to the corrected expectations. Cost if wrong: none — the assertions are still the behaviour I want, only the arithmetic in the test was wrong.
Task 5: in progress
Task 5: complete (commit 83a0c48, tests: npx vitest run __tests__/chart-drawings-render.test.tsx → 7 passed; npm test → 694 passed; npm run build → exit 0)
  Ruling: the far end of a ray/extended line is placed at the panel's pixel edge, not by converting a chart-space time back with `toScreen` — the chart's lookup snaps to the nearest bar, which would stop the ray at the last bar. The chart-space helpers (rayEnd/extendedEnds) still decide the price at the edge; only the price is asked of the scale. Cost if wrong: the line's end is a pixel rather than a bar time, which is what TradingView draws anyway.
  Ruling: `rayEnd` now follows the ray's own direction (a leftward ray takes the left edge), not always the right edge. Cost if wrong: a ray drawn right-to-left would have stayed inside the picture.
  Ruling: 'cross' kept at 2 clicks per the plan, but only the first point is used (a second click is harmless). If the phase-3 pass finds it awkward, it becomes a 1-click tool like 'vline'.
  Ruling: 'trendangle' measures left to right. Cost if wrong: same as Task 4's ruling.
  Finding (pre-existing, environment): `npm run build` fails with `Invariant: no direct app page entry found for /_not-found` when a dev server has been writing into the same `.next`; after stopping the dev server and removing `.next` the same build exits 0. Not caused by this diff; worth a CI note.
  Phase done: rail regroup + the seven basic lines. Next plan: specs/2026-11-03-drawing-toolkit-positions-plan.md (phase 3).

## Phase 3 (plan: specs/2026-11-03-drawing-toolkit-positions-plan.md)

Task 1: complete (commit 9572854, tests: npx vitest run __tests__/drawing-groups.test.ts → 6 passed)
  Ruling: dropped the plan's `pointLabels: ['Entry','Target','Stop']` — point labels are drawn as literal glyphs, so English words would appear in the Arabic UI. Cost if wrong: the three points are unlabelled; the readouts name the zones instead.
  Ruling: `projection` takes 2 clicks, not the 3 the plan's Task 1 line said. Cost if wrong: none — a third point would only repeat the second.
Task 2: complete (commit 075f486, tests: npx vitest run __tests__/chart-drawings-shapes.test.ts → 21 passed)
  Ruling: a position's loss box is forced to the profit box's time width (the stop's x is ignored). Cost if wrong: dragging the stop sideways does nothing, which is what TradingView does too.
Task 3: complete (commit 7480543, tests: npx vitest run __tests__/chart-drawings-render.test.tsx → 13 passed; npm test → 709 passed)
  Ruling: a range with an unknown interval (`barSeconds` 0) prints 0 bars rather than guessing. Cost if wrong: a range drawn before bar times load under-counts; the price and time readings stay correct.
  Ruling: my own date-range render fixture assumed a "D" duration for a 1000-second span; the code reads hours below a day, so the test now asserts 0.3H.
Task 4: complete (npm run build → exit 0 after a clean .next; browser pass on http://localhost:3001/stocks/2222.SR)
  Browser evidence: the Forecast flyout lists all six tools; a long position drew two zones and read "+1.41 · R:R 1.50" / "−0.94 · 3.61%"; a projection drew its dotted repeat; a date and price range read "+1.41 (+5.47%) · 69.0D · 69 bars". Test drawings cleared from the review browser's localStorage afterwards.

## Phase 4: the rest of the Fibonacci family (commit 99aa6ce)

Registry + labels (no separate commit — the typed TOOL_LABEL_KEYS and the i18n maps compile together):
  tests: npx vitest run __tests__/drawing-groups.test.ts __tests__/chart-drawings.test.ts → 63 passed
  Ruling: the fib family is registered next to the original `fib` entry, not appended after the forecast block, so `toolsInGroup('fib')` reads in the rail's order (fib first). Cost if wrong: the flyout lists them in a different order than the group array.
Geometry: fibExtension, fibFanEnds, fibChannelLevels, fibTimeMultiples, fibArcRadii, speedFanEnds + FIB_EXT_RATIOS / FIB_TREND_EXT_RATIOS / SPEED_RATIOS.
  tests: npx vitest run __tests__/chart-drawings-shapes.test.ts → 27 passed
Painters for fibext / fibtrendext / fibfan / fibchannel / fibtime / fibarc / fibspeed.
  tests: npx vitest run __tests__/chart-drawings-render.test.tsx → 21 passed; npm test → 724 passed; tsc + eslint clean; npm run build → exit 0 after clearing .next.
  Bug the browser pass caught: the chart's price→pixel lookup returns null for a price outside the visible price scale, so an eight-level extension drew ONE line. Fixed by falling back to the pixel slope between the two placed points (the SVG clips what falls outside); the same fallback covers the fan and the speed fan. Reproduce with the render test `draws every level even when the price scale cannot show it`.
  Ruling: time zones are spaced in pixels (`screen[1].x + span × multiple`) because their lines sit past the last bar, where `toScreen` cannot map a time — the same reason the ray reaches the panel edge in pixels. Cost if wrong: the zones do not re-space when the visible range is panned to include more bars, which is what TradingView does too (they are anchored to the drawn move).
  Ruling: fib arcs are full ellipses centred on the third point rather than partial arcs; the radius maths is what the trader reads, and an SVG path per arc would triple the branch for no extra information. Cost if wrong: arcs look like circles when the base move is flat.
  Ruling: two of my own render fixtures were wrong before the painters existed (fibfan index 14 is ratio 3, not 1, so y2 is 200 and not 400; fibtime's 34 spans put the last zone at 3600 and not 3500; the arc's base move is 100px tall so rx == ry; the speed fan's edge time is 5400s past the entry, not 120). Fixed the fixtures.
  Still open on this branch: no whole-branch review yet (the plan has more phases), and the branch is not pushed.

## Where the plan stands

Phases 1-2 (rail + seven basic lines): done.
Phase 3 (positions, ranges, projection): done — specs/2026-11-03-drawing-toolkit-positions-plan.md.
Phase 4 (the Fibonacci family): done — this section.
Remaining, each needing its own plan: geometric shapes (ellipse, circle, triangle, polyline, arc, curve),
brush + annotation (brush, highlighter, note/callout/balloon/signpost/flag/price note), Gann + pitchfork
family, organisation (hide-all already on the rail; layering, templates, object list), and the optional
exotic set (icons, image, bars pattern, anchored VWAP, volume profile).

## Fix: the rail was drawing outside the chart (commit b0b2949)

Reported by the user from the browser. Measured on the live page: the rail's box was 436→840 (inside the
chart 428→848) but its content ran to **998px** — sixteen 32px buttons do not fit a 420px panel, and the
strip had no containment, so Undo (898), Redo (932) and Clear all (966) were drawn over the rows below
the chart.

Fix:
  - The cursor cluster folds into the strip's first button ("Cursor") as a flyout holding Select, Measure,
    Magnet, Lock, Hide all and Delete — which is what the design's group 1 says and what TradingView does.
    The strip is now eleven items (cursor + seven groups + undo/redo/clear), 398px in a 398px box.
  - `.draw-rail` scrolls inside itself (`overflow-y: auto`, hidden scrollbar) so a taller strip can never
    escape the panel again — the next phases add the shapes and brush groups.
  - The flyouts moved out of the scrolling strip into a non-clipping root (`.draw-rail-root`), are capped
    at `min(60vh, 100%)` with their own scroll, and are nudged upwards when their button is too low.
  Ruling: the strip's first button is labelled with `chart.group.cursor` ("Cursor", "المؤشر") rather than a
  new string, since it opens exactly that group. Cost if wrong: the button reads "Cursor" to a trader who
  is looking for the view toggles, which the flyout names individually.
  Ruling: toggles use `role="menuitemcheckbox"` with `aria-checked` instead of `aria-pressed` on
  `role="menuitem"`, which eslint rejects. Cost if wrong: a screen reader announces them as checkboxes
  rather than pressed buttons — which is what they are.
  Browser evidence after the fix: strip 436→834 inside the chart 428→848 with no overflow; the Fibonacci
  flyout (8 rows, 294px) 513→807, Annotation 683→727, Cursor 440→650 — all inside the panel.
  tests: npx vitest run __tests__/drawing-rail.test.tsx → 7 passed; npm test → 727 passed; tsc + eslint
  clean; npm run build → exit 0.
  Follow-up on the same fix: with a tool armed the strip has a twelfth button (Cancel) and overflowed by
  28px again. Tightened the metrics (30px buttons, 1px gap, 3px padding, 2px separator margin) so the
  twelve fit with no overflow: measured 439→822 inside the chart 428→848, `scrollHeight === clientHeight`.
  The scroll stays as the net for the shapes and brush groups still to come. Same commit (amended).
  Evidence: npm run build → exit 0 after the CSS change; npm test → 727 passed.

## Phase 5: the geometric shapes (commit 9d0aeee)

Tools: `ellipse`, `circle`, `tri`, `polyline`, `arc`, `curve`, `dcurve` — the `shapes` group, empty since
the rail was built, now shows.
Geometry: `ellipseFrom`, `circleFrom`, `polygonPoints`, `polylinePath`, `quadraticPath`, `doubleCurvePath`,
`arcThrough` (circumcircle + path data with both SVG arc flags). Screen-space on purpose: a circle must
stay a circle.
  tests: npx vitest run __tests__/chart-drawings-shapes.test.ts → 35 passed; __tests__/chart-drawings-render.test.tsx → 29 passed; npm test → 744 passed; tsc + eslint clean on the touched files; npm run build → exit 0.
  Browser pass: the Shapes flyout lists all seven, the strip still fits (12 buttons, no overflow) with the
  flyout's bottom at 836 inside the chart's 848; ending a polyline on the double click stored **four**
  points for five clicks (the duplicate was replaced) with the "Double-click to finish" hint showing while
  drawing; an ellipse came out 82×63, a triangle three points, and an arc whose path carries `0 1` flags.

  Ruling: `clicks: 0` means "open-ended" rather than an error, and `parseDrawings` accepts 2..MAX_STROKE_POINTS for such a tool (anything shorter or a mismatched fixed count is still dropped). Cost if wrong: a stored one-point polyline would render as nothing; it is dropped instead.
  Ruling: the geometric shapes are hit-tested on their anchors except the polyline and triangle, which are hit-tested on their segments. Cost if wrong: clicking the middle of an ellipse's stroke selects nothing — you grab its corner handles; the outline is where TradingView puts the handles too.
  Ruling: the arc's overlap of the old `triangle` kind is avoided by naming the new three-point triangle `tri` (the pattern `triangle` keeps its four points). Cost if wrong: two similarly named tools in the code; the labels differ ("Triangle" vs "Triangle pattern").
  Ruling: an `arc` whose three points are collinear draws a straight line instead of nothing. Cost if wrong: a shape that looks like a line while the tool is "arc", which is exactly the geometry the user drew.
  Note: the 35th shapes test (my own first draft) asserted a large-arc flag of 1 for a configuration whose arc is exactly a semicircle; the code was right and the test was wrong, so the test now pins the semicircle at `0 1` and adds a genuinely major-arc case (centre 50,200/3, r 250/3, flags `1 0`) computed by hand.
  Pre-existing, untouched: `__tests__/utils.test.ts:171` has an `@typescript-eslint/no-explicit-any` error on HEAD (verified with the changes stashed). `npx eslint` on the whole repo therefore reports one error that is not from this work.

## Where the plan stands

Phases 1-5 done: rail, basic lines, forecast group, Fibonacci family, geometric shapes — 52 tools.
Remaining: brush + annotation (brush, highlighter, note/callout/balloon/signpost/flag/price note),
Gann + pitchfork family, organisation (layering, templates, object list), the optional exotic set.

## Phase 6a: the freehand brush (commit fd10b2d)

Tools: `brush`, `highlighter` (the `brush` group, empty until now) — 54 tools, and the last empty group on the rail.
  tests: npx vitest run __tests__/chart-drawings-render.test.tsx → 33 passed; npm test → 749 passed; tsc + eslint clean; npm run build → exit 0.
  Browser pass: a 5-move drag drew a live stroke and released into a stored brush of five points; a highlighter
  drag stored three points with width 12, opacity 0.28 and screen blending; the strip (thirteen buttons) sits
  439→837 inside the chart's 428→848 with no overflow.
  Ruling: `isFreehand` (kind brush/highlighter) switches on the drag gesture instead of the click model, and the strip's metric shrank to `flex: 0 1 auto; min-height: 22px` so a thirteen-button rail cannot clip its last button on a short panel. Cost if wrong: buttons are 29px instead of 30px on a 420px panel.
  Ruling: a brush and a highlighter are hit-tested on their segments, so a stroke can be selected, dragged and deleted. The design's note that the highlighter should be "non-selecting by click priority rules" is not implemented: a highlighter you cannot select is a highlighter you cannot delete. Cost if wrong: a wide highlighter can swallow clicks meant for a drawing underneath.
  Ruling: the "Double-click to finish" hint is suppressed for freehand tools, which finish on release. Cost if wrong: an open-ended click tool (the polyline) keeps its hint, which is what it needs.
  Finding (test-infrastructure, not the app): a drag played from one `tools.browser.evaluate` batches every synthetic pointer event into a single React render, so the stroke commits as empty. Playing each event in its own call reproduces a real mouse. Same class of artefact as the jsdom case, where `fireEvent` wraps each event in `act`.
  Still open in this phase: the annotation family (note/callout/balloon/signpost/flag/price note). The `note` tool already exists as `text`; the rest are next.

## Deploy + the TASI index page (commits c6f21d5, deployed to https://rovexjo.com)

Pushed `feat/drawing-rail` to origin (PR: https://github.com/ahmaddirar-ios/OpenStock/pull/new/feat/drawing-rail)
and ran `vercel --prod` twice (once for phases 1-6a, once for the TASI fix). Both aliased to rovexjo.com.
Verified live: landing 200, /stocks/TASI 307 to /sign-in (the auth middleware, not a 500), /sign-in 200, and
the served CSS carries `.draw-rail-root` + the phase-6 `min-height:22px` button rule, so the deployment
includes the newest commits.

`/stocks/TASI` was the emptiest page in the app (reported by the user as "TASI مش راضية تفتح"): every field
"—", CNBC crypto stories in the news panel, and no chart — "TASI" alone is not a TradingView symbol, so the
embed was dead, and Finnhub answers a zero quote so the header took the Finnhub path.
  Fix: `isIndexSymbol` + the alias set in lib/yahoo.ts (TASI / ^TASI.SR / TASI.SR / TADAWUL:TASI ->
  ^TASI.SR); formatSymbolForTradingView maps the index to TADAWUL:TASI (blocked exchange -> the Yahoo
  candle path, so the rail works on the index too); hasFinnhubQuotes returns false for an index so the
  header uses the Yahoo quote (TASI: 9,876.13 -0.07%, "Tadawul All Shares Index"); the page drops the
  company panels for an index.
  tests: npm test → 750 passed; tsc clean; no new lint errors.
  Browser: header, chart, rail and drawings all work on /stocks/TASI; panels are Chart, Technicals, Profile.
  Data limitation found and reported: Yahoo serves **no daily or weekly history** for ^TASI.SR (1 bar for
  1d/1wk at any range) — only intraday (5m 301 bars, 15m 101, 60m 116) and monthly (61 bars over 5y). So
  the 1D and 1W views of the index cannot be charted from this source, and TradingView will not embed
  TADAWUL. A real daily TASI chart needs a paid Saudi feed (or the index page defaulting to 1h).
  Ruling: the index page keeps the same interval mapping as every other symbol rather than faking daily
  bars from the monthly series. Cost if wrong: the 1D view of TASI shows Yahoo's single bar until a paid
  source or a different default lands.

## The index in search, and a free chart for it (commit 80ba711, deployed)

Reported from a screenshot: the palette answered "Nothing matches \"Tadawul All Shares Index\"" on
https://rovexjo.com/stocks/2082.SR. Two bugs stacked:
  - Finnhub's /search rejects a query longer than **20 characters** (`422 {"error":"q too long"}`);
    measured live: 18 chars pass, 21 refuse.
  - The action wrapped everything in one try/catch, so that throw threw away the matches the local
    tables had already produced.
Fix: `lib/search.ts` owns the rules (finnhubCanAnswer + mergeSearchResults), the feed is only asked a
query it will accept, and a failing feed call can no longer remove local matches. `lib/saudi-indices.ts`
is a new small directory for the indices (Finnhub knows no index; the Saudi table is companies only),
matched by ticker, English name, Arabic name or alias, with `type.index` labelled in both languages.
Also: the TASI page opens on `60m` because the index has no daily series in this feed — and
`openingInterval()` only honours a preference that names a real interval ("1h" is not one; the id is "60m").
  tests: npm test → 762 passed; tsc clean; no new lint errors (the one error left, lib/kit.ts:91, is on HEAD).
  Browser: "Tadawul All Shares Index", "TASI", "المؤشر العام", "مؤشر" all return the index first as
  "SR · Index"; a stored 1d interval no longer wins over the index page's own choice; /stocks/TASI draws
  months of hourly candles with the rail.

## The annotation family (commit ac8c838)

The rail's annotation flyout now carries the six tools TradingView puts there: the note that already
existed, a callout, a balloon, a signpost, a flag and a price note.
  - A callout and a balloon are the trader's own words with a leader line to the price they annotate
    (two clicks: the point, then where the label sits).
  - A signpost and a flag are price markers: one click, and they start with the price at that point.
    A double click re-words them.
  - A price note is a chip against the panel edge, the way the chart's own last-price chip sits.
Ruling: one rule in lib/chart-drawings.ts decides the words (`carriesText`, `annotationText`,
`priceLabel`), so the toolbar field, the marker seed and the storage validator cannot drift apart.
Cost if wrong: a signpost placed while a stale note sat in the field would inherit that note — caught
in the browser and fixed by giving the price markers their own price instead of the field's text.
  tests: npm test → 775 passed; tsc clean; no new lint errors.
  Browser: a callout stored its two points and "Breakout above 26.30" and drew its label; a signpost
  drew its own price; a price note drew 27.65 against the edge.

## Gann, pitchforks and the measured channels (commit acc9eb4)

Ten tools in the Gann & cycles flyout: gannfan, gannbox, gannsquare, pitchfork, schiffpitchfork,
modpitchfork, insidepitchfork, regression, flattop, disjoint. Geometry lives in lib/chart-drawings.ts
(gannFanEnds/gannBoxGuides/gannSquareCorner/pitchforkLines/regressionChannel/flattenLines/disjointChannel)
and is tested on its own; the painters only place lines. `closes` is passed down from YahooChart so the
regression channel fits the candles actually on screen (memoised on the candle set).

Bug found in the browser, and it was pre-existing: **every edge-reaching fan drew nothing.** The
chart's own time lookup (`coordinateToTime`) gives up a pixel or two before the panel's right edge —
the right offset is not part of its time scale — so `fromScreen(edgeX, 0)` returned null and the
painter produced no lines at all. Measured: a Ray ended at y = its second click's y (not collinear
with its dots), proving the painter had fallen back. One helper now asks the chart and, when it gives
up, carries the clicked trend's slope on linearly. That repairs the speed fan and the extended line
(which had the same hole) and makes the Gann fan/box/square reach the edge. A non-finite pixel (log
scale asked for a negative price) is skipped instead of painted as NaN.
Ruling: the original `gann` tool is retired, not removed — ToolDef gained `hidden`; a hidden tool is
off the rail but still parses and still paints, so charts saved before today keep their box. Cost if
wrong: selecting a legacy `gann` drawing does not light up the Gann group in the rail (accepted).
  tests: npm test → 798 passed; tsc clean; no new lint errors. The three "reach the edge" tests were
  checked red without the helper (3 failed) before being checked green with it.
  Browser (2222.SR): fan 9 lines all reaching the edge with 9 distinct slopes and the 1x1 the heaviest;
  box rect + 11 lines (2 diagonals + 9); square rect + 13; speed fan 3 lines to the edge; extended line
  0 → 657; original `gann` box still paints.

## Organising the drawings (commit d83fce2)

Two things the design put in phase 8; hide-all and the object list already existed.
  - **Layering.** The SVG paints its children in order, so the list's order *is* the stacking.
    `layerDrawings(list, id, 'front'|'back')` returns the same array when the move changes nothing
    (an undo step that does nothing is worse than none). Toolbar: Bring to front / Send to back for
    the selection, through the same history as every other edit.
  - **Saved strokes** ("templates"). A new drawing used to come out in its tool's own default colour;
    now the selected drawing's stroke can be saved as that tool's default (the bookmark button, pressed
    when a default exists, click again to clear). A preference, not part of a symbol's drawings, so it
    lives under one key in `lib/drawing-styles.ts`; every value is validated against the palette and the
    width/dash lists, so a hand-edited store cannot put an off-theme colour on the chart.
Ruling: a style is keyed by tool only (not by symbol or by a named template). Cost if wrong: two
different charts cannot want two different colours for the same tool (accepted; TradingView's named
templates are per tool as well).
Found while testing: this runner's jsdom has **no `window.localStorage`** (a store needs a real origin),
which is why `loadDrawings` silently returns [] in component tests — the drawing-organise test fakes one.
  tests: npm test → 808 passed; tsc clean; no new lint errors.
  Browser (2222.SR): two overlapping boxes, bringing the lower one to the front flipped the stored order
  and the paint order; saving a stroke (orange, 3px) as the Box default made the next box come out
  orange and 3px; the bookmark read as pressed after a reload; clearing it emptied the store.
  Note for future browser passes: the drawing toolbar's tool labels are the *i18n* labels — the rectangle
  tool's row reads "Box", not "Rectangle".

## The exotics (commit 220b1a1)

The design's optional phase 9: `icon`, `image`, `bars`, `avwap`, `vprofile`.
  - Sticker (`icon`, annotation group): one click, seeded with the first glyph of `ICON_GLYPHS`; the note
    field and a double click re-word it, so any glyph the trader types works. `nextGlyph` was written and
    then removed — the text field already does the job, and an unused export is clutter.
  - Image (`image`, annotation group): a box (two clicks) drawn only from a plain `http(s)` address
    (`isImageUrl`), so a `data:` payload or a local path cannot reach the chart; until an address is
    pasted the frame says "Paste an image URL". An address is longer than a note's words, so `cleanText`
    now takes the tool's own limit (`textLimit`: 80 for words, 300 for an image URL).
  - Volume tools (`bars`, `avwap`, `vprofile`, forecast group — with the other measurements):
    `candlesBetween`, `anchoredVwap` (typical price weighted by volume from the anchor forward; a bar with
    no volume counts as one, so the line keeps moving on a symbol the feed reports no volume for) and
    `volumeProfile` (each candle's volume spread over the rows its high–low spans; the busiest row is the
    point of control, printed). The layer now receives the **candles** rather than just the closes.
Ruling: "Bars pattern" copies the range's candle *shapes* forward to the drop point (pixel offsets, the
body width taken from the copied range's spacing) rather than rescaling it to the destination price.
Cost if wrong: a copy dropped on a very different price level keeps its original shape instead of
stretching to fit (accepted; it is what TradingView's pattern does too).
  tests: npm test → 826 passed; tsc clean; no new lint errors.
  Browser (2222.SR): sticker stored/drew ★; image stored its URL and drew an <image>; anchored VWAP drew
  a 79-point line; profile drew its shaded range + 24 rows + the point of control (26.63); bars pattern
  copied 29 candles to its anchor.

## Live verification on production (2026-11-03)

Deployed with `vercel --prod` (deployment `openstock-arabic-ravm9muib`, alias https://rovexjo.com) and
verified in the browser **on the real site, signed in as the owner**, on /stocks/2222.SR:
callout with its words; Gann fan 9 angles reaching the edge with the 1×1 heaviest; pitchfork 3 rails;
regression 3 lines + filled band fitted to live candles; anchored VWAP 79-point line; volume profile
25 rows + POC 26.63; bars pattern 25 copied candles; sticker ★; pasted image loaded; "Bring to front"
flipped the stored order; a 4px saved default came out on the next Gann fan; Arabic/RTL docks the rail on
the right with all ten group labels and the new tools' Arabic names; a reload re-parsed all ten kinds with
an empty console.
