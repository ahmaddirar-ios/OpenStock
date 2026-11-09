// One catalog for every tool the chart offers: the 79 drawings, the 27 studies, the 11 chart types
// and the 15 formula functions. It exists so that four things can never disagree about a tool again
// — the rail, the menus, the search palette, and the guide that will be written from it.
//
// The catalog carries *addresses*, not prose: a name is an i18n key, so the strings keep living in
// lib/i18n.ts and a translation is added in one place. It carries what a picker needs and a reader
// cannot infer: which section a tool belongs to, what a formula function's ready example looks
// like, and how many clicks a drawing asks for.
//
// Nothing here holds behaviour. A drawing's geometry lives in lib/chart/drawings.ts, a study's maths
// in lib/chart/studies.ts, an expression in lib/formula/formula.ts — this file only knows they exist.

import { TOOL_DEFS, type ShapeTool, type ToolGroup } from '@/lib/chart/drawings';
import { STUDIES, STUDY_IDS } from '@/lib/chart/studies';
import { CHART_TYPE_KEYS, CHART_TYPES, type ChartType } from '@/lib/chart/view';
import { FORMULA_FUNCTIONS } from '@/lib/formula/formula';
import { TOOL_SHORTCUTS } from '@/lib/chart/hotkeys';
import { TOOL_LABEL_KEYS } from '@/lib/chart/drawing-groups';
import { tx, type Lang, type StringKey } from '@/lib/i18n';

export type ToolFamily = 'drawing' | 'study' | 'chartType' | 'formula';

export type ToolSectionId =
    | ToolGroup
    | 'study.overlay'
    | 'study.oscillator'
    | 'chart.type'
    | 'formula.average'
    | 'formula.stat'
    | 'formula.cross'
    | 'formula.math'
    | 'formula.logic';

export type ToolEntry = {
    /** Unique across the four families: `drawing:trend`, `study:sma`, `chartType:pnf`. */
    id: string;
    /** The family's own name for it — what an insert handler switches on. */
    key: string;
    family: ToolFamily;
    section: ToolSectionId;
    nameKey: StringKey;
    /** A ready expression, for the formula functions: one click and the study is filled in. */
    example?: string;
    /** How many chart clicks a drawing asks for. */
    clicks?: number;
    /** The bare letter that arms it. */
    hotkey?: string;
    /** Synonyms a trader would type. The translated name is matched without any entry here. */
    keywords: readonly string[];
    /** Retired from the pickers; still a valid stored drawing, so the catalog keeps it. */
    hidden?: boolean;
};

export type ToolSection = {
    id: ToolSectionId;
    family: ToolFamily;
    nameKey: StringKey;
    /** What the section is for, printed under its heading in the palette. */
    summaryKey?: StringKey;
};

/** The order a trader already knows from the rail, then the studies, then the rest. */
export const TOOL_SECTIONS: readonly ToolSection[] = [
    { id: 'cursor', family: 'drawing', nameKey: 'chart.group.cursor' },
    { id: 'lines', family: 'drawing', nameKey: 'chart.group.lines' },
    { id: 'fib', family: 'drawing', nameKey: 'chart.group.fib' },
    { id: 'gann', family: 'drawing', nameKey: 'chart.group.gann' },
    { id: 'patterns', family: 'drawing', nameKey: 'chart.group.patterns' },
    { id: 'elliott', family: 'drawing', nameKey: 'chart.group.elliott' },
    { id: 'forecast', family: 'drawing', nameKey: 'chart.group.forecast' },
    { id: 'shapes', family: 'drawing', nameKey: 'chart.group.shapes' },
    { id: 'annotation', family: 'drawing', nameKey: 'chart.group.annotation' },
    { id: 'brush', family: 'drawing', nameKey: 'chart.group.brush' },
    { id: 'study.overlay', family: 'study', nameKey: 'study.group.overlay' },
    { id: 'study.oscillator', family: 'study', nameKey: 'study.group.oscillator' },
    { id: 'chart.type', family: 'chartType', nameKey: 'tools.section.chartType' },
    { id: 'formula.average', family: 'formula', nameKey: 'tools.section.formula.average' },
    { id: 'formula.stat', family: 'formula', nameKey: 'tools.section.formula.stat' },
    { id: 'formula.cross', family: 'formula', nameKey: 'tools.section.formula.cross' },
    { id: 'formula.math', family: 'formula', nameKey: 'tools.section.formula.math' },
    { id: 'formula.logic', family: 'formula', nameKey: 'tools.section.formula.logic' },
];

/** Synonyms a trader would actually type, in both languages. The translated name is free. */
const DRAWING_KEYWORDS: Partial<Record<ShapeTool | 'select' | 'measure', readonly string[]>> = {
    // cursor
    select: ['cursor', 'pointer', 'مؤشر', 'اختيار', 'تحديد'],
    measure: ['ruler', 'distance', 'قياس', 'مسافة', 'مسطرة'],
    // lines
    trend: ['trendline', 'line', 'خط اتجاه', 'خط', 'ميل'],
    horizontal: ['level', 'support', 'resistance', 'خط افقي', 'دعم', 'مقاومة', 'سعر'],
    vline: ['vertical', 'time', 'عمودي', 'زمن', 'تاريخ'],
    hray: ['horizontal ray', 'شعاع افقي'],
    ray: ['شعاع', 'اتجاه واحد'],
    extended: ['extension', 'ممتد'],
    cross: ['crosshair', 'تقاطع', 'صليب'],
    trendangle: ['angle', 'زاوية', 'قياس الميل'],
    info: ['السعر والزمن', 'معلومة'],
    pricetime: ['price time', 'السعر والزمن', 'مربع'],
    rectangle: ['box', 'range', 'مستطيل', 'مربع', 'نطاق'],
    xrect: ['extended box', 'مستطيل ممتد'],
    channel: ['parallel', 'قناة', 'متوازي'],
    arrow: ['سهم', 'اتجاه'],
    // fibonacci
    fib: ['fibonacci', 'retracement', 'golden', 'فيبو', 'فيبوناتشي', 'تصحيح', 'ذهبي'],
    fibext: ['extension', 'امتداد فيبو'],
    fibtrendext: ['trend extension', 'امتداد الاتجاه'],
    fibfan: ['fan', 'مروحة فيبو', 'مروحة'],
    fibchannel: ['channel', 'قناة فيبو'],
    fibtime: ['time zones', 'zones', 'زمن فيبو', 'مناطق زمنية'],
    fibarc: ['arc', 'قوس فيبو', 'قوس'],
    fibspeed: ['speed', 'resistance fan', 'سرعات', 'مروحة سرعة'],
    fibwedge: ['wedge', 'converging fan', 'وتد فيبو', 'مروحة متقاربة'],
    // gann and families
    gann: ['gann', 'جان'],
    gannfan: ['gann fan', 'مروحة جان'],
    gannbox: ['gann box', 'مربع جان'],
    gannsquare: ['square of nine', 'مربع التسعة'],
    gannsquarefixed: ['fixed square', 'مربع غان ثابت', 'مربع ثابت'],
    pitchfork: ['fork', 'median', 'شوكة', 'اندروز', 'وسيط'],
    schiffpitchfork: ['schiff', 'شوكة شيف'],
    modpitchfork: ['modified', 'شوكة معدّلة'],
    insidepitchfork: ['inside', 'شوكة داخلية'],
    regression: ['regression channel', 'قناة انحدار', 'انحدار'],
    flattop: ['جزء مسطح'],
    disjoint: ['منفصل'],
    cycles: ['cycle', 'دورة', 'دورات'],
    sine: ['sine line', 'موجة', 'جيب'],
    // patterns
    xabcd: ['harmonic', 'هارمونيك', 'نمط'],
    cypher: ['هارمونيك سايفر'],
    hs: ['head and shoulders', 'راس وكتفين', 'كتف'],
    abcd: ['ab cd', 'نمط abcd'],
    triangle: ['مثلث'],
    drives3: ['three drives', 'ثلاث دفعات'],
    wolfe: ['wolfe wave', 'wolfe', 'وولف', 'موجة وولف', 'موجات'],
    // elliott
    'ew-impulse': ['elliott', 'impulse', 'اليوت', 'دافعة', 'موجة'],
    'ew-abc': ['correction', 'abc', 'تصحيح'],
    'ew-triangle': ['مثلث اليوت'],
    'ew-double': ['double combo', 'تركيبة مزدوجة'],
    'ew-triple': ['triple combo', 'تركيبة ثلاثية'],
    'ew-count': ['count', 'عد الموجات', 'ترقيم'],
    'ew-count-abc': ['auto count', 'عد تلقائي'],
    // forecast
    longpos: ['long position', 'risk reward', 'مركز شراء', 'هدف', 'وقف'],
    shortpos: ['short position', 'مركز بيع'],
    pricerange: ['range', 'نطاق سعري'],
    daterange: ['date range', 'نطاق زمني'],
    dprange: ['date price range', 'نطاق السعر والزمن'],
    projection: ['project', 'توقع', 'إسقاط'],
    // shapes
    ellipse: ['circle', 'oval', 'دائرة', 'بيضوي', 'شكل'],
    circle: ['دائرة'],
    tri: ['triangle', 'مثلث'],
    polyline: ['multi line', 'خطوط متعددة'],
    arc: ['قوس'],
    curve: ['منحنى'],
    dcurve: ['double curve', 'منحنى مزدوج'],
    // annotation
    text: ['note', 'label', 'نص', 'تعليق', 'ملاحظة'],
    callout: ['bubble', 'فقاعة', 'تعليق'],
    balloon: ['بالون'],
    signpost: ['لافتة', 'علامة'],
    flag: ['علم'],
    pricenote: ['price label', 'سعر السهم'],
    table: ['grid', 'stats', 'جدول', 'خلايا'],
    icon: ['sticker', 'رمز', 'ملصق'],
    image: ['صورة', 'لصق'],
    // brush
    brush: ['freehand', 'pen', 'فرشاة', 'رسم حر', 'قلم'],
    highlighter: ['marker', 'قلم تظليل', 'تظليل'],
    // reading the candles
    bars: ['candles', 'شمعة', 'شموع'],
    avwap: ['anchored vwap', 'متوسط مرجح', 'vwap'],
    vprofile: ['volume profile', 'بروفايل الفوليوم', 'حجم'],
};
const hotkeyFor = new Map<string, string>(TOOL_SHORTCUTS.map((shortcut) => [shortcut.tool, shortcut.key]));

/**
 * Which formula family a function belongs to, so the reference groups itself the way a trader thinks
 * about it: the averages, the measurements, the crossings, then the arithmetic.
 */
const FORMULA_SECTIONS: Record<string, ToolSectionId> = {
    sma: 'formula.average', ema: 'formula.average', rma: 'formula.average', sum: 'formula.average',
    stdev: 'formula.stat', highest: 'formula.stat', lowest: 'formula.stat', change: 'formula.stat', rsi: 'formula.stat',
    crossover: 'formula.cross', crossunder: 'formula.cross',
    abs: 'formula.math', sqrt: 'formula.math', pow: 'formula.math', max: 'formula.math', min: 'formula.math',
    if: 'formula.logic', nz: 'formula.logic',
};

/** A one-line use of every function: the example the palette drops into a new Formula study. */
const FORMULA_EXAMPLES: Record<string, string> = {
    sma: 'sma(close, 20)',
    ema: 'ema(close, 21)',
    rma: 'rma(close, 14)',
    sum: 'sum(volume, 20)',
    stdev: 'stdev(close, 20)',
    rsi: 'rsi(close, 14)',
    highest: 'highest(high, 20)',
    lowest: 'lowest(low, 20)',
    change: 'change(close)',
    crossover: 'crossover(close, sma(close, 20)) ? close : 0',
    crossunder: 'crossunder(close, sma(close, 20)) ? close : 0',
    abs: 'abs(close - open)',
    sqrt: 'sqrt(volume)',
    pow: 'pow(close, 2)',
    max: 'max(close, sma(close, 20))',
    min: 'min(close, sma(close, 20))',
    if: 'if(close > open, close - open, 0)',
    nz: 'nz(close[1], close)',
};

const drawingEntries = (): ToolEntry[] => [
    // The two tools the rail puts above the groups: nothing is drawn, everything else is done with
    // them. They are in the catalog so "measure" is findable like any other tool.
    { id: 'drawing:select', key: 'select', family: 'drawing', section: 'cursor', nameKey: 'chart.tool.select', clicks: 1, keywords: DRAWING_KEYWORDS.select ?? [] },
    { id: 'drawing:measure', key: 'measure', family: 'drawing', section: 'cursor', nameKey: 'chart.tool.measure', clicks: 2, keywords: DRAWING_KEYWORDS.measure ?? [] },
    ...TOOL_DEFS.map((def) => ({
        id: `drawing:${def.tool}`,
        key: def.tool,
        family: 'drawing' as const,
        section: def.group,
        // The rail's own label map, so a tool cannot be called one thing in the rail and another in
        // the palette. The pattern and count tools carry their names under chart.pat.* / chart.count.*.
        nameKey: TOOL_LABEL_KEYS[def.tool],
        clicks: def.clicks,
        hotkey: hotkeyFor.get(def.tool),
        keywords: DRAWING_KEYWORDS[def.tool] ?? [],
        hidden: def.hidden,
    })),
];

const studyEntries = (): ToolEntry[] => STUDY_IDS.map((id) => {
    const def = STUDIES[id];
    return {
        id: `study:${id}`,
        key: id,
        family: 'study' as const,
        section: def.group === 'oscillator' ? ('study.oscillator' as const) : ('study.overlay' as const),
        nameKey: def.label,
        keywords: [],
    };
});

const chartTypeEntries = (): ToolEntry[] => CHART_TYPES.map((type: ChartType) => ({
    id: `chartType:${type}`,
    key: type,
    family: 'chartType' as const,
    section: 'chart.type' as const,
    nameKey: CHART_TYPE_KEYS[type],
    keywords: [],
}));

const formulaEntries = (): ToolEntry[] => FORMULA_FUNCTIONS.map((fn) => ({
    id: `formula:${fn.name}`,
    key: fn.name,
    family: 'formula' as const,
    section: FORMULA_SECTIONS[fn.name] ?? 'formula.math',
    nameKey: `tools.fn.${fn.name}` as StringKey,
    example: FORMULA_EXAMPLES[fn.name] ?? fn.signature,
    keywords: [fn.signature],
}));

export const TOOLS: readonly ToolEntry[] = [
    ...drawingEntries(),
    ...studyEntries(),
    ...chartTypeEntries(),
    ...formulaEntries(),
];

const BY_ID = new Map(TOOLS.map((entry) => [entry.id, entry]));

export const toolById = (id: string): ToolEntry | undefined => BY_ID.get(id);

/** The entries of one section, in catalog order. */
export const toolsInSection = (section: ToolSectionId): ToolEntry[] =>
    TOOLS.filter((entry) => entry.section === section);

/** The pickers never offer a retired tool; the catalog keeps it so old drawings still resolve. */
export const pickableTools = (): ToolEntry[] => TOOLS.filter((entry) => !entry.hidden);

/** Sections with what they hold, in order — the palette's default view, and the guide's outline. */
export const groupedTools = (includeHidden = false): { section: ToolSection; tools: ToolEntry[] }[] => {
    const source = includeHidden ? TOOLS : pickableTools();
    return TOOL_SECTIONS.map((section) => ({
        section,
        tools: source.filter((entry) => entry.section === section.id),
    })).filter((group) => group.tools.length > 0);
};

// --- search ------------------------------------------------------------------

/** Folds the spellings a trader might type into one: أ/إ/آ, ى, ة, ؤ, ئ, and the marks above them. */
const foldArabic = (value: string): string => value
    .replace(/[\u064B-\u0652\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ئ/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ة/g, 'ه');

/** Folded, punctuation-free text — shared with the command bar so both answer the same spellings. */
export const normaliseSearch = (value: string): string =>
    foldArabic(value.toLowerCase())
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();

/** Every string a tool answers to, in both languages, so a search is not tied to the UI language. */
const haystack = (entry: ToolEntry): string[] => [
    tx('en', entry.nameKey),
    tx('ar', entry.nameKey),
    entry.key,
    entry.example ?? '',
    ...entry.keywords,
].map(normaliseSearch).filter(Boolean);

type Scored = { entry: ToolEntry; text: string[]; order: number };

const scoreOf = (hit: Scored, query: string): number => {
    let best = 0;
    for (const text of hit.text) {
        if (text === query) best = Math.max(best, 100);
        else if (text.startsWith(query)) best = Math.max(best, 80);
        else if (text.includes(query)) best = Math.max(best, 60);
        else {
            // A multi-word query still matches when every word appears somewhere in the name.
            const words = query.split(' ').filter(Boolean);
            if (words.length > 1 && words.every((word) => text.includes(word))) best = Math.max(best, 45);
        }
    }
    // The family's own name is the last thing to answer, so a typed name always wins over an id.
    if (best === 0 && normaliseSearch(hit.entry.key).includes(query)) best = 30;
    return best;
};

/**
 * The tools that answer a query, best first and stable within a score. An empty query returns the
 * catalog in its own order, which is what the palette shows before anything is typed.
 */
export function searchTools(query: string): ToolEntry[] {
    const needle = normaliseSearch(query);
    const entries = pickableTools().map((entry, order) => ({ entry, text: haystack(entry), order }));
    if (!needle) return entries.map((hit) => hit.entry);
    return entries
        .map((hit) => ({ ...hit, score: scoreOf(hit, needle) }))
        .filter((hit) => hit.score > 0)
        .sort((a, b) => b.score - a.score || a.order - b.order)
        .map((hit) => hit.entry);
}

export const toolCount = (family: ToolFamily): number => TOOLS.filter((entry) => entry.family === family).length;

/** How the palette labels the result of a search: "12 of 127 tools". */
export const toolTotal = (): number => pickableTools().length;

/** The Arabic and English names of one tool, for a title attribute or a test. */
export const toolNames = (entry: ToolEntry, lang: Lang): string => tx(lang, entry.nameKey);
