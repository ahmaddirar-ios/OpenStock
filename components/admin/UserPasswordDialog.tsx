'use client';

// Setting a customer's password from the admin panel.
//
// This exists for the case a reset email cannot solve — the customer lost access to their mailbox,
// or the address was mistyped at sign-up. The server action calls better-auth's admin endpoint, which
// signs every session out; the dialog says so instead of surprising them. Nothing is ever shown back:
// the admin chooses a password, hands it over out of band, and cannot read it afterwards.

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
} from '@/components/ui/dialog';
import { setUserPasswordRecord, type AdminUser } from '@/lib/actions/admin-users.actions';
import { tx, type Lang } from '@/lib/i18n';

type Props = {
    lang: Lang;
    user: AdminUser;
    open: boolean;
    onOpenChange: (open: boolean) => void;
};

const UserPasswordDialog = ({ lang, user, open, onOpenChange }: Props) => {
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    const reset = (next: boolean) => {
        if (next) {
            setPassword('');
            setConfirm('');
            setError(null);
        }
        onOpenChange(next);
    };

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (password.length < 8) {
            setError(tx(lang, 'admin.password.tooShort'));
            return;
        }
        if (password !== confirm) {
            setError(tx(lang, 'admin.password.mismatch'));
            return;
        }
        setSaving(true);
        setError(null);
        try {
            await setUserPasswordRecord(user.id, password);
            toast.success(tx(lang, 'admin.saved'));
            reset(false);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : tx(lang, 'admin.error'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={reset}>
            <DialogContent className="sm:max-w-[420px] gap-4" closeLabel={tx(lang, 'dialog.close')}>
                <div>
                    <DialogTitle className="text-[16px] font-bold tracking-[-0.02em]">
                        {tx(lang, 'admin.password.title').replace('{email}', user.email)}
                    </DialogTitle>
                    <DialogDescription className="mt-1 text-[12px] leading-relaxed text-faint">
                        {tx(lang, 'admin.password.sub')}
                    </DialogDescription>
                </div>

                <form onSubmit={submit} className="flex flex-col gap-3">
                    <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-faint">
                        {tx(lang, 'admin.password.field')}
                        <input
                            type="password"
                            autoComplete="new-password"
                            dir="ltr"
                            className="form-input h-9 text-[13px] normal-case tracking-normal text-foreground"
                            value={password}
                            disabled={saving}
                            onChange={(event) => setPassword(event.target.value)}
                        />
                    </label>
                    <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-faint">
                        {tx(lang, 'admin.password.confirm')}
                        <input
                            type="password"
                            autoComplete="new-password"
                            dir="ltr"
                            className="form-input h-9 text-[13px] normal-case tracking-normal text-foreground"
                            value={confirm}
                            disabled={saving}
                            onChange={(event) => setConfirm(event.target.value)}
                        />
                    </label>

                    {error && <p className="text-[11.5px] text-down" role="alert">{error}</p>}

                    <div className="flex justify-end gap-2">
                        <button type="button" className="btn btn-ghost h-9 px-4 text-[12px]" disabled={saving} onClick={() => reset(false)}>
                            {tx(lang, 'dialog.close')}
                        </button>
                        <button type="submit" className="btn btn-primary h-9 px-4 text-[12px]" disabled={saving || !password || !confirm}>
                            {saving && <Loader2 className="animate-spin" />}
                            {tx(lang, 'admin.password.save')}
                        </button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
};

export default UserPasswordDialog;
