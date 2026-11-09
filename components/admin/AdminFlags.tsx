'use client';

import { useState, useTransition } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { listFlags, setFlag, type FlagRow } from '@/lib/actions/admin-flags.actions';
import { tx, type Lang, type StringKey } from '@/lib/i18n';
import { cn } from '@/lib/utils';

type Props = { lang: Lang; initial: FlagRow[] };

/**
 * The flag board. One row per flag the product reads; a switch saves on change and the row holds
 * the last value the server confirmed, so a refused write leaves the board honest.
 */
const AdminFlags = ({ lang, initial }: Props) => {
    const [rows, setRows] = useState<FlagRow[]>(initial);
    const [busy, setBusy] = useState<string | null>(null);
    const [, startTransition] = useTransition();

    const flip = (row: FlagRow) => {
        setBusy(row.key);
        startTransition(async () => {
            try {
                const saved = await setFlag(row.key, !row.enabled);
                setRows((current) => current.map((entry) => (entry.key === saved.key ? saved : entry)));
                toast.success(tx(lang, 'admin.saved'));
            } catch (error) {
                toast.error(error instanceof Error ? error.message : tx(lang, 'admin.error'));
            } finally {
                setBusy(null);
            }
        });
    };

    const refresh = () => {
        setBusy('refresh');
        startTransition(async () => {
            try {
                setRows(await listFlags());
            } catch {
                toast.error(tx(lang, 'admin.error'));
            } finally {
                setBusy(null);
            }
        });
    };

    return (
        <div className="flex flex-col gap-3 p-3.5">
            <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] text-faint">{tx(lang, 'admin.flags.sub')}</span>
                <button type="button" className="btn btn-ghost h-7 px-2.5 text-[12px]" disabled={busy !== null} onClick={refresh}>
                    {busy === 'refresh' && <Loader2 className="animate-spin" />}
                    {tx(lang, 'admin.flags.refresh')}
                </button>
            </div>

            <ul className="flex flex-col divide-y divide-line">
                {rows.map((row) => (
                    <li key={row.key} className="flex flex-wrap items-center gap-3 py-3">
                        <span className="min-w-0 flex-1">
                            <span className="mono block truncate text-[13px] font-semibold" dir="ltr">{row.key}</span>
                            <span className="block truncate text-[12px] text-faint">
                                {tx(lang, `admin.flags.desc.${row.key}` as StringKey)}
                            </span>
                            {row.updatedAt && (
                                <span className="num block text-[11px] text-faint" dir="ltr">
                                    {tx(lang, 'admin.flags.updated')} {row.updatedAt.slice(0, 16).replace('T', ' ')}
                                </span>
                            )}
                        </span>
                        <span className={cn('pill', row.enabled ? 'is-up' : 'is-down')}>
                            {tx(lang, row.enabled ? 'admin.flags.on' : 'admin.flags.off')}
                        </span>
                        <button
                            type="button"
                            role="switch"
                            aria-checked={row.enabled}
                            aria-label={row.key}
                            disabled={busy === row.key}
                            onClick={() => flip(row)}
                            className={cn(
                                'relative h-5 w-9 flex-none rounded-full transition-colors',
                                row.enabled ? 'bg-up' : 'bg-line',
                            )}
                        >
                            <span
                                className={cn(
                                    'absolute top-0.5 size-4 rounded-full bg-page transition-all',
                                    row.enabled ? 'start-4.5' : 'start-0.5',
                                )}
                            />
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    );
};

export default AdminFlags;
