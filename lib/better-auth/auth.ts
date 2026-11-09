import { betterAuth } from "better-auth";
import {mongodbAdapter} from "better-auth/adapters/mongodb";
import {connectToDatabase} from "@/database/mongoose";
import {nextCookies} from "better-auth/next-js";
import { headers } from "next/headers";
import { cache } from "react";
import { admin } from "better-auth/plugins";
import { createAccessControl } from "better-auth/plugins/access";
import { sendPasswordResetEmail } from "@/lib/nodemailer/reset-password";
import { ROLES, STATEMENTS, groupByResource, type Role } from "@/lib/authz";


type MongoDb = Parameters<typeof mongodbAdapter>[0];

// The authorization matrix, handed to better-auth so its own endpoints (`/admin/list-users`,
// `/admin/set-role`, …) enforce exactly the rules `lib/authz.ts` defines. Every resource is listed
// even when a role holds none of its actions, so the shape matches the statements exactly.
const ac = createAccessControl(STATEMENTS);
const roleInput = (role: Role) => {
    const grouped = groupByResource(role);
    return {
        user: grouped.user ?? [],
        session: grouped.session ?? [],
        content: grouped.content ?? [],
        flag: grouped.flag ?? [],
        ops: grouped.ops ?? [],
    };
};
// The cast is narrow: `groupByResource` returns `string[]`, but the values come from the same
// `STATEMENTS` literal better-auth types against, so every action is a real one. The matrix itself
// is proven by `__tests__/authz.test.ts`.
const ACCESS_ROLES = Object.fromEntries(
    ROLES.map((role) => [role, ac.newRole(roleInput(role) as Parameters<typeof ac.newRole>[0])]),
);

// The owner bootstraps from the environment: any account whose email is listed is an admin. It is a
// DB write, not a read-time override, so `session.user.role` and the plugin agree, and there is no
// route anywhere that can promote an account — the allowlist cannot be used to escalate.
const adminEmails = (): string[] =>
    (process.env.ADMIN_EMAILS ?? '')
        .split(',')
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean);

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const syncAdminEmails = async (db: NonNullable<MongoDb>): Promise<void> => {
    const emails = adminEmails();
    if (emails.length === 0) return;
    try {
        // Case-insensitive, and only the rows that actually need it, so a boot is one cheap write.
        await db.collection('user').updateMany(
            { email: { $in: emails.map((email) => new RegExp(`^${escapeRegExp(email)}$`, 'i')) }, role: { $ne: 'admin' } },
            { $set: { role: 'admin' } },
        );
    } catch (error) {
        console.error('Admin bootstrap failed:', error);
    }
};

// Typed from the real config, so additional user fields (country, ...) show up in session types
const createAuth = (database: MongoDb) => betterAuth({
        database: mongodbAdapter(database),
       secret: process.env.BETTER_AUTH_SECRET,
        baseURL: process.env.BETTER_AUTH_URL,
        // Onboarding answers live on the user so the profile page can show and edit them
        user: {
            additionalFields: {
                country: { type: "string", required: false },
                investmentGoals: { type: "string", required: false },
                riskTolerance: { type: "string", required: false },
                preferredIndustry: { type: "string", required: false },
            },
        },
        emailAndPassword: {
            enabled: true,
            disableSignUp: false,
            requireEmailVerification: false,
            minPasswordLength: 8,
            maxPasswordLength: 128,
            autoSignIn: true,
            // A reset is how a victim takes an account back: sign out every other session (off by default)
            revokeSessionsOnPasswordReset: true,
            sendResetPassword: async ({ user, url }) => {
                void sendPasswordResetEmail({
                    email: user.email,
                    name: user.name,
                    resetUrl: url,
                }).catch((error) => {
                    console.error('Failed to queue password reset email:', error);
                });
            },
        },
        // Signed session cookie for 5 min: pages stop paying a MongoDB round trip per request.
        // Trade-off: a revoked session can stay valid for up to 5 minutes.
        session: {
            cookieCache: { enabled: true, maxAge: 5 * 60 },
        },
        // No account linking. Sign-up doesn't verify emails, so linking a Google/GitHub identity to an
        // existing account with the same email would let someone pre-register a victim's address and
        // later capture their social sign-in. This switch also blocks explicit linking (still true in 1.7);
        // when social sign-in ships, `disableImplicitLinking: true` keeps explicit linking and drops only the email match.
        account: {
            accountLinking: { enabled: false },
        },
        // Providers stay disabled until their env vars are set
        socialProviders: {
            google: {
                enabled: !!process.env.GOOGLE_CLIENT_ID,
                clientId: process.env.GOOGLE_CLIENT_ID as string,
                clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
            },
            github: {
                enabled: !!process.env.GITHUB_CLIENT_ID,
                clientId: process.env.GITHUB_CLIENT_ID as string,
                clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
            },
        },
        plugins: [
            // Roles, bans and the admin endpoints. `adminRoles` stays `['admin']` so the plugin's
            // own routes are the strictest door; the finer roles pass through our own guards.
            admin({ defaultRole: 'user', adminRoles: ['admin'], roles: ACCESS_ROLES }),
            nextCookies(),
        ],
});

let authInstance: ReturnType<typeof createAuth> | null = null;

export const getAuth = async () => {
    if (authInstance) return authInstance;

    // Without a secret better-auth falls back to a public default anyone could forge sessions with (1.7 refuses it in
    // production too); fail here first, before connecting. Checked on first use, not at import, so `next build` needs no secrets.
    if (process.env.NODE_ENV === 'production' && !process.env.BETTER_AUTH_SECRET && !process.env.AUTH_SECRET) {
        throw new Error('BETTER_AUTH_SECRET must be set in production');
    }

    const mongoose = await connectToDatabase();
    const database = mongoose.connection.db;
    if (!database) {
        throw new Error("MongoDB connection not found!");
    }

    authInstance = createAuth(database);
    await syncAdminEmails(database);
    return authInstance;
}

type Auth = ReturnType<typeof createAuth>;

// Connects on first use, not at import: `next build` imports this module while collecting page data, and a
// top-level `await getAuth()` made every build (Docker, Railway, CI) need a reachable MongoDB.
export const auth = {
    api: new Proxy({} as Auth['api'], {
        get: (_, method) => async (...args: unknown[]) => {
            const { api } = await getAuth();
            return (api[method as keyof Auth['api']] as (...a: unknown[]) => unknown)(...args);
        },
    }),
    handler: async (request: Request) => (await getAuth()).handler(request),
};

// One session lookup per request, shared by layouts, pages and actions
export const getSession = cache(async () => auth.api.getSession({ headers: await headers() }));

// Server actions are public endpoints: never trust a userId sent from the client.
export const requireUserId = async () => {
    const session = await getSession();
    if (!session?.user) throw new Error("Unauthorized");
    return session.user.id;
}
