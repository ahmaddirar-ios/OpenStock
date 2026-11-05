# The command bar — one field over the whole terminal

**Date:** 2026-11-05
**Status:** approved by delegation (the owner: "keep going, do not stop"), sub-project **B** of the
Rovex terminal programme
**Builds on:** `2026-11-04-tool-catalog-design.md` (sub-project A)

## Why

The catalogue (A) made every tool addressable, but the only door to it is the **Tools** button inside
a chart. A trader who wants the Fibonacci fan while reading the Saudi board has to open a stock, find
the chart, open the palette and type. The shell still answers ⌘K with stocks only, and the page list
is written out three times (sidebar, tab bar, page labels) with no single source.

TickerChart's shape is one field at the top that reaches everything. That is the visible half of B.

## What this is

1. **One page list.** `lib/shell/pages.ts` holds every destination with its i18n key, icon and
   section. The sidebar, the tab bar's labels and the command bar all read it.
2. **A command bar in the chrome.** A search field in the tab bar (icon-only under 640px) that opens
   the one palette; ⌘K still works everywhere.
3. **A universal palette.** The same dialog answers with three groups, in this order:
   **Pages** → **Tools** → **Stocks**. Typing filters all three in both languages; Arabic is folded
   the same way the tool catalogue folds it, so `فيبوناتشى` and `فيبوناتشي` land together.
4. **A tool is a link.** Choosing a tool navigates to the chart with `?tool=<id>`; the chart arms a
   drawing, adds a study, chooses a chart type or opens a Formula study filled with the function's
   example — the same `insertTool` the palette uses. The parameter is removed after it is applied, so
   a refresh does not re-arm it, and the link is shareable.

## What this is not

- Not the whole shell restructure. Splitting `YahooChart.tsx` (2,807 lines) into toolbar, menus and
  wiring is an internal refactor with no user-visible change; it is deferred and recorded in the
  ledger rather than risked in the same pass as a navigation change.
- Not D (formulas v3) and not E (the live guide). They follow.

## The pure part

`lib/shell/command.ts` decides what a query answers, with no React:

```ts
type CommandGroup = { id: 'pages' | 'tools' | 'stocks'; items: CommandItem[] };
commandPages(query, lang): PageDef[]     // name match, folded
commandTools(query): ToolEntry[]         // null on an empty query — 127 rows is not a result
toolHref(entry, symbol): string          // /stocks/2222.SR?tool=drawing%3Atrend
```

An empty query answers pages only: the palette's idle state is "where can I go", which is what a
command bar is for. Tools and stocks appear once something is typed, so the dialog never opens as a
wall of 127 rows.

## Tests

`__tests__/shell-command.test.ts`:

- every page href is unique, starts with `/`, and has a name in both languages that is not its key;
- the sidebar's sections cover every page exactly once (no page without a home);
- an empty query answers pages and no tools;
- `فيبوناتشي` answers the Fibonacci drawings from the command bar, and so does `fib`;
- a tool href round-trips through `URL` and carries the id unchanged (`drawing:fib`);
- the same query twice answers the same order.

## Rollout

One commit, one deployment, verified in the signed-in app in both layouts: ⌘K → type `فيبوناتشي` →
Enter lands on a chart with the Fibonacci tool armed and the URL clean.
