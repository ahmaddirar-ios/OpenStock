'use client';

import { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';

// One field and a button: an email is the whole ask, and the API is idempotent so a second
// submit is answered the same way instead of "already on the list".
export default function WaitlistForm({ plan = 'cloud' }: { plan?: string }) {
    const [email, setEmail] = useState('');
    const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
    const [message, setMessage] = useState('');

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (state === 'busy') return;
        setState('busy');
        setMessage('');
        try {
            const res = await fetch('/api/waitlist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, plan }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setState('error');
                setMessage(data?.error ?? 'Something went wrong. Try again.');
                return;
            }
            setState('done');
        } catch {
            setState('error');
            setMessage('Network error. Try again.');
        }
    };

    if (state === 'done') {
        return (
            <p className="flex items-center gap-2 text-[14px] font-semibold text-brand-ink">
                <Check className="size-4" /> You are on the list. We will write when Cloud opens.
            </p>
        );
    }

    return (
        <div className="w-full">
            <form onSubmit={submit} className="flex w-full flex-col gap-2 sm:flex-row">
                <label className="sr-only" htmlFor="waitlist-email">Email address</label>
                <input
                    id="waitlist-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="h-11 min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.03] px-4 text-[15px] outline-none transition-colors placeholder:text-faint focus:border-brand-ink/60"
                />
                <button type="submit" disabled={state === 'busy'} className="btn btn-primary h-11 px-5 text-[15px] disabled:opacity-60">
                    {state === 'busy' ? <Loader2 className="size-4 animate-spin" /> : 'Join the waitlist'}
                </button>
            </form>
            {state === 'error' && <p role="alert" className="mt-2 text-[13px] text-red-400">{message}</p>}
        </div>
    );
}
