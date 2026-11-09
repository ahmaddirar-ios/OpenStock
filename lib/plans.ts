// What an account may use, and the three bundles that hand it out.
//
// A *feature* is one switchable piece of the product, named after what it opens: a page
// (`page.screener`) or a family of chart tools (`tool.drawing.fib`). Features are the only unit the
// admin panel and the guards share, so a plan, an exception and a page guard can never disagree.
//
// A plan is just a bundle of features. An account can also carry two exception lists on top — allow
// adds a feature the plan lacks, deny removes one it has — and `resolveFeatures` is the single place
// that combines them. Client-safe: no server imports, so the shell can filter itself.

export const FEATURES = [
    // Pages. The ones without a feature (overview, tools, profile, help) are open to every account.
    'page.saudi',
    'page.world',
    'page.watchlist',
    'page.portfolio',
    'page.alerts',
    'page.screener',
    'page.scanner',
    'page.charts',
    'page.strategies',
    // Chart tools: one switch per drawing group, per study family, and per remaining family.
    'tool.drawing.cursor',
    'tool.drawing.lines',
    'tool.drawing.fib',
    'tool.drawing.gann',
    'tool.drawing.patterns',
    'tool.drawing.elliott',
    'tool.drawing.forecast',
    'tool.drawing.shapes',
    'tool.drawing.annotation',
    'tool.drawing.brush',
    'tool.study.overlay',
    'tool.study.oscillator',
    'tool.chartType',
    'tool.formula',
    // Account-level products that are not a page or a chart tool.
    'api.rest',
] as const;

export type Feature = (typeof FEATURES)[number];

export const PLANS = ['free', 'pro', 'premium'] as const;
export type Plan = (typeof PLANS)[number];
export const DEFAULT_PLAN: Plan = 'free';

/** The human name of each feature, grouped the way the admin panel prints it. */
export const FEATURE_GROUPS: readonly { id: string; labelKey: 'access.pages' | 'access.tools' | 'access.api'; features: readonly Feature[] }[] = [
    {
        id: 'pages',
        labelKey: 'access.pages',
        features: FEATURES.filter((feature) => feature.startsWith('page.')),
    },
    {
        id: 'tools',
        labelKey: 'access.tools',
        features: FEATURES.filter((feature) => feature.startsWith('tool.')),
    },
    {
        id: 'api',
        labelKey: 'access.api',
        features: FEATURES.filter((feature) => feature.startsWith('api.')),
    },
];

/** What each plan includes before any account-level exception. Later plans are supersets. */
export const PLAN_FEATURES: Record<Plan, readonly Feature[]> = {
    free: [
        'page.saudi',
        'page.world',
        'page.watchlist',
        'page.portfolio',
        'page.alerts',
        'page.charts',
        'tool.drawing.cursor',
        'tool.drawing.lines',
        'tool.drawing.shapes',
        'tool.drawing.annotation',
        'tool.drawing.brush',
        'tool.study.overlay',
        'tool.chartType',
    ],
    pro: [
        'page.saudi',
        'page.world',
        'page.watchlist',
        'page.portfolio',
        'page.alerts',
        'page.charts',
        'page.screener',
        'page.scanner',
        'page.strategies',
        'tool.drawing.cursor',
        'tool.drawing.lines',
        'tool.drawing.fib',
        'tool.drawing.gann',
        'tool.drawing.patterns',
        'tool.drawing.forecast',
        'tool.drawing.shapes',
        'tool.drawing.annotation',
        'tool.drawing.brush',
        'tool.study.overlay',
        'tool.study.oscillator',
        'tool.chartType',
        'tool.formula',
        'api.rest',
    ],
    // Premium is the whole catalogue. Written out rather than derived, so adding a feature forces a
    // deliberate decision about which plan first sees it.
    premium: [...FEATURES],
};

export const isPlan = (value: unknown): value is Plan =>
    typeof value === 'string' && (PLANS as readonly string[]).includes(value);

export const isFeature = (value: unknown): value is Feature =>
    typeof value === 'string' && (FEATURES as readonly string[]).includes(value);

/** Only the known feature names, deduplicated, in catalogue order. */
export const cleanFeatures = (values: readonly unknown[] | null | undefined): Feature[] => {
    if (!values) return [];
    const wanted = new Set(values.filter(isFeature));
    return FEATURES.filter((feature) => wanted.has(feature));
};

/**
 * The features an account actually holds: the plan, minus the explicit denials, plus the explicit
 * grants. Deny wins over allow, so a mistake in a grant can never override a deliberate block.
 */
export const resolveFeatures = (
    plan: Plan,
    allow: readonly unknown[] = [],
    deny: readonly unknown[] = [],
): Feature[] => {
    const held = new Set<Feature>(PLAN_FEATURES[plan]);
    for (const feature of cleanFeatures(allow)) held.add(feature);
    for (const feature of cleanFeatures(deny)) held.delete(feature);
    return FEATURES.filter((feature) => held.has(feature));
};

/** Whether a resolved set holds a feature. An undefined set means "not filtered" (registries, tests). */
export const hasFeature = (features: readonly Feature[] | undefined, feature: Feature): boolean =>
    features === undefined || features.includes(feature);

/** A page's feature, if it is gated at all. Kept here so the page registry stays declarative. */
export const PAGE_FEATURE: Partial<Record<string, Feature>> = {
    '/saudi': 'page.saudi',
    '/world': 'page.world',
    '/watchlist': 'page.watchlist',
    '/portfolio': 'page.portfolio',
    '/alerts': 'page.alerts',
    '/screener': 'page.screener',
    '/scanner': 'page.scanner',
    '/charts': 'page.charts',
    '/strategies': 'page.strategies',
};
