'use client';

import { useMemo, useState } from 'react';
import { CalendarDays, Download, Pause, Play, RotateCcw, Shuffle, SkipBack, SkipForward, X } from 'lucide-react';
import {
    DEFAULT_COSTS,
    REPLAY_SPEEDS,
    fillPrice,
    parseQuantity,
    summarize,
    toCsv,
    type Fill,
    type OrderFailure,
    type PaperAccount,
    type ReplaySpeed,
} from '@/lib/replay';
import { cn, formatPrice } from '@/lib/utils';
import { arDigits, fillReasonLabel, tx, type Lang, type StringKey } from '@/lib/i18n';
import type { Candle } from '@/lib/yahoo-candles';
import type { Bracket, OrderType, ReplayIntent } from '@/lib/replay';

type Props = {
    lang: Lang;
    candles: readonly Candle[];
    cursor: number;
    playing: boolean;
    speed: ReplaySpeed;
    account: PaperAccount;
    /** What is armed but not executed: a limit/stop entry, or a bracket on the position. */
    intent: ReplayIntent;
    currency: string;
    loading: boolean;
    error: OrderFailure | null;
    /** The bar a stored session resumed on, so the trader knows why the cursor is not at the start. */
    resumedFrom: number | null;
    onCursor: (time: number) => void;
    onTogglePlay: () => void;
    onSpeed: (speed: ReplaySpeed) => void;
    onStart: (time: number) => void;
    onFirst: () => void;
    onRandom: () => void;
    onExit: () => void;
    onBuy: (quantity: number) => void;
    onSell: (quantity: number) => void;
    onPlacePending: (type: OrderType, price: number, quantity: number) => void;
    onCancelOrder: () => void;
    onSetBracket: (bracket: Bracket) => void;
    onClearBracket: () => void;
    onReset: () => void;
};

const ORDER_FAILURES: Record<OrderFailure, StringKey> = {
    badQuantity: 'replay.order.badQuantity',
    badPrice: 'replay.order.badPrice',
    insufficientFunds: 'replay.order.insufficientFunds',
    noPosition: 'replay.order.noPosition',
    notEnoughShares: 'replay.order.notEnoughShares',
    wrongSideOfMarket: 'replay.order.wrongSideOfMarket',
};

const ORDER_TYPES: OrderType[] = ['market', 'limit', 'stop'];
const TYPE_KEYS: Record<OrderType, StringKey> = {
    market: 'replay.type.market',
    limit: 'replay.type.limit',
    stop: 'replay.type.stop',
};

/** A bar's day, in the one format an <input type="date"> accepts. */
const dayOf = (time: number): string => new Date(time * 1000).toISOString().slice(0, 10);
const startOfDay = (day: string): number => Math.floor(Date.parse(`${day}T00:00:00Z`) / 1000);

const trimQuantity = (value: number): string => String(Math.floor(value * 1e6) / 1e6);

/**
 * The replay transport and the paper account beside it. Pure presentation: the session state and
 * the fills live in YahooChart, this file only reads them and reports intent.
 */
export default function ReplayPanel({
    lang,
    candles,
    cursor,
    playing,
    speed,
    account,
    intent,
    currency,
    loading,
    error,
    resumedFrom,
    onCursor,
    onTogglePlay,
    onSpeed,
    onStart,
    onFirst,
    onRandom,
    onExit,
    onBuy,
    onSell,
    onPlacePending,
    onCancelOrder,
    onSetBracket,
    onClearBracket,
    onReset,
}: Props) {
    const t = (key: StringKey) => tx(lang, key);
    const [quantity, setQuantity] = useState('10');
    const [orderType, setOrderType] = useState<OrderType>('market');
    const [orderPrice, setOrderPrice] = useState('');
    const [stopPrice, setStopPrice] = useState('');
    const [targetPrice, setTargetPrice] = useState('');
    const [startDay, setStartDay] = useState('');
    const [orderError, setOrderError] = useState<OrderFailure | null>(null);

    const bar = candles[cursor] ?? null;
    const summary = useMemo(() => summarize(account, bar?.close ?? null), [account, bar?.close]);
    const price = (value: number) => formatPrice(value, currency || 'USD', lang);
    const fills = useMemo(() => [...account.fills].reverse().slice(0, 12), [account.fills]);
    const lastDay = candles.length > 0 ? dayOf(candles[candles.length - 1].time) : '';
    const firstDay = candles.length > 0 ? dayOf(candles[0].time) : '';

    const place = (side: 'buy' | 'sell') => {
        const parsed = parseQuantity(quantity);
        if (parsed == null) {
            setOrderError('badQuantity');
            return;
        }
        setOrderError(null);
        if (side === 'sell') {
            onSell(parsed);
            return;
        }
        // A market buy fills on this bar; a limit or a stop is armed and waits for a later one.
        if (orderType === 'market') onBuy(parsed);
        else onPlacePending(orderType, Number(orderPrice), parsed);
    };

    /** The price a limit/stop is armed at, defaulting to the bar the trader is looking at. */
    const defaultOrderPrice = () => {
        if (!bar) return '';
        const drift = orderType === 'limit' ? 0.98 : 1.02;
        return (Math.round(bar.close * drift * 100) / 100).toFixed(2);
    };

    const fillMax = () => {
        if (!bar || bar.close <= 0) return;
        // Costs are charged on the fill, so max size is what the cash really covers.
        setQuantity(trimQuantity(Math.max(0, (summary.cash / fillPrice(bar.close, 'buy', DEFAULT_COSTS)) * 0.999999)));
        setOrderError(null);
    };

    const exportFills = () => {
        if (account.fills.length === 0) return;
        const url = URL.createObjectURL(new Blob([toCsv(account.fills, lang)], { type: 'text/csv;charset=utf-8' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = 'openstock-paper-fills.csv';
        link.click();
        URL.revokeObjectURL(url);
    };

    const failure = orderError ?? error;

    return (
        <section className="rounded-[12px] bg-card p-2.5 shadow-[0_0_0_1px_var(--line)]" aria-label={t('replay.title')}>
            {loading && (
                <p role="status" className="py-3 text-center text-[12.5px] text-faint">{t('replay.loading')}</p>
            )}

            {!loading && candles.length === 0 && (
                <div className="flex items-center justify-between gap-2 py-2">
                    <p className="text-[12.5px] text-down">{t('replay.error')}</p>
                    <button type="button" onClick={onExit} className="pill h-7 px-2.5 text-[12px]">{t('replay.jumpLive')}</button>
                </div>
            )}

            {!loading && candles.length > 0 && (
                <div className="flex flex-col gap-2">
                    {/* Transport — left-to-right like every media player, even in Arabic. */}
                    <div className="flex flex-wrap items-center gap-1.5" dir="ltr">
                        <span className="pill is-up h-7 gap-1.5 px-2.5 text-[11.5px]">
                            <span className="size-1.5 rounded-full bg-brand" /> {t('replay.title')}
                        </span>
                        <button type="button" onClick={() => onCursor(candles[Math.max(0, cursor - 1)].time)} className="icon-btn" title={t('replay.stepBack')} aria-label={t('replay.stepBack')}>
                            <SkipBack />
                        </button>
                        <button type="button" onClick={onTogglePlay} className="icon-btn" title={t(playing ? 'replay.pause' : 'replay.play')} aria-label={t(playing ? 'replay.pause' : 'replay.play')}>
                            {playing ? <Pause /> : <Play />}
                        </button>
                        <button type="button" onClick={() => onCursor(candles[Math.min(candles.length - 1, cursor + 1)].time)} className="icon-btn" title={t('replay.stepForward')} aria-label={t('replay.stepForward')}>
                            <SkipForward />
                        </button>
                        <span className="mx-1 h-4 w-px bg-line" />
                        <span className="text-[11px] font-semibold text-faint">{t('replay.speed')}</span>
                        {REPLAY_SPEEDS.map((value) => (
                            <button
                                key={value}
                                type="button"
                                onClick={() => onSpeed(value)}
                                aria-pressed={speed === value}
                                className={cn('pill h-6 min-w-8 px-1.5 text-[11.5px]', speed === value && 'is-up')}
                                title={t('replay.speedValue').replace('{n}', String(value))}
                            >
                                {value}×
                            </button>
                        ))}
                        <button type="button" onClick={onExit} className="pill ms-auto h-7 gap-1.5 px-2.5 text-[12px]" title={t('replay.jumpLive')}>
                            <X className="size-3.5" /> {t('replay.jumpLive')}
                        </button>
                    </div>

                    {/* The scrubber is the one control a thumb can drag; it stays LTR for the same reason. */}
                    <input
                        type="range"
                        min={0}
                        max={candles.length - 1}
                        step={1}
                        value={cursor}
                        onChange={(event) => {
                            const next = candles[Number(event.target.value)];
                            if (next) onCursor(next.time);
                        }}
                        aria-label={t('replay.title')}
                        dir="ltr"
                        className="h-1.5 w-full cursor-pointer accent-[var(--brand)]"
                    />

                    <div className="flex flex-wrap items-center gap-1.5" dir="ltr">
                        <span className="mono num text-[12px] font-semibold text-muted-foreground">
                            {t('replay.progress')
                                .replace('{i}', arDigits(cursor + 1, lang))
                                .replace('{n}', arDigits(candles.length, lang))}
                        </span>
                        <span className="mono num text-[11.5px] text-faint">{arDigits(dayOf(bar?.time ?? 0), lang)}</span>
                        <span className="mx-1 h-4 w-px bg-line" />
                        <CalendarDays className="size-3.5 text-faint" />
                        <input
                            type="date"
                            value={startDay}
                            min={firstDay}
                            max={lastDay}
                            onChange={(event) => setStartDay(event.target.value)}
                            aria-label={t('replay.startDate')}
                            className="h-7 rounded-full bg-page px-2 text-[12px] shadow-[inset_0_0_0_1px_var(--line)] outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        />
                        <button
                            type="button"
                            onClick={() => {
                                const time = startOfDay(startDay);
                                if (Number.isFinite(time) && startDay) onStart(time);
                            }}
                            disabled={!startDay}
                            className={cn('pill h-7 px-2.5 text-[12px] is-up', !startDay && 'cursor-not-allowed opacity-40')}
                        >
                            {t('replay.go')}
                        </button>
                        <button type="button" onClick={onFirst} className="pill h-7 px-2.5 text-[12px]">{t('replay.first')}</button>
                        <button type="button" onClick={onRandom} className="pill h-7 gap-1 px-2.5 text-[12px]">
                            <Shuffle className="size-3" /> {t('replay.random')}
                        </button>
                        {resumedFrom != null && (
                            <span className="text-[11px] text-faint">{t('replay.resumed').replace('{date}', arDigits(dayOf(resumedFrom), lang))}</span>
                        )}
                    </div>

                    {/* The paper account, marked at the cursor bar's close — never at a live quote. */}
                    <div className="grid gap-2 rounded-[10px] bg-page/60 p-2 md:grid-cols-[minmax(0,1fr)_auto]">
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[12px] sm:grid-cols-3">
                            <Stat label={t('replay.cash')} value={price(summary.cash)} />
                            <Stat label={t('replay.equity')} value={price(summary.equity)} />
                            <Stat
                                label={t('replay.realized')}
                                value={price(summary.realized)}
                                tone={summary.realized === 0 ? undefined : summary.realized > 0 ? 'up' : 'down'}
                            />
                            <Stat
                                label={t('replay.unrealized')}
                                value={price(summary.unrealized)}
                                tone={summary.unrealized === 0 ? undefined : summary.unrealized > 0 ? 'up' : 'down'}
                            />
                            <Stat
                                label={t('replay.position')}
                                value={
                                    summary.quantity > 0 && summary.averageCost != null
                                        ? `${arDigits(trimQuantity(summary.quantity), lang)} @ ${price(summary.averageCost)}`
                                        : t('replay.flat')
                                }
                            />
                            <Stat
                                label="%"
                                value={`${summary.returnPct >= 0 ? '+' : ''}${arDigits((summary.returnPct * 100).toFixed(2), lang)}%`}
                                tone={summary.returnPct === 0 ? undefined : summary.returnPct > 0 ? 'up' : 'down'}
                            />
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5" dir="ltr">
                            <select
                                value={orderType}
                                onChange={(event) => {
                                    const next = event.target.value as OrderType;
                                    setOrderType(next);
                                    setOrderError(null);
                                    if (next === 'market') setOrderPrice('');
                                    else if (!orderPrice) setOrderPrice(defaultOrderPrice());
                                }}
                                aria-label={t('replay.type')}
                                className="h-7 rounded-full bg-page px-2 text-[11.5px] shadow-[inset_0_0_0_1px_var(--line)] outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                {ORDER_TYPES.map((type) => (
                                    <option key={type} value={type}>{t(TYPE_KEYS[type])}</option>
                                ))}
                            </select>
                            {orderType !== 'market' && (
                                <input
                                    value={orderPrice}
                                    onChange={(event) => setOrderPrice(event.target.value)}
                                    inputMode="decimal"
                                    aria-label={t('replay.typePrice')}
                                    placeholder={t('replay.typePrice')}
                                    className="mono h-7 w-20 rounded-full bg-page px-2.5 text-[12px] shadow-[inset_0_0_0_1px_var(--line)] outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                />
                            )}
                            <input
                                value={quantity}
                                onChange={(event) => setQuantity(event.target.value)}
                                inputMode="decimal"
                                aria-label={t('replay.quantity')}
                                placeholder={t('replay.quantity')}
                                className="mono h-7 w-24 rounded-full bg-page px-2.5 text-[12px] shadow-[inset_0_0_0_1px_var(--line)] outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            />
                            <button type="button" onClick={fillMax} className="pill h-7 px-2 text-[11.5px]">{t('replay.max')}</button>
                            <button type="button" onClick={() => place('buy')} className="pill h-7 px-3 text-[12px] text-up">{t('replay.buy')}</button>
                            <button
                                type="button"
                                onClick={() => place('sell')}
                                disabled={summary.quantity <= 0}
                                className={cn('pill h-7 px-3 text-[12px] text-down', summary.quantity <= 0 && 'cursor-not-allowed opacity-40')}
                            >
                                {t('replay.sell')}
                            </button>
                            <button type="button" onClick={onReset} className="icon-btn" title={t('replay.reset')} aria-label={t('replay.reset')}>
                                <RotateCcw />
                            </button>
                            <button
                                type="button"
                                onClick={exportFills}
                                disabled={account.fills.length === 0}
                                className={cn('icon-btn', account.fills.length === 0 && 'cursor-not-allowed opacity-40')}
                                title={t('replay.export')}
                                aria-label={t('replay.export')}
                            >
                                <Download />
                            </button>
                        </div>
                    </div>

                    {failure && <p role="alert" className="text-[11.5px] text-down">{t(ORDER_FAILURES[failure])}</p>}

                    {intent.order && (
                        <div className="flex flex-wrap items-center gap-2 rounded-[9px] bg-page px-2.5 py-1.5 text-[11.5px] text-faint">
                            <span>
                                {t('replay.pending')
                                    .replace('{t}', t(TYPE_KEYS[intent.order.type]))
                                    .replace('{p}', price(intent.order.price))
                                    .replace('{q}', arDigits(trimQuantity(intent.order.quantity), lang))}
                            </span>
                            <button type="button" onClick={onCancelOrder} className="pill h-6 px-2 text-[11px]">{t('replay.cancelOrder')}</button>
                        </div>
                    )}

                    {summary.quantity > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5" dir="ltr">
                            <span className="text-[11px] font-semibold text-faint">{t('replay.bracket')}</span>
                            <input
                                value={stopPrice}
                                onChange={(event) => setStopPrice(event.target.value)}
                                inputMode="decimal"
                                aria-label={t('replay.bracket.stop')}
                                placeholder={t('replay.bracket.stop')}
                                className="mono h-7 w-20 rounded-full bg-page px-2.5 text-[12px] shadow-[inset_0_0_0_1px_var(--line)] outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            />
                            <input
                                value={targetPrice}
                                onChange={(event) => setTargetPrice(event.target.value)}
                                inputMode="decimal"
                                aria-label={t('replay.bracket.target')}
                                placeholder={t('replay.bracket.target')}
                                className="mono h-7 w-20 rounded-full bg-page px-2.5 text-[12px] shadow-[inset_0_0_0_1px_var(--line)] outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            />
                            <button
                                type="button"
                                onClick={() => {
                                    setOrderError(null);
                                    onSetBracket({
                                        ...(stopPrice.trim() === '' ? {} : { stopLoss: Number(stopPrice) }),
                                        ...(targetPrice.trim() === '' ? {} : { takeProfit: Number(targetPrice) }),
                                    });
                                }}
                                className="pill h-7 px-2.5 text-[11.5px]"
                            >
                                {t('replay.bracket.set')}
                            </button>
                            {intent.bracket && (
                                <button type="button" onClick={onClearBracket} className="pill h-7 px-2.5 text-[11.5px]">
                                    {t('replay.bracket.clear')}
                                </button>
                            )}
                        </div>
                    )}

                    {intent.bracket && summary.quantity > 0 && (
                        <p className="text-[11.5px] text-faint">
                            {intent.bracket.stopLoss != null && `${t('replay.bracket.stop')} ${price(intent.bracket.stopLoss)}`}
                            {intent.bracket.stopLoss != null && intent.bracket.takeProfit != null && ' · '}
                            {intent.bracket.takeProfit != null && `${t('replay.bracket.target')} ${price(intent.bracket.takeProfit)}`}
                        </p>
                    )}

                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-[11px] text-faint">
                        <p>{t('replay.costs')}</p>
                        <p>{t('replay.liveQuote')}</p>
                    </div>

                    <div className="flex flex-col gap-0.5">
                        <p className="text-[11px] font-semibold text-faint">{t('replay.log')} · {arDigits(account.fills.length, lang)}</p>
                        {account.fills.length === 0 ? (
                            <p className="text-[11.5px] text-faint">{t('replay.logEmpty')}</p>
                        ) : (
                            <div className="flex max-h-28 flex-col overflow-y-auto">
                                {fills.map((fill) => (
                                    <FillRow key={fill.id} fill={fill} lang={lang} price={price} />
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </section>
    );
}

const Stat = ({ label, value, tone }: { label: string; value: string; tone?: 'up' | 'down' }) => (
    <div className="min-w-0">
        <p className="truncate text-[10.5px] font-semibold uppercase tracking-wide text-faint">{label}</p>
        <p className={cn('mono num truncate text-[12.5px] font-semibold', tone === 'up' && 'text-up', tone === 'down' && 'text-down')}>{value}</p>
    </div>
);

const FillRow = ({ fill, lang, price }: { fill: Fill; lang: Lang; price: (value: number) => string }) => (
    <div className="flex items-center gap-2 border-t border-line/60 py-0.5 text-[11.5px] first:border-t-0">
        <span className={cn('w-10 shrink-0 font-semibold', fill.side === 'buy' ? 'text-up' : 'text-down')}>
            {tx(lang, fill.side === 'buy' ? 'replay.sideBuy' : 'replay.sideSell')}
        </span>
        <span className="shrink-0 text-[10.5px] text-faint">{fillReasonLabel(lang, fill.reason)}</span>
        <span className="mono num shrink-0">{arDigits(fill.quantity, lang)}</span>
        <span className="mono num shrink-0 text-faint">{price(fill.price)}</span>
        <span className="mono num ms-auto shrink-0 text-faint">{arDigits(new Date(fill.time * 1000).toISOString().slice(0, 10), lang)}</span>
        {fill.side === 'sell' && (
            <span className={cn('mono num w-16 shrink-0 text-end', fill.realized >= 0 ? 'text-up' : 'text-down')}>{price(fill.realized)}</span>
        )}
    </div>
);
