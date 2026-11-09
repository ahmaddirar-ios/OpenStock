'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, Copy, KeyRound, Plus, Trash2 } from 'lucide-react';
import { createApiKey, listApiKeys, revokeApiKey } from '@/lib/actions/api-key.actions';
import { apiQuotaForPlan, MAX_ACTIVE_KEYS } from '@/lib/api/limits';
import type { ApiKeyView } from '@/lib/api/keys';
import { arNumberDigits, tx, type Lang } from '@/lib/i18n';

type Props = {
    lang: Lang;
    initialKeys: ApiKeyView[];
    plan: 'free' | 'pro' | 'premium';
    locked: boolean;
};

const formatDate = (lang: Lang, iso: string | null): string =>
    iso
        ? arNumberDigits(new Date(iso).toLocaleDateString(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' }), lang)
        : '';

const ApiKeysPanel = ({ lang, initialKeys, plan, locked }: Props) => {
    const [keys, setKeys] = useState<ApiKeyView[]>(initialKeys);
    const [name, setName] = useState('');
    const [creating, setCreating] = useState(false);
    const [createdKey, setCreatedKey] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [revoking, setRevoking] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const quota = apiQuotaForPlan(plan);
    const active = keys.filter((key) => !key.revokedAt).length;

    const refresh = async () => {
        try {
            setKeys(await listApiKeys());
        } catch {
            setError(tx(lang, 'profile.apiError'));
        }
    };

    const onCreate = async () => {
        setError(null);
        setCreating(true);
        setCopied(false);
        try {
            const result = await createApiKey(name);
            if (result.error || !result.key) {
                setError(result.error ?? tx(lang, 'profile.apiError'));
                return;
            }
            setCreatedKey(result.key);
            setName('');
            await refresh();
        } finally {
            setCreating(false);
        }
    };

    const onRevoke = async (id: string) => {
        setError(null);
        setRevoking(id);
        try {
            const result = await revokeApiKey(id);
            if (result.error) setError(result.error);
            await refresh();
        } finally {
            setRevoking(null);
        }
    };

    const onCopy = async () => {
        if (!createdKey) return;
        try {
            await navigator.clipboard.writeText(createdKey);
            setCopied(true);
        } catch {
            setError(tx(lang, 'profile.apiError'));
        }
    };

    if (locked) {
        return (
            <div className="flex flex-col gap-3 p-4">
                <p className="text-[13px] text-faint">{tx(lang, 'profile.apiUpgrade')}</p>
                <Link href="/api" className="btn btn-ghost w-fit">
                    {tx(lang, 'profile.apiDocs')}
                </Link>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-4 p-4">
            <p className="text-[13px] text-faint">{tx(lang, 'profile.apiLimit').replace('{n}', arNumberDigits(quota, lang))}</p>

            {createdKey && (
                <div className="rounded-[10px] border border-brand-ink/30 bg-brand-soft/40 p-3">
                    <p className="text-[12.5px] font-semibold">{tx(lang, 'profile.apiCreated')}</p>
                    <p className="mt-0.5 text-[11.5px] text-faint">{tx(lang, 'profile.apiCreatedSub')}</p>
                    <div className="mt-2 flex items-center gap-2">
                        <code dir="ltr" className="min-w-0 flex-1 overflow-x-auto rounded-md bg-black/20 px-2.5 py-2 font-mono text-[12px]">
                            {createdKey}
                        </code>
                        <button type="button" onClick={onCopy} className="btn btn-ghost flex-none">
                            {copied ? <Check /> : <Copy />}
                            {tx(lang, copied ? 'profile.apiCopied' : 'profile.apiCopy')}
                        </button>
                    </div>
                </div>
            )}

            <div className="flex flex-wrap items-end gap-2">
                <label className="min-w-0 flex-1">
                    <span className="mb-1 block text-[12px] font-semibold">{tx(lang, 'profile.apiName')}</span>
                    <input
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        placeholder={tx(lang, 'profile.apiNamePh')}
                        maxLength={60}
                        className="form-input w-full"
                    />
                </label>
                <button
                    type="button"
                    onClick={onCreate}
                    disabled={creating || active >= MAX_ACTIVE_KEYS}
                    className="btn btn-primary"
                >
                    <Plus />
                    {tx(lang, creating ? 'profile.apiCreating' : 'profile.apiCreate')}
                </button>
            </div>

            {active >= MAX_ACTIVE_KEYS && <p className="text-[12px] text-faint">{tx(lang, 'profile.apiMaxed')}</p>}
            {error && <p className="text-[12.5px] text-down">{error}</p>}

            {keys.length === 0 ? (
                <p className="text-[13px] text-faint">{tx(lang, 'profile.apiEmpty')}</p>
            ) : (
                <ul className="row-list">
                    {keys.map((key) => (
                        <li key={key.id} className="flex flex-wrap items-center gap-3 px-3.5 py-3">
                            <span className="bento-ico"><KeyRound /></span>
                            <div className="min-w-0 flex-1">
                                <p className="truncate font-semibold">
                                    {key.name}
                                    {key.revokedAt && <span className="pill ms-2">{tx(lang, 'profile.apiRevoked')}</span>}
                                </p>
                                <p dir="ltr" className="truncate font-mono text-[11.5px] text-faint">
                                    {key.prefix}…{key.last4}
                                    <span className="mx-1.5 opacity-50">·</span>
                                    {arNumberDigits(key.usageCount, lang)} {tx(lang, 'profile.apiUsage')}
                                    <span className="mx-1.5 opacity-50">·</span>
                                    {key.lastUsedAt
                                        ? `${tx(lang, 'profile.apiLastUsed')} ${formatDate(lang, key.lastUsedAt)}`
                                        : tx(lang, 'profile.apiNever')}
                                </p>
                            </div>
                            {!key.revokedAt && (
                                <button
                                    type="button"
                                    onClick={() => onRevoke(key.id)}
                                    disabled={revoking === key.id}
                                    className="btn btn-ghost flex-none"
                                >
                                    <Trash2 />
                                    {tx(lang, 'profile.apiRevoke')}
                                </button>
                            )}
                        </li>
                    ))}
                </ul>
            )}

            <Link href="/api" className="w-fit text-[12.5px] font-semibold text-brand-ink underline-offset-4 hover:underline">
                {tx(lang, 'profile.apiDocs')}
            </Link>
        </div>
    );
};

export default ApiKeysPanel;
