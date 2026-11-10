// Who may do what, in one place.
//
// The same matrix is read twice: the server guards (`lib/authz-server.ts`) consult it directly, and
// `lib/better-auth/auth.ts` hands it to better-auth's admin plugin as access-control roles, so the
// plugin's own endpoints enforce exactly the same rules. One definition, two consumers — they
// cannot drift.
//
// Client-safe: no server imports, so the shell can filter navigation with it.

/** A resource and the actions it carries. The first two resources are better-auth's own. */
export const STATEMENTS = {
    user: ['list', 'get', 'ban', 'update', 'set-password', 'set-role', 'delete', 'entitlements'],
    session: ['list', 'revoke'],
    // What the site publishes: the notice bar and the waitlist.
    content: ['view', 'manage'],
    // Feature flags.
    flag: ['manage'],
    // The operations panel.
    ops: ['view'],
} as const;

export type Resource = keyof typeof STATEMENTS;
type ActionsOf<R extends Resource> = (typeof STATEMENTS)[R][number];
/** A capability is written `resource:action`, e.g. `user:ban`. */
export type Capability = { [R in Resource]: `${R}:${ActionsOf<R>}` }[Resource];

export const ROLES = ['user', 'viewer', 'support', 'moderator', 'admin'] as const;
export type Role = (typeof ROLES)[number];

// The approved matrix, written as the bundles a role carries. Later roles extend earlier ones.
const VIEWER = ['user:list', 'user:get', 'session:list', 'content:view', 'ops:view'] as const;
const SUPPORT = [...VIEWER, 'session:revoke', 'user:ban', 'user:update', 'user:set-password'] as const;
const MODERATOR = [...SUPPORT, 'content:manage', 'user:entitlements'] as const;
const ADMIN = [...MODERATOR, 'user:set-role', 'user:delete', 'flag:manage'] as const;

export const PERMISSIONS: Record<Role, readonly Capability[]> = {
    user: [],
    viewer: VIEWER,
    support: SUPPORT,
    moderator: MODERATOR,
    admin: ADMIN,
};

export const isRole = (value: unknown): value is Role =>
    typeof value === 'string' && (ROLES as readonly string[]).includes(value);

export const capabilitiesOf = (role: Role): readonly Capability[] => PERMISSIONS[role];

export const can = (role: Role, capability: Capability): boolean => PERMISSIONS[role].includes(capability);

export const hasAnyCapability = (role: Role, capabilities: readonly Capability[]): boolean =>
    capabilities.some((capability) => can(role, capability));

/** A staff member is any role that can do at least one thing; plain `user` can do nothing. */
export const isStaff = (role: Role): boolean => PERMISSIONS[role].length > 0;

/**
 * The role a user record resolves to. better-auth can hold several roles comma-separated
 * (`"admin,user"`), so the strongest one wins; anything unknown, missing or empty is a plain user.
 */
export const roleOf = (user: { role?: string | null } | null | undefined): Role => {
    const raw = typeof user?.role === 'string' ? user.role : '';
    const named = raw.split(',').map((part) => part.trim()).filter(isRole);
    if (named.length === 0) return 'user';
    return named.reduce((best, role) => (capabilitiesOf(role).length > capabilitiesOf(best).length ? role : best));
};

/** The matrix grouped by resource — the shape better-auth's access control wants. */
export const groupByResource = (role: Role): Record<string, string[]> => {
    const grouped: Record<string, string[]> = {};
    for (const capability of PERMISSIONS[role]) {
        const [resource, action] = capability.split(':') as [string, string];
        (grouped[resource] ??= []).push(action);
    }
    return grouped;
};

/** The roles a staff member can hand out, strongest last. Never includes plain `user` twice. */
export const ASSIGNABLE_ROLES = ROLES;
