# Pattern Scanner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `/scanner` page that runs the chart's own pattern detectors over a list of symbols and returns the hits, with a link that opens the chart with the pattern drawn.

**Architecture:** Pure detectors in `lib/patterns.ts` (pivots in, hit out), one shared scan in `lib/pattern-scan.ts`, a batched server action that copies `screenFormula`'s contract, a client page that walks the batches, and a URL token that carries a hit into `YahooChart`.

**Tech Stack:** Next.js 15 App Router, TypeScript, React 19, Vitest, Tailwind, lucide-react.

**Spec:** `docs/superpowers/specs/2026-11-09-pattern-scanner-design.md`

## Global Constraints

- No new data provider. Candles come from `getStrategyCandles(symbol, intervalId)` only.
- Detectors are pure: no `fetch`, no `Date.now()`, no DOM, no `Math.random()`.
- Every new string exists in **both** languages in `lib/i18n.ts` (`ar` is `Record<Key, string>`, so a missing Arabic key fails the build). Numeric labels use Arabic-Indic digits via `arDigits`.
- Arabic strings in labels and buttons, English in code identifiers and comments.
- Nothing is "done" until: `npx tsc --noEmit`, `npx eslint <changed files>`, `npx vitest run`, `rm -rf .next && npx next build` all pass.
- Follow the existing test style: `describe`/`it` from `vitest`, `@/` path alias, Arabic-free test names.

## Review Focus

The spec implies these inputs; each one has a test in the task that owns the code.

1. **Empty or short candle history** — a symbol with 0–3 bars must return no hits and must not crash the batch; the action counts it as unanswered rather than failed.
2. **A flat or duplicate-time series** — two pivots on the same bar make `retrace`/`converge` divide by zero; they must return a non-hit, never `NaN` in the table.
3. **A tampered pattern link** — NaN prices, non-increasing times, an unknown pattern id, or a token over 2 KB must decode to `null`, and the chart must open normally.
4. **A universe larger than the ceiling** — the client stops at `MAX_SCAN_SYMBOLS` and says so; the server action caps each call at `SCAN_BATCH * 2`.
5. **A hit whose point count does not match its tool** — `drawingFromLink` must return `null` rather than a drawing the chart would silently drop.
6. **Cancelling mid-scan** — no state update after unmount, so React does not warn.

---

### Task 1: Pattern vocabulary, geometry helpers and the Wolfe detector

**Files:**
- Create: `lib/patterns.ts`
- Test: `__tests__/patterns.test.ts`

**Interfaces:**
- Consumes: `detectPivots`, `Pivot`, `PivotOptions` from `@/lib/auto-count`; `checkWolfe`, `lineAt` from `@/lib/wolfe`; `DrawPoint`, `ShapeTool`, `Drawing`, `newDrawingId`, `toolDef` from `@/lib/chart-drawings`; `Candle` from `@/lib/yahoo-candles`; `StringKey` from `@/lib/i18n`.
- Produces:
  ```ts
  export type PatternDirection = 'bullish' | 'bearish';
  export type PatternId = 'wolfe' | 'gartley' | 'bat' | 'butterfly' | 'crab' | 'cypher'
      | 'hs' | 'triangle' | 'drives3' | 'impulse' | 'abc';
  export type PatternHit = {
      pattern: PatternId; direction: PatternDirection; tool: ShapeTool;
      points: DrawPoint[]; labels: string[];
      invalidation: number; target: number | null;
      confirmed: boolean; foundAt: number;
  };
  export const PATTERN_ORDER: readonly PatternId[];
  export const PATTERN_TOOL: Record<PatternId, ShapeTool>;
  export const PATTERN_POINTS: Record<PatternId, number>;
  export const PATTERN_GROUP: Record<PatternId, 'wolfe' | 'harmonic' | 'classical' | 'elliott'>;
  export const PATTERN_LABEL_KEY: Record<PatternId, StringKey>;
  export function retrace(from: number, to: number, at: number): number;
  export function within(value: number, min: number, max: number): boolean;
  export function slopeOf(a: Pivot, b: Pivot): number;
  export function detectWolfe(pivots: readonly Pivot[], candles: readonly Candle[]): PatternHit | null;
  ```

- [ ] **Step 1: Write the failing tests**

In `__tests__/patterns.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { PATTERN_ORDER, PATTERN_POINTS, PATTERN_TOOL, detectWolfe, retrace, within } from '@/lib/patterns';
import { pointsNeeded } from '@/lib/chart-drawings';
import type { Pivot } from '@/lib/auto-count';
import type { Candle } from '@/lib/yahoo-candles';

const pivot = (time: number, price: number, kind: 'high' | 'low'): Pivot => ({ time, price, kind });

// The textbook bullish wave from __tests__/wolfe.test.ts, as pivots.
const bullish = [pivot(1, 100, 'low'), pivot(2, 120, 'high'), pivot(3, 90, 'low'), pivot(4, 108, 'high'), pivot(5, 78, 'low')];

const bars = (count: number, close: (i: number) => number): Candle[] =>
    Array.from({ length: count }, (_, i) => ({ time: 1000 + i * 60, open: close(i), high: close(i) + 0.4, low: close(i) - 0.4, close: close(i), volume: 10 }));

describe('the pattern vocabulary', () => {
    it('names every pattern once and gives each one a tool and a point count', () => {
        expect(new Set(PATTERN_ORDER).size).toBe(PATTERN_ORDER.length);
        for (const id of PATTERN_ORDER) {
            expect(PATTERN_TOOL[id]).toBeTruthy();
            expect(PATTERN_POINTS[id]).toBeGreaterThanOrEqual(3);
        }
    });

    it('uses each tool with exactly the number of points the tool takes, or an open-ended one', () => {
        for (const id of PATTERN_ORDER) {
            const needed = pointsNeeded(PATTERN_TOOL[id]);
            if (needed === 0) expect(PATTERN_POINTS[id]).toBeGreaterThanOrEqual(2);
            else expect(PATTERN_POINTS[id]).toBe(needed);
        }
    });
});

describe('retrace', () => {
    it('reads 0.618 for a 61.8% pullback of a rising leg', () => {
        expect(retrace(100, 200, 138.2)).toBeCloseTo(0.618, 3);
    });

    it('reads the same fraction for a falling leg', () => {
        expect(retrace(200, 100, 138.2)).toBeCloseTo(0.618, 3);
    });

    it('returns 0 instead of Infinity when the leg has no height', () => {
        expect(retrace(100, 100, 120)).toBe(0);
    });
});

describe('within', () => {
    it('accepts a value inside the band and one on the tolerance edge', () => {
        expect(within(0.618, 0.382, 0.618)).toBe(true);
        expect(within(0.65, 0.382, 0.618)).toBe(true);
    });

    it('rejects a value outside the band', () => {
        expect(within(0.8, 0.382, 0.618)).toBe(false);
    });
});

describe('detectWolfe', () => {
    it('reads the textbook wave, with the fifth point as the invalidation', () => {
        const hit = detectWolfe(bullish, bars(10, (i) => 100 + i));
        expect(hit?.pattern).toBe('wolfe');
        expect(hit?.direction).toBe('bullish');
        expect(hit?.tool).toBe('wolfe');
        expect(hit?.labels).toEqual(['1', '2', '3', '4', '5']);
        expect(hit?.invalidation).toBe(78);
        expect(hit?.confirmed).toBe(true);
        expect(hit?.foundAt).toBe(5);
    });

    it('returns null for five pivots that are not a wave', () => {
        const broken = [pivot(1, 100, 'low'), pivot(2, 120, 'high'), pivot(3, 90, 'low'), pivot(4, 125, 'high'), pivot(5, 78, 'low')];
        expect(detectWolfe(broken, bars(10, (i) => 100 + i))).toBeNull();
    });

    it('returns null for a flat series rather than a NaN hit', () => {
        const flat = [pivot(1, 100, 'low'), pivot(2, 100, 'high'), pivot(3, 100, 'low'), pivot(4, 100, 'high'), pivot(5, 100, 'low')];
        expect(detectWolfe(flat, bars(10, () => 100))).toBeNull();
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run __tests__/patterns.test.ts`
Expected: FAIL — "Failed to resolve import '@/lib/patterns'".

- [ ] **Step 3: Implement the vocabulary and the helpers in `lib/patterns.ts`**

`PATTERN_ORDER` is `['wolfe', 'gartley', 'bat', 'butterfly', 'crab', 'cypher', 'hs', 'triangle', 'drives3', 'impulse', 'abc']` (the table order in the spec). `PATTERN_TOOL` and `PATTERN_POINTS` are the spec's "Pattern → drawing tool" table verbatim. `PATTERN_GROUP` is wolfe→`'wolfe'`, the four harmonic + cypher→`'harmonic'`, hs/triangle/drives3→`'classical'`, impulse/abc→`'elliott'`. `PATTERN_LABEL_KEY[id]` is `` `scan.pattern.${id}` ``.

`retrace(from, to, at)`: `const span = to - from; return span === 0 ? 0 : (at - from) / span;`
`within(value, min, max)`: `value >= min - 0.05 && value <= max + 0.05`.
`slopeOf(a, b)`: `b.time === a.time ? 0 : (b.price - a.price) / (b.time - a.time)`.

`detectWolfe(pivots, candles)` maps the pivots to `DrawPoint[]`, calls `checkWolfe`, returns null when it fails, and otherwise builds the hit with `direction` from the check, `invalidation` = point 5 price, `target` = `lineAt(p1, p4, apexTime)` where `apexTime` is where the 1-3 and 2-4 lines meet (solve the two lines for equal price; when the slopes are equal there is no apex and `target` is `null`), and `confirmed: true` (piercing the 1-3 line is part of the rule). It does not read `candles`; the parameter exists so every detector has one signature.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run __tests__/patterns.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/patterns.ts __tests__/patterns.test.ts
git commit -m "Add the pattern vocabulary, geometry helpers and the Wolfe detector"
```

---

### Task 2: Harmonic family and Cypher

**Files:**
- Modify: `lib/patterns.ts`
- Test: `__tests__/patterns.test.ts`

**Interfaces:**
- Consumes: Task 1's `PatternHit`, `retrace`, `within`, `slopeOf`.
- Produces:
  ```ts
  export function detectHarmonic(pivots: readonly Pivot[], candles: readonly Candle[]): PatternHit | null;
  export function detectCypher(pivots: readonly Pivot[], candles: readonly Candle[]): PatternHit | null;
  ```

- [ ] **Step 1: Write the failing tests**

Append to `__tests__/patterns.test.ts`:

```ts
// X low, A high, B low, C high, D low: a bullish Gartley (D retraces 0.786 of XA).
const gartley = [pivot(1, 100, 'low'), pivot(2, 200, 'high'), pivot(3, 138.2, 'low'), pivot(4, 176, 'high'), pivot(5, 121.4, 'low')];

describe('detectHarmonic', () => {
    it('names the variant whose ratios all hold', () => {
        const hit = detectHarmonic(gartley, bars(10, (i) => 100 + i));
        expect(hit?.pattern).toBe('gartley');
        expect(hit?.direction).toBe('bullish');
        expect(hit?.tool).toBe('xabcd');
        expect(hit?.labels).toEqual(['X', 'A', 'B', 'C', 'D']);
        expect(hit?.invalidation).toBe(121.4);
        expect(hit?.target).toBe(200);
    });

    it('reads the mirrored shape as bearish', () => {
        const mirror = gartley.map((p) => pivot(p.time, 300 - p.price, p.kind === 'high' ? 'low' : 'high'));
        expect(detectHarmonic(mirror, bars(10, (i) => 100 + i))?.direction).toBe('bearish');
    });

    it('returns null when point C retraces almost nothing of AB', () => {
        const broken = [gartley[0], gartley[1], gartley[2], pivot(4, 139, 'high'), gartley[4]];
        expect(detectHarmonic(broken, bars(10, (i) => 100 + i))).toBeNull();
    });
});

describe('detectCypher', () => {
    it('accepts the shape whose C overshoots A and whose D is 0.786 of XC', () => {
        const cypher = [pivot(1, 100, 'low'), pivot(2, 200, 'high'), pivot(3, 140, 'low'), pivot(4, 215, 'high'), pivot(5, 144.1, 'low')];
        const hit = detectCypher(cypher, bars(10, (i) => 100 + i));
        expect(hit?.pattern).toBe('cypher');
        expect(hit?.tool).toBe('cypher');
    });

    it('returns null when C stays inside XA', () => {
        expect(detectCypher(gartley, bars(10, (i) => 100 + i))).toBeNull();
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run __tests__/patterns.test.ts`
Expected: FAIL — `detectHarmonic is not a function`.

- [ ] **Step 3: Implement both detectors**

`detectHarmonic` reads X→A direction, then tests the spec's ratio table in order Gartley, Bat, Butterfly, Crab; the first variant whose four ratios pass wins. `target` = A's price, `invalidation` = D's price, `confirmed` = the newest close has moved off D by at least 10% of the CD leg in the direction the pattern trades.

`detectCypher` tests B = 0.382–0.618 of XA, C = 1.13–1.414 of XA, D = 0.786 of XC, with `target` = A and the same `confirmed` rule.

Both return null when `pivots.length !== 5`, when any price is not finite, or when the direction cannot be read.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run __tests__/patterns.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/patterns.ts __tests__/patterns.test.ts
git commit -m "Add the harmonic family and Cypher detectors"
```

---

### Task 3: Head & shoulders and triangle

**Files:**
- Modify: `lib/patterns.ts`
- Test: `__tests__/patterns.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function detectHeadShoulders(pivots: readonly Pivot[], candles: readonly Candle[]): PatternHit | null;
  export function detectTriangle(pivots: readonly Pivot[], candles: readonly Candle[]): PatternHit | null;
  ```

- [ ] **Step 1: Write the failing tests**

Append:

```ts
// LS, N1, head, N2, RS — a completed bearish head & shoulders.
const hs = [pivot(1, 120, 'high'), pivot(2, 100, 'low'), pivot(3, 140, 'high'), pivot(4, 102, 'low'), pivot(5, 121, 'high')];
const falling = bars(10, (i) => 120 - i);

describe('detectHeadShoulders', () => {
    it('labels the five points the hs tool takes and measures the move off the neckline', () => {
        const hit = detectHeadShoulders(hs, falling);
        expect(hit?.pattern).toBe('hs');
        expect(hit?.tool).toBe('hs');
        expect(hit?.labels).toEqual(['LS', 'N1', 'H', 'N2', 'RS']);
        expect(hit?.direction).toBe('bearish');
        expect(hit?.invalidation).toBe(140);
        // The neckline sits at 101 and the head is 39 above it, so the target is 62.
        expect(hit?.target).toBeCloseTo(62, 0);
        expect(hit?.confirmed).toBe(true);
    });

    it('reports the same shape as forming while the close is still above the neckline', () => {
        expect(detectHeadShoulders(hs, bars(10, () => 110))?.confirmed).toBe(false);
    });

    it('returns null when the second shoulder is far below the first', () => {
        const lopsided = [hs[0], hs[1], hs[2], hs[3], pivot(5, 90, 'high')];
        expect(detectHeadShoulders(lopsided, falling)).toBeNull();
    });
});

describe('detectTriangle', () => {
    it('reads falling highs over rising lows as symmetric', () => {
        const symmetric = [pivot(1, 130, 'high'), pivot(2, 90, 'low'), pivot(3, 122, 'high'), pivot(4, 98, 'low')];
        const hit = detectTriangle(symmetric, bars(10, () => 110));
        expect(hit?.pattern).toBe('triangle');
        expect(hit?.tool).toBe('triangle');
        expect(hit?.labels).toEqual(['1', '2', '3', '4']);
    });

    it('returns null when the two lines diverge', () => {
        const diverging = [pivot(1, 120, 'high'), pivot(2, 100, 'low'), pivot(3, 132, 'high'), pivot(4, 88, 'low')];
        expect(detectTriangle(diverging, bars(10, () => 110))).toBeNull();
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run __tests__/patterns.test.ts`
Expected: FAIL — `detectHeadShoulders is not a function`.

- [ ] **Step 3: Implement both detectors**

`detectHeadShoulders` needs exactly 5 pivots: the middle one is the head and must be beyond both shoulders by at least 1% of price; the two shoulders must be within 10% of each other measured against the head-to-neckline height; the neckline is the line through the two inner pivots; `target` is the neckline at the last pivot's time ± the head-to-neckline height; `invalidation` is the head's price; `confirmed` is the newest close beyond the neckline. Both the bearish (head high) and inverse (head low) shapes are accepted.

`detectTriangle` needs exactly 4 pivots alternating H-L-H-L or L-H-L-H; it fits a line through the highs and one through the lows and requires them to converge to the right (`slopeOf` of the high line below the low line's slope for a symmetric shape, with flat sides accepted when within 2% of price); it names symmetric / ascending / descending by which sides slope; `target` is the first leg's height projected from the breakout side; `invalidation` is the far side of the triangle; `confirmed` is the newest close outside the triangle.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run __tests__/patterns.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/patterns.ts __tests__/patterns.test.ts
git commit -m "Add the head-and-shoulders and triangle detectors"
```

---

### Task 4: Three drives, Elliott impulse and Elliott ABC

**Files:**
- Modify: `lib/patterns.ts`
- Test: `__tests__/patterns.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function detectThreeDrives(pivots: readonly Pivot[], candles: readonly Candle[]): PatternHit | null;
  export function detectImpulse(pivots: readonly Pivot[], candles: readonly Candle[]): PatternHit | null;
  export function detectAbc(pivots: readonly Pivot[], candles: readonly Candle[]): PatternHit | null;
  export const DETECTORS: Record<PatternId, (pivots: readonly Pivot[], candles: readonly Candle[]) => PatternHit | null>;
  ```

- [ ] **Step 1: Write the failing tests**

Append:

```ts
// Three drives down, each pullback retracing about 0.6 of the drive before it.
const drives = [pivot(1, 200, 'high'), pivot(2, 150, 'low'), pivot(3, 180, 'high'), pivot(4, 130, 'low'), pivot(5, 160, 'high'), pivot(6, 110, 'low')];

describe('detectThreeDrives', () => {
    it('labels six points and targets the start of the first drive', () => {
        const hit = detectThreeDrives(drives, bars(10, (i) => 110 + i));
        expect(hit?.pattern).toBe('drives3');
        expect(hit?.tool).toBe('polyline');
        expect(hit?.labels).toHaveLength(6);
        expect(hit?.invalidation).toBe(110);
        expect(hit?.target).toBe(200);
    });

    it('returns null when a pullback retraces only a sliver of its drive', () => {
        const broken = [drives[0], drives[1], drives[2], drives[3], pivot(5, 137, 'high'), drives[5]];
        expect(detectThreeDrives(broken, bars(10, (i) => 110 + i))).toBeNull();
    });
});

// A textbook impulse: 2 holds above 0, 3 clears 1, 4 stays above 1, 5 clears 3.
const impulse = [pivot(1, 100, 'low'), pivot(2, 140, 'high'), pivot(3, 110, 'low'), pivot(4, 190, 'high'), pivot(5, 150, 'low'), pivot(6, 220, 'high')];

describe('detectImpulse', () => {
    it('accepts the wave and voids the count at point 4', () => {
        const hit = detectImpulse(impulse, bars(10, (i) => 100 + i));
        expect(hit?.pattern).toBe('impulse');
        expect(hit?.tool).toBe('ew-impulse');
        expect(hit?.labels).toEqual(['0', '1', '2', '3', '4', '5']);
        expect(hit?.invalidation).toBe(150);
    });

    it('returns null when wave 4 overlaps wave 1', () => {
        const overlapping = [impulse[0], impulse[1], impulse[2], impulse[3], pivot(4, 205, 'high'), impulse[5]];
        expect(detectImpulse(overlapping, bars(10, (i) => 100 + i))).toBeNull();
    });

    it('returns null when wave 3 is the shortest of the three impulses', () => {
        const short = [impulse[0], impulse[1], impulse[2], pivot(3, 149, 'low'), impulse[4], impulse[5]];
        expect(detectImpulse(short, bars(10, (i) => 100 + i))).toBeNull();
    });
});

describe('detectAbc', () => {
    it('accepts a zigzag whose C clears A', () => {
        const abc = [pivot(1, 200, 'high'), pivot(2, 150, 'low'), pivot(3, 180, 'high'), pivot(4, 130, 'low')];
        const hit = detectAbc(abc, bars(10, (i) => 100 + i));
        expect(hit?.pattern).toBe('abc');
        expect(hit?.tool).toBe('ew-abc');
        expect(hit?.labels).toEqual(['0', 'A', 'B', 'C']);
        expect(hit?.invalidation).toBe(180);
    });

    it('returns null when B retraces more than 0.886 of A', () => {
        const broken = [abc[0], abc[1], pivot(3, 196, 'high'), abc[3]];
        expect(detectAbc(broken, bars(10, (i) => 100 + i))).toBeNull();
    });
});

describe('DETECTORS', () => {
    it('has one entry per pattern id, and each is the function the id names', () => {
        expect(Object.keys(DETECTORS).sort()).toEqual([...PATTERN_ORDER].sort());
        expect(DETECTORS.wolfe).toBe(detectWolfe);
        expect(DETECTORS.impulse).toBe(detectImpulse);
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run __tests__/patterns.test.ts`
Expected: FAIL — `detectThreeDrives is not a function`.

- [ ] **Step 3: Implement the three detectors and the registry**

`detectThreeDrives`: six pivots; the three extremes (indices 0, 2, 4) must progress in one direction and each pullback (indices 1, 3, 5) must retrace 0.5–0.786 of the drive before it; `tool: 'polyline'`, labels `['1','2','3','4','5','6']`, `invalidation` = the third drive's extreme, `target` = the first pivot's price.

`detectImpulse`: six pivots; the spec's five rules, all enforced; `invalidation` = point 4; `target` = the 1.618 extension of wave 1 measured from point 2; `confirmed` = the newest close beyond point 5.

`detectAbc`: four pivots; B retraces 0.382–0.886 of 0→A and C passes A; `invalidation` = B; `target` = the 1.272 extension of A from B.

`DETECTORS` maps every `PatternId` to its function (harmonic and cypher included), so `lib/pattern-scan.ts` never switches on the id.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run __tests__/patterns.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/patterns.ts __tests__/patterns.test.ts
git commit -m "Add the three-drives and Elliott detectors"
```

---

### Task 5: The scan over candles

**Files:**
- Create: `lib/pattern-scan.ts`
- Test: `__tests__/pattern-scan.test.ts`

**Interfaces:**
- Consumes: `DETECTORS`, `PATTERN_ORDER`, `PATTERN_POINTS`, `PatternHit`, `PatternId` from `@/lib/patterns`; `detectPivots`, `PivotOptions`, `AutoSensitivity` from `@/lib/auto-count`; `Candle` from `@/lib/yahoo-candles`.
- Produces:
  ```ts
  export const SCAN_PATTERNS: readonly PatternId[];
  export const SCAN_BATCH = 8;
  export const MAX_SCAN_SYMBOLS = 240;
  export function pivotOptionsFor(sensitivity: AutoSensitivity): PivotOptions;
  export function scanCandles(candles: Candle[], patterns: readonly PatternId[], options: PivotOptions): PatternHit[];
  ```

- [ ] **Step 1: Write the failing tests**

`__tests__/pattern-scan.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { MAX_SCAN_SYMBOLS, SCAN_BATCH, SCAN_PATTERNS, pivotOptionsFor, scanCandles } from '@/lib/pattern-scan';
import type { Candle } from '@/lib/yahoo-candles';

/** A close path walked in equal steps, so the zigzag detector sees one pivot per waypoint. */
const candlesFrom = (waypoints: number[]): Candle[] => {
    const closes: number[] = [];
    for (let i = 0; i < waypoints.length - 1; i += 1) {
        const from = waypoints[i];
        const to = waypoints[i + 1];
        for (let step = 0; step < 5; step += 1) closes.push(from + ((to - from) * step) / 5);
    }
    closes.push(waypoints[waypoints.length - 1]);
    return closes.map((close, index) => ({ time: 1_000 + index * 60, open: close, high: close + 0.4, low: close - 0.4, close, volume: 100 }));
};

const percent = { mode: 'percent' as const, percent: 0.02 };

describe('scanCandles', () => {
    it('returns at most one hit per pattern, newest first', () => {
        const hits = scanCandles(candlesFrom([100, 95, 120, 90, 108, 78, 95]), SCAN_PATTERNS, percent);
        const ids = hits.map((hit) => hit.pattern);
        expect(new Set(ids).size).toBe(ids.length);
        for (let i = 1; i < hits.length; i += 1) expect(hits[i - 1].foundAt).toBeGreaterThanOrEqual(hits[i].foundAt);
    });

    it('finds the Wolfe wave when only Wolfe is asked for', () => {
        const hits = scanCandles(candlesFrom([100, 95, 120, 90, 108, 78, 95]), ['wolfe'], percent);
        expect(hits).toHaveLength(1);
        expect(hits[0].tool).toBe('wolfe');
    });

    it('returns nothing for a straight series', () => {
        const straight = Array.from({ length: 40 }, (_, i) => 100 + i);
        expect(scanCandles(candlesFrom(straight), SCAN_PATTERNS, percent)).toEqual([]);
    });

    it('returns nothing for three bars instead of throwing', () => {
        expect(scanCandles(candlesFrom([100, 110, 105]), SCAN_PATTERNS, percent)).toEqual([]);
    });

    it('ignores an unknown pattern id rather than crashing', () => {
        expect(scanCandles(candlesFrom([100, 95, 120, 90, 108, 78, 95]), ['nope' as never], percent)).toEqual([]);
    });

    it('publishes the ceilings the client and the action both read', () => {
        expect(SCAN_BATCH).toBe(8);
        expect(MAX_SCAN_SYMBOLS).toBe(240);
    });
});

describe('pivotOptionsFor', () => {
    it('maps ATR to the ATR mode and a percentage to the percent mode', () => {
        expect(pivotOptionsFor('atr')).toEqual({ mode: 'atr' });
        expect(pivotOptionsFor('0.03')).toEqual({ mode: 'percent', percent: 0.03 });
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run __tests__/pattern-scan.test.ts`
Expected: FAIL — "Failed to resolve import '@/lib/pattern-scan'".

- [ ] **Step 3: Implement `pivotOptionsFor` and `scanCandles`**

`pivotOptionsFor(sensitivity)` returns `{ mode: 'atr' }` for `'atr'`, and `{ mode: 'percent', percent: Number(sensitivity) }` otherwise. It lives here, **not** in the action file: a `'use server'` module may only export async functions (Next 15 rejects a synchronous export), so the action imports this helper instead of defining it.

`scanCandles` runs `detectPivots(candles, options)` once. For each requested id that exists in `DETECTORS`, walk windows from the newest backwards (`for (let end = pivots.length; end >= PATTERN_POINTS[id]; end -= 1)`) and take the first window whose detector returns a hit. Sort by `foundAt` descending, then by `PATTERN_ORDER` index. Return `[]` when fewer than 4 pivots were found.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run __tests__/pattern-scan.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/pattern-scan.ts __tests__/pattern-scan.test.ts
git commit -m "Add the candle scan that runs each detector once"
```

---

### Task 6: The batched server action

**Files:**
- Create: `lib/actions/pattern-scan.actions.ts`
- Test: `__tests__/pattern-scan-actions.test.ts`

**Interfaces:**
- Consumes: `scanCandles`, `SCAN_BATCH`, `pivotOptionsFor` from `@/lib/pattern-scan`; `getStrategyCandles` from `@/lib/actions/yahoo-candles.actions`; `PatternHit`, `PatternId` from `@/lib/patterns`; `AutoSensitivity` from `@/lib/auto-count`.
- Produces:
  ```ts
  export type SymbolPatternHits = { symbol: string; hits: PatternHit[] };
  export type PatternScanResult = { results: SymbolPatternHits[]; answered: number; requested: number };
  export async function scanPatternBatch(
      symbols: string[], patterns: PatternId[], intervalId: string, sensitivity: AutoSensitivity,
  ): Promise<PatternScanResult>;
  ```

- [ ] **Step 1: Write the failing tests**

`__tests__/pattern-scan-actions.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/lib/actions/yahoo-candles.actions', () => ({
    getStrategyCandles: vi.fn(),
}));

import { getStrategyCandles } from '@/lib/actions/yahoo-candles.actions';
import { scanPatternBatch } from '@/lib/actions/pattern-scan.actions';
import { pivotOptionsFor } from '@/lib/pattern-scan';
import { SCAN_BATCH } from '@/lib/pattern-scan';

const candles = (waypoints: number[]) => {
    const closes: number[] = [];
    for (let i = 0; i < waypoints.length - 1; i += 1) {
        for (let step = 0; step < 5; step += 1) closes.push(waypoints[i] + ((waypoints[i + 1] - waypoints[i]) * step) / 5);
    }
    closes.push(waypoints[waypoints.length - 1]);
    return closes.map((close, index) => ({ time: 1_000 + index * 60, open: close, high: close + 0.4, low: close - 0.4, close, volume: 100 }));
};

const wave = candles([100, 95, 120, 90, 108, 78, 95]);

beforeEach(() => vi.mocked(getStrategyCandles).mockReset());

describe('pivotOptionsFor', () => {
    it('maps ATR to the ATR mode and a percentage to the percent mode', () => {
        expect(pivotOptionsFor('atr')).toEqual({ mode: 'atr' });
        expect(pivotOptionsFor('0.03')).toEqual({ mode: 'percent', percent: 0.03 });
    });
});

describe('scanPatternBatch', () => {
    it('answers per symbol and counts only the symbols that came back', async () => {
        vi.mocked(getStrategyCandles).mockImplementation(async (symbol: string) =>
            symbol === 'GOOD' ? { candles: wave } as never : null);
        const result = await scanPatternBatch(['GOOD', 'EMPTY'], ['wolfe'], '1d', '0.02');
        expect(result.requested).toBe(2);
        expect(result.answered).toBe(1);
        expect(result.results.find((row) => row.symbol === 'GOOD')?.hits[0].pattern).toBe('wolfe');
        expect(result.results.find((row) => row.symbol === 'EMPTY')?.hits).toEqual([]);
    });

    it('treats a throwing symbol as a miss, not a failed scan', async () => {
        vi.mocked(getStrategyCandles).mockImplementation(async (symbol: string) => {
            if (symbol === 'BOOM') throw new Error('nope');
            return { candles: wave } as never;
        });
        const result = await scanPatternBatch(['BOOM', 'GOOD'], ['wolfe'], '1d', '0.02');
        expect(result.answered).toBe(1);
        expect(result.results).toHaveLength(2);
    });

    it('caps the list at twice the batch size', async () => {
        vi.mocked(getStrategyCandles).mockResolvedValue({ candles: wave } as never);
        const many = Array.from({ length: SCAN_BATCH * 5 }, (_, i) => `S${i}`);
        await scanPatternBatch(many, ['wolfe'], '1d', '0.02');
        expect(vi.mocked(getStrategyCandles).mock.calls.length).toBe(SCAN_BATCH * 2);
    });

    it('asks for nothing when the symbol list is empty', async () => {
        const result = await scanPatternBatch([], ['wolfe'], '1d', '0.02');
        expect(result).toEqual({ results: [], answered: 0, requested: 0 });
        expect(vi.mocked(getStrategyCandles)).not.toHaveBeenCalled();
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run __tests__/pattern-scan-actions.test.ts`
Expected: FAIL — "Failed to resolve import '@/lib/actions/pattern-scan.actions'".

- [ ] **Step 3: Implement the action**

`'use server'` at the top, and the only exports are the two types and `scanPatternBatch` — a server module may not export a synchronous function, which is why `pivotOptionsFor` lives in `lib/pattern-scan.ts` and is imported here. `scanPatternBatch` filters the list to non-empty strings, slices to `SCAN_BATCH * 2`, maps each symbol through `getStrategyCandles` inside a `try/catch`, runs `scanCandles(set.candles, patterns, pivotOptionsFor(sensitivity))` on the candles, and counts a symbol as answered only when `getStrategyCandles` returned a set with at least one candle. Never throws: a total failure returns `{ results: [], answered: 0, requested: list.length }`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run __tests__/pattern-scan-actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/actions/pattern-scan.actions.ts __tests__/pattern-scan-actions.test.ts lib/pattern-scan.ts
git commit -m "Add the batched pattern scan action"
```

---

### Task 7: The pattern link

**Files:**
- Create: `lib/pattern-link.ts`
- Test: `__tests__/pattern-link.test.ts`

**Interfaces:**
- Consumes: `PATTERN_ORDER`, `PATTERN_TOOL`, `PATTERN_POINTS`, `PatternHit`, `PatternId`, `PatternDirection` from `@/lib/patterns`; `DrawPoint`, `Drawing`, `newDrawingId`, `toolDef` from `@/lib/chart-drawings`; `CANDLE_INTERVALS` from `@/lib/yahoo-candles`.
- Produces:
  ```ts
  export type PatternLink = { pattern: PatternId; direction: PatternDirection; intervalId: string; points: DrawPoint[] };
  export function encodePatternLink(hit: Pick<PatternHit, 'pattern' | 'direction' | 'points'> & { intervalId: string }): string;
  export function decodePatternLink(token: string | null | undefined): PatternLink | null;
  export function drawingFromLink(link: PatternLink): Drawing | null;
  ```

- [ ] **Step 1: Write the failing tests**

`__tests__/pattern-link.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { decodePatternLink, drawingFromLink, encodePatternLink } from '@/lib/pattern-link';

const wave = {
    pattern: 'wolfe' as const,
    direction: 'bullish' as const,
    intervalId: '1d',
    points: [
        { time: 1, price: 100 }, { time: 2, price: 120 }, { time: 3, price: 90 },
        { time: 4, price: 108 }, { time: 5, price: 78 },
    ],
};

describe('the pattern link', () => {
    it('round-trips a hit, interval included', () => {
        expect(decodePatternLink(encodePatternLink(wave))).toEqual(wave);
    });

    it('rejects an unknown pattern id', () => {
        const token = Buffer.from(JSON.stringify({ v: 1, p: 'nope', d: 'bullish', i: '1d', pts: wave.points.map((p) => [p.time, p.price]) })).toString('base64url');
        expect(decodePatternLink(token)).toBeNull();
    });

    it('rejects an interval the chart cannot open on', () => {
        const token = Buffer.from(JSON.stringify({ v: 1, p: 'wolfe', d: 'bullish', i: '7x', pts: wave.points.map((p) => [p.time, p.price]) })).toString('base64url');
        expect(decodePatternLink(token)).toBeNull();
    });

    it('rejects times that do not increase', () => {
        const token = encodePatternLink({ ...wave, points: [wave.points[0], wave.points[0], wave.points[2], wave.points[3], wave.points[4]] });
        expect(decodePatternLink(token)).toBeNull();
    });

    it('rejects a NaN price and an oversized token', () => {
        const bad = Buffer.from(JSON.stringify({ v: 1, p: 'wolfe', d: 'bullish', i: '1d', pts: [[1, null], [2, 1], [3, 1], [4, 1], [5, 1]] })).toString('base64url');
        expect(decodePatternLink(bad)).toBeNull();
        expect(decodePatternLink('a'.repeat(3000))).toBeNull();
        expect(decodePatternLink(undefined)).toBeNull();
    });

    it('refuses to build a drawing whose point count does not match its tool', () => {
        expect(drawingFromLink({ ...wave, pattern: 'triangle', direction: 'bearish' })).toBeNull();
        expect(drawingFromLink(wave)?.tool).toBe('wolfe');
    });

    it('builds an ordinary drawing: an id, the tool, the points and the labels', () => {
        const drawing = drawingFromLink(wave);
        expect(drawing?.id).toBeTruthy();
        expect(drawing?.points).toHaveLength(5);
        expect(drawing?.labels).toEqual(['1', '2', '3', '4', '5']);
        expect(drawing?.color).toBe('teal');
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run __tests__/pattern-link.test.ts`
Expected: FAIL — "Failed to resolve import '@/lib/pattern-link'".

- [ ] **Step 3: Implement the link**

`encodePatternLink` writes `{ v: 1, p, d, i: intervalId, pts: [[time, price], ...] }` and base64url-encodes it with the same helpers `lib/chart-share.ts` uses (duplicate the two small `btoa`/`atob` wrappers locally; do not export them from `chart-share`). `decodePatternLink` returns null when the token is missing, over 2000 characters, not JSON, of the wrong version, of an unknown pattern, of a point count other than `PATTERN_POINTS[pattern]`, of an interval id not in `CANDLE_INTERVALS`, of non-increasing times, or of non-finite prices. `drawingFromLink` returns null when the point count does not match `toolDef(PATTERN_TOOL[pattern]).clicks` (0 means "two or more"), and otherwise returns `{ id: newDrawingId(), tool, points, labels: toolDef(tool).pointLabels, color: toolDef(tool).defaultColor }`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run __tests__/pattern-link.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/pattern-link.ts __tests__/pattern-link.test.ts
git commit -m "Add the pattern link token"
```

---

### Task 8: The scanner page

**Files:**
- Create: `app/(root)/scanner/page.tsx`
- Create: `components/scanner/PatternScanner.tsx`
- Modify: `lib/i18n.ts` (both language blocks)
- Modify: `lib/shell/pages.ts` (add the page to the command bar)
- Modify: `components/shell/MenuBar.tsx` (add it to the Analysis menu)
- Test: `__tests__/pattern-scanner-render.test.tsx`

**Interfaces:**
- Consumes: `scanPatternBatch` from `@/lib/actions/pattern-scan.actions`; `PATTERN_GROUP`, `PATTERN_LABEL_KEY`, `PATTERN_ORDER`, `PatternHit`, `PatternId` from `@/lib/patterns`; `AUTO_SENSITIVITIES`, `AutoSensitivity` from `@/lib/auto-count`; `SCAN_BATCH`, `MAX_SCAN_SYMBOLS` from `@/lib/pattern-scan`; `encodePatternLink` from `@/lib/pattern-link`; `tx`, `arDigits`, `Lang`, `StringKey` from `@/lib/i18n`; `SCREENER_UNIVERSE` from `@/lib/screener-universe`; `getUserWatchlist` from `@/lib/actions/watchlist.actions`; `getLang` from `@/lib/i18n-server`.
- Produces:
  ```ts
  // components/scanner/PatternScanner.tsx
  export type ScanUniverse = { watchlist: string[]; saudi: string[]; us: string[] };
  export type ScanNames = Record<string, string>;   // symbol → the name to print (Arabic when we have it)
  export default function PatternScanner(props: { lang: Lang; universe: ScanUniverse; names: ScanNames }): JSX.Element;
  ```

- [ ] **Step 1: Write the failing test**

`__tests__/pattern-scanner-render.test.tsx` renders `PatternScanner` with a stubbed `scanPatternBatch` (mocked module) and asserts:

```ts
it('shows the controls, and the empty state before the first scan', () => {
    // render with universe { watchlist: ['2222.SR'], saudi: [], us: [] } and names { '2222.SR': 'أرامكو' }
    // expect a button named scan.run, the watchlist universe selected, and the scan.empty copy
});

it('renders one row per hit with its pattern name, direction and state', () => {
    // resolve scanPatternBatch with a wolfe hit; click scan.run; await
    // expect the row's pattern label, the bullish pill, and the confirmed copy
});

it('reports progress while the batches run', () => {
    // a scan over two batches shows scan.progress with the counts
});

it('stops at the ceiling and says so', () => {
    // universe of MAX_SCAN_SYMBOLS + 10 symbols → the partial copy appears
});

it('ignores a batch that resolves after the scan was cancelled', async () => {
    // start a scan over two batches, click scan.run again while the first is pending,
    // resolve the pending batch → no rows are added and no state update warns
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run __tests__/pattern-scanner-render.test.tsx`
Expected: FAIL — "Failed to resolve import '@/components/scanner/PatternScanner'".

- [ ] **Step 3: Add the i18n keys**

In `lib/i18n.ts`, add to the English block and the Arabic block (Arabic first, matching the file's existing order per block): `nav.scanner`, `scan.title`, `scan.sub`, `scan.universe`, `scan.universe.watchlist`, `scan.universe.saudi`, `scan.universe.us`, `scan.patterns`, `scan.group.wolfe`, `scan.group.harmonic`, `scan.group.classical`, `scan.group.elliott`, `scan.interval`, `scan.sensitivity`, `scan.run`, `scan.running`, `scan.progress`, `scan.empty`, `scan.cancelled`, `scan.partial`, `scan.answered`, `scan.openChart`, `scan.state.confirmed`, `scan.state.forming`, `scan.direction.bullish`, `scan.direction.bearish`, `scan.col.symbol`, `scan.col.name`, `scan.col.pattern`, `scan.col.direction`, `scan.col.last`, `scan.col.invalidation`, `scan.col.target`, `scan.col.state`, `scan.added`, and `scan.pattern.<id>` for every `PatternId`. Arabic strings use Arabic-Indic digits where they carry a number, and `scan.progress` carries `{done}`/`{total}`.

- [ ] **Step 4: Implement the page and the component**

`app/(root)/scanner/page.tsx` is a server component: `getLang()`, `getUserWatchlist()`, and the two market lists from `SCREENER_UNIVERSE` (`market === 'sa'` / `'us'`), rendered under a `page-head` like the screener's. It maps the watchlist docs to `doc.symbol`, builds `names` from the watchlist's `company` plus each `UniverseEntry`'s `nameAr ?? name`, and passes both down. Add `{ href: '/scanner', labelKey: 'nav.scanner', icon: ScanSearch, section: 'analysis', keywords: ['pattern', 'scanner', 'wolfe', 'harmonic', 'نموذج', 'أنماط', 'مسح'] }` to `PAGES` and the same entry to `MenuBar`'s Analysis group.

`PatternScanner` holds: the chosen universe, the checked patterns (all on by default), the interval, the sensitivity, the running flag, the progress pair, the results, and a cancellation ref. The interval choices are the real `CANDLE_INTERVALS` ids — `60m`, `4h`, `1d`, `1wk` — with `1d` the default (the labels the trader sees are 1h / 4h / 1D / 1W, but the id passed to `scanPatternBatch` is the one `getStrategyCandles` understands). Scan walks `screenBatches(symbols, SCAN_BATCH)`-style batches, `await`ing `scanPatternBatch` per batch, appending hits, updating progress, and stopping when the ref is flipped or the results reach `MAX_SCAN_SYMBOLS`. The results table has one row per hit with a link to `/stocks/<symbol>?pattern=<encodePatternLink(hit)>`. The empty, partial, cancelled and answered copies render exactly as the spec describes. All numbers pass through `arDigits` when `lang === 'ar'`.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run __tests__/pattern-scanner-render.test.tsx`
Expected: PASS.

- [ ] **Step 6: Run the whole suite and the type check**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all green (the i18n test fails if a key is missing from either language).

- [ ] **Step 7: Commit**

```bash
git add app/\(root\)/scanner/page.tsx components/scanner/PatternScanner.tsx lib/i18n.ts lib/shell/pages.ts components/shell/MenuBar.tsx __tests__/pattern-scanner-render.test.tsx
git commit -m "Add the pattern scanner page"
```

---

### Task 9: The chart hand-off

**Files:**
- Modify: `app/(root)/stocks/[symbol]/page.tsx` (read `searchParams.pattern`, decode it, pass the token and the interval down)
- Modify: `components/stocks/YahooChart.tsx` (accept `initialPattern`, commit it once, clear the param)
- Modify: `lib/i18n.ts` (the `scan.added` toast copy, if not already added)
- Test: `__tests__/pattern-link.test.ts` (the pure half already covered in Task 7)

**Interfaces:**
- Consumes: `decodePatternLink`, `drawingFromLink` from `@/lib/pattern-link`; the existing `preferredInterval` prop on `YahooChart`.
- Produces: `YahooChart`'s new optional prop `initialPattern?: string`.

- [ ] **Step 1: Add the prop and the one-shot commit**

`YahooChart` takes `initialPattern?: string`. In an effect that runs once after the candles reach `status === 'ready'` (guard with a ref so a re-render cannot place it twice), it decodes the token, builds the drawing with `drawingFromLink`, and calls the existing `commit(drawing)`, `setSelectedId([drawing.id])` and a `setWolfeNotice('scan.added')`-style toast. When the token is bad or the drawing is null, it does nothing at all. It then clears the query string with `window.history.replaceState(null, '', window.location.pathname)`.

- [ ] **Step 2: Pass it from the page**

`app/(root)/stocks/[symbol]/page.tsx` gains `searchParams: Promise<Record<string, string | string[] | undefined>>`, awaits it, reads `pattern` as a string when it is one, decodes it once with `decodePatternLink` and passes `initialPattern={pattern}` to `YahooChart`. The page's own interval preference (`preferredInterval`, already used for the Saudi index) becomes `link?.intervalId ?? preferred`, so the chart opens on the bars the pattern was measured from and everything else keeps its current default.

- [ ] **Step 3: Verify the pure half still passes**

Run: `npx vitest run __tests__/pattern-link.test.ts`
Expected: PASS (unchanged from Task 7; this step exists to prove the hand-off did not fork the parsing).

- [ ] **Step 4: Run the full gate**

Run: `npx tsc --noEmit && npx eslint app components/stocks/YahooChart.tsx lib && npx vitest run && rm -rf .next && npx next build`
Expected: type check clean, eslint zero errors (pre-existing warnings allowed), all tests green, build succeeds.

- [ ] **Step 5: Verify in the browser**

Start the built app (`npx next start -p 3010`), sign in, open `/scanner`, scan the watchlist for Wolfe at 1D, and confirm: the results table renders, a row's link opens `/stocks/<symbol>` with the pattern drawn and the toast shown, the URL loses its `?pattern=` after load, and the console has no errors. Capture a screenshot.

- [ ] **Step 6: Commit**

```bash
git add app/\(root\)/stocks/\[symbol\]/page.tsx components/stocks/YahooChart.tsx lib/i18n.ts
git commit -m "Open the chart with a pattern from the scanner"
```

---

## Notes for the executor

- The existing `__tests__/wolfe.test.ts` already pins `checkWolfe`'s rules; do not duplicate them. Task 1 tests the wrapper only.
- `screenBatches` lives in `lib/screener-formula.ts`; reuse it rather than writing a second batching helper.
- If a detector's tolerance makes a textbook case fail, widen the tolerance in `within`, never the test's numbers — the tests carry the published ratios.
- The Arabic strings are user-facing: write them the way a Saudi trader speaks, not word-for-word translations.
