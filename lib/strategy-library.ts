// The library's content, in both languages. Keeping it out of the components means the index, the
// strategy page and the chart menu all read the same words, and the formulas are never retyped.

import type { Params, StrategyId } from '@/lib/strategies';

export type ParamField = {
    key: string;
    label: { en: string; ar: string };
    min: number;
    max: number;
    step: number;
};

export type StrategyDoc = {
    id: StrategyId;
    name: string;
    nameAr: string;
    idea: string;
    ideaAr: string;
    /** Formula lines, rendered LTR in monospace inside the RTL page. */
    formula: string[];
    entry: string;
    entryAr: string;
    exit: string;
    exitAr: string;
    risk: string;
    riskAr: string;
    failure: string;
    failureAr: string;
    category: 'trend' | 'reversion' | 'momentum' | 'breakout';
    timeframe: { en: string; ar: string };
    defaults: Params;
    paramFields: ParamField[];
};

export const CATEGORY_KEYS = ['trend', 'reversion', 'momentum', 'breakout'] as const;
export type StrategyCategory = (typeof CATEGORY_KEYS)[number];

export const STRATEGY_LIBRARY: StrategyDoc[] = [
    {
        id: 'sma-cross',
        name: 'SMA 50/200 cross',
        nameAr: 'تقاطع المتوسطين ٥٠/٢٠٠',
        idea: 'The slowest, most quoted trend filter there is: when the medium average climbs over the long one, the balance of buyers has shifted for months, not days.',
        ideaAr: 'أبطأ مرشّح اتجاه وأشهره: عندما يعبر المتوسط المتوسطُ فوق الطويل، يكون ميزان المشترين قد تغيّر على مدى أشهر لا أيام.',
        formula: ['SMA(n) = (1/n) · Σ C(t−i), i = 0 … n−1', 'Entry: SMA(50) crosses above SMA(200)', 'Exit: SMA(50) crosses below SMA(200)'],
        entry: 'The 50-period simple average closes above the 200-period one, having been at or below it on the previous bar.',
        entryAr: 'يُغلق المتوسط البسيط ٥٠ فوق المتوسط ٢٠٠ بعد أن كان مساويًا له أو دونه في الشمعة السابقة.',
        exit: 'The 50 crosses back below the 200.',
        exitAr: 'يعود المتوسط ٥٠ ويعبر تحت المتوسط ٢٠٠.',
        risk: 'A stop 8 % below the fill, and one position at a time — this rule is late by design, so the stop does the protecting.',
        riskAr: 'وقف ٨٪ تحت سعر الدخول، ومركز واحد في الوقت نفسه — هذه القاعدة متأخرة بطبيعتها، فالوقف هو ما يحمي.',
        failure: 'Sideways markets. Two averages that keep crossing and uncrossing cost the spread and the stop over and over.',
        failureAr: 'الأسواق العرضية. متوسطان يعبران بعضهما ذهابًا وإيابًا يأكلان الفارق والوقف مرة بعد مرة.',
        category: 'trend',
        timeframe: { en: 'Daily and weekly', ar: 'يومي وأسبوعي' },
        defaults: { fast: 50, slow: 200, stopPct: 8 },
        paramFields: [
            { key: 'fast', label: { en: 'Fast average', ar: 'المتوسط السريع' }, min: 2, max: 200, step: 1 },
            { key: 'slow', label: { en: 'Slow average', ar: 'المتوسط البطيء' }, min: 3, max: 400, step: 1 },
            { key: 'stopPct', label: { en: 'Stop %', ar: 'الوقف ٪' }, min: 1, max: 50, step: 0.5 },
        ],
    },
    {
        id: 'ema-cross',
        name: 'EMA 9/21 cross',
        nameAr: 'تقاطع المتوسطين الأسّيين ٩/٢١',
        idea: 'The faster cousin: exponential averages weight the latest bars more, so the cross turns earlier and whipsaws more.',
        ideaAr: 'ابن العم الأسرع: المتوسطات الأسّية تزن الشمعات الأحدث أكثر، فينعطف التقاطع أبكر ويكثر معه التذبذب.',
        formula: ['EMA(t) = α · C(t) + (1−α) · EMA(t−1)', 'α = 2 / (n + 1)', 'Entry: EMA(9) crosses above EMA(21)'],
        entry: 'The 9-period exponential average closes above the 21-period one.',
        entryAr: 'يُغلق المتوسط الأسّي ٩ فوق المتوسط ٢١.',
        exit: 'The 9 closes back below the 21.',
        exitAr: 'يعود ٩ ويُغلق تحت ٢١.',
        risk: 'An 8 % stop; expect more trades and smaller wins than the 50/200 rule.',
        riskAr: 'وقف ٨٪؛ توقّع صفقات أكثر وأرباحًا أصغر من قاعدة ٥٠/٢٠٠.',
        failure: 'Low-volatility chop. The exponential weighting reacts to noise as if it were a trend.',
        failureAr: 'التذبذب منخفض التقلب. الوزن الأسّي يتفاعل مع الضجيج كأنه اتجاه.',
        category: 'trend',
        timeframe: { en: 'Hourly to daily', ar: 'من الساعة إلى اليومي' },
        defaults: { fast: 9, slow: 21, stopPct: 8 },
        paramFields: [
            { key: 'fast', label: { en: 'Fast average', ar: 'المتوسط السريع' }, min: 2, max: 100, step: 1 },
            { key: 'slow', label: { en: 'Slow average', ar: 'المتوسط البطيء' }, min: 3, max: 200, step: 1 },
            { key: 'stopPct', label: { en: 'Stop %', ar: 'الوقف ٪' }, min: 1, max: 50, step: 0.5 },
        ],
    },
    {
        id: 'rsi-reversion',
        name: 'RSI 14 reversion',
        nameAr: 'ارتداد مؤشر القوة النسبية ١٤',
        idea: 'A mean-reversion rule: when sellers have pressed the RSI below 30 and the buyers take it back above, the exhaustion is the trade.',
        ideaAr: 'قاعدة عودة إلى المتوسط: عندما يضغط البائعون بمؤشر القوة النسبية تحت ٣٠ ثم يستعيده المشترون فوقه، يكون الإنهاك هو الصفقة.',
        formula: ['RS = avgGain(14) / avgLoss(14)', 'RSI = 100 − 100 / (1 + RS)', 'Entry: RSI crosses above 30', 'Exit: RSI ≥ 70'],
        entry: 'The RSI(14) closes above 30 after being at or below it.',
        entryAr: 'يُغلق المؤشر فوق ٣٠ بعد أن كان عند ٣٠ أو دونه.',
        exit: 'The RSI reaches 70, or the stop is hit.',
        exitAr: 'يبلغ المؤشر ٧٠، أو يُضرب الوقف.',
        risk: 'A tight 5 % stop and a 70 exit level — reversion trades age badly if the bounce does not come.',
        riskAr: 'وقف ضيق ٥٪ ومستوى خروج ٧٠ — صفقات الارتداد تسوء مع الوقت إن لم يأتِ الارتداد.',
        failure: 'Strong downtrends, where an oversold reading stays oversold for weeks and each bounce is a lower high.',
        failureAr: 'الاتجاهات الهابطة القوية، حيث يبقى التشبع البيعي أسابيع وكل ارتداد قمة أدنى.',
        category: 'reversion',
        timeframe: { en: 'Daily', ar: 'يومي' },
        defaults: { period: 14, entry: 30, exit: 70, stopPct: 5 },
        paramFields: [
            { key: 'period', label: { en: 'RSI period', ar: 'مدة المؤشر' }, min: 2, max: 50, step: 1 },
            { key: 'entry', label: { en: 'Entry level', ar: 'مستوى الدخول' }, min: 5, max: 45, step: 1 },
            { key: 'exit', label: { en: 'Exit level', ar: 'مستوى الخروج' }, min: 55, max: 95, step: 1 },
            { key: 'stopPct', label: { en: 'Stop %', ar: 'الوقف ٪' }, min: 1, max: 30, step: 0.5 },
        ],
    },
    {
        id: 'macd-cross',
        name: 'MACD 12/26/9 cross',
        nameAr: 'تقاطع الماكد ١٢/٢٦/٩',
        idea: 'A momentum rule that only buys a cross below zero: the turn has to start from weakness for the entry to be early enough to pay.',
        ideaAr: 'قاعدة زخم لا تشتري إلا تقاطعًا تحت الصفر: يجب أن يبدأ الانعطاف من ضعف ليكون الدخول مبكرًا بما يكفي ليدفع.',
        formula: ['MACD = EMA(12) − EMA(26)', 'Signal = EMA(9, MACD)', 'Entry: MACD crosses above Signal while MACD < 0', 'Exit: MACD crosses below Signal'],
        entry: 'The MACD line closes above its signal line while still below zero.',
        entryAr: 'يُغلق خط الماكد فوق خط الإشارة وهو ما يزال تحت الصفر.',
        exit: 'The MACD line crosses back below the signal line.',
        exitAr: 'يعود خط الماكد ويقطع تحت خط الإشارة.',
        risk: 'An 8 % stop; the below-zero filter is the risk control, because it refuses late crosses.',
        riskAr: 'وقف ٨٪؛ مرشّح «تحت الصفر» هو ضبط المخاطر، لأنه يرفض التقاطعات المتأخرة.',
        failure: 'Long, quiet trends where the zero filter keeps the rule out of the move entirely.',
        failureAr: 'الاتجاهات الطويلة الهادئة حيث يُبقي مرشّح الصفر القاعدة خارج الحركة كلها.',
        category: 'momentum',
        timeframe: { en: 'Daily', ar: 'يومي' },
        defaults: { fast: 12, slow: 26, signal: 9, stopPct: 8 },
        paramFields: [
            { key: 'fast', label: { en: 'Fast EMA', ar: 'المتوسط السريع' }, min: 2, max: 50, step: 1 },
            { key: 'slow', label: { en: 'Slow EMA', ar: 'المتوسط البطيء' }, min: 3, max: 100, step: 1 },
            { key: 'signal', label: { en: 'Signal EMA', ar: 'متوسط الإشارة' }, min: 2, max: 50, step: 1 },
            { key: 'stopPct', label: { en: 'Stop %', ar: 'الوقف ٪' }, min: 1, max: 50, step: 0.5 },
        ],
    },
    {
        id: 'donchian-breakout',
        name: 'Donchian 20/10 breakout',
        nameAr: 'اختراق قناة دونشيان ٢٠/١٠',
        idea: 'The turtle rule: buy a new 20-bar high, leave on a 10-bar low. It pays for the many small losses with the occasional long trend.',
        ideaAr: 'قاعدة السلاحف: اشترِ أعلى سعر في ٢٠ شمعة، واخرج عند أدنى سعر في ١٠. تدفع الخسائر الصغيرة الكثيرة مقابل اتجاه طويل من حين لآخر.',
        formula: ['Upper = max(High, t−20 … t−1)', 'Lower = min(Low, t−10 … t−1)', 'Entry: Close > Upper', 'Exit: Close < Lower'],
        entry: 'The close is above the highest high of the previous 20 bars.',
        entryAr: 'الإغلاق فوق أعلى سعر في الشمعات العشرين السابقة.',
        exit: 'The close is below the lowest low of the previous 10 bars.',
        exitAr: 'الإغلاق تحت أدنى سعر في الشمعات العشر السابقة.',
        risk: 'An 8 % stop, so a failed breakout costs less than the move it was chasing.',
        riskAr: 'وقف ٨٪، فاختراق فاشل يكلّف أقل مما كانت الحركة تطارده.',
        failure: 'Ranges that produce false breakouts at the top of the channel, one after another.',
        failureAr: 'النطاقات التي تنتج اختراقات كاذبة عند سقف القناة، واحدًا بعد آخر.',
        category: 'breakout',
        timeframe: { en: 'Daily and weekly', ar: 'يومي وأسبوعي' },
        defaults: { entry: 20, exit: 10, stopPct: 8 },
        paramFields: [
            { key: 'entry', label: { en: 'Entry lookback', ar: 'مدى الدخول' }, min: 5, max: 100, step: 1 },
            { key: 'exit', label: { en: 'Exit lookback', ar: 'مدى الخروج' }, min: 3, max: 50, step: 1 },
            { key: 'stopPct', label: { en: 'Stop %', ar: 'الوقف ٪' }, min: 1, max: 50, step: 0.5 },
        ],
    },
    {
        id: 'ema50-pullback',
        name: 'EMA 50 pullback',
        nameAr: 'ارتداد إلى المتوسط الأسّي ٥٠',
        idea: 'Buy the dip inside an uptrend rather than the breakout: the trend is defined by the 200, the entry by a touch of the 50 that closes green.',
        ideaAr: 'اشترِ التصحيح داخل اتجاه صاعد لا الاختراق: الاتجاه يُعرَّف بالمتوسط ٢٠٠، والدخول بلمسة للمتوسط ٥٠ تُغلق خضراء.',
        formula: ['Trend: Close > EMA(200)', 'Touch: Low ≤ EMA(50) ≤ Close', 'Entry bar closes green', 'Stop −7 %, target +20 %'],
        entry: 'Price is above the 200 average, the bar dips to touch the 50 average, and closes at or above its open.',
        entryAr: 'السعر فوق المتوسط ٢٠٠، والشمعة تهبط لتلمس المتوسط ٥٠، وتُغلق عند افتتاحها أو فوقه.',
        exit: 'A close below the 50 average, the 7 % stop, or the 20 % target.',
        exitAr: 'إغلاق تحت المتوسط ٥٠، أو وقف ٧٪، أو هدف ٢٠٪.',
        risk: 'A 7 % stop and a 20 % target give the trade a defined shape; the 200 filter keeps it out of downtrends.',
        riskAr: 'وقف ٧٪ وهدف ٢٠٪ يمنحان الصفقة شكلًا محددًا؛ ومرشّح ٢٠٠ يُبقيها خارج الاتجاهات الهابطة.',
        failure: 'Sharp reversals: a touch that looks like a pullback is the first leg of a trend change.',
        failureAr: 'الانعكاسات الحادة: اللمسة التي تبدو تصحيحًا تكون أول ضلع في تغيّر اتجاه.',
        category: 'trend',
        timeframe: { en: 'Daily', ar: 'يومي' },
        defaults: { fast: 50, slow: 200, stopPct: 7, targetPct: 20 },
        paramFields: [
            { key: 'fast', label: { en: 'Pullback average', ar: 'متوسط الارتداد' }, min: 5, max: 100, step: 1 },
            { key: 'slow', label: { en: 'Trend average', ar: 'متوسط الاتجاه' }, min: 50, max: 400, step: 1 },
            { key: 'stopPct', label: { en: 'Stop %', ar: 'الوقف ٪' }, min: 1, max: 30, step: 0.5 },
            { key: 'targetPct', label: { en: 'Target %', ar: 'الهدف ٪' }, min: 0, max: 100, step: 1 },
        ],
    },
];

export function strategyById(id: string): StrategyDoc | undefined {
    return STRATEGY_LIBRARY.find((doc) => doc.id === id);
}
