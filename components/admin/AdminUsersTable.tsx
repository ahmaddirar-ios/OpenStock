'use client';

import { useState, useTransition } from 'react';
import { Ban, Loader2, Search, ShieldCheck, Trash2, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import {
    banUserRecord,
    listUsers,
    removeUserRecord,
    setUserRole,
    unbanUserRecord,
    type AdminUser,
    type AdminUserPage,
} from '@/lib/actions/admin-users.actions';
import { ROLES, type Role } from '@/lib/authz';
import { tx, type Lang, type StringKey } from '@/lib/i18n';
import { cn } from '@/lib/utils';

type Props = {
    lang: Lang;
    initial: AdminUserPage;
    meId: string;
    can: { setRole: boolean; ban: boolean; delete: boolean };
};

/**
 * The account table. It never decides what is allowed — every button calls a guarded action and
 * reports the refusal. What it does decide is what is worth showing: a role select only where the
 * viewer may set one, and no destructive control on the viewer's own row.
 */
const AdminUsersTable = ({ lang, initial, meId, can }: Props) => {
    const [page, setPage] = useState<AdminUserPage>(initial);
    const [search, setSearch] = useState('');
    const [busy, setBusy] = useState<string | null>(null);
    const [, startTransition] = useTransition();

    const load = (nextSearch: string, nextOffset: number) => {
        setBusy('page');
        startTransition(async () => {
            try {
                setPage(await listUsers({ search: nextSearch, offset: nextOffset, limit: page.limit }));
            } catch {
                toast.error(tx(lang, 'admin.error'));
            } finally {
                setBusy(null);
            }
        });
    };

    const submitSearch = (event: React.FormEvent) => {
        event.preventDefault();
        load(search, 0);
    };

    const patch = (id: string, change: Partial<AdminUser>) =>
        setPage((current) => ({ ...current, users: current.users.map((user) => (user.id === id ? { ...user, ...change } : user)) }));

    const act = (id: string, kind: string, run: () => Promise<unknown>, done: Partial<AdminUser>) => {
        setBusy(`${kind}:${id}`);
        startTransition(async () => {
            try {
                await run();
                patch(id, done);
                toast.success(tx(lang, 'admin.saved'));
            } catch (error) {
                toast.error(error instanceof Error ? error.message : tx(lang, 'admin.error'));
            } finally {
                setBusy(null);
            }
        });
    };

    const changeRole = (user: AdminUser, role: string) => {
        if (!ROLES.includes(role as Role)) return;
        act(user.id, 'role', () => setUserRole(user.id, role), { role: role as Role, storedRole: role });
    };

    const ban = (user: AdminUser) => act(user.id, 'ban', () => banUserRecord(user.id, tx(lang, 'admin.users.banReason')), { banned: true });
    const unban = (user: AdminUser) => act(user.id, 'ban', () => unbanUserRecord(user.id), { banned: false });
    const remove = (user: AdminUser) => {
        if (!window.confirm(tx(lang, 'admin.users.removeConfirm').replace('{email}', user.email))) return;
        setBusy(`remove:${user.id}`);
        startTransition(async () => {
            try {
                await removeUserRecord(user.id);
                setPage((current) => ({ ...current, users: current.users.filter((row) => row.id !== user.id), total: Math.max(0, current.total - 1) }));
                toast.success(tx(lang, 'admin.saved'));
            } catch (error) {
                toast.error(error instanceof Error ? error.message : tx(lang, 'admin.error'));
            } finally {
                setBusy(null);
            }
        });
    };

    const from = page.total === 0 ? 0 : page.offset + 1;
    const to = Math.min(page.offset + page.users.length, page.total);

    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
                <form onSubmit={submitSearch} className="flex min-w-0 flex-1 items-center gap-2">
                    <div className="relative flex min-w-0 flex-1 items-center">
                        <Search className="pointer-events-none absolute start-3 size-3.5 text-faint" />
                        <input
                            type="search"
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder={tx(lang, 'admin.users.searchPlaceholder')}
                            aria-label={tx(lang, 'admin.users.search')}
                            className="form-input ps-9"
                        />
                    </div>
                    <button type="submit" className="btn btn-ghost h-9 px-3 text-[12px]" disabled={busy === 'page'}>
                        {busy === 'page' ? <Loader2 className="animate-spin" /> : <Search />}
                        {tx(lang, 'admin.users.search')}
                    </button>
                </form>
                <span className="num text-[12px] text-faint">
                    {tx(lang, 'admin.users.count').replace('{from}', String(from)).replace('{to}', String(to)).replace('{total}', String(page.total))}
                </span>
            </div>

            {page.users.length === 0 ? (
                <p className="empty-state">{tx(lang, 'admin.users.empty')}</p>
            ) : (
                <div className="overflow-x-auto">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>{tx(lang, 'admin.users.name')}</th>
                                <th>{tx(lang, 'admin.users.role')}</th>
                                <th>{tx(lang, 'admin.users.status')}</th>
                                <th>{tx(lang, 'admin.users.joined')}</th>
                                <th className="text-end">{tx(lang, 'admin.users.actions')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {page.users.map((user) => {
                                const self = user.id === meId;
                                const rowBusy = busy?.endsWith(`:${user.id}`);
                                return (
                                    <tr key={user.id}>
                                        <td>
                                            <span className="flex items-center gap-2">
                                                <span className="grid size-7 flex-none place-items-center rounded-full bg-brand-soft text-[11px] font-bold text-brand-ink">
                                                    {user.name?.[0]?.toUpperCase() ?? user.email[0]?.toUpperCase() ?? '?'}
                                                </span>
                                                <span className="min-w-0">
                                                    <span className="block truncate font-semibold">
                                                        {user.name || '—'}
                                                        {self && <span className="pill ms-1.5">{tx(lang, 'admin.users.you')}</span>}
                                                    </span>
                                                    <span className="block truncate text-[11px] text-faint" dir="ltr">{user.email}</span>
                                                </span>
                                            </span>
                                        </td>
                                        <td>
                                            {can.setRole && !self ? (
                                                <select
                                                    className="form-input h-8 w-32 text-[12px]"
                                                    value={user.role}
                                                    disabled={rowBusy}
                                                    onChange={(event) => changeRole(user, event.target.value)}
                                                    aria-label={tx(lang, 'admin.users.role')}
                                                >
                                                    {ROLES.map((role) => (
                                                        <option key={role} value={role}>{tx(lang, `admin.role.${role}` as StringKey)}</option>
                                                    ))}
                                                </select>
                                            ) : (
                                                <span className="pill is-brand">{tx(lang, `admin.role.${user.role}` as StringKey)}</span>
                                            )}
                                        </td>
                                        <td>
                                            <span className={cn('pill', user.banned ? 'is-down' : 'is-up')}>
                                                {tx(lang, user.banned ? 'admin.users.banned' : 'admin.users.active')}
                                            </span>
                                        </td>
                                        <td className="num text-[12px] text-faint" dir="ltr">{user.createdAt?.slice(0, 10) ?? '—'}</td>
                                        <td>
                                            <span className="flex justify-end gap-1.5">
                                                {can.ban && !self && (
                                                    <button type="button" className="btn btn-ghost h-7 px-2 text-[11px]" disabled={rowBusy} onClick={() => (user.banned ? unban(user) : ban(user))}>
                                                        {rowBusy ? <Loader2 className="animate-spin" /> : user.banned ? <Undo2 /> : <Ban />}
                                                        {tx(lang, user.banned ? 'admin.users.unban' : 'admin.users.ban')}
                                                    </button>
                                                )}
                                                {can.delete && !self && (
                                                    <button type="button" className="btn btn-ghost h-7 px-2 text-[11px] text-down" disabled={rowBusy} onClick={() => remove(user)}>
                                                        <Trash2 />
                                                        {tx(lang, 'admin.users.remove')}
                                                    </button>
                                                )}
                                                {self && (
                                                    <span className="pill">
                                                        <ShieldCheck className="size-3" />
                                                        {tx(lang, 'admin.users.self')}
                                                    </span>
                                                )}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            <div className="flex items-center justify-end gap-2">
                <button type="button" className="btn btn-ghost h-8 px-3 text-[12px]" disabled={page.offset === 0 || busy === 'page'} onClick={() => load(search, Math.max(0, page.offset - page.limit))}>
                    {tx(lang, 'admin.users.prev')}
                </button>
                <button type="button" className="btn btn-ghost h-8 px-3 text-[12px]" disabled={page.offset + page.limit >= page.total || busy === 'page'} onClick={() => load(search, page.offset + page.limit)}>
                    {tx(lang, 'admin.users.next')}
                </button>
            </div>
        </div>
    );
};

export default AdminUsersTable;
