// The server side of authorization: read the session once, resolve the role, and refuse anything the
// matrix does not allow. Pages redirect; actions throw a typed error the caller turns into a result.
//
// Never trust a role sent from the client. Every guard reads it from the session.

import { redirect } from 'next/navigation';
import { getSession } from '@/lib/better-auth/auth';
import { can, capabilitiesOf, isStaff, roleOf, type Capability, type Role } from '@/lib/authz';

export type AuthUser = {
    id: string;
    name: string;
    email: string;
    role: Role;
};

export class Unauthorized extends Error {
    constructor() {
        super('Unauthorized');
        this.name = 'Unauthorized';
    }
}

export class Forbidden extends Error {
    readonly capability: Capability;
    constructor(capability: Capability) {
        super(`Forbidden: ${capability}`);
        this.name = 'Forbidden';
        this.capability = capability;
    }
}

/** The signed-in user with a resolved role, or null. */
export const currentUser = async (): Promise<AuthUser | null> => {
    const session = await getSession();
    const user = session?.user;
    if (!user) return null;
    return {
        id: user.id,
        name: user.name ?? '',
        email: user.email ?? '',
        role: roleOf(user as { role?: string | null }),
    };
};

/** The capabilities the signed-in user holds. */
export const currentCapabilities = async (): Promise<readonly Capability[]> => {
    const user = await currentUser();
    return user ? capabilitiesOf(user.role) : [];
};

/** For actions: throws when the caller may not do this. */
export const requireCapability = async (capability: Capability): Promise<AuthUser> => {
    const user = await currentUser();
    if (!user) throw new Unauthorized();
    if (!can(user.role, capability)) throw new Forbidden(capability);
    return user;
};

/** For pages: sends a signed-out reader to sign-in, and a signed-in one to the overview. */
export const requireStaffPage = async (): Promise<AuthUser> => {
    const user = await currentUser();
    if (!user) redirect('/sign-in');
    if (!isStaff(user.role)) redirect('/dashboard');
    return user;
};

/** For pages: like `requireStaffPage`, but for one capability. */
export const requireCapabilityPage = async (capability: Capability): Promise<AuthUser> => {
    const user = await currentUser();
    if (!user) redirect('/sign-in');
    if (!can(user.role, capability)) redirect('/dashboard');
    return user;
};
