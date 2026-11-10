'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { tx, type Lang } from '@/lib/i18n';
import { SHORTCUTS } from '@/lib/shell/shortcuts';

/** Any key handler can open the one sheet mounted in the shell, like the command palette. */
const OPEN_EVENT = 'open-shortcuts';

export const openShortcuts = () => window.dispatchEvent(new Event(OPEN_EVENT));

/**
 * The keys the terminal owns, on one card — the answer to "what can I press?" without a manual.
 * It lists only what really works; a browser key we cannot take is not printed here.
 */
export default function ShortcutSheet({ lang }: { lang: Lang }) {
    const [open, setOpen] = useState(false);

    useEffect(() => {
        const onOpen = () => setOpen(true);
        window.addEventListener(OPEN_EVENT, onOpen);
        return () => window.removeEventListener(OPEN_EVENT, onOpen);
    }, []);

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="sm:max-w-md">
                <div className="flex flex-col gap-1.5 pe-8">
                    <DialogTitle className="text-[15px] font-bold">{tx(lang, 'shortcut.title')}</DialogTitle>
                    <DialogDescription className="text-[12.5px] leading-relaxed text-faint">
                        {tx(lang, 'shortcut.hint')}
                    </DialogDescription>
                </div>

                <dl className="flex flex-col">
                    {SHORTCUTS.map((shortcut) => (
                        <div
                            key={shortcut.id}
                            className="flex items-center justify-between gap-4 border-t border-line/60 py-2.5 first:border-t-0 first:pt-0"
                        >
                            <dt className="text-[13px]">{tx(lang, shortcut.labelKey)}</dt>
                            <dd className="flex shrink-0 items-center gap-1">
                                {shortcut.keys.map((cap) => (
                                    <kbd
                                        key={cap}
                                        className="grid h-6 min-w-6 place-items-center rounded-md border border-line bg-hover px-1.5 font-mono text-[11px] font-semibold text-foreground"
                                    >
                                        {cap}
                                    </kbd>
                                ))}
                            </dd>
                        </div>
                    ))}
                </dl>
            </DialogContent>
        </Dialog>
    );
}
