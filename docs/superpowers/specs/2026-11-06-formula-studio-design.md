# Formula Studio — design (Phase 1)

Date: 2026-11-06
Status: approved direction (hybrid: text is the truth for formulas; structured object for strategies)
Repo: OpenStock-arabic

## Why

The terminal already has a formula language (`lib/formula.ts`, 507 lines) and six backtested
strategies, but the language stops at a single expression, the editor is one input box inside the
studies menu, and the saved shelf lives in one browser's localStorage. The product promise — "the
customer writes his own formula and keeps experimenting" — is not met.

Phase 1 makes the formula surface professional. Phase 2 (a separate spec) makes strategies
custom, and Phase 3 wires formulas into the screener and the alerts.

## Architecture decision

**The formula string is the single source of truth.** The code editor writes it, the visual builder
writes it, the chart evaluates it, the account stores it, and a share link carries it. The builder
also *reads back* the subset of the language it can express, so reopening a builder-made formula
restores the controls. A hand-written formula the builder cannot read opens in code mode, never in a
broken form.

Strategies will not follow this rule: a strategy is a structured object whose rule fields are
formula strings (Phase 2).

## Scope of Phase 1

### 1. Language v2 (`lib/formula.ts`)

Add, without breaking any stored formula:

| Feature | Syntax | Why |
|---|---|---|
| Series history | `close[1]`, `sma(close,20)[1]` | "close above yesterday's close" is the first thing anyone writes |
| Logical operators | `a and b`, `a or b`, `not a` | Conditions composed properly; `and`/`or` are already reserved but unparsed |
| Conditional function | `if(cond, a, b)` | Reads better than nesting `?:` |
| NaN handling | `nz(x)`, `nz(x, y)`, `na` | Warm-up bars and division by zero |
| Bar index | `bar_index` | Count bars, mark the first N |
| Indicator | `rsi(x, n)` | The builder's most-wanted condition |

Explicitly **not** in Phase 1: `plotshape`, `bgcolor`, `hline`, `request.security`,
`alertcondition`, loops, per-plot colours. Each needs chart or data plumbing that belongs in its own
slice.

Errors gain a `position` (character offset) so the editor can underline the exact token. Every new
node is pure and covered by vitest.

### 2. The editor (`components/stocks/FormulaStudio.tsx`)

A real panel, not a settings row:

- monospace editor with a line-number gutter and a highlighted error line;
- live validation while typing, with the message and the column;
- an insert-on-click function/series list with one-line Arabic + English help;
- examples that load into the editor;
- the saved shelf (apply, rename by re-save, delete);
- save to the account, with the browser as the offline copy;
- a builder/code switch.

### 3. The visual builder (`lib/formula-builder.ts`)

A condition group: rows of `left op right`, joined by `and`/`or`.
- Operands: price series, indicator call (`sma/ema/rsi/highest/lowest` with a period), a number, and
  an optional history offset.
- Operators: `>`, `>=`, `<`, `<=`, `=`, `crosses above`, `crosses below`.
- `buildExpression(group)` produces the text with explicit parentheses.
- `parseBuilder(text)` reconstructs a group from the AST, or returns null when the text is outside
  the builder's subset.

### 4. Account storage

- `database/models/formula.model.ts` — one row per user, `items: [{ id, name, expression, updatedAt }]`,
  capped at 100, validated by the same clean/parse functions the browser uses.
- `lib/actions/formula.actions.ts` — `loadFormulas()`, `saveFormulas(items)`; user always from the
  session, payload always re-validated server-side; signed out answers `unauthorized` and the
  studio keeps working on localStorage.
- `lib/formula-library.ts` grows `mergeFormulas(local, remote)` (newest per id), still the single
  gate for shape validation.

## Data flow

```
editor / builder ──text──► ChartStudiesMenu (study param) ──► chart
        │
        └──items──► saveFormulas() ──► Mongo (per user)
                    ↕ merge on open
                 localStorage (offline)
```

## Error handling

- A formula that does not parse never reaches the chart; the studio shows the reason and column.
- A formula that parses but throws at evaluation draws nothing (existing behaviour).
- A save while signed out keeps the browser copy and says so; no silent loss.
- A row in an older format is dropped entry-by-entry, never the whole shelf.

## Testing

- vitest: tokenizer/parser/evaluator for every new construct, precedence (`or` < `and` < `not` <
  comparison), history bounds, `nz`/`na`, `rsi` against `lib/indicators`, error positions.
- vitest: builder round-trip (`parse(build(group))` deep-equals the group) and rejection of text
  outside the subset.
- vitest: formula-library merge and validation.
- Browser: the studio opens, typing an invalid formula shows the error, a valid one draws on the
  chart, the builder produces the same text, saving survives a reload, and the chart still renders
  every existing study.

## Out of scope (Phase 2/3)

Custom strategies, shorting, position sizing, trailing stops, optimiser, walk-forward, portfolio
backtest, screener formula filters, strategy/formula alerts, `request.security`.
