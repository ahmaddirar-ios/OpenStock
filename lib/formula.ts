// A small formula language for a custom line on the chart — the one thing TradingView users reach for
// Pine Script for, reduced to what an indicator actually needs: the four prices, the volume, the usual
// averages, arithmetic, a decision and a few variables.
//
//   close - sma(close, 20)                    distance from the 20-period average
//   (high - low) / close * 100                the day's range in percent
//   mid = (high + low) / 2; close - mid       a variable, then the line
//   close > ema(close, 50) ? 1 : -1           above the average, or below it
//
// Statements are separated by `;` and the last one is the line that gets drawn. There is no `eval`,
// no property access, no loops and no state: the text is parsed into a tree, the tree is walked per
// bar, and anything the language does not know comes back as a reason the menu can print.

export type FormulaBar = { time: number; open: number; high: number; low: number; close: number; volume: number };

/**
 * One drawn line. A formula that never calls `plot` has a single line keyed `value`; every
 * `plot(...)` adds one, keyed `p1`, `p2`, … so the chart, the legend and the settings agree on
 * which line is which without parsing the text again.
 */
export type FormulaLine = { key: string; values: number[] };

export type FormulaResult =
    | { ok: true; values: number[]; lines: FormulaLine[] }
    | { ok: false; error: string };

/** Four lines is enough to read a band and its two edges without turning the chart into a web. */
export const MAX_FORMULA_PLOTS = 4;

/** Words that stand for a whole series, in the order the help panel lists them. */
export const FORMULA_SERIES = ['open', 'high', 'low', 'close', 'volume', 'hl2', 'hlc3', 'ohlc4'] as const;

/** The functions, with the shape the help panel prints for each. */
export const FORMULA_FUNCTIONS: readonly { name: string; signature: string; help: string }[] = [
    { name: 'sma', signature: 'sma(x, n)', help: 'Simple average of the last n bars' },
    { name: 'ema', signature: 'ema(x, n)', help: 'Exponential average' },
    { name: 'rma', signature: 'rma(x, n)', help: 'Wilder average, as RSI uses' },
    { name: 'sum', signature: 'sum(x, n)', help: 'Total over the last n bars' },
    { name: 'stdev', signature: 'stdev(x, n)', help: 'Standard deviation over n bars' },
    { name: 'highest', signature: 'highest(x, n)', help: 'Highest value in n bars' },
    { name: 'lowest', signature: 'lowest(x, n)', help: 'Lowest value in n bars' },
    { name: 'change', signature: 'change(x)', help: 'Bar-to-bar difference' },
    { name: 'crossover', signature: 'crossover(a, b)', help: '1 on the bar a crosses above b, else 0' },
    { name: 'crossunder', signature: 'crossunder(a, b)', help: '1 on the bar a crosses below b, else 0' },
    { name: 'abs', signature: 'abs(x)', help: 'Absolute value' },
    { name: 'sqrt', signature: 'sqrt(x)', help: 'Square root' },
    { name: 'pow', signature: 'pow(a, b)', help: 'a raised to b' },
    { name: 'max', signature: 'max(a, b)', help: 'The larger of two values' },
    { name: 'min', signature: 'min(a, b)', help: 'The smaller of two values' },
];

/** One statement may name a value; the last statement is what the chart draws. */
export const FORMULA_EXAMPLES = [
    'close - sma(close, 20)',
    'mid = (high + low) / 2; close - mid',
    'spread = ema(close, 9) - ema(close, 21); spread',
    'close > ema(close, 50) ? 1 : -1',
    'crossover(close, sma(close, 20)) ? close : 0',
    'mid = (high + low) / 2; plot(mid + stdev(close, 20)); plot(mid); plot(mid - stdev(close, 20))',
] as const;

const SERIES_WORDS = new Set<string>(FORMULA_SERIES);
/** `plot` is a statement, not a function over values, so it is not offered in the help list. */
const PLOT = 'plot';
const FUNCTION_NAMES = new Set([...FORMULA_FUNCTIONS.map((fn) => fn.name), PLOT]);
/** Reserved so a variable cannot shadow a series or a function and make the text ambiguous. */
const RESERVED = new Set<string>([...SERIES_WORDS, ...FUNCTION_NAMES, 'if', 'and', 'or', 'not']);

// --- tokenizer --------------------------------------------------------------

type Token =
    | { kind: 'number'; value: number }
    | { kind: 'word'; value: string }
    | { kind: 'op'; value: string };

const OPERATORS = ['<=', '>=', '==', '!=', '<', '>', '?', ':', ';', ',', '(', ')', '+', '-', '*', '/', '^', '='];

const tokenize = (input: string): Token[] => {
    const tokens: Token[] = [];
    let i = 0;
    while (i < input.length) {
        const ch = input[i];
        if (/\s/.test(ch)) { i += 1; continue; }
        if (/[0-9.]/.test(ch)) {
            const match = /^[0-9]*\.?[0-9]+/.exec(input.slice(i));
            if (!match) throw new Error(`bad_number:${ch}`);
            tokens.push({ kind: 'number', value: Number(match[0]) });
            i += match[0].length;
            continue;
        }
        if (/[a-zA-Z_]/.test(ch)) {
            const match = /^[a-zA-Z_][a-zA-Z0-9_]*/.exec(input.slice(i))!;
            tokens.push({ kind: 'word', value: match[0].toLowerCase() });
            i += match[0].length;
            continue;
        }
        // Two-character operators first, or "<=" would read as "<" then "=".
        const two = input.slice(i, i + 2);
        if (OPERATORS.includes(two)) {
            tokens.push({ kind: 'op', value: two });
            i += 2;
            continue;
        }
        if (OPERATORS.includes(ch)) {
            tokens.push({ kind: 'op', value: ch });
            i += 1;
            continue;
        }
        throw new Error(`bad_char:${ch}`);
    }
    return tokens;
};

// --- parser -----------------------------------------------------------------

type Node =
    | { kind: 'number'; value: number }
    | { kind: 'series'; name: string }
    | { kind: 'variable'; name: string }
    | { kind: 'negate'; of: Node }
    | { kind: 'not'; of: Node }
    | { kind: 'binary'; op: string; left: Node; right: Node }
    | { kind: 'ternary'; test: Node; whenTrue: Node; whenFalse: Node }
    | { kind: 'call'; name: string; args: Node[] };

type Statement = { name: string | null; value: Node };

type Parser = { tokens: Token[]; at: number; declared: Set<string> };

const peek = (p: Parser): Token | undefined => p.tokens[p.at];

const eat = (p: Parser, value: string): boolean => {
    const token = peek(p);
    if (token && token.kind === 'op' && token.value === value) {
        p.at += 1;
        return true;
    }
    return false;
};

/** expression := ternary */
function parseExpression(p: Parser): Node {
    const test = parseComparison(p);
    if (eat(p, '?')) {
        const whenTrue = parseExpression(p);
        if (!eat(p, ':')) throw new Error('missing_colon');
        return { kind: 'ternary', test, whenTrue, whenFalse: parseExpression(p) };
    }
    return test;
}

/** comparison := additive (('<' | '>' | '<=' | '>=' | '==' | '!=') additive)? */
function parseComparison(p: Parser): Node {
    const left = parseAdditive(p);
    const token = peek(p);
    if (token && token.kind === 'op' && ['<', '>', '<=', '>=', '==', '!='].includes(token.value)) {
        p.at += 1;
        return { kind: 'binary', op: token.value, left, right: parseAdditive(p) };
    }
    return left;
}

/** additive := term (('+' | '-') term)* */
function parseAdditive(p: Parser): Node {
    let left = parseTerm(p);
    for (;;) {
        if (eat(p, '+')) left = { kind: 'binary', op: '+', left, right: parseTerm(p) };
        else if (eat(p, '-')) left = { kind: 'binary', op: '-', left, right: parseTerm(p) };
        else return left;
    }
}

/** term := power (('*' | '/') power)* */
function parseTerm(p: Parser): Node {
    let left = parsePower(p);
    for (;;) {
        if (eat(p, '*')) left = { kind: 'binary', op: '*', left, right: parsePower(p) };
        else if (eat(p, '/')) left = { kind: 'binary', op: '/', left, right: parsePower(p) };
        else return left;
    }
}

/** power := unary ('^' power)? — right-associative, so 2^3^2 is 2^9 */
function parsePower(p: Parser): Node {
    const base = parseUnary(p);
    return eat(p, '^') ? { kind: 'binary', op: '^', left: base, right: parsePower(p) } : base;
}

function parseUnary(p: Parser): Node {
    if (eat(p, '-')) return { kind: 'negate', of: parseUnary(p) };
    eat(p, '+');
    return parsePrimary(p);
}

function parsePrimary(p: Parser): Node {
    const token = peek(p);
    if (!token) throw new Error('unexpected_end');
    if (token.kind === 'number') {
        p.at += 1;
        return { kind: 'number', value: token.value };
    }
    if (token.kind === 'word') {
        p.at += 1;
        if (eat(p, '(')) {
            const args: Node[] = [];
            if (!eat(p, ')')) {
                do {
                    args.push(parseExpression(p));
                } while (eat(p, ','));
                if (!eat(p, ')')) throw new Error('missing_close');
            }
            if (!FUNCTION_NAMES.has(token.value)) throw new Error(`unknown_function:${token.value}`);
            return { kind: 'call', name: token.value, args };
        }
        if (SERIES_WORDS.has(token.value)) return { kind: 'series', name: token.value };
        if (p.declared.has(token.value)) return { kind: 'variable', name: token.value };
        throw new Error(`unknown_name:${token.value}`);
    }
    if (eat(p, '(')) {
        const inner = parseExpression(p);
        if (!eat(p, ')')) throw new Error('missing_close');
        return inner;
    }
    throw new Error(`unexpected:${token.value}`);
}

const isPlot = (node: Node): node is Extract<Node, { kind: 'call' }> => node.kind === 'call' && node.name === PLOT;

/** A plot is a whole statement: `plot(x) + 1` has no meaning, and silently ignoring the +1 is worse. */
function containsPlot(node: Node): boolean {
    switch (node.kind) {
        case 'call': return node.name === PLOT || node.args.some(containsPlot);
        case 'binary': return containsPlot(node.left) || containsPlot(node.right);
        case 'ternary': return containsPlot(node.test) || containsPlot(node.whenTrue) || containsPlot(node.whenFalse);
        case 'negate':
        case 'not': return containsPlot(node.of);
        default: return false;
    }
}

/** program := statement (';' statement)* — plots draw, the last plain statement is the line. */
function parseProgram(p: Parser): Statement[] {
    const statements: Statement[] = [];
    for (;;) {
        const token = peek(p);
        // A name followed by "=" is a declaration, not a variable being read: the variable only
        // exists from the next statement on, which is what a reader expects.
        if (token && token.kind === 'word' && p.tokens[p.at + 1]?.kind === 'op' && p.tokens[p.at + 1]?.value === '=') {
            const name = token.value;
            if (RESERVED.has(name)) throw new Error(`reserved_name:${name}`);
            p.at += 2;
            const value = parseExpression(p);
            if (containsPlot(value)) throw new Error('plot_misplaced');
            if (statements.length >= 40) throw new Error('too_many_statements');
            statements.push({ name, value });
            p.declared.add(name);
        } else {
            const value = parseExpression(p);
            if (isPlot(value)) {
                if (value.args.length !== 1) throw new Error('plot_arguments');
            } else if (containsPlot(value)) {
                throw new Error('plot_misplaced');
            }
            if (statements.length >= 40) throw new Error('too_many_statements');
            statements.push({ name: null, value });
        }
        if (eat(p, ';')) continue;
        break;
    }
    return statements;
}

// --- evaluator --------------------------------------------------------------

const seriesOf = (bars: readonly FormulaBar[], name: string): number[] => {
    switch (name) {
        case 'open': return bars.map((bar) => bar.open);
        case 'high': return bars.map((bar) => bar.high);
        case 'low': return bars.map((bar) => bar.low);
        case 'close': return bars.map((bar) => bar.close);
        case 'volume': return bars.map((bar) => bar.volume);
        case 'hl2': return bars.map((bar) => (bar.high + bar.low) / 2);
        case 'hlc3': return bars.map((bar) => (bar.high + bar.low + bar.close) / 3);
        case 'ohlc4': return bars.map((bar) => (bar.open + bar.high + bar.low + bar.close) / 4);
        default: throw new Error(`unknown_name:${name}`);
    }
};

/** The window a period argument asks for: whole numbers only, at least one bar. */
const periodOf = (n: number): number => Math.max(1, Math.min(2000, Math.floor(n)));

const smaOf = (values: number[], n: number): number[] => {
    const out = new Array<number>(values.length).fill(NaN);
    let sum = 0;
    for (let i = 0; i < values.length; i += 1) {
        sum += values[i];
        if (i >= n) sum -= values[i - n];
        if (i >= n - 1) out[i] = sum / n;
    }
    return out;
};

/** Wilder's average: the plain mean of the first n bars, then a slow exponential from there. */
const rmaOf = (values: number[], n: number): number[] => {
    const out = new Array<number>(values.length).fill(NaN);
    const seed = smaOf(values, n);
    let previous = NaN;
    for (let i = 0; i < values.length; i += 1) {
        const value = values[i];
        if (!Number.isFinite(value)) continue;
        if (!Number.isFinite(previous)) {
            if (!Number.isFinite(seed[i])) continue;
            previous = seed[i];
        } else {
            previous = (previous * (n - 1) + value) / n;
        }
        out[i] = previous;
    }
    return out;
};

/** The total over the last n bars. */
const sumOf = (values: number[], n: number): number[] => {
    const out = new Array<number>(values.length).fill(NaN);
    let sum = 0;
    for (let i = 0; i < values.length; i += 1) {
        sum += values[i];
        if (i >= n) sum -= values[i - n];
        if (i >= n - 1) out[i] = sum;
    }
    return out;
};

const emaOf = (values: number[], n: number): number[] => {
    const out = new Array<number>(values.length).fill(NaN);
    const k = 2 / (n + 1);
    let previous = NaN;
    for (let i = 0; i < values.length; i += 1) {
        const value = values[i];
        if (!Number.isFinite(value)) continue;
        previous = Number.isFinite(previous) ? value * k + previous * (1 - k) : value;
        out[i] = previous;
    }
    return out;
};

const stdevOf = (values: number[], n: number): number[] => {
    const mean = smaOf(values, n);
    return values.map((_, i) => {
        if (!Number.isFinite(mean[i])) return NaN;
        const window = values.slice(i - n + 1, i + 1);
        const variance = window.reduce((total, value) => total + (value - mean[i]) ** 2, 0) / n;
        return Math.sqrt(variance);
    });
};

/** 1 on the bar `a` came from below `b` to at or above it, 0 elsewhere. */
const crossOf = (a: number[], b: number[], up: boolean): number[] =>
    a.map((value, i) => {
        if (i === 0) return 0;
        const wasBelow = a[i - 1] < b[i - 1];
        const wasAbove = a[i - 1] > b[i - 1];
        if (!Number.isFinite(value) || !Number.isFinite(b[i]) || !Number.isFinite(a[i - 1]) || !Number.isFinite(b[i - 1])) return 0;
        return up ? (wasBelow && value >= b[i] ? 1 : 0) : wasAbove && value <= b[i] ? 1 : 0;
    });

type Scope = Map<string, number[]>;

const evaluate = (node: Node, bars: readonly FormulaBar[], scope: Scope): number[] => {
    switch (node.kind) {
        case 'number':
            return new Array<number>(bars.length).fill(node.value);
        case 'series':
            return seriesOf(bars, node.name);
        case 'variable': {
            const value = scope.get(node.name);
            if (!value) throw new Error(`unknown_name:${node.name}`);
            return value;
        }
        case 'negate':
            return evaluate(node.of, bars, scope).map((value) => -value);
        case 'not':
            return evaluate(node.of, bars, scope).map((value) => (value ? 0 : 1));
        case 'ternary': {
            const test = evaluate(node.test, bars, scope);
            const whenTrue = evaluate(node.whenTrue, bars, scope);
            const whenFalse = evaluate(node.whenFalse, bars, scope);
            return test.map((value, i) => (value ? whenTrue[i] : whenFalse[i]));
        }
        case 'binary': {
            const left = evaluate(node.left, bars, scope);
            const right = evaluate(node.right, bars, scope);
            return left.map((value, i) => {
                const other = right[i];
                switch (node.op) {
                    case '+': return value + other;
                    case '-': return value - other;
                    case '*': return value * other;
                    case '/': return other === 0 ? NaN : value / other;
                    case '^': return value ** other;
                    case '<': return value < other ? 1 : 0;
                    case '>': return value > other ? 1 : 0;
                    case '<=': return value <= other ? 1 : 0;
                    case '>=': return value >= other ? 1 : 0;
                    case '==': return value === other ? 1 : 0;
                    default: return value !== other ? 1 : 0;
                }
            });
        }
        case 'call': {
            const args = node.args.map((arg) => evaluate(arg, bars, scope));
            const period = args[1]?.[0];
            switch (node.name) {
                case 'sma': return smaOf(args[0], periodOf(period ?? 14));
                case 'ema': return emaOf(args[0], periodOf(period ?? 14));
                case 'rma': return rmaOf(args[0], periodOf(period ?? 14));
                case 'sum': return sumOf(args[0], periodOf(period ?? 14));
                case 'stdev': return stdevOf(args[0], periodOf(period ?? 14));
                case 'highest': {
                    const n = periodOf(period ?? 14);
                    return args[0].map((_, i) => (i < n - 1 ? NaN : Math.max(...args[0].slice(i - n + 1, i + 1))));
                }
                case 'lowest': {
                    const n = periodOf(period ?? 14);
                    return args[0].map((_, i) => (i < n - 1 ? NaN : Math.min(...args[0].slice(i - n + 1, i + 1))));
                }
                case 'change': return args[0].map((value, i) => (i === 0 ? NaN : value - args[0][i - 1]));
                case 'crossover': return crossOf(args[0], args[1], true);
                case 'crossunder': return crossOf(args[0], args[1], false);
                case 'abs': return args[0].map(Math.abs);
                case 'sqrt': return args[0].map((value) => Math.sqrt(value));
                case 'pow': return args[0].map((value, i) => value ** (args[1]?.[i] ?? 1));
                case 'max': return args[0].map((value, i) => Math.max(value, args[1]?.[i] ?? value));
                case 'min': return args[0].map((value, i) => Math.min(value, args[1]?.[i] ?? value));
                default: throw new Error(`unknown_function:${node.name}`);
            }
        }
    }
};

const parse = (expression: string): { statements: Statement[]; parser: Parser } => {
    const parser: Parser = { tokens: tokenize(expression), at: 0, declared: new Set<string>() };
    const statements = parseProgram(parser);
    // Anything left over is a second expression, which is a typo rather than a feature.
    if (parser.at !== parser.tokens.length) throw new Error(`unexpected:${String(peek(parser)?.value ?? '')}`);
    if (statements.length === 0) throw new Error('empty');
    return { statements, parser };
};

/** How many `plot(...)` statements an expression has, capped; 0 when it plots nothing or is broken. */
export function formulaPlotCount(expression: string): number {
    try {
        const { statements } = parse(expression);
        return Math.min(MAX_FORMULA_PLOTS, statements.filter((statement) => isPlot(statement.value)).length);
    } catch {
        return 0;
    }
}

/** How many lines an expression draws: its plots, or one for a v2-style formula. */
export function formulaLineCount(expression: string): number {
    return Math.max(1, formulaPlotCount(expression));
}

/** Whether an expression parses and names only things the language knows. */
export function checkFormula(expression: string): { ok: true } | { ok: false; error: string } {
    try {
        parse(expression);
        return { ok: true };
    } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : 'invalid' };
    }
}

/**
 * Runs an expression over the candles. The last statement is the line; the ones before it are
 * variables. A NaN in the result means the expression had nothing to say on that bar (an average of
 * 20 has nothing in bar 3), which the caller plots as a gap.
 */
export function evaluateFormula(expression: string, bars: readonly FormulaBar[]): FormulaResult {
    const checked = checkFormula(expression);
    if (!checked.ok) return checked;
    if (bars.length === 0) return { ok: true, values: [], lines: [] };
    try {
        const { statements } = parse(expression);
        const scope: Scope = new Map();
        const plotted: FormulaLine[] = [];
        let output: number[] = bars.map(() => NaN);
        for (const statement of statements) {
            // A plot draws. A named statement stores. A bare expression is the fallback line, used
            // only when the text never called plot — which is every formula written before v3.
            if (isPlot(statement.value)) {
                if (plotted.length < MAX_FORMULA_PLOTS) {
                    plotted.push({ key: `p${plotted.length + 1}`, values: evaluate(statement.value.args[0], bars, scope) });
                }
                continue;
            }
            const values = evaluate(statement.value, bars, scope);
            if (statement.name) scope.set(statement.name, values);
            else output = values;
        }
        const values = plotted[0]?.values ?? output;
        return { ok: true, values, lines: plotted.length > 0 ? plotted : [{ key: 'value', values }] };
    } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : 'invalid' };
    }
}
