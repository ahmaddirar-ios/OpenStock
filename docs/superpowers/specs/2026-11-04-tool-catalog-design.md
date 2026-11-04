# The tool catalog — one place that knows every tool

**Date:** 2026-11-04
**Status:** approved by the owner (full authority delegated, work continues unattended)
**Scope:** sub-project **A** of the "Rovex terminal" programme

## Why

The app now carries 74 drawing tools, 27 studies, 11 chart types and 15 formula functions —
127 tools. Their metadata is already mostly gathered, but it lives in four unrelated shapes:

| Family | Where it is declared | What it carries | What it is missing |
|---|---|---|---|
| Drawings | `TOOL_DEFS` in `lib/chart-drawings.ts` | id, group, geometry kind, clicks, default colour | hotkey (a second table), keywords, one-line help |
| Studies | `define()` in `lib/chart-studies.ts` | id, label key, group, params | keywords, one-line help |
| Chart types | `CHART_TYPES` in `lib/chart-view.ts` | id + label key | everything else |
| Formula functions | `FORMULA_FUNCTIONS` in `lib/formula.ts` | name, signature, English help | Arabic help, a ready example |

Three costs follow from that:

1. **Every new tool is a multi-file chore.** Adding one drawing means touching the registry, the
   hotkey table, the i18n files and — for a shortcut — the help panel. That is how lists drift.
2. **There is nothing to search.** The rail is browsable by group, the studies menu has its own
   search box, and there is no way to ask "where is the pitchfork?" across all 127.
3. **Documentation cannot be generated.** The illustrated guide the owner wants (last, and live)
   needs one structured description per tool. Today it would have to be hand-written and would go
   stale on the first rename.

The owner's requirement, in his words: *sections, and inside the sections the tools, and every tool
has its own section* — the shape of the TickerChart terminal. That shape needs one catalog.

## What this is not

- Not a UI redesign. The rail and the menus keep their look. This is the layer under them.
- Not the illustrated guide. That is sub-project E, and it will be built *from* this catalog.
- Not the formula language upgrade. That is D; this only records what the language already has.
- Not new tools. It makes the 127 we have addressable, and the next ones cheap.

## The entry

```ts
export type ToolFamily = 'drawing' | 'study' | 'chartType' | 'formula';

export type ToolEntry = {
    id: string;        // 'drawing:trend' | 'study:sma' | 'chartType:pnf' | 'formula:stdev'
    key: string;       // the family's own name: 'trend' | 'sma' | 'pnf' | 'stdev'
    family: ToolFamily;
    section: ToolSectionId;
    nameKey: StringKey;      // reused: chart.tool.*, study.*, chart.type.*, tools.fn.*
    example?: string;        // a ready expression, for the formula functions
    clicks?: number;         // how many chart clicks a drawing asks for
    hotkey?: string;         // a bare letter that arms it
    keywords: readonly string[]; // synonyms; the translated name is matched anyway
    hidden?: boolean;        // retired from the pickers, still a valid stored drawing
};
```

The name is **not** copied into the catalog: the i18n table stays the only place a string lives, and
the catalog points at it. Search therefore finds an Arabic name in the Arabic UI and an English one
in the English UI, and both are matched regardless of the UI language, because a trader typing
"trend" in an Arabic interface should still find the trend line.

## Sections

```ts
export type ToolSectionId =
    | ToolGroup                                  // cursor, lines, fib, gann, patterns, elliott, forecast, shapes, annotation, brush
    | 'study.overlay' | 'study.oscillator'
    | 'chart.type'
    | 'formula.average' | 'formula.stat' | 'formula.cross' | 'formula.math';
```

Section names reuse `chart.group.*` and `study.group.*` where they exist, so the rail, the menus and
the palette cannot disagree about what "Fibonacci" is called.

## The readers

Wired in this sub-project:

- **The tool palette** — one search field over all 127 tools, grouped by section, inserting on
  click: a drawing arms its tool, a study is added, a chart type is chosen, a formula function adds
  a Formula study already filled with that function's example. This is the visible win, and the
  beginning of the TickerChart-shaped navigation.
- **The shortcuts panel and the rail tooltips** — the catalog mirrors the single `TOOL_SHORTCUTS`
  table rather than duplicating it, so the palette cannot offer a key the handler does not know.

Left for later (they read the same catalog, so they are additive):

- B: the section sidebar and the command bar.
- E: the illustrated guide — one live section per tool.

## Search

`searchTools(query, lang)` returns the entries that match, best first. Matching is normalised:
Latin text is lowercased and stripped of punctuation; Arabic is normalised (alef/hamza/ya/ta-marbuta
folded, diacritics and tatweel removed) so `فيبوناتشي` and `فيبوناتشى` behave the same.

Ranking: exact name, then name prefix, then keyword, then name substring, then id. Ties keep catalog
order, so the same query always answers the same list.

## Catalog order

The order a trader already knows from the rail: cursor, then the drawing groups in rail order, then
overlays, oscillators, chart types, and the formula families. `groupedTools(lang)` returns sections
in that order with their entries, for the palette's default view.

## Testing

`__tests__/tool-catalog.test.ts`:

- every entry has a unique id, a name that translates to something other than its own key, a section
  that exists in `TOOL_SECTIONS`, and a family that matches its section's family;
- the four families are all present, and the counts match their sources (so a tool added to
  `TOOL_DEFS` without reaching the catalog fails the build);
- a retired tool (`hidden`) is not offered by the palette but is still in the catalog;
- search finds a tool by its English name, by its Arabic name, by a keyword, and by a fragment;
- Arabic normalisation matches a variant spelling;
- search is stable: the same query twice gives the same order;
- every formula function carries an example that actually parses with `checkFormula`.

## Rollout

One deployment. Nothing user-visible changes until the palette button appears; the catalog itself is
inert until a reader imports it.
