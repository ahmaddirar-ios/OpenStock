import { REPO_URL } from '@/lib/constants';
import type { Lang } from '@/lib/i18n';

/**
 * The AGPL asks a public deployment to credit the original project, so every surface that
 * carries the brand also carries the source. Kept tiny and out of the way of the product.
 */
export default function FooterCredit({ lang = 'en', className = '' }: { lang?: Lang; className?: string }) {
    return (
        <p className={`text-[10.5px] leading-relaxed text-faint ${className}`}>
            {lang === 'ar' ? 'مبني على ' : 'Powered by '}
            <a
                href={REPO_URL}
                target="_blank"
                rel="noreferrer"
                className="underline decoration-dotted underline-offset-2 transition-colors hover:text-muted-foreground"
            >
                OpenStock
            </a>
            <span className="mx-1 opacity-60">·</span>
            AGPL-3.0
        </p>
    );
}
