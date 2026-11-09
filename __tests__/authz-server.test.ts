// The guards: what a session may do, and what happens when it may not.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getSession, redirect } = vi.hoisted(() => ({
    getSession: vi.fn(),
    redirect: vi.fn((path: string) => {
        throw new Error(`REDIRECT:${path}`);
    }),
}));

vi.mock('@/lib/better-auth/auth', () => ({ getSession }));
vi.mock('next/navigation', () => ({ redirect }));

import { Forbidden, Unauthorized, currentCapabilities, currentUser, requireCapability, requireCapabilityPage, requireStaffPage } from '@/lib/authz-server';

const session = (role?: string) => ({ user: { id: 'u1', name: 'Ahmad', email: 'a@b.c', ...(role === undefined ? {} : { role }) } });

beforeEach(() => {
    getSession.mockReset();
    redirect.mockClear();
});

describe('currentUser', () => {
    it('returns null when signed out', async () => {
        getSession.mockResolvedValue(null);
        expect(await currentUser()).toBeNull();
        expect(await currentCapabilities()).toEqual([]);
    });

    it('resolves the role, defaulting an unknown one to user', async () => {
        getSession.mockResolvedValue(session('moderator'));
        expect((await currentUser())?.role).toBe('moderator');
        getSession.mockResolvedValue(session());
        expect((await currentUser())?.role).toBe('user');
        getSession.mockResolvedValue(session('wizard'));
        expect((await currentUser())?.role).toBe('user');
    });
});

describe('requireCapability', () => {
    it('throws Unauthorized when signed out', async () => {
        getSession.mockResolvedValue(null);
        await expect(requireCapability('user:list')).rejects.toBeInstanceOf(Unauthorized);
    });

    it('throws Forbidden when the role lacks the capability, naming it', async () => {
        getSession.mockResolvedValue(session('support'));
        await expect(requireCapability('user:set-role')).rejects.toBeInstanceOf(Forbidden);
        await expect(requireCapability('user:set-role')).rejects.toMatchObject({ capability: 'user:set-role' });
    });

    it('returns the user when the role holds it', async () => {
        getSession.mockResolvedValue(session('moderator'));
        expect((await requireCapability('content:manage')).role).toBe('moderator');
    });
});

describe('the page guards', () => {
    it('sends a signed-out reader to sign-in', async () => {
        getSession.mockResolvedValue(null);
        await expect(requireStaffPage()).rejects.toThrow('REDIRECT:/sign-in');
        await expect(requireCapabilityPage('ops:view')).rejects.toThrow('REDIRECT:/sign-in');
    });

    it('sends a plain user to the overview', async () => {
        getSession.mockResolvedValue(session());
        await expect(requireStaffPage()).rejects.toThrow('REDIRECT:/dashboard');
        await expect(requireCapabilityPage('ops:view')).rejects.toThrow('REDIRECT:/dashboard');
    });

    it('lets a viewer into the panel but not into a section it cannot open', async () => {
        getSession.mockResolvedValue(session('viewer'));
        expect((await requireStaffPage()).role).toBe('viewer');
        expect((await requireCapabilityPage('ops:view')).role).toBe('viewer');
        await expect(requireCapabilityPage('flag:manage')).rejects.toThrow('REDIRECT:/dashboard');
    });
});
