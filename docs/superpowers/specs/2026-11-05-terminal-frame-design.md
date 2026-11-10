# The terminal frame — the site should open like a desktop app

**Date:** 2026-11-05
**Status:** approved by the owner (reference: the TickerChart desktop window on his desktop)
**Scope:** the shell's frame — sub-project **B** continued

## Why

The owner's reference is a Windows trading terminal: a red delayed-data line, a menu bar with
window controls, a scrolling quote tape, tabs, a workspace, and a status line at the bottom. Our
app had a tab bar and a sidebar inside a rounded card — a website that happened to have tabs, not a
window that happened to be a website. Opening it should feel like opening the terminal.

## What was built

1. **Desk frame** (`.desk`): five rows — notice, menu bar, quote tape, body (nav + workspace),
   status line. The body is the only scrolling part; everything else is chrome.
2. **Notice line**: the feed's honesty, in the terminal's red — "All data is delayed 15 minutes",
   with the live-data link. Not dismissible, because it is true on every page.
3. **Menu bar** (`components/shell/MenuBar.tsx`): Rovex mark, then **Add · View · Tools · Trade ·
   Account · Settings · Help**, each a real dropdown over the pages the shell already has. Ends with
   the command bar, the theme switch, the account, and the window controls — collapse the sidebar,
   full screen, focus mode.
4. **Quote tape** (`MarketStrip`): the Gulf and world indices from the same `/api/world/market` board
   the world page reads, scrolling, pausable on hover. It cannot disagree with the board because it
   is the same data; it says "reading the market" instead of inventing a number.
5. **Status line**: live clock, date, connection, "delayed 15 min", and the workspace name.
6. **Menu rows are the page list.** Every href in the menu is checked against `lib/shell/pages.ts` by
   a test, so a menu cannot promise a destination the shell does not have. Resources (Help, API docs,
   About, Terms) joined the page list too, which puts them in ⌘K as well.

## What was deliberately not copied

- **The far-right icon rail.** In TickerChart it *is* the navigation, because the window has no
  sidebar. Ours has a full sidebar with sections and the watchlist; a second rail would be a second
  door to the same rooms. The window's minimise button collapses the sidebar instead.
- **The market-watch pane split.** Our stock page already splits chart + panels; replacing the
  panels with a watch table is a content decision, not a frame one, and is left for later.

## Fixes found while verifying at 1440×900

- The chart legend started at `left-3`, **under the drawing rail**, so the first two characters of
  every legend line were clipped ("O 26.12" read "12", "Bollinger" read "ier"). It now clears the
  rail at `left-12`.
- Two studies shared one legend line when a formula label wrapped, so the second study's text landed
  under the first one's values. Studies are one per line now, with the label truncated.
- The watchlist block in the sidebar collapsed under its own empty message and printed it over the
  Help row. It no longer shrinks below its content, and the list is capped at `max-h-56`.

## Verification

Production build at **1440×900** and at the app's narrow width (687px): the desktop frame renders
(notice, menu with seven menus, tape with live indices, status clock), the narrow layout degrades to
brand + search + drawer, and nothing overlaps. 1,021 tests, TypeScript clean, build clean.
