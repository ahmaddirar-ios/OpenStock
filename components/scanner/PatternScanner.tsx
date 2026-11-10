'use client';

// The scanner's control room. It owns the chosen universe, the pattern set and the settings, walks
// the list in batches through the server action, and paints one row per hit with a link that opens
// the chart on the bars the pattern was measured from.

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { scanPatternBatch } from '@/lib/actions/pattern-scan.actions';
import { PATTERN_GROUP, PATTERN_LABEL_KEY, PATTERN_ORDER, type PatternGroup, type PatternHit, type PatternId } from '@/lib/patterns';
import { AUTO_SENSITIVITIES, type AutoSensitivity } from '@/lib/chart/auto-count';
import { MAX_SCAN_SYMBOLS, SCAN_BATCH } from '@/lib/pattern-scan';
import { encodePatternLink } from '@/lib/pattern-link';
import { arDigits, tx, type Lang, type StringKey } from '@/lib/i18n';

export type ScanUniverse = { watchlist: string[]; saudi: string[]; us: string[]; all: string[] };
export type ScanNames = Record<string, string>;

type UniverseId = 'watchlist' | 'saudi' | 'us' | 'all';
type Row = { symbol: string; hit: PatternHit; intervalId: string };

const UNIVERSES: { id: UniverseId; key: StringKey }[] = [
    { id: 'watchlist', key: 'scan.universe.watchlist' },
    { id: 'saudi', key: 'scan.universe.saudi' },
    { id: 'us', key: 'scan.universe.us' },
    { id: 'all', key: 'scan.universe.all' },
];

const GROUPS: { id: PatternGroup; key: StringKey }[] = [
    { id: 'wolfe', key: 'scan.group.wolfe' },
    { id: 'harmonic', key: 'scan.group.harmonic' },
    { id: 'classical', key: 'scan.group.classical' },
    { id: 'elliott', key: 'scan.group.elliott' },
];

/** The ids `getStrategyCandles` understands; the trader sees the short label beside them. */
const INTERVALS: { id: string; en: string; ar: string }[] = [
    { id: '60m', en: '1h', ar: '١س' },
    { id: '4h', en: '4h', ar: '٤س' },
    { id: '1d', en: '1D', ar: 'يومي' },
    { id: '1wk', en: '1W', ar: 'أسبوعي' },
];

const chunk = <T,>(items: readonly T[], size: number): T[][] => {
    const out: T[][] = [];
    for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size));
    return out;
};

/** ATR reads as a word; the rest are percentages, so the digits follow the language. */
const sensitivityLabel = (value: AutoSensitivity, lang: Lang): string =>
    value === 'atr' ? 'ATR' : arDigits(`${Number(value) * 100}%`, lang);

export default function PatternScanner({ lang, universe, names }: { lang: Lang; universe: ScanUniverse; names: ScanNames }) {
    const [scope, setScope] = useState<UniverseId>(() =>
        universe.watchlist.length > 0 ? 'watchlist' : universe.saudi.length > 0 ? 'saudi' : 'us');
    const [patterns, setPatterns] = useState<Set<PatternId>>(() => new Set(PATTERN_ORDER));
    const [intervalId, setIntervalId] = useState('1d');
    const [sensitivity, setSensitivity] = useState<AutoSensitivity>('0.03');
    const [running, setRunning] = useState(false);
    const [progress, setProgress] = useState({ done: 0, total: 0 });
    const [rows, setRows] = useState<Row[]>([]);
    const [answered, setAnswered] = useState(0);
    const [cancelled, setCancelled] = useState(false);
    // Bumped on every run and on every cancel; a batch whose run is stale is dropped on arrival.
    const runRef = useRef(0);

    const symbols = universe[scope];
    const capped = symbols.length > MAX_SCAN_SYMBOLS;
    const scanned = [...new Set(symbols)].slice(0, MAX_SCAN_SYMBOLS);

    const togglePattern = (id: PatternId) => {
        setPatterns((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleGroup = (group: PatternGroup, on: boolean) => {
        setPatterns((prev) => {
            const next = new Set(prev);
            for (const id of PATTERN_ORDER) {
                if (PATTERN_GROUP[id] !== group) continue;
                if (on) next.add(id);
                else next.delete(id);
            }
            return next;
        });
    };

    const run = async () => {
        // A second click while a scan is in flight stops it after the batch that is already out.
        if (running) {
            runRef.current += 1;
            setRunning(false);
            setCancelled(true);
            return;
        }
        const chosen = PATTERN_ORDER.filter((id) => patterns.has(id));
        if (scanned.length === 0 || chosen.length === 0) return;

        const runId = runRef.current + 1;
        runRef.current = runId;
        // The link must name the interval the points were measured on, not whatever the select says
        // when the trader clicks it later.
        const scanInterval = intervalId;
        setRunning(true);
        setCancelled(false);
        setRows([]);
        setAnswered(0);
        setProgress({ done: 0, total: scanned.length });

        const collected: Row[] = [];
        let replies = 0;
        let done = 0;
        for (const batch of chunk(scanned, SCAN_BATCH)) {
            let result: Awaited<ReturnType<typeof scanPatternBatch>>;
            try {
                result = await scanPatternBatch(batch, chosen, scanInterval, sensitivity);
            } catch {
                result = { results: [], answered: 0, requested: batch.length };
            }
            // The scan was stopped or restarted while this batch was in flight: its rows are stale.
            if (runRef.current !== runId) return;
            replies += result.answered;
            for (const row of result.results) for (const hit of row.hits) collected.push({ symbol: row.symbol, hit, intervalId: scanInterval });
            done += batch.length;
            setRows([...collected]);
            setAnswered(replies);
            setProgress({ done, total: scanned.length });
        }
        if (runRef.current !== runId) return;
        setRunning(false);
    };

    // A result belongs to the settings that produced it. Changing any control clears the table and
    // stops any walk still in flight, so a late batch cannot repaint rows for the old settings.
    useEffect(() => {
        runRef.current += 1;
        setRunning(false);
        setCancelled(false);
        setRows([]);
        setAnswered(0);
        setProgress({ done: 0, total: 0 });
    }, [scope, patterns, intervalId, sensitivity]);

    const intervalLabel = (id: string): string => {
        const found = INTERVALS.find((entry) => entry.id === id);
        if (!found) return id;
        return lang === 'ar' ? found.ar : found.en;
    };

    const number = (value: number | null): string => (value === null ? '—' : arDigits(value.toLocaleString('en-US', { maximumFractionDigits: 2 }), lang));

    return (
        <>
            <div className="card flex flex-wrap items-end gap-4 p-4">
                <fieldset className="min-w-44">
                    <legend className="form-label">{tx(lang, 'scan.universe')}</legend>
                    <div className="flex flex-wrap gap-3">
                        {UNIVERSES.map((entry) => (
                            <span key={entry.id} className="flex items-center gap-1.5 text-[13px]">
                                <label className="flex items-center gap-1.5">
                                    <input type="radio" name="scan-universe" value={entry.id} checked={scope === entry.id} disabled={running} onChange={() => setScope(entry.id)} />
                                    {tx(lang, entry.key)}
                                </label>
                                <span className="text-muted-foreground">{arDigits(universe[entry.id].length, lang)}</span>
                            </span>
                        ))}
                    </div>
                </fieldset>

                <div className="min-w-64 flex-1">
                    <span className="form-label">{tx(lang, 'scan.patterns')}</span>
                    <div className="flex flex-col gap-2">
                        {GROUPS.map((group) => {
                            const ids = PATTERN_ORDER.filter((id) => PATTERN_GROUP[id] === group.id);
                            const allOn = ids.every((id) => patterns.has(id));
                            return (
                                <div key={group.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                    <label className="flex items-center gap-1.5 text-[13px] font-medium">
                                        <input type="checkbox" checked={allOn} disabled={running} onChange={(event) => toggleGroup(group.id, event.target.checked)} />
                                        {tx(lang, group.key)}
                                    </label>
                                    {ids.map((id) => (
                                        <label key={id} className="flex items-center gap-1.5 text-[13px]">
                                            <input type="checkbox" checked={patterns.has(id)} disabled={running} onChange={() => togglePattern(id)} />
                                            {tx(lang, PATTERN_LABEL_KEY[id])}
                                        </label>
                                    ))}
                                </div>
                            );
                        })}
                    </div>
                </div>

                <label className="flex flex-col gap-1">
                    <span className="form-label">{tx(lang, 'scan.interval')}</span>
                    <select className="form-input" value={intervalId} disabled={running} onChange={(event) => setIntervalId(event.target.value)}>
                        {INTERVALS.map((entry) => <option key={entry.id} value={entry.id}>{intervalLabel(entry.id)}</option>)}
                    </select>
                </label>

                <label className="flex flex-col gap-1">
                    <span className="form-label">{tx(lang, 'scan.sensitivity')}</span>
                    <select className="form-input" value={sensitivity} disabled={running} onChange={(event) => setSensitivity(event.target.value as AutoSensitivity)}>
                        {AUTO_SENSITIVITIES.map((value) => <option key={value} value={value}>{sensitivityLabel(value, lang)}</option>)}
                    </select>
                </label>

                <button
                    type="button"
                    aria-label={running ? tx(lang, 'scan.stop') : tx(lang, 'scan.run')}
                    className="btn btn-primary"
                    onClick={run}
                    disabled={!running && (scanned.length === 0 || patterns.size === 0)}
                >
                    {running ? tx(lang, 'scan.running') : tx(lang, 'scan.run')}
                </button>
            </div>

            <div className="flex flex-col gap-1 px-1 text-[12px] text-muted-foreground">
                {(running || progress.total > 0) && (
                    <p aria-live="polite">
                        {tx(lang, 'scan.progress')
                            .replace('{done}', arDigits(progress.done, lang))
                            .replace('{total}', arDigits(progress.total, lang))}
                    </p>
                )}
                {progress.total > 0 && (
                    <div
                        className="h-1.5 w-full overflow-hidden rounded-full bg-hover"
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={progress.total}
                        aria-valuenow={progress.done}
                    >
                        <div
                            className="h-full rounded-full bg-accent transition-[width] duration-300"
                            style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
                        />
                    </div>
                )}
                {capped && <p>{tx(lang, 'scan.partial').replace('{max}', arDigits(MAX_SCAN_SYMBOLS, lang))}</p>}
                {progress.total > 0 && (
                    <p>
                        {tx(lang, 'scan.answered')
                            .replace('{n}', arDigits(answered, lang))
                            .replace('{m}', arDigits(progress.total, lang))}
                    </p>
                )}
                {cancelled && <p>{tx(lang, 'scan.cancelled')}</p>}
            </div>

            {rows.length === 0 ? (
                // "No pattern" is an answer to a question that was asked. Before the first scan the
                // table has no verdict yet, so the space stays quiet instead of claiming a result.
                progress.total > 0 && (
                    <div className="empty-state py-14">
                        <h3>{tx(lang, 'scan.empty')}</h3>
                    </div>
                )
            ) : (
                <div className="card overflow-x-auto">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>{tx(lang, 'scan.col.symbol')}</th>
                                <th>{tx(lang, 'scan.col.name')}</th>
                                <th>{tx(lang, 'scan.col.pattern')}</th>
                                <th>{tx(lang, 'scan.col.direction')}</th>
                                <th>{tx(lang, 'scan.col.last')}</th>
                                <th>{tx(lang, 'scan.col.invalidation')}</th>
                                <th>{tx(lang, 'scan.col.target')}</th>
                                <th>{tx(lang, 'scan.col.state')}</th>
                                <th />
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row) => {
                                const last = row.hit.points[row.hit.points.length - 1]?.price ?? null;
                                return (
                                    <tr key={`${row.symbol}-${row.hit.pattern}`}>
                                        <td className="font-medium">{row.symbol}</td>
                                        <td dir="auto">{names[row.symbol] ?? row.symbol}</td>
                                        <td>{tx(lang, PATTERN_LABEL_KEY[row.hit.pattern])}</td>
                                        <td>
                                            <span className={`pill ${row.hit.direction === 'bullish' ? 'is-up' : 'is-down'}`}>
                                                {tx(lang, row.hit.direction === 'bullish' ? 'scan.direction.bullish' : 'scan.direction.bearish')}
                                            </span>
                                        </td>
                                        <td>{number(last)}</td>
                                        <td>{number(row.hit.invalidation)}</td>
                                        <td>{number(row.hit.target)}</td>
                                        <td>{tx(lang, row.hit.confirmed ? 'scan.state.confirmed' : 'scan.state.forming')}</td>
                                        <td>
                                            <Link
                                                className="btn btn-ghost"
                                                href={`/stocks/${encodeURIComponent(row.symbol)}?pattern=${encodePatternLink({ ...row.hit, intervalId: row.intervalId })}`}
                                            >
                                                {tx(lang, 'scan.openChart')}
                                            </Link>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </>
    );
}