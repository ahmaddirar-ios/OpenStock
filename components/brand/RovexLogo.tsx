import type { Lang } from '@/lib/i18n';

/**
 * The Rovex lockup: a lime mark (an R cut from a rising line) and the wordmark.
 * It renders as text + inline SVG so it stays crisp at any size and follows the
 * theme colour, unlike a bitmap logo.
 */
export default function RovexLogo({
    size = 26,
    lang = 'en',
    wordmark = true,
    className = '',
}: {
    size?: number;
    lang?: Lang;
    wordmark?: boolean;
    className?: string;
}) {
    return (
        <span className={`inline-flex items-center gap-2 text-brand ${className}`}>
            <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" className="shrink-0">
                <rect x="0.75" y="0.75" width="30.5" height="30.5" rx="9" fill="currentColor" fillOpacity="0.10" />
                <rect x="0.75" y="0.75" width="30.5" height="30.5" rx="9" stroke="currentColor" strokeOpacity="0.45" strokeWidth="1.5" />
                <path
                    d="M10.5 23.5V9h5.4a4.4 4.4 0 0 1 0 8.8h-5.4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
                <path d="M16.4 17.8 22 23.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
            </svg>
            {wordmark && <span className="brand-word text-foreground">{lang === 'ar' ? 'روفكس' : 'rovex'}</span>}
        </span>
    );
}
