# Pattern Scanner — design

Date: 2026-11-09
Status: draft for review
Repo: OpenStock-arabic (Rovex)

## Why

The chart can now draw and auto-detect Wolfe waves, and it already draws harmonic patterns, head &
shoulders, triangles, three drives and Elliott counts by hand. What a trader cannot do is ask the
market a question: *which of my names has a completed pattern right now?*

The screener answers that for numbers (price, change, P/E, a formula). It cannot answer it for
shapes, because a shape needs history, not a snapshot. This spec adds the missing surface: a
scanner that walks a list of symbols, runs the same detectors the chart uses, and returns the hits
with a link that opens the chart with the pattern already drawn.

## Non-goals

- No new data provider. Candles come from the existing `getStrategyCandles` (Yahoo, cached 1h).
- No background cron in this phase. The scan is on demand; the pure scan function is written so a
  scheduled job can call it later without a rewrite.
- No new drawing tools. Every hit is expressed with tools that already exist.
- No "confidence score" theatre. A pattern either satisfies its published rules or it does not; the
  table says *confirmed* or *forming*, nothing invented in between.

## Architecture

Three layers, each testable on its own:

```
lib/patterns.ts        pure detectors: pivots in → hit or null
lib/pattern-scan.ts    pure scan: candles + requested patterns → newest hit per pattern
lib/actions/pattern-scan.actions.ts
                       server action: symbols → candles → scan, batched, per-symbol failure isolated
components/scanner/PatternScanner.tsx
                       client: controls, batch walk, progress, results table
app/(root)/scanner/page.tsx
                       server: universe lists + language, renders the client
```

The chart hand-off is a fourth, small piece: `lib/pattern-link.ts` encodes a hit into a URL token,
and `YahooChart` decodes it on mount and commits it as an ordinary drawing.

### Why this shape

`screenFormula` already proves the pattern: a server action that fetches one batch, a pure matcher,
and a client that walks the list so one slow symbol cannot hold up the rest. The scanner copies that
contract exactly, which keeps the two features readable side by side and means the caching, the
batching and the failure isolation are already understood.

## 1. Detectors (`lib/patterns.ts`)

Every detector takes the alternating pivots from `detectPivots` and returns the **newest** valid
occurrence, or null. A detector never fetches, never reads the clock, and never touches the DOM.

```ts
export type PatternId =
    | 'wolfe' | 'gartley' | 'bat' | 'butterfly' | 'crab' | 'cypher'
    | 'hs' | 'triangle' | 'drives3' | 'impulse' | 'abc';

export type PatternHit = {
    pattern: PatternId;
    direction: 'bullish' | 'bearish';
    /** The existing drawing tool this hit is painted with (see the table below). */
    tool: ShapeTool;
    points: DrawPoint[];          // the pivots, oldest first
    labels: string[];             // the tool's own point labels: X A B C D / 1..5 / 0..5
    /** The price that voids the pattern: the level a trader would put the stop beyond. */
    invalidation: number;
    /** Where the pattern projects to, when it has a target. Null for shapes without one. */
    target: number | null;
    /** True when the newest close has already done what the pattern asks (e.g. broke the neckline). */
    confirmed: boolean;
    /** The bar the last pivot sits on, so the scan can prefer the freshest hit. */
    foundAt: number;
};
```

### Pattern → drawing tool

Every hit is painted with a tool the chart already ships, so the hand-off never invents a shape.
The point counts are the tools' own, which fixes how many pivots each detector returns:

| Pattern | Tool | Points |
|---|---|---|
| Wolfe | `wolfe` | 5 (1–5) |
| Gartley / Bat / Butterfly / Crab | `xabcd` | 5 (X A B C D) |
| Cypher | `cypher` | 5 (X A B C D) |
| Head & shoulders | `hs` | 5 (LS N1 H N2 RS) |
| Triangle | `triangle` | 4 (H L H L) |
| Three drives | `polyline` | 6 (the three drives and their pullbacks) |
| Elliott impulse | `ew-impulse` | 6 (0–5) |
| Elliott ABC | `ew-abc` | 4 (0 A B C) |

### Shared helpers

- `retrace(from, to, at)` — how far `at` retraces the `from → to` leg, as a fraction (0.618 = a
  61.8% pullback). Direction-agnostic: a bullish and a bearish leg both read positive.
- `within(value, min, max)` — inclusive ratio test with a tolerance of ±0.05 on each bound, because
  pivots are bars, not exact Fibonacci points.
- `converge(a1, a2, b1, b2)` — whether the two lines through `a1→a2` and `b1→b2` close to the right.

### Wolfe

Reuse `checkWolfe` from `lib/wolfe.ts` unchanged. The scanner only wraps it: five pivots in, a hit
out, `invalidation` = point 5, `target` = the 1-4 line at the 1-3 / 2-4 apex time.

### Harmonic family (XABCD)

Five pivots X, A, B, C, D. Direction is read from X→A: a rising XA is bearish (sell at D), a falling
XA is bullish (buy at D). Ratios are measured on price distance:

| Variant | B of XA | C of AB | D of XA | D of BC |
|---|---|---|---|---|
| Gartley | 0.618 | 0.382–0.886 | 0.786 | 1.27–1.618 |
| Bat | 0.382–0.5 | 0.382–0.886 | 0.886 | 1.618–2.618 |
| Butterfly | 0.786 | 0.382–0.886 | 1.27–1.618 | 1.618–2.618 |
| Crab | 0.382–0.618 | 0.382–0.886 | 1.618 | 2.24–3.618 |

The first variant whose four ratios all pass wins, in the order above, so a shape that fits Gartley
is not also reported as a Bat. `invalidation` = D, `target` = A (the conventional first target),
`confirmed` = the newest close has turned back from D by at least 10% of the CD leg.

### Cypher

Five pivots. B = 0.382–0.618 of XA; C = 1.13–1.414 of XA (it overshoots A); D = 0.786 of XC.
`invalidation` = D, `target` = A, `confirmed` as above.

### Head & shoulders

Five pivots: LS, N1, head, N2, RS — the two lows (or highs, inverted) between the shoulders are the
neckline's two points, and they are part of the drawing because the `hs` tool takes five.
Bearish when the middle pivot is the highest; inverse when it is the lowest.

- head beyond both shoulders by at least 1% of price;
- the two shoulders within 10% of each other (measured against the head-to-neckline height);
- the neckline is the line through the two lows (or highs, inverted);
- `confirmed` when the newest close is beyond the neckline;
- `target` = neckline ± the head-to-neckline height (the measured move);
- `invalidation` = the head.

### Triangle

The last four pivots, alternating high and low (H-L-H-L, or the mirror), so the shape has two highs
and two lows and matches the `triangle` tool's four points. Fit a line through the highs and one
through the lows:

- symmetric: highs falling and lows rising;
- ascending: highs flat (within 2% of price) and lows rising;
- descending: lows flat and highs falling.

The two lines must converge to the right. `target` = the height of the first leg projected from the
breakout side; `invalidation` = the far side of the triangle; `confirmed` when the newest close is
outside the triangle.

### Three drives

Six pivots: three impulses in one direction, each followed by a pullback of 0.5–0.786 of the drive
before it. Bearish when the three drives are up (the trade is the reversal down), bullish when they
are down. `invalidation` = the third drive's extreme; `target` = the start of the first drive. The
six pivots go to the open-ended `polyline` tool, because the `drives3` tool only holds the three
extremes and would draw a triangle instead of the zigzag.

### Elliott impulse

Six pivots 0–5. The published rules, all of them:

- 2 does not pass 0;
- 3 passes 1;
- 4 does not overlap 1;
- 2 and 4 alternate (one retraces more than 50% of its leg, the other less);
- 3 is not the shortest of waves 1, 3 and 5;
- 5 passes 3.

`invalidation` = point 4 (the level that voids the count), `target` = the 1.618 extension of wave 1
from point 2.

### Elliott correction (ABC)

Four pivots 0, A, B, C. B retraces 0.382–0.886 of 0→A; C passes A. `invalidation` = B,
`target` = the 1.272 extension of A from B.

## 2. The scan (`lib/pattern-scan.ts`)

```ts
export const SCAN_PATTERNS: readonly PatternId[] = [...];
export const SCAN_BATCH = 8;          // symbols per server call
export const MAX_SCAN_SYMBOLS = 240;  // the same ceiling the formula screen uses

export function scanCandles(
    candles: readonly Candle[],
    patterns: readonly PatternId[],
    options: PivotOptions,
): PatternHit[];
```

- `detectPivots` runs **once** per symbol, not once per pattern.
- Each requested detector walks the pivot list from the newest window backwards and returns its
  newest valid hit, so a symbol contributes at most one hit per pattern.
- Hits are sorted newest first, then by pattern order.
- A symbol with fewer than 4 pivots returns `[]` without running any detector.

## 3. Server action (`lib/actions/pattern-scan.actions.ts`)

```ts
export async function scanPatternBatch(
    symbols: string[],
    patterns: PatternId[],
    intervalId: string,
    sensitivity: AutoSensitivity,
): Promise<PatternScanResult>;
```

- Validates and caps the list at `SCAN_BATCH * 2`, the same guard `screenFormula` uses.
- Fetches through `getStrategyCandles` (already cached for an hour per symbol+interval).
- One symbol that throws is a miss, not a failed scan.
- Returns `{ symbol, hits }` per symbol plus the count of symbols that answered, so the client can
  say "scanned 96 of 120" instead of pretending the whole list was read.

## 4. The page (`/scanner`)

`app/(root)/scanner/page.tsx` is a server component: it reads the language, the watchlist and the
universe sizes, and renders `PatternScanner`.

Controls, in one row above the results:

- **Universe**: Watchlist · Saudi market · US market · All (the same lists the screener uses).
- **Patterns**: a checkbox per pattern, grouped (Wolfe · Harmonic · Classical · Elliott), with
  "select all" per group. Default: every pattern on, Elliott included; the group checkbox is there
  because Elliott is the noisiest and a trader will want to switch it off.
- **Interval**: 1h · 4h · 1D · 1W, default 1D.
- **Sensitivity**: ATR · 1% · 3% · 5%, the same picker the chart's auto-count uses.
- **Scan** button, which switches to a Stop button while running, with a progress bar and "scanned N of M".

Results table, one row per hit:

| Symbol | Name | Pattern | Direction | Last | Invalidation | Target | State | |
|---|---|---|---|---|---|---|---|---|

- Direction is a coloured pill (صاعد / هابط).
- State is *مؤكد* or *قيد التشكل*.
- The last cell is a link: **افتح الشارت** → `/stocks/SYM?pattern=<token>`.
- Empty state: "ما في نمط مكتمل بهذه الإعدادات — جرّب حساسية أصغر أو فاصل أطول."
- The scan is cancellable: a second click on Scan stops the walk after the current batch.

The page is added to the sidebar under Screener and to the command bar's tool list.

## 5. Chart hand-off (`lib/pattern-link.ts`)

A hit becomes a URL token, base64url of:

```json
{ "v": 1, "p": "wolfe", "d": "bullish", "i": "1d", "pts": [[1730000000, 26.1], ...] }
```

- `encodePatternLink(hit)` / `decodePatternLink(token)`.
- `i` is the interval the scan ran on. It is part of the token because a Wolfe found on the hour is a
  different shape on the daily, and the chart has to open on the bars the pattern was measured from.
- Decoding validates: known pattern id, exactly `PATTERN_POINTS[pattern]` points, strictly increasing
  times, finite prices, a known `CANDLE_INTERVALS` id, token under 2 KB. Anything else returns null
  and the chart opens normally.
- `app/(root)/stocks/[symbol]/page.tsx` reads `searchParams.pattern`, decodes it, and passes
  `initialPattern` to `YahooChart`; the chart also opens on the token's interval via the existing
  `preferredInterval` prop.
- `YahooChart` commits it once, after the candles load, through the same `commit()` the auto-detect
  uses, then clears the query param with `history.replaceState` so a refresh does not duplicate it.
- The drawing is an ordinary one: draggable, recolourable, deletable, alertable.

## 6. i18n

New keys, both languages, Arabic-Indic digits in any label that carries a number:

- `scan.title`, `scan.sub`, `scan.universe.*`, `scan.patterns`, `scan.group.*`, `scan.interval`,
  `scan.sensitivity`, `scan.run`, `scan.running`, `scan.progress`, `scan.empty`, `scan.cancelled`,
  `scan.partial`, `scan.openChart`, `scan.state.confirmed`, `scan.state.forming`,
  `scan.direction.bullish`, `scan.direction.bearish`, `scan.col.*`, `scan.pattern.*` (one per id),
  `scan.added` (the toast when the chart receives a pattern).

## 7. Testing

- `__tests__/patterns.test.ts` — every detector: one textbook positive, and one negative per rule
  it enforces (the same shape with that rule broken). Synthetic pivots, no candles.
- `__tests__/pattern-scan.test.ts` — one pivot pass for many patterns; newest hit wins; a symbol
  with too few pivots returns nothing; hits are ordered.
- `__tests__/pattern-link.test.ts` — round trip, rejects unknown pattern, non-increasing times,
  oversized token.
- `__tests__/pattern-scan-actions.test.ts` — a throwing symbol does not fail the batch; the cap is
  enforced; the answered count is honest.
- `__tests__/pattern-scanner-render.test.tsx` — the table renders a hit, the empty state, and the
  progress line.
- Existing suites must stay green: `npx vitest run`, `npx tsc --noEmit`, eslint on changed files,
  `rm -rf .next && npx next build`.

## 8. Rollout

1. Detectors + tests (pure, no UI).
2. Scan + action + tests.
3. Page + i18n + nav.
4. Chart hand-off.
5. Runtime check in the browser on the local build, then the usual verification gate.

No feature flag: the route is new, so nothing existing can regress. The scheduled scan (Inngest) is
a later phase that calls `scanCandles` over the stored universe and writes hits to Mongo; nothing in
this spec has to change for it.
