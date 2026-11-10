// One-device policy: the session rows a sign-in should evict, and the edge cases that would
// otherwise sign the wrong device out.
import { describe, expect, it } from 'vitest';
import { MAX_ACTIVE_SESSIONS, sessionsToRevoke, type SessionRef } from '@/lib/better-auth/device-policy';

const at = (minute: number) => new Date(Date.UTC(2026, 10, 9, 12, minute));

const session = (id: string, minute: number): SessionRef => ({ id, createdAt: at(minute) });

describe('sessionsToRevoke', () => {
    it('keeps the new session and evicts every older one', () => {
        const rows = [session('old-phone', 1), session('laptop', 2), session('new-phone', 3)];
        expect(sessionsToRevoke(rows, 'new-phone').map((row) => row.id)).toEqual(['laptop', 'old-phone']);
    });

    it('evicts nothing when the new session is the only one', () => {
        expect(sessionsToRevoke([session('only', 1)], 'only')).toEqual([]);
    });

    it('allows a larger cap, keeping the newest sessions', () => {
        const rows = [session('a', 1), session('b', 2), session('c', 3), session('d', 4)];
        expect(sessionsToRevoke(rows, 'd', 2).map((row) => row.id)).toEqual(['b', 'a']);
    });

    it('still evicts down to the cap when the kept id is unknown', () => {
        const rows = [session('a', 1), session('b', 2)];
        expect(sessionsToRevoke(rows, 'ghost', 1).map((row) => row.id)).toEqual(['a']);
    });

    it('treats a missing timestamp as oldest', () => {
        const rows: SessionRef[] = [{ id: 'legacy' }, session('fresh', 5)];
        expect(sessionsToRevoke(rows, 'fresh').map((row) => row.id)).toEqual(['legacy']);
    });

    it('does not mutate the input order', () => {
        const rows = [session('a', 1), session('b', 2)];
        sessionsToRevoke(rows, 'b');
        expect(rows.map((row) => row.id)).toEqual(['a', 'b']);
    });

    it('ships with a one-device limit', () => {
        expect(MAX_ACTIVE_SESSIONS).toBe(1);
    });
});
