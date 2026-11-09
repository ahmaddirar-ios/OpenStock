'use client';

// The access editor: one account's plan, plus the exceptions that bend it.
//
// Three states per feature, and they mean different things. "Follow plan" stores nothing, so a later
// plan change carries the account with it; "Allow" and "Block" are deliberate overrides that survive
// plan changes. The dialog shows what the plan itself would give, so an override never looks like a
// mystery. Saving sends the whole row, and the server re-validates every feature name.

import { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
} from '@/components/ui/dialog';
import { setUserEntitlement, type AdminUser } from '@/lib/actions/admin-users.actions';
import { FEATURE_GROUPS, PLANS, PLAN_FEATURES, type Feature, type Plan } from '@/lib/plans';
import { arDigits, tx, type Lang, type StringKey } from '@/lib/i18n';
import { cn } from '@/lib/utils';

type Override = 'default' | 'allow' | 'deny';

type Props = {
    lang: Lang;
    user: AdminUser;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSaved: (userId: string, change: Partial<AdminUser>) => void;
};

const featureLabel = (lang: Lang, feature: Feature) => tx(lang, `access.${feature}` as StringKey);
const planLabel = (lang: Lang, plan: Plan) => tx(lang, `plan.${plan}` as StringKey);

const UserAccessDialog = ({ lang, user, open, onOpenChange, onSaved }: Props) => {
    const [plan, setPlan] = useState<Plan>(user.plan);
    const [overrides, setOverrides] = useState<Record<string, Override>>(() => {
        const next: Record<string, Override> = {};
        for (const feature of user.allow) next[feature] = 'allow';
        for (const feature of user.deny) next[feature] = 'deny';
        return next;
    });
    const [saving, setSaving] = useState(false);

    const inPlan = useMemo(() => new Set<Feature>(PLAN_FEATURES[plan]), [plan]);
    const granted = useMemo(
        () =>
            FEATURE_GROUPS.flatMap((group) => group.features).filter((feature) => {
                const override = overrides[feature] ?? 'default';
                if (override === 'deny') return false;
                if (override === 'allow') return true;
                return inPlan.has(feature);
            }),
        [overrides, inPlan],
    );

    const reset = (next: boolean) => {
        if (next) {
            const fresh: Record<string, Override> = {};
            for (const feature of user.allow) fresh[feature] = 'allow';
            for (const feature of user.deny) fresh[feature] = 'deny';
            setPlan(user.plan);
            setOverrides(fresh);
        }
        onOpenChange(next);
    };

    const save = async () => {
        setSaving(true);
        try {
            const allow = Object.entries(overrides)
                .filter(([, value]) => value === 'allow')
                .map(([feature]) => feature);
            const deny = Object.entries(overrides)
                .filter(([, value]) => value === 'deny')
                .map(([feature]) => feature);
            const result = await setUserEntitlement(user.id, { plan, allow, deny });
            onSaved(user.id, { plan: result.plan, allow: result.allow, deny: result.deny });
            toast.success(tx(lang, 'admin.saved'));
            onOpenChange(false);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : tx(lang, 'admin.error'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={reset}>
            <DialogContent className="max-h-[86vh] gap-4 overflow-y-auto sm:max-w-[620px]" closeLabel={tx(lang, 'dialog.close')}>
                <div>
                    <DialogTitle className="text-[16px] font-bold tracking-[-0.02em]">
                        {tx(lang, 'admin.access.title').replace('{email}', user.email)}
                    </DialogTitle>
                    <DialogDescription className="mt-1 text-[12px] text-faint">
                        {tx(lang, 'admin.access.sub')}
                    </DialogDescription>
                </div>

                <div className="flex flex-wrap items-end gap-3">
                    <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-faint">
                        {tx(lang, 'admin.access.plan')}
                        <select
                            className="form-input h-9 w-40 text-[13px] normal-case tracking-normal text-foreground"
                            value={plan}
                            disabled={saving}
                            onChange={(event) => setPlan(event.target.value as Plan)}
                        >
                            {PLANS.map((value) => (
                                <option key={value} value={value}>{planLabel(lang, value)}</option>
                            ))}
                        </select>
                    </label>
                    <span className="pill is-brand num">
                        {tx(lang, 'admin.access.summary').replace('{n}', arDigits(granted.length, lang))}
                    </span>
                </div>

                <p className="rounded-[8px] bg-hover px-3 py-2 text-[11.5px] leading-relaxed text-faint">
                    {tx(lang, 'admin.access.staff')}
                </p>

                {FEATURE_GROUPS.map((group) => (
                    <section key={group.id} className="flex flex-col gap-1.5">
                        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-faint">
                            {tx(lang, group.labelKey)}
                        </h3>
                        <ul className="flex flex-col divide-y divide-line/60 rounded-[8px] border border-line">
                            {group.features.map((feature) => {
                                const override = overrides[feature] ?? 'default';
                                const base = inPlan.has(feature);
                                return (
                                    <li key={feature} className="flex items-center justify-between gap-3 px-3 py-2">
                                        <span className="min-w-0">
                                            <span className="block truncate text-[12.5px] font-semibold">{featureLabel(lang, feature)}</span>
                                            <span className={cn('block text-[11px]', base ? 'text-up' : 'text-faint')}>
                                                {planLabel(lang, plan)} · {tx(lang, base ? 'admin.access.included' : 'admin.access.excluded')}
                                            </span>
                                        </span>
                                        <span className="flex flex-none overflow-hidden rounded-[7px] border border-line">
                                            {(['default', 'allow', 'deny'] as const).map((state) => (
                                                <button
                                                    key={state}
                                                    type="button"
                                                    disabled={saving}
                                                    onClick={() => (state === 'default' ? setOverrides((current) => {
                                                        const next = { ...current };
                                                        delete next[feature];
                                                        return next;
                                                    }) : setOverrides((current) => ({ ...current, [feature]: state })))}
                                                    className={cn(
                                                        'px-2 py-1 text-[10.5px] font-semibold transition-colors',
                                                        override === state
                                                            ? state === 'deny'
                                                                ? 'bg-down text-on-brand'
                                                                : state === 'allow'
                                                                    ? 'bg-up text-on-brand'
                                                                    : 'bg-brand text-brand-ink'
                                                            : 'text-faint hover:bg-hover',
                                                    )}
                                                >
                                                    {tx(lang, `admin.access.${state}` as StringKey)}
                                                </button>
                                            ))}
                                        </span>
                                    </li>
                                );
                            })}
                        </ul>
                    </section>
                ))}

                <div className="flex justify-end gap-2">
                    <button type="button" className="btn btn-ghost h-9 px-4 text-[12px]" disabled={saving} onClick={() => reset(false)}>
                        {tx(lang, 'dialog.close')}
                    </button>
                    <button type="button" className="btn btn-primary h-9 px-4 text-[12px]" disabled={saving} onClick={save}>
                        {saving && <Loader2 className="animate-spin" />}
                        {tx(lang, 'admin.access.save')}
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default UserAccessDialog;
