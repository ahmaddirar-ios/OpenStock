// The authorization matrix: every role against every capability, plus the edges that decide what an
// unknown or multi-valued role resolves to.
import { describe, expect, it } from 'vitest';
import {
    ASSIGNABLE_ROLES,
    PERMISSIONS,
    ROLES,
    can,
    capabilitiesOf,
    groupByResource,
    hasAnyCapability,
    isRole,
    isStaff,
    roleOf,
    type Role,
} from '@/lib/authz';

describe('the authorization matrix', () => {
    it('gives a plain user nothing', () => {
        expect(PERMISSIONS.user).toEqual([]);
        expect(isStaff('user')).toBe(false);
    });

    it('lets a viewer read users, content and the operations panel, and nothing else', () => {
        expect(can('viewer', 'user:list')).toBe(true);
        expect(can('viewer', 'user:get')).toBe(true);
        expect(can('viewer', 'content:view')).toBe(true);
        expect(can('viewer', 'ops:view')).toBe(true);
        expect(can('viewer', 'user:ban')).toBe(false);
        expect(can('viewer', 'content:manage')).toBe(false);
        expect(can('viewer', 'user:set-role')).toBe(false);
        expect(can('viewer', 'flag:manage')).toBe(false);
    });

    it('lets support manage accounts but not content, roles or flags', () => {
        expect(can('support', 'user:ban')).toBe(true);
        expect(can('support', 'user:update')).toBe(true);
        expect(can('support', 'user:set-password')).toBe(true);
        expect(can('support', 'session:list')).toBe(true);
        expect(can('support', 'session:revoke')).toBe(true);
        expect(can('viewer', 'session:revoke')).toBe(false);
        expect(can('support', 'content:view')).toBe(true);
        expect(can('support', 'content:manage')).toBe(false);
        expect(can('support', 'user:set-role')).toBe(false);
        expect(can('support', 'user:delete')).toBe(false);
    });

    it('lets a moderator manage content on top of support', () => {
        expect(can('moderator', 'content:manage')).toBe(true);
        expect(can('moderator', 'user:ban')).toBe(true);
        expect(can('moderator', 'user:delete')).toBe(false);
        expect(can('moderator', 'flag:manage')).toBe(false);
    });

    it('lets an admin do everything', () => {
        for (const role of ROLES) {
            for (const capability of capabilitiesOf(role)) {
                expect(can('admin', capability)).toBe(true);
            }
        }
        expect(can('admin', 'user:delete')).toBe(true);
        expect(can('admin', 'user:set-role')).toBe(true);
        expect(can('admin', 'flag:manage')).toBe(true);
    });

    it('grows monotonically: each role keeps what the one before it had', () => {
        const ladder: Role[] = ['user', 'viewer', 'support', 'moderator', 'admin'];
        for (let i = 1; i < ladder.length; i += 1) {
            for (const capability of capabilitiesOf(ladder[i - 1])) {
                expect(can(ladder[i], capability)).toBe(true);
            }
        }
    });

    it('marks every role but plain user as staff', () => {
        expect(ROLES.filter(isStaff)).toEqual(['viewer', 'support', 'moderator', 'admin']);
        expect(ASSIGNABLE_ROLES).toEqual(ROLES);
    });

    it('answers hasAnyCapability', () => {
        expect(hasAnyCapability('viewer', ['user:ban', 'ops:view'])).toBe(true);
        expect(hasAnyCapability('user', ['user:list'])).toBe(false);
    });
});

describe('roleOf', () => {
    it('reads a known role', () => {
        expect(roleOf({ role: 'support' })).toBe('support');
    });

    it('treats a missing, empty or unknown role as a plain user', () => {
        expect(roleOf(null)).toBe('user');
        expect(roleOf(undefined)).toBe('user');
        expect(roleOf({})).toBe('user');
        expect(roleOf({ role: '' })).toBe('user');
        expect(roleOf({ role: 'root' })).toBe('user');
        expect(roleOf({ role: 42 as unknown as string })).toBe('user');
    });

    it('picks the strongest of several comma-separated roles', () => {
        expect(roleOf({ role: 'user,moderator' })).toBe('moderator');
        expect(roleOf({ role: 'admin,user' })).toBe('admin');
        expect(roleOf({ role: ' viewer , support ' })).toBe('support');
    });
});

describe('isRole', () => {
    it('accepts only the five roles', () => {
        expect(isRole('admin')).toBe(true);
        expect(isRole('ADMIN')).toBe(false);
        expect(isRole('')).toBe(false);
        expect(isRole(null)).toBe(false);
        expect(isRole(1)).toBe(false);
    });
});

describe('groupByResource', () => {
    it('shapes the matrix the way access control wants it', () => {
        expect(groupByResource('viewer')).toEqual({
            user: ['list', 'get'],
            session: ['list'],
            content: ['view'],
            ops: ['view'],
        });
    });

    it('returns an empty map for a plain user', () => {
        expect(groupByResource('user')).toEqual({});
    });
});
