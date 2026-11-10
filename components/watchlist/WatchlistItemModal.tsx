"use client";

import React, { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { updateWatchlistItem } from "@/lib/actions/watchlist.actions";
import { DEFAULT_GROUP, MAX_NOTE_LENGTH, MAX_TAGS } from "@/lib/watchlist";
import { tx, type Lang } from "@/lib/i18n";
import { toast } from "sonner";

export type WatchlistItemDraft = {
    symbol: string;
    company: string;
    group: string;
    note: string;
    tags: string[];
};

export default function WatchlistItemModal({
    lang,
    item,
    groups,
    children,
    onSaved,
}: {
    lang: Lang;
    item: WatchlistItemDraft;
    groups: string[];
    children: React.ReactNode;
    onSaved?: () => void;
}) {
    const [open, setOpen] = useState(false);
    const [group, setGroup] = useState(item.group || DEFAULT_GROUP);
    const [note, setNote] = useState(item.note);
    const [tags, setTags] = useState(item.tags.join(', '));
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const onOpenChange = (next: boolean) => {
        setOpen(next);
        if (next) {
            setGroup(item.group || DEFAULT_GROUP);
            setNote(item.note);
            setTags(item.tags.join(', '));
            setError(null);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            const result = await updateWatchlistItem(item.symbol, { group, note, tags });
            if (result && 'error' in result) {
                setError(tx(lang, 'wl.errSave'));
                return;
            }
            toast.success(tx(lang, 'wl.saved'));
            setOpen(false);
            onSaved?.();
        } catch (err) {
            console.error(err);
            setError(tx(lang, 'wl.errSave'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogTrigger asChild>{children}</DialogTrigger>
            <DialogContent className="sm:max-w-[440px] gap-5" closeLabel={tx(lang, 'dialog.close')}>
                <div>
                    <p className="kicker text-brand-ink" dir="ltr">{item.symbol}</p>
                    <DialogTitle className="mt-1 text-xl font-bold tracking-tight">{tx(lang, 'wl.organiseTitle')}</DialogTitle>
                    <DialogDescription className="mt-1 text-[13px] text-faint">{tx(lang, 'wl.organiseSub')}</DialogDescription>
                </div>

                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    <label className="flex flex-col gap-2">
                        <span className="form-label">{tx(lang, 'wl.group')}</span>
                        <input
                            value={group}
                            onChange={(e) => setGroup(e.target.value)}
                            list="watchlist-groups"
                            maxLength={40}
                            placeholder={DEFAULT_GROUP}
                            className="h-11 w-full rounded-[11px] border border-line bg-page px-3 text-foreground outline-none focus:border-brand"
                        />
                        <datalist id="watchlist-groups">
                            {groups.map((name) => (
                                <option key={name} value={name} />
                            ))}
                        </datalist>
                    </label>

                    <label className="flex flex-col gap-2">
                        <span className="form-label">{tx(lang, 'wl.note')}</span>
                        <textarea
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            maxLength={MAX_NOTE_LENGTH}
                            rows={3}
                            placeholder={tx(lang, 'wl.notePlaceholder')}
                            className="w-full resize-none rounded-[11px] border border-line bg-page px-3 py-2.5 text-foreground outline-none focus:border-brand"
                        />
                        <span className="text-[11px] text-faint">{note.length}/{MAX_NOTE_LENGTH}</span>
                    </label>

                    <label className="flex flex-col gap-2">
                        <span className="form-label">{tx(lang, 'wl.tags')}</span>
                        <input
                            value={tags}
                            onChange={(e) => setTags(e.target.value)}
                            placeholder={tx(lang, 'wl.tagsPlaceholder')}
                            className="h-11 w-full rounded-[11px] border border-line bg-page px-3 text-foreground outline-none focus:border-brand"
                        />
                        <span className="text-[11px] text-faint">{tx(lang, 'wl.tagsHint').replace('{n}', String(MAX_TAGS))}</span>
                    </label>

                    {error && <p role="alert" className="text-[13px] text-warn">{error}</p>}

                    <button type="submit" disabled={loading} className="btn btn-primary h-11">
                        {loading ? tx(lang, 'pf.saving') : tx(lang, 'pf.save')}
                    </button>
                </form>
            </DialogContent>
        </Dialog>
    );
}
