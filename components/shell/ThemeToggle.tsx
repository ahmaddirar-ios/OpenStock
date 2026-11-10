'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { applyTheme, readTheme, writeTheme, type Theme } from '@/lib/theme';
import { tx, type Lang } from '@/lib/i18n';
import { cn } from '@/lib/utils';

/**
 * Dark or light, remembered per browser. Rendered as dark (the default) on the server and corrected
 * on mount, so the markup the server sends and the first client render agree.
 */
export default function ThemeToggle({ lang, className, iconOnly }: { lang: Lang; className?: string; iconOnly?: boolean }) {
    const [theme, setTheme] = useState<Theme>('dark');
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setTheme(readTheme());
        setMounted(true);
    }, []);

    const flip = () => {
        const next: Theme = theme === 'dark' ? 'light' : 'dark';
        setTheme(next);
        applyTheme(next);
        writeTheme(next);
        // The chart paints from tokens it resolved at creation, so it is told to read them again.
        window.dispatchEvent(new CustomEvent('rovex:theme', { detail: next }));
    };

    const label = tx(lang, theme === 'dark' ? 'theme.light' : 'theme.dark');

    return (
        <button
            type="button"
            onClick={flip}
            aria-label={label}
            title={iconOnly ? undefined : label}
            data-mounted={mounted ? 'true' : 'false'}
            className={cn(iconOnly ? 'rail-btn' : 'side-item h-8 w-full justify-start gap-2 font-semibold', className)}
        >
            {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
            {iconOnly ? (
                <>
                    <span className="rail-label">{label}</span>
                    <span className="rail-tip" aria-hidden="true">{label}</span>
                </>
            ) : (
                <span className="flex-1 text-start">{label}</span>
            )}
        </button>
    );
}
