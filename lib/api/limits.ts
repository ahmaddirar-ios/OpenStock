import { isPlan, type Plan } from '@/lib/plans';

// The customer API's one tunable: how many requests an hour each plan buys. The feature gate
// (`api.rest`) decides whether a key may exist at all; the quota follows the plan, so an account
// that was granted the feature by hand still gets a sane ceiling (the free row).

export const API_WINDOW_SECONDS = 3600;

/** How many un-revoked keys one account may hold at once. Client-safe: the profile panel reads it. */
export const MAX_ACTIVE_KEYS = 10;

export const API_QUOTAS: Record<Plan, number> = {
    free: 60,
    pro: 600,
    premium: 3000,
};

export const apiQuotaForPlan = (plan: unknown): number =>
    isPlan(plan) ? API_QUOTAS[plan] : API_QUOTAS.free;
