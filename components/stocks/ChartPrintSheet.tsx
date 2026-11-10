'use client';

import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { arDigits } from '@/lib/i18n';
import { tx, type Lang } from '@/lib/i18n';
import { printChange, printDay, printRange, printStudies } from '@/lib/chart/print';

/** What the sheet states about the chart, decided before the page is laid out. */
export type PrintSheetMeta = {
    symbol: string;
    name?: string;
    interval: string;
    last?: number;
    /** The session move, in percent; the chart's own quote carries it rather than a second price. */
    changePercent?: number | null;
    /** The first and last bar on the chart, in seconds. */
    from?: number;
    to?: number;
    studies: readonly string[];
    /** The currency symbol for the last price, already localised. */
    currency: string;
};

type Props = {
    image: { dataUrl: string; width: number; height: number };
    meta: PrintSheetMeta;
    lang: Lang;
    onClose: () => void;
};

// Screen styles are inline, not classes: this sheet is on screen for one moment and the point is
// that it is the print page plus buttons, so nothing can inherit a hover or a dark theme into it.
const sheet: CSSProperties = {
    position: 'fixed',
    inset: 0,
    zIndex: 60,
    overflow: 'auto',
    background: '#e8eaee',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '16px',
    padding: '20px 16px 40px',
};

const paper: CSSProperties = {
    width: '100%',
    maxWidth: '980px',
    background: '#ffffff',
    color: '#111827',
    borderRadius: '10px',
    boxShadow: '0 12px 40px rgba(15, 23, 42, 0.18)',
    padding: '24px 28px 18px',
};

const bar: CSSProperties = {
    display: 'flex',
    gap: '10px',
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'center',
};

const button = (primary: boolean): CSSProperties => ({
    border: primary ? 'none' : '1px solid #cbd2dc',
    background: primary ? '#2563eb' : '#ffffff',
    color: primary ? '#ffffff' : '#111827',
    borderRadius: '8px',
    padding: '9px 18px',
    fontSize: '13.5px',
    fontWeight: 600,
    cursor: 'pointer',
});

/**
 * The page a trader gets when they print the chart: a header of the facts they would otherwise have
 * to write in by hand, the chart itself, and a footnote naming the source. The browser's own print
 * dialog turns this into paper or a PDF; "Save as PDF" is the same dialog, so one sheet serves both.
 */
export default function ChartPrintSheet({ image, meta, lang, onClose }: Props) {
    const t = (key: Parameters<typeof tx>[1]) => tx(lang, key);
    const facts: [string, string][] = [
        [t('chart.print.symbol'), meta.name ? `${meta.symbol} · ${meta.name}` : meta.symbol],
        [t('chart.print.interval'), meta.interval],
        [t('chart.print.last'), meta.last == null ? '—' : arDigits(`${meta.last.toFixed(2)} ${meta.currency}`, lang)],
        [t('chart.print.change'), printChange(meta.changePercent)],
    ];
    const range = printRange(meta.from, meta.to);
    if (range) facts.push([t('chart.print.range'), range]);
    const studies = printStudies(meta.studies);
    if (studies) facts.push([t('chart.print.studies'), studies]);

    // Portalled to the body so the print stylesheet can hide the app with one rule: the sheet has to
    // be a sibling of the app root, not a descendant of it.
    return createPortal(
        <div style={sheet} role="dialog" aria-modal="true" aria-label={t('chart.print')} data-print-sheet="" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
            <div style={bar} data-print-hide="">
                <button type="button" style={button(true)} onClick={() => window.print()}>
                    {t('chart.print.open')}
                </button>
                <button type="button" style={button(false)} onClick={onClose}>
                    {t('chart.print.close')}
                </button>
            </div>
            <p
                style={{ maxWidth: '640px', margin: 0, textAlign: 'center', fontSize: '12.5px', lineHeight: 1.6, color: '#4b5563' }}
                data-print-hide=""
            >
                {t('chart.print.note')}
            </p>

            <div style={paper} data-print-paper="">
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '16px' }}>
                    <div style={{ fontSize: '19px', fontWeight: 700, letterSpacing: '-0.01em' }}>{meta.name ?? meta.symbol}</div>
                    <div style={{ fontSize: '19px', fontWeight: 700, letterSpacing: '-0.01em' }}>ROVEX</div>
                </div>
                <dl
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                        gap: '10px 20px',
                        margin: '14px 0 14px',
                        fontSize: '12px',
                    }}
                >
                    {facts.map(([label, value]) => (
                        <div key={label}>
                            <dt style={{ color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: '10px', fontWeight: 600 }}>
                                {label}
                            </dt>
                            {/* The value keeps its own left-to-right run inside an Arabic page: a
                                range arrow and a clock read the same way in both languages. bdi,
                                not dir=auto on the block, so the line still starts on the right. */}
                            <dd style={{ margin: '2px 0 0', fontWeight: 600, color: '#111827' }}>
                                <bdi>{value}</bdi>
                            </dd>
                        </div>
                    ))}
                </dl>
                {/* No next/image here: a one-shot data URL is already the pixels we want at full width. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src={image.dataUrl}
                    alt={`${meta.symbol} ${meta.interval}`}
                    width={image.width}
                    height={image.height}
                    style={{ display: 'block', width: '100%', height: 'auto', border: '1px solid #e5e7eb', borderRadius: '4px' }}
                />
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: '12px',
                        marginTop: '10px',
                        fontSize: '10.5px',
                        color: '#6b7280',
                    }}
                >
                    <span>{t('chart.print.watermark')}</span>
                    <span>
                        {t('chart.print.drawn')}: <bdi>{printDay(Date.now() / 1000)}</bdi>
                    </span>
                </div>
            </div>
        </div>,
        document.body,
    );
}
