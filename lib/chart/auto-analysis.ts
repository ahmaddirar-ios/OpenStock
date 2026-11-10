// The auto analysis: one mechanical read of a chart's own candles. Everything here is pure — no
// fetch, no clock, no DOM — so the same bars always produce the same verdict and the panel can be
// proved by tests. It is deliberately not an LLM: a trader looking at four panes needs an answer
// that is instant, repeatable and explainable, and every factor below says what it measured.
//
// The read is six factors, each scored -1 (bearish) to 1 (bullish), then weighted into one 0..100
// score. Levels and patterns come from the same zigzag the chart already draws, so the panel and
// the drawing tools never disagree about where the swings are.

import { adx, atr, bollinger, ema, macd, obv, rsi } from '@/lib/chart/indicators';
import { detectPivots, type Pivot } from '@/lib/chart/auto-count';
import { scanCandles } from '@/lib/pattern-scan';
import { PATTERN_ORDER, type PatternDirection, type PatternId } from '@/lib/patterns';
import type { Candle } from '@/lib/market/yahoo-candles';
import type { StringKey } from '@/lib/i18n';

export type AnalysisBias = 'bullish' | 'bearish' | 'neutral';

export type AnalysisFactorId = 'trend' | 'structure' | 'momentum' | 'macd' | 'volume' | 'position';

export type AnalysisFactor = {
    id: AnalysisFactorId;
    bias: AnalysisBias;
    /** -1 (bearish) .. 1 (bullish), the factor's own reading before weighting. */
    score: number;
    /** What it measured, already short enough for a row: "RSI 62.4", "1.3×". */
    value: string;
};

export type AnalysisLevel = {
    price: number;
    kind: 'support' | 'resistance';
    /** How many swings sit on this price, which is what makes a level worth drawing. */
    touches: number;
};

export type AnalysisPattern = {
    id: PatternId;
    direction: PatternDirection;
    confirmed: boolean;
};

export type AutoAnalysis = {
    bias: AnalysisBias;
    /** 0..100, 50 is balanced. */
    score: number;
    confidence: 'low' | 'medium' | 'high';
    /** The one-line verdict, translated by the panel. */
    headline: StringKey;
    factors: AnalysisFactor[];
    levels: AnalysisLevel[];
    patterns: AnalysisPattern[];
    last: number;
    /** Average true range as a percentage of price: the risk the chart is currently carrying. */
    atrPercent: number;
    /** Trend strength, 0..100, from ADX. */
    trendStrength: number;
    bars: number;
};

/** The weights sum to 1. Trend and structure lead because they are what a top-down read is about. */
const WEIGHTS: Record<AnalysisFactorId, number> = {
    trend: 0.3,
    structure: 0.2,
    momentum: 0.15,
    macd: 0.15,
    volume: 0.1,
    position: 0.1,
};

/** Below this many bars the read is a guess, so the panel says so instead of scoring noise. */
export const MIN_ANALYSIS_BARS = 30;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const lastOf = (series: (number | null)[]): number | null => {
    for (let index = series.length - 1; index >= 0; index -= 1) {
        const value = series[index];
        if (value !== null && Number.isFinite(value)) return value;
    }
    return null;
};

const biasOf = (score: number): AnalysisBias => (score >= 0.2 ? 'bullish' : score <= -0.2 ? 'bearish' : 'neutral');

const pct = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;

/**
 * The trend factor: the three moving averages a chart reader actually looks at, plus where price
 * sits against the long one. A stack that agrees is a trend; a crossed stack is a turn.
 */
function trendFactor(closes: number[]): AnalysisFactor {
    const close = closes[closes.length - 1];
    const fast = lastOf(ema(closes, 20));
    const mid = lastOf(ema(closes, 50));
    const slow = lastOf(ema(closes, 200));
    let score = 0;
    if (fast !== null && mid !== null) score += fast > mid ? 0.5 : -0.5;
    if (slow !== null) score += close > slow ? 0.3 : -0.3;
    if (mid !== null && slow !== null) score += mid > slow ? 0.2 : -0.2;
    const spread = fast !== null && mid !== null && mid !== 0 ? ((fast - mid) / mid) * 100 : 0;
    return {
        id: 'trend',
        bias: biasOf(score),
        score: clamp(score, -1, 1),
        value: fast !== null && mid !== null ? `EMA20 ${pct(spread)}` : '—',
    };
}

/**
 * The structure factor: the last two highs and the last two lows. Higher highs with higher lows is
 * an uptrend in the only sense that survives a different indicator set.
 */
function structureFactor(pivots: Pivot[]): AnalysisFactor {
    const highs = pivots.filter((pivot) => pivot.kind === 'high').slice(-2);
    const lows = pivots.filter((pivot) => pivot.kind === 'low').slice(-2);
    let score = 0;
    const marks: string[] = [];
    if (highs.length === 2) {
        const up = highs[1].price > highs[0].price;
        score += up ? 0.5 : -0.5;
        marks.push(up ? 'HH' : 'LH');
    }
    if (lows.length === 2) {
        const up = lows[1].price > lows[0].price;
        score += up ? 0.5 : -0.5;
        marks.push(up ? 'HL' : 'LL');
    }
    return {
        id: 'structure',
        bias: biasOf(score),
        score: clamp(score, -1, 1),
        value: marks.length > 0 ? marks.join(' · ') : '—',
    };
}

/** Momentum: RSI around its 50 line, with the extremes counted as exhaustion rather than strength. */
function momentumFactor(closes: number[]): AnalysisFactor {
    const value = lastOf(rsi(closes, 14));
    if (value === null) return { id: 'momentum', bias: 'neutral', score: 0, value: '—' };
    let score = clamp((value - 50) / 25, -1, 1);
    if (value >= 75) score = 0.4;
    if (value <= 25) score = -0.4;
    return { id: 'momentum', bias: biasOf(score), score, value: `RSI ${value.toFixed(1)}` };
}

/** MACD: the histogram's side, and whether it is growing or fading. */
function macdFactor(closes: number[]): AnalysisFactor {
    const result = macd(closes);
    const histogram = result.histogram;
    const current = lastOf(histogram);
    const previous = histogram.length > 1 ? histogram[histogram.length - 2] : null;
    if (current === null) return { id: 'macd', bias: 'neutral', score: 0, value: '—' };
    let score = current >= 0 ? 0.6 : -0.6;
    if (previous !== null && Number.isFinite(previous)) score += current > previous ? 0.4 : -0.4;
    return {
        id: 'macd',
        bias: biasOf(score),
        score: clamp(score, -1, 1),
        value: `${current >= 0 ? '+' : ''}${current.toFixed(2)}`,
    };
}

/** Volume: whether the money is behind the move, read through on-balance volume and relative size. */
function volumeFactor(candles: Candle[]): AnalysisFactor {
    const bars = candles.slice(-20);
    const series = obv(candles.map((candle) => ({ close: candle.close, volume: candle.volume })));
    const now = lastOf(series);
    const then = series.length > 20 ? series[series.length - 21] : null;
    const average = bars.reduce((sum, candle) => sum + candle.volume, 0) / Math.max(1, bars.length);
    const relative = average > 0 ? (bars[bars.length - 1]?.volume ?? 0) / average : 0;
    let score = 0;
    let arrow = '·';
    if (now !== null && then !== null && Number.isFinite(then)) {
        score += now > then ? 0.6 : -0.6;
        arrow = now > then ? '↑' : '↓';
    }
    const rising = bars.length > 1 && bars[bars.length - 1].close >= bars[0].close;
    if (relative > 1.2) score += rising ? 0.2 : -0.2;
    return {
        id: 'volume',
        bias: biasOf(score),
        score: clamp(score, -1, 1),
        value: `${arrow} ${relative > 0 ? relative.toFixed(1) : '—'}×`,
    };
}

/** Where price sits inside its recent range: the top of a range is not the same as a breakout. */
function positionFactor(candles: Candle[]): AnalysisFactor {
    const bars = candles.slice(-20);
    const high = Math.max(...bars.map((candle) => candle.high));
    const low = Math.min(...bars.map((candle) => candle.low));
    const close = bars[bars.length - 1]?.close ?? 0;
    const span = high - low;
    if (!(span > 0)) return { id: 'position', bias: 'neutral', score: 0, value: '—' };
    const position = (close - low) / span;
    const score = clamp((position - 0.5) * 2, -1, 1);
    return {
        id: 'position',
        bias: biasOf(score),
        score,
        value: `${Math.round(position * 100)}%`,
    };
}

/**
 * The levels: the zigzag's swings, clustered so three nearby highs become one resistance instead of
 * three lines. A cluster's weight is how many swings landed on it, which is the honest measure of a
 * level — not a round number someone liked.
 */
function levelsFrom(pivots: Pivot[], last: number, tolerance: number): AnalysisLevel[] {
    const clusters: { price: number; touches: number }[] = [];
    for (const pivot of pivots.slice(-24)) {
        const found = clusters.find((cluster) => Math.abs(cluster.price - pivot.price) <= tolerance);
        if (found) {
            found.price = (found.price * found.touches + pivot.price) / (found.touches + 1);
            found.touches += 1;
        } else {
            clusters.push({ price: pivot.price, touches: 1 });
        }
    }
    const levels: AnalysisLevel[] = clusters.map((cluster) => ({
        price: cluster.price,
        kind: cluster.price < last ? 'support' : 'resistance',
        touches: cluster.touches,
    }));
    const supports = levels
        .filter((level) => level.kind === 'support')
        .sort((a, b) => b.price - a.price)
        .slice(0, 3);
    const resistances = levels
        .filter((level) => level.kind === 'resistance')
        .sort((a, b) => a.price - b.price)
        .slice(0, 3);
    return [...supports, ...resistances];
}

/** The verdict line: bias first, then whether the trend behind it is actually strong. */
function headlineFor(bias: AnalysisBias, trendScore: number, trendStrength: number): StringKey {
    if (bias === 'neutral') return 'auto.headline.range';
    const strong = trendStrength >= 25 && Math.abs(trendScore) >= 0.5;
    if (bias === 'bullish') return strong ? 'auto.headline.bullTrend' : 'auto.headline.bull';
    return strong ? 'auto.headline.bearTrend' : 'auto.headline.bear';
}

/**
 * The whole read. The timeframe is not an input: the pivot threshold is measured in ATR, so the same
 * function reads an hourly chart and a monthly one without a table of per-interval settings.
 *
 * Returns null when the chart has too little history to say anything honest — the panel then shows
 * its empty state rather than a score built on twenty bars.
 */
export function analyzeCandles(candles: readonly Candle[]): AutoAnalysis | null {
    const bars = Array.isArray(candles)
        ? candles.filter(
              (candle) =>
                  candle &&
                  Number.isFinite(candle.time) &&
                  Number.isFinite(candle.close) &&
                  Number.isFinite(candle.high) &&
                  Number.isFinite(candle.low),
          )
        : [];
    if (bars.length < MIN_ANALYSIS_BARS) return null;

    const closes = bars.map((candle) => candle.close);
    const last = closes[closes.length - 1];
    const pivots = detectPivots(bars as Candle[], { mode: 'atr' });
    const atrValue = lastOf(atr(bars, 14)) ?? 0;
    const atrPercent = last > 0 ? (atrValue / last) * 100 : 0;
    const trendStrength = clamp(lastOf(adx(bars, 14).adx) ?? 0, 0, 100);

    const factors: AnalysisFactor[] = [
        trendFactor(closes),
        structureFactor(pivots),
        momentumFactor(closes),
        macdFactor(closes),
        volumeFactor(bars as Candle[]),
        positionFactor(bars as Candle[]),
    ];

    const weighted = factors.reduce((sum, factor) => sum + factor.score * WEIGHTS[factor.id], 0);
    const score = Math.round(clamp(50 + weighted * 50, 0, 100));
    const bias = score >= 60 ? 'bullish' : score <= 40 ? 'bearish' : 'neutral';

    // Confidence is agreement, not conviction: six factors pointing the same way is a read worth
    // acting on, three against three is a chart that is still deciding.
    const agreeing = factors.filter((factor) => factor.bias === bias).length / factors.length;
    const confidence = agreeing >= 0.8 && bars.length >= 120 ? 'high' : agreeing >= 0.6 ? 'medium' : 'low';

    const tolerance = Math.max(atrValue * 0.75, last * 0.002);
    const patterns = scanCandles(bars as Candle[], PATTERN_ORDER, { mode: 'atr' })
        .slice(0, 3)
        .map((hit) => ({ id: hit.pattern, direction: hit.direction, confirmed: hit.confirmed }));

    return {
        bias,
        score,
        confidence,
        headline: headlineFor(bias, factors[0].score, trendStrength),
        factors,
        levels: levelsFrom(pivots, last, tolerance),
        patterns,
        last,
        atrPercent,
        trendStrength,
        bars: bars.length,
    };
}

/** The Bollinger width, kept for the panel's volatility line: a squeeze is a setup, not a direction. */
export function bollingerWidth(candles: readonly Candle[]): number | null {
    const closes = candles.map((candle) => candle.close);
    const bands = bollinger(closes, 20, 2);
    const upper = lastOf(bands.upper);
    const lower = lastOf(bands.lower);
    const middle = lastOf(bands.middle);
    if (upper === null || lower === null || middle === null || middle === 0) return null;
    return ((upper - lower) / middle) * 100;
}
