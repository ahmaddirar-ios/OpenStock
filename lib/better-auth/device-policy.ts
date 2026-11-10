// One device at a time.
//
// better-auth writes a row to `session` on every sign-in. That row is the only record of a device,
// so the policy is applied right after it exists: everything older is deleted and the newest stays.
// The previous device loses its session within one cookie-cache window and is sent back to sign-in.
//
// Pure and client-safe on purpose: `__tests__/device-policy.test.ts` locks the selection, and the
// auth config is the only consumer, so raising the limit to two devices is a one-line change.

/** How many devices may hold a session at once. One means a new sign-in kicks the old device out. */
export const MAX_ACTIVE_SESSIONS = 1;

export type SessionRef = {
    id: string;
    createdAt?: Date | string | null;
};

const createdAt = (session: SessionRef): number => {
    const at = session.createdAt ? new Date(session.createdAt).getTime() : 0;
    return Number.isFinite(at) ? at : 0;
};

/**
 * The sessions that must be deleted so at most `max` remain, always keeping `keepId`.
 *
 * The kept session counts towards the limit, and the survivors are the newest by `createdAt`. A row
 * without a usable timestamp sorts as oldest, so a malformed record can never outlive a real one.
 */
export const sessionsToRevoke = <T extends SessionRef>(
    sessions: readonly T[],
    keepId: string,
    max: number = MAX_ACTIVE_SESSIONS,
): T[] => {
    const kept = sessions.some((session) => session.id === keepId) ? 1 : 0;
    const others = sessions
        .filter((session) => session.id !== keepId)
        .sort((a, b) => createdAt(b) - createdAt(a));
    return others.slice(Math.max(0, max - kept));
};
