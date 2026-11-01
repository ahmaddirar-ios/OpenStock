'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import ChartPane, { type CrosshairSync, type RangeSync } from '@/components/charts/ChartPane';
import LayoutPicker from '@/components/charts/LayoutPicker';
import { NO_INDICATORS, type IndicatorFlags } from '@/lib/candle-host';
import {
    CHART_LAYOUTS,
    INDICATOR_BUTTONS,
    INTERVAL_LABEL_KEYS,
    paneSymbols,
    parseGridState,
    serializeGridState,
    serializeGridSymbols,
    type GridLayoutId,
    type GridState,
} from '@/lib/chart-grid';
import { CANDLE_INTERVALS } from '@/lib/yahoo-candles';
import { tx, type Lang } from '@/lib/i18n';
import { cn } from '@/lib/utils';

/** The last workspace this browser opened, used only when the URL carries no state of its own. */
const STORAGE_KEY = 'openstock:charts-workspace';

type Props = {
    lang: Lang;
    /** Parsed on the server from the query string, so the first paint is the right screen. */
    initial: GridState;
    /** True when the URL itself said something; a shared link then beats the remembered workspace. */
    fromUrl: boolean;
    watchlist: string[];
};

const sameCrosshair = (a: CrosshairSync | null, b: CrosshairSync | null) => {
    if (!a || !b) return a === b;
    return a.time === b.time && Math.abs(a.price - b.price) < 1e-6;
};

const sameRange = (a: RangeSync, b: RangeSync) =>
    Math.abs(a.from - b.from) < 1e-6 && Math.abs(a.to - b.to) < 1e-6;

/**
 * The screen that keeps several symbols in view. It owns the one shared state — interval, indicators
 * and the layout — and relays the crosshair and the visible range between panes, so every pane reads
 * the same moment without any pane owning another.
 */
export default function ChartGrid({ lang, initial, fromUrl, watchlist }: Props) {
    const router = useRouter();
    const pathname = usePathname();

    const [layout, setLayout] = useState<GridLayoutId>(initial.layout);
    const [symbols, setSymbols] = useState<string[]>(initial.symbols);
    const [intervalId, setIntervalId] = useState(initial.intervalId);
    const [indicators, setIndicators] = useState<IndicatorFlags>(NO_INDICATORS);
    const [refreshNonce, setRefreshNonce] = useState(0);
    const [crosshair, setCrosshair] = useState<{ from: number; value: CrosshairSync | null } | null>(null);
    const [range, setRange] = useState<{ from: number; value: RangeSync } | null>(null);

    const t = useCallback((key: Parameters<typeof tx>[1]) => tx(lang, key), [lang]);

    // The remembered workspace is read after mount: the server has no storage, and a link must win.
    useEffect(() => {
        if (fromUrl) return;
        try {
            const raw = window.localStorage.getItem(STORAGE_KEY);
            if (!raw) return;
            const stored = JSON.parse(raw) as { l?: string; s?: string; i?: string };
            const next = parseGridState(
                { l: stored.l, s: stored.s, i: stored.i },
                { symbols: initial.symbols },
            );
            setLayout(next.layout);
            setSymbols(next.symbols);
            setIntervalId(next.intervalId);
        } catch {
            /* private mode: the defaults from the server stand */
        }
        // Only on mount: after that the workspace belongs to the trader, not to the storage.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // The workspace lives in the URL and in this browser, written behind a short debounce so a burst
    // of clicks produces one history entry and one storage write.
    useEffect(() => {
        const query = serializeGridState({ layout, symbols, intervalId });
        const stored = serializeGridSymbols(symbols);
        const timer = window.setTimeout(() => {
            try {
                window.localStorage.setItem(
                    STORAGE_KEY,
                    JSON.stringify({ l: String(layout), s: stored, i: intervalId }),
                );
            } catch {
                /* private mode: the workspace simply is not remembered */
            }
            if (window.location.search.replace(/^\?/, '') !== query) {
                router.replace(`${pathname}?${query}`, { scroll: false });
            }
        }, 300);
        return () => window.clearTimeout(timer);
    }, [layout, symbols, intervalId, pathname, router]);

    const panes = CHART_LAYOUTS[layout].panes;
    const slots = useMemo(() => paneSymbols(symbols, panes), [symbols, panes]);
    const timeframes = useMemo(
        () => CANDLE_INTERVALS.map((item) => ({ id: item.id as string, label: t(INTERVAL_LABEL_KEYS[item.id] ?? 'chart.tf.1d') })),
        [t],
    );

    /** One render frame carries one crosshair update, however many pointers are moving. */
    const pendingCrosshair = useRef<{ from: number; value: CrosshairSync | null } | null>(null);
    const crosshairFrame = useRef<number | null>(null);

    const publishCrosshair = useCallback((from: number) => (value: CrosshairSync | null) => {
        pendingCrosshair.current = { from, value };
        if (crosshairFrame.current !== null) return;
        crosshairFrame.current = requestAnimationFrame(() => {
            crosshairFrame.current = null;
            const next = pendingCrosshair.current;
            if (!next) return;
            setCrosshair((current) =>
                current && current.from === next.from && sameCrosshair(current.value, next.value)
                    ? current
                    : next,
            );
        });
    }, []);

    useEffect(
        () => () => {
            if (crosshairFrame.current !== null) cancelAnimationFrame(crosshairFrame.current);
        },
        [],
    );

    const publishRange = useCallback((from: number) => (value: RangeSync) => {
        setRange((current) =>
            current && current.from === from && sameRange(current.value, value) ? current : { from, value },
        );
    }, []);

    const chooseLayout = (id: GridLayoutId) => {
        setLayout(id);
        // The panes that are no longer shown are dropped, and a widened screen starts with empty
        // panes rather than inventing symbols, so the URL never claims more than the screen shows.
        setSymbols((current) => paneSymbols(current, CHART_LAYOUTS[id].panes));
    };

    const setPaneSymbol = (index: number, symbol: string) => {
        setSymbols((current) => {
            const next = paneSymbols(current, panes);
            next[index] = symbol;
            return next;
        });
    };

    const clearPane = (index: number) => {
        setSymbols((current) => {
            const next = paneSymbols(current, panes);
            next[index] = '';
            return next;
        });
    };

    return (
        <div className="flex flex-col gap-2.5">
            <div className="flex flex-wrap items-center gap-1.5" dir="ltr">
                <LayoutPicker value={layout} onChange={chooseLayout} lang={lang} />
                <span className="mx-1 h-4 w-px bg-line" />
                {timeframes.map((timeframe) => (
                    <button
                        key={timeframe.id}
                        type="button"
                        onClick={() => setIntervalId(timeframe.id)}
                        className={cn('pill h-7 px-2.5 text-[12px]', intervalId === timeframe.id && 'is-up')}
                        aria-pressed={intervalId === timeframe.id}
                    >
                        {timeframe.label}
                    </button>
                ))}
                <span className="mx-1 h-4 w-px bg-line" />
                {INDICATOR_BUTTONS.map((indicator) => (
                    <button
                        key={indicator.id}
                        type="button"
                        onClick={() =>
                            setIndicators((state) => ({ ...state, [indicator.id]: !state[indicator.id] }))
                        }
                        className={cn('pill h-7 px-2.5 text-[12px]', indicators[indicator.id] && 'is-up')}
                        aria-pressed={indicators[indicator.id]}
                    >
                        {t(indicator.label)}
                    </button>
                ))}
                <button
                    type="button"
                    onClick={() => setRefreshNonce((value) => value + 1)}
                    className="icon-btn ms-auto"
                    aria-label={t('chart.grid.refresh')}
                    title={t('chart.grid.refresh')}
                >
                    <RefreshCw />
                </button>
            </div>

            <div className={cn('grid gap-2.5', CHART_LAYOUTS[layout].className)}>
                {slots.map((symbol, index) => (
                    <ChartPane
                        key={index}
                        lang={lang}
                        paneIndex={index}
                        symbol={symbol}
                        symbols={slots}
                        watchlist={watchlist}
                        intervalId={intervalId}
                        indicators={indicators}
                        refreshNonce={refreshNonce}
                        crosshair={crosshair}
                        range={range}
                        onCrosshair={publishCrosshair(index)}
                        onRange={publishRange(index)}
                        onSymbol={(picked) => setPaneSymbol(index, picked)}
                        onClear={() => clearPane(index)}
                        className={index === 0 ? CHART_LAYOUTS[layout].firstClassName : undefined}
                    />
                ))}
            </div>
        </div>
    );
}
