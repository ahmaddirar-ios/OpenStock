// A small formula language for a custom line on the chart — the one thing TradingView users reach for
// Pine Script for, reduced to what an indicator actually needs: the four prices, the volume, the
// usual averages, and arithmetic.
//
//   close - sma(close, 20)          distance from the 20-period average
//   (high - low) / close * 100      the day's range in percent
//   ema(close, 9) - ema(close, 21)  a MACD-style spread
//
// There is no `eval`, no property access and no state: the expression is parsed into a tree, the tree
// is walked per bar, and anything it does not recognise comes back as an error the menu can print.

export type FormulaBar = { time: number; open: number; high: number; low: number; close: number; volume: number };

export type FormulaResult = { ok: true; values: number[] } | { ok: false; error: string };

/** Words that stand for a whole series, in the order the help panel lists them. */
export const FORMULA_SERIES = ['open', 'high', 'low', 'close', 'volume', 'hl2', 'hlc3', 'ohlc4'] as const;

/** The functions, with the shape the help panel prints for each. */
export const FORMULA_FUNCTIONS: readonly { name: string; signature: string; help: string }[] = [
    { name: 'sma', signature: 'sma(series, n)', help: 'Simple average of the last n bars' },
    { name: 'ema', signature: 'ema(series, n)', help: 'Exponential average' },
    { name: 'rma', signature: 'rma(series, n)', help: 'Wilder average, as RSI uses' },
    { name: 'sum', signature: 'sum(series, n)', help: 'Total over the last n bars' },
    { name: 'highest', signature: 'highest(series, n)', help: 'Highest value in n bars' },
    { name: 'lowest', signature: 'lowest(series, n)', help: 'Lowest value in n bars' },
    { name: 'change', signature: 'change(series)', help: 'Bar-to-bar difference' },
    { name: 'abs', signature: 'abs(x)', help: 'Absolute value' },
    { name: 'sqrt', signature: 'sqrt(x)', help: 'Square root' },
    { name: 'max', signature: 'max(a, b)', help: 'The larger of two values' },
    { name: 'min', signature: 'min(a, b)', help: 'The smaller of two values' },
];

const SERIES_WORDS = new Set<string>(FORMULA_SERIES);
const FUNCTION_NAMES = new Set(FORMULA_FUNCTIONS.map((fn) => fn.name));

// --- tokenizer --------------------------------------------------------------

type Token = { kind: 'number'; value: number } | { kind: 'word'; value: string } | { kind: 'op'; value: string };

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
        if ('+-*/^(),'.includes(ch)) {
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
    | { kind: 'negate'; of: Node }
    | { kind: 'binary'; op: '+' | '-' | '*' | '/' | '^'; left: Node; right: Node }
    | { kind: 'call'; name: string; args: Node[] };

type Parser = { tokens: Token[]; at: number };

const peek = (p: Parser): Token | undefined => p.tokens[p.at];

const eat = (p: Parser, value: string): boolean => {
    const token = peek(p);
    if (token && token.kind === 'op' && token.value === value) {
        p.at += 1;
        return true;
    }
    return false;
};

/** expression := term (('+' | '-') term)* */
function parseExpression(p: Parser): Node {
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
        const args: Node[] = [];
        if (eat(p, '(')) {
            if (!eat(p, ')')) {
                do {
                    args.push(parseExpression(p));
                } while (eat(p, ','));
                if (!eat(p, ')')) throw new Error('missing_close');
            }
            if (!FUNCTION_NAMES.has(token.value)) throw new Error(`unknown_function:${token.value}`);
            return { kind: 'call', name: token.value, args };
        }
        if (!SERIES_WORDS.has(token.value)) throw new Error(`unknown_series:${token.value}`);
        return { kind: 'series', name: token.value };
    }
    if (eat(p, '(')) {
        const inner = parseExpression(p);
        if (!eat(p, ')')) throw new Error('missing_close');
        return inner;
    }
    throw new Error(`unexpected:${token.value}`);
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
        default: throw new Error(`unknown_series:${name}`);
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

const evaluate = (node: Node, bars: readonly FormulaBar[]): number[] => {
    switch (node.kind) {
        case 'number':
            return new Array<number>(bars.length).fill(node.value);
        case 'series':
            return seriesOf(bars, node.name);
        case 'negate':
            return evaluate(node.of, bars).map((value) => -value);
        case 'binary': {
            const left = evaluate(node.left, bars);
            const right = evaluate(node.right, bars);
            return left.map((value, i) => {
                const other = right[i];
                switch (node.op) {
                    case '+': return value + other;
                    case '-': return value - other;
                    case '*': return value * other;
                    case '/': return other === 0 ? NaN : value / other;
                    default: return value ** other;
                }
            });
        }
        case 'call': {
            const args = node.args.map((arg) => evaluate(arg, bars));
            const period = args[1]?.[0];
            switch (node.name) {
                case 'sma': return smaOf(args[0], periodOf(period ?? 14));
                case 'ema': return emaOf(args[0], periodOf(period ?? 14));
                case 'rma': return rmaOf(args[0], periodOf(period ?? 14));
                case 'sum': return sumOf(args[0], periodOf(period ?? 14));
                case 'highest': {
                    const n = periodOf(period ?? 14);
                    return args[0].map((_, i) => (i < n - 1 ? NaN : Math.max(...args[0].slice(i - n + 1, i + 1))));
                }
                case 'lowest': {
                    const n = periodOf(period ?? 14);
                    return args[0].map((_, i) => (i < n - 1 ? NaN : Math.min(...args[0].slice(i - n + 1, i + 1))));
                }
                case 'change': return args[0].map((value, i) => (i === 0 ? NaN : value - args[0][i - 1]));
                case 'abs': return args[0].map(Math.abs);
                case 'sqrt': return args[0].map((value) => Math.sqrt(value));
                case 'max': return args[0].map((value, i) => Math.max(value, args[1]?.[i] ?? value));
                case 'min': return args[0].map((value, i) => Math.min(value, args[1]?.[i] ?? value));
                default: throw new Error(`unknown_function:${node.name}`);
            }
        }
    }
};

/** Whether an expression parses and names only things the language knows. */
export function checkFormula(expression: string): { ok: true } | { ok: false; error: string } {
    try {
        const parser: Parser = { tokens: tokenize(expression), at: 0 };
        const tree = parseExpression(parser);
        if (parser.at !== parser.tokens.length) throw new Error(`unexpected:${String(peek(parser)?.value ?? '')}`);
        return { ok: true };
    } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : 'invalid' };
    }
}

/**
 * Runs an expression over the candles. A shorter result than the bars means the expression needs more
 * history (an average of 20 has nothing to say in bar 3), which the caller plots as gaps.
 */
export function evaluateFormula(expression: string, bars: readonly FormulaBar[]): FormulaResult {
    const checked = checkFormula(expression);
    if (!checked.ok) return checked;
    if (bars.length === 0) return { ok: true, values: [] };
    try {
        const parser: Parser = { tokens: tokenize(expression), at: 0 };
        const tree = parseExpression(parser);
        return { ok: true, values: evaluate(tree, bars) };
    } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : 'invalid' };
    }
}
