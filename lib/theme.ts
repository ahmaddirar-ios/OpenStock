// Which theme the app wears. Kept in the browser and applied to <html> before the first paint (the
// inline script in app/layout.tsx), because a flash of the wrong theme is worse than either theme.
//
// The palette itself lives in app/globals.css: `:root` is the dark set, `:root[data-theme='light']`
// the light one, and the shadcn `.dark` class follows the same switch so the component library's own
// variants agree with it.

export type Theme = 'dark' | 'light';

export const THEME_KEY = 'openstock-theme';
export const DEFAULT_THEME: Theme = 'dark';

export const isTheme = (value: unknown): value is Theme => value === 'dark' || value === 'light';

/** The stored choice, or what the operating system prefers when nobody has chosen yet. */
export function readTheme(): Theme {
    if (typeof window === 'undefined') return DEFAULT_THEME;
    try {
        const stored = window.localStorage.getItem(THEME_KEY);
        if (isTheme(stored)) return stored;
    } catch {
        // A blocked store simply means the preference is not remembered.
    }
    return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : DEFAULT_THEME;
}

export function writeTheme(theme: Theme): void {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(THEME_KEY, theme);
    } catch {
        // Not fatal: the theme still applies for this visit.
    }
}

/** Puts the theme on the document. The class and the attribute are kept in step on purpose. */
export function applyTheme(theme: Theme): void {
    if (typeof document === 'undefined') return;
    document.documentElement.dataset.theme = theme;
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.classList.toggle('light', theme === 'light');
    document.documentElement.style.colorScheme = theme;
}

/**
 * The script the document runs before paint. It is a string because it has to be inline: anything
 * deferred arrives after the browser has already painted the default theme.
 */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_KEY}');if(t!=='light'&&t!=='dark'){t=window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';}var d=document.documentElement;d.dataset.theme=t;d.classList.toggle('dark',t==='dark');d.classList.toggle('light',t==='light');d.style.colorScheme=t;}catch(e){}})();`;
