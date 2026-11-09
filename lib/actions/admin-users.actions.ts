'use server';

// The admin panel's account actions. Every function re-checks its capability against the session —
// the page hiding a button is a convenience, never the protection. The role a client sends is only
// ever an *input to validate*, never a trusted fact.

import { headers } from 'next/headers';
import { auth } from '@/lib/better-auth/auth';
import { currentUser, requireCapability } from '@/lib/authz-server';
import { isRole, roleOf, type Role } from '@/lib/authz';

export type AdminUser = {
    id: string;
    name: string;
    email: string;
    /** The role the matrix resolves — the strongest of the stored values. */
    role: Role;
    /** The raw stored value, so the panel can show "admin,user" as it is. */
    storedRole: string;
    banned: boolean;
    emailVerified: boolean;
    createdAt: string | null;
};

export type AdminUserPage = {
    users: AdminUser[];
    total: number;
    limit: number;
    offset: number;
};

type RawUser = {
    id: string;
    name?: string | null;
    email?: string | null;
    role?: string | null;
    banned?: boolean | null;
    emailVerified?: boolean | null;
    createdAt?: Date | string | null;
};

const toAdminUser = (row: RawUser): AdminUser => ({
    id: row.id,
    name: row.name ?? '',
    email: row.email ?? '',
    role: roleOf({ role: row.role ?? null }),
    storedRole: row.role ?? '',
    banned: row.banned === true,
    emailVerified: row.emailVerified === true,
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
});

const clamp = (value: unknown, min: number, max: number): number => {
    const number = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : min;
    return Math.min(max, Math.max(min, number));
};

/** One page of accounts, newest first, with an email-or-name search. */
export async function listUsers(input: { search?: string; offset?: number; limit?: number } = {}): Promise<AdminUserPage> {
    await requireCapability('user:list');
    const limit = clamp(input.limit, 1, 100);
    const offset = clamp(input.offset, 0, 1_000_000);
    const search = typeof input.search === 'string' ? input.search.trim().slice(0, 120) : '';

    const result = await auth.api.listUsers({
        query: {
            limit,
            offset,
            sortBy: 'createdAt',
            sortDirection: 'desc',
            ...(search
                ? {
                    searchValue: search,
                    searchField: search.includes('@') ? ('email' as const) : ('name' as const),
                    searchOperator: 'contains' as const,
                }
                : {}),
        },
        headers: await headers(),
    });

    const users = (result.users as unknown as RawUser[]).map(toAdminUser);
    return { users, total: Number(result.total ?? users.length), limit, offset };
}

/** A client-supplied role must be one of the five, or the call is refused. */
const readRole = (value: unknown): Role => {
    if (!isRole(value)) throw new Error('Unknown role');
    return value;
};

const readUserId = (value: unknown): string => {
    const id = typeof value === 'string' ? value.trim() : '';
    if (!id) throw new Error('Missing user');
    return id;
};

/** Refuse an action on your own account: a staff member must not lock themselves out. */
const refuseSelf = async (userId: string): Promise<void> => {
    const me = await currentUser();
    if (me?.id === userId) throw new Error('You cannot do that to your own account');
};

export async function setUserRole(userId: unknown, role: unknown): Promise<AdminUser | null> {
    await requireCapability('user:set-role');
    const id = readUserId(userId);
    const next = readRole(role);
    await refuseSelf(id);

    const result = await auth.api.setRole({
        body: { userId: id, role: next },
        headers: await headers(),
    });
    const user = (result as unknown as { user?: RawUser })?.user;
    return user ? toAdminUser(user) : null;
}

export async function banUserRecord(userId: unknown, reason?: unknown): Promise<void> {
    await requireCapability('user:ban');
    const id = readUserId(userId);
    await refuseSelf(id);
    const banReason = typeof reason === 'string' ? reason.trim().slice(0, 200) : '';
    await auth.api.banUser({
        body: { userId: id, ...(banReason ? { banReason } : {}) },
        headers: await headers(),
    });
}

export async function unbanUserRecord(userId: unknown): Promise<void> {
    await requireCapability('user:ban');
    const id = readUserId(userId);
    await auth.api.unbanUser({ body: { userId: id }, headers: await headers() });
}

export async function removeUserRecord(userId: unknown): Promise<void> {
    await requireCapability('user:delete');
    const id = readUserId(userId);
    await refuseSelf(id);
    await auth.api.removeUser({ body: { userId: id }, headers: await headers() });
}
