'use client';

import { useState, useTransition } from 'react';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { saveSiteNotice } from '@/lib/actions/admin-content.actions';
import { NOTICE_LEVELS, type NoticeLevel, type SiteNotice } from '@/lib/notice';
import { NoticeBar } from '@/components/shell/TerminalBars';
import { tx, type Lang, type StringKey } from '@/lib/i18n';

type Props = { lang: Lang; initial: SiteNotice; canEdit: boolean };

const toLocalInput = (iso: string | null): string => (iso ? iso.slice(0, 16) : '');

/** The site notice editor, with a live preview of exactly what the shell would render. */
const AdminNoticeForm = ({ lang, initial, canEdit }: Props) => {
    const [draft, setDraft] = useState<SiteNotice>(initial);
    const [expires, setExpires] = useState(toLocalInput(initial.expiresAt));
    const [pending, startTransition] = useTransition();

    const set = <K extends keyof SiteNotice>(key: K, value: SiteNotice[K]) => setDraft((current) => ({ ...current, [key]: value }));

    const save = () => {
        startTransition(async () => {
            try {
                const when = expires ? new Date(expires) : null;
                const saved = await saveSiteNotice({
                    ...draft,
                    expiresAt: when && !Number.isNaN(when.getTime()) ? when.toISOString() : null,
                });
                setDraft(saved);
                setExpires(toLocalInput(saved.expiresAt));
                toast.success(tx(lang, 'admin.saved'));
            } catch (error) {
                toast.error(error instanceof Error ? error.message : tx(lang, 'admin.error'));
            }
        });
    };

    const preview: SiteNotice | null =
        draft.active && (draft.messageEn || draft.messageAr) ? { ...draft, expiresAt: null } : null;

    return (
        <div className="flex flex-col gap-3 p-3.5">
            <div className="overflow-hidden rounded-lg border border-line">
                <NoticeBar lang={lang} notice={preview} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1">
                    <span className="form-label">{tx(lang, 'admin.content.messageEn')}</span>
                    <textarea className="form-input min-h-[64px]" dir="ltr" maxLength={240} value={draft.messageEn} disabled={!canEdit} onChange={(event) => set('messageEn', event.target.value)} />
                </label>
                <label className="flex flex-col gap-1">
                    <span className="form-label">{tx(lang, 'admin.content.messageAr')}</span>
                    <textarea className="form-input min-h-[64px]" dir="rtl" maxLength={240} value={draft.messageAr} disabled={!canEdit} onChange={(event) => set('messageAr', event.target.value)} />
                </label>
                <label className="flex flex-col gap-1">
                    <span className="form-label">{tx(lang, 'admin.content.href')}</span>
                    <input className="form-input" dir="ltr" placeholder="/pricing" maxLength={300} value={draft.href} disabled={!canEdit} onChange={(event) => set('href', event.target.value)} />
                </label>
                <label className="flex flex-col gap-1">
                    <span className="form-label">{tx(lang, 'admin.content.level')}</span>
                    <select className="form-input" value={draft.level} disabled={!canEdit} onChange={(event) => set('level', event.target.value as NoticeLevel)}>
                        {NOTICE_LEVELS.map((level) => (
                            <option key={level} value={level}>{tx(lang, `admin.content.level.${level}` as StringKey)}</option>
                        ))}
                    </select>
                </label>
                <label className="flex flex-col gap-1">
                    <span className="form-label">{tx(lang, 'admin.content.linkLabelEn')}</span>
                    <input className="form-input" dir="ltr" maxLength={60} value={draft.linkLabelEn} disabled={!canEdit} onChange={(event) => set('linkLabelEn', event.target.value)} />
                </label>
                <label className="flex flex-col gap-1">
                    <span className="form-label">{tx(lang, 'admin.content.linkLabelAr')}</span>
                    <input className="form-input" dir="rtl" maxLength={60} value={draft.linkLabelAr} disabled={!canEdit} onChange={(event) => set('linkLabelAr', event.target.value)} />
                </label>
                <label className="flex flex-col gap-1">
                    <span className="form-label">{tx(lang, 'admin.content.expires')}</span>
                    <input type="datetime-local" className="form-input" dir="ltr" value={expires} disabled={!canEdit} onChange={(event) => setExpires(event.target.value)} />
                </label>
                <label className="flex items-center gap-2 self-end pb-2">
                    <input type="checkbox" checked={draft.active} disabled={!canEdit} onChange={(event) => set('active', event.target.checked)} />
                    <span className="text-[13px] font-semibold">{tx(lang, 'admin.content.active')}</span>
                </label>
            </div>

            {canEdit && (
                <div className="flex justify-end">
                    <button type="button" className="btn btn-primary h-9 px-4 text-[13px]" onClick={save} disabled={pending}>
                        {pending ? <Loader2 className="animate-spin" /> : <Save />}
                        {tx(lang, 'admin.content.save')}
                    </button>
                </div>
            )}
        </div>
    );
};

export default AdminNoticeForm;
