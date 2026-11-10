// The server side of entitlements: read an account's plan and exceptions, resolve the features it
// holds, and refuse the pages it may not open.
//
// One read per request: `accessFor` is wrapped in React's cache, so the layout, the page guard and
// the chart all pay for one pair of queries. A failed read resolves to the free plan rather than
// opening everything — an entitlement lookup must never become a permission bypass.
//
// Staff are not customers: every role that can open the admin panel holds the whole catalogue, so a
// support account never loses the tools it needs to help someone. That decision lives here, once.

import { cache } from 'react';
import { redirect } from 'next/navigation';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/database/mongoose';
import { Entitlement } from '@/database/models/entitlement.model';
import { FEATURES, isFeature, isPlan, resolveFeatures, type Feature, type Plan } from '@/lib/plans';
import { featureOfDrawing, featureOfStudy } from '@/lib/tools/access';
import type { ChartSetup } from '@/lib/chart/setup';
import { Unauthorized, currentUser } from '@/lib/authz-server';
import { isStaff, roleOf } from '@/lib/authz';

export type Access = {
    userId: string;
    plan: Plan;
    features: readonly Feature[];
    /** The stored rows, so the admin editor can show what is deliberate instead of what is derived. */
    allow: readonly Feature[];
    deny: readonly Feature[];
    /** Staff see the whole catalogue, whatever the plan row says. */
    staff: boolean;
};

const readAccess = async (userId: string): Promise<Access> => {
    try {
        await connectToDatabase();
        const db = (await connectToDatabase()).connection.db;
        const keys = /^[a-fA-F0-9]{24}$/.test(userId) ? [userId, new ObjectId(userId)] : [userId];
        const [user, row] = await Promise.all([
            // The role lives on the better-auth `user` document, keyed by `_id`.
            db
                ? db.collection('user').findOne({ _id: { $in: keys as never } }, { projection: { role: 1 } })
                : Promise.resolve(null),
            Entitlement.findOne({ userId }, { plan: 1, allow: 1, deny: 1 }).lean(),
        ]);

        const staff = isStaff(roleOf({ role: (user?.role as string | null) ?? null }));
        const plan = isPlan(row?.plan) ? row.plan : 'free';
        const allow = (row?.allow ?? []).filter(isFeature);
        const deny = (row?.deny ?? []).filter(isFeature);
        return {
            userId,
            plan,
            allow,
            deny,
            staff,
            features: staff ? [...FEATURES] : resolveFeatures(plan, allow, deny),
        };
    } catch {
        return { userId, plan: 'free', allow: [], deny: [], staff: false, features: resolveFeatures('free') };
    }
};

/** Cached for one request: the layout, the page and the client props share this. */
export const accessFor = cache(readAccess);

/** The signed-in account's access, or null when signed out. */
export const currentAccess = async (): Promise<Access | null> => {
    const user = await currentUser();
    return user ? accessFor(user.id) : null;
};

/** For pages: an account without the feature is sent to the tools hub, which it can always open. */
export const requireFeaturePage = async (feature: Feature): Promise<Access> => {
    const access = await currentAccess();
    if (!access) redirect('/sign-in');
    if (!access.features.includes(feature)) redirect('/tools?locked=' + encodeURIComponent(feature));
    return access;
};

/** For actions: throws when the caller's plan does not include the feature. */
export const requireFeature = async (feature: Feature): Promise<Access> => {
    const access = await currentAccess();
    if (!access) throw new Unauthorized();
    if (!access.features.includes(feature)) throw new Error(`Your plan does not include ${feature}`);
    return access;
};

/**
 * The setup the chart may keep. Drawings and studies outside the account's features are dropped, not
 * rejected: a downgrade must not leave the chart unopenable, and the next save stores the trimmed set.
 */
export const filterSetupByFeatures = (setup: ChartSetup, features: readonly Feature[]): ChartSetup => ({
    drawings: setup.drawings.filter((drawing) => features.includes(featureOfDrawing(drawing.tool))),
    studies: setup.studies.filter((study) => features.includes(featureOfStudy(study.id))),
});
