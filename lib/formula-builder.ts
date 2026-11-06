// The visual half of the formula studio. A group is rows of "left operator right" joined by and/or;
// `buildExpression` turns it into the exact text the chart evaluates, and `parseBuilder` reads that
// text back into the same group. The text stays the single source of truth (see the design doc), so a
// hand-edited formula that this module cannot express opens in code mode instead of a broken builder.

import { formulaAst, type FormulaNode } from '@/lib/formula';

export type BuilderJoin = 'and' | 'or';

export type BuilderOperand =
    | { kind: 'price'; series: string; offset?: number }
    | { kind: 'number'; value: number }
    | { kind: 'indicator'; fn: BuilderIndicator; source: string; period: number; periodParam?: string; offset?: number }
    /** A `{name}` placeholder: the strategy's parameter table owns the number, the rule owns the name. */
    | { kind: 'param'; key: string };

export type BuilderIndicator = 'sma' | 'ema' | 'rsi' | 'highest' | 'lowest';

export type BuilderOperator = '>' | '>=' | '<' | '<=' | '==' | 'crossesAbove' | 'crossesBelow';

export type BuilderCondition = { left: BuilderOperand; op: BuilderOperator; right: BuilderOperand };

export type BuilderGroup = { join: BuilderJoin; conditions: BuilderCondition[] };

export const BUILDER_PRICES = ['close', 'open', 'high', 'low', 'volume', 'hl2', 'hlc3', 'ohlc4'] as const;

export const BUILDER_INDICATORS: readonly { id: BuilderIndicator; label: string }[] = [
    { id: 'sma', label: 'SMA' },
    { id: 'ema', label: 'EMA' },
    { id: 'rsi', label: 'RSI' },
    { id: 'highest', label: 'Highest' },
    { id: 'lowest', label: 'Lowest' },
];

export const BUILDER_OPERATORS: readonly BuilderOperator[] = ['>', '>=', '<', '<=', '==', 'crossesAbove', 'crossesBelow'];

export const MAX_BUILDER_CONDITIONS = 8;

export const emptyBuilderGroup = (): BuilderGroup => ({ join: 'and', conditions: [] });

/** The default row: price above its own 20-bar average, the condition almost everyone starts with. */
export const defaultBuilderCondition = (): BuilderCondition => ({
    left: { kind: 'price', series: 'close' },
    op: '>',
    right: { kind: 'indicator', fn: 'sma', source: 'close', period: 20 },
});

const renderOperand = (operand: BuilderOperand): string => {
    let text: string;
    if (operand.kind === 'number') text = String(operand.value);
    else if (operand.kind === 'param') text = `{${operand.key}}`;
    else if (operand.kind === 'price') text = operand.series;
    else text = `${operand.fn}(${operand.source}, ${operand.periodParam ? `{${operand.periodParam}}` : operand.period})`;
    if ((operand.kind === 'price' || operand.kind === 'indicator') && operand.offset && operand.offset > 0) text += `[${operand.offset}]`;
    return text;
};

const renderCondition = (condition: BuilderCondition): string => {
    const left = renderOperand(condition.left);
    const right = renderOperand(condition.right);
    if (condition.op === 'crossesAbove') return `crossover(${left}, ${right})`;
    if (condition.op === 'crossesBelow') return `crossunder(${left}, ${right})`;
    return `${left} ${condition.op} ${right}`;
};

/**
 * The text for a group. Every condition is parenthesised when there is more than one, so the join
 * reads the way the rows do and operator precedence in the language never changes the meaning.
 */
export function buildExpression(group: BuilderGroup): string {
    const rows = group.conditions.slice(0, MAX_BUILDER_CONDITIONS).map(renderCondition);
    if (rows.length === 0) return '';
    if (rows.length === 1) return rows[0];
    const joiner = group.join === 'or' ? ' or ' : ' and ';
    return rows.map((row) => `(${row})`).join(joiner);
}

const parseOperand = (node: FormulaNode, params?: ReadonlyMap<number, string>): BuilderOperand | null => {
    if (node.kind === 'number') {
        if (!Number.isFinite(node.value)) return null;
        const key = params?.get(node.value);
        return key ? { kind: 'param', key } : { kind: 'number', value: node.value };
    }
    if (node.kind === 'series') return { kind: 'price', series: node.name };
    if (node.kind === 'history') {
        const inner = parseOperand(node.of, params);
        if (!inner || inner.kind === 'number' || inner.kind === 'param') return null;
        return { ...inner, offset: node.offset };
    }
    if (node.kind === 'call') {
        if (!BUILDER_INDICATORS.some((entry) => entry.id === node.name)) return null;
        const [source, period, ...rest] = node.args;
        if (rest.length > 0 || !source || source.kind !== 'series' || !period || period.kind !== 'number') return null;
        if (!Number.isFinite(period.value)) return null;
        const periodParam = params?.get(period.value);
        if (periodParam) {
            return { kind: 'indicator', fn: node.name as BuilderIndicator, source: source.name, period: 1, periodParam };
        }
        if (period.value < 1) return null;
        return {
            kind: 'indicator',
            fn: node.name as BuilderIndicator,
            source: source.name,
            period: Math.floor(period.value),
        };
    }
    return null;
};

const parseCondition = (node: FormulaNode, params?: ReadonlyMap<number, string>): BuilderCondition | null => {
    if (node.kind === 'call' && (node.name === 'crossover' || node.name === 'crossunder')) {
        if (node.args.length !== 2) return null;
        const left = parseOperand(node.args[0], params);
        const right = parseOperand(node.args[1], params);
        if (!left || !right) return null;
        return { left, op: node.name === 'crossover' ? 'crossesAbove' : 'crossesBelow', right };
    }
    if (node.kind === 'binary' && ['>', '>=', '<', '<=', '=='].includes(node.op)) {
        const left = parseOperand(node.left, params);
        const right = parseOperand(node.right, params);
        if (!left || !right) return null;
        return { left, op: node.op as BuilderOperator, right };
    }
    return null;
};

/** Flattens a chain of the same join; a mix of and/or is outside the builder. */
function flatten(node: FormulaNode, join: BuilderJoin): FormulaNode[] | null {
    if (node.kind === 'binary' && (node.op === 'and' || node.op === 'or')) {
        if (node.op !== join) return null;
        const left = flatten(node.left, join);
        const right = flatten(node.right, join);
        return left && right ? [...left, ...right] : null;
    }
    return [node];
}

/**
 * The parser only knows numbers, so a placeholder is swapped for a sentinel number before the parse
 * and swapped back afterwards. The sentinels are tiny and unique per key; if the text already
 * contains one, the builder declines rather than guessing which number was meant.
 */
const PARAM_SENTINEL = 1_000_003;

const paramSentinels = (text: string, keys: readonly string[]): Map<number, string> | null => {
    const map = new Map<number, string>();
    for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index];
        const sentinel = PARAM_SENTINEL + index * 2;
        if (text.includes(String(sentinel))) return null;
        map.set(sentinel, key);
    }
    return map;
};

/**
 * Reads a formula back into a group, or null when it is not something the rows can represent. A null
 * is not an error: it means the editor shows the formula in code mode, untouched. `paramKeys` lets a
 * rule that uses `{name}` placeholders open in the builder with the placeholders intact.
 */
export function parseBuilder(text: string, paramKeys: readonly string[] = []): BuilderGroup | null {
    const sentinels = paramKeys.length > 0 ? paramSentinels(text, paramKeys) : new Map<number, string>();
    if (!sentinels) return null;
    let source = text;
    for (const [sentinel, key] of sentinels) source = source.split(`{${key}}`).join(String(sentinel));

    const ast = formulaAst(source);
    if (!ast) return null;

    // A single condition needs no join, but the same flatten handles both shapes.
    if (parseCondition(ast, sentinels)) {
        const condition = parseCondition(ast, sentinels)!;
        return { join: 'and', conditions: [condition] };
    }
    if (ast.kind === 'binary' && (ast.op === 'and' || ast.op === 'or')) {
        const parts = flatten(ast, ast.op);
        if (!parts || parts.length < 2 || parts.length > MAX_BUILDER_CONDITIONS) return null;
        const conditions: BuilderCondition[] = [];
        for (const part of parts) {
            const condition = parseCondition(part, sentinels);
            if (!condition) return null;
            conditions.push(condition);
        }
        return { join: ast.op, conditions };
    }
    return null;
}
