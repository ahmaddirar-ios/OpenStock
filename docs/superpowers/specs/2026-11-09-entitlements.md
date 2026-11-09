# Plans, entitlements and chart gates

Date: 2026-11-09
Status: shipped

## Goal

One place decides what a customer can open and which chart tools they may use. Staff set that
decision in the admin panel — a plan, plus per-account exceptions — and every page guard, menu and
saved chart respect it. The chart is not presentation-only: a denied tool is refused on the server
as well as hidden in the UI.

## Model

A **feature** is the single switchable unit. Two families:

- `page.*` — one per gated destination (`page.screener`, `page.scanner`, `page.strategies`,
  `page.charts`, `page.saudi`, `page.world`, `page.watchlist`, `page.portfolio`, `page.alerts`).
- `tool.*` — one per drawing group (`cursor`, `lines`, `fib`, `gann`, `patterns`, `elliott`,
  `forecast`, `shapes`, `annotation`, `brush`), per study family (`overlay`, `oscillator`), plus
  `tool.chartType` and `tool.formula`.

`lib/plans.ts` holds the catalogue (`FEATURES`), the plans (`free < pro < premium`) and
`PLAN_FEATURES` written out in full. Premium is the whole catalogue. Writing each plan out means a
new feature forces a deliberate choice about who first sees it, rather than silently appearing in
every plan.

An account carries:

- a **plan** (`free`, `pro`, `premium`), stored in the `entitlements` collection keyed by `userId`;
- two **exception** lists: `allow` adds a feature the plan lacks, `deny` removes one it includes.

`resolveFeatures(plan, allow, deny)` is the only place these combine. **Deny wins over allow**, then
unknown names are dropped and the result follows catalogue order. A missing row means `free` with no
exceptions, so a new account needs no write at sign-up.

## Enforcement points

- **Pages.** Every gated page calls `requireFeaturePage(feature)`. A signed-out reader goes to
  `/sign-in`; a signed-in reader without the feature goes to `/tools?locked=<feature>`. The tools
  hub and the overview are always open, so a locked page always has somewhere to land.
- **Navigation.** `AppShell`, `Sidebar`, `TabBar`, `SearchCommand`, `ToolsHub`, `PAGES` filtering and
  the command bar all read the same feature set. A locked page is absent from the rail and
  unfindable from the command bar.
- **Chart tools.** `DrawingRail`, `ToolPalette`, `ChartStudiesMenu` and `YahooChart` filter what they
  offer. Hotkeys and `?tool=` deep links are checked too: a denied deep link is stripped instead of
  arming the tool. Formula is `tool.formula` even though its study sits in the overlay group.
- **Stored setups.** `lib/actions/chart-setup.actions.ts` filters drawings and studies on load **and**
  on save. A downgrade drops what the account no longer owns rather than refusing to open the chart;
  the next save stores the trimmed set.
- **Actions.** `requireFeature` throws `Unauthorized` when a server action needs a feature the caller
  lacks.

`AccessContext` carries the resolved features into the client tree. `undefined` means "unfiltered",
which is what tests and standalone registries use.

## Staff bypass

Any role with at least one capability (`viewer` and up) holds the whole catalogue, whatever the plan
row says. This lives in `accessFor` once: a support account must never lose the tools it needs to
help a customer. `staff` is reported on the access object so the editor can explain it.

## Admin surface

- `/admin/users` gains a **Plan** column (a select that saves immediately) and **Access** /
  **Password** actions.
- **Access** (`components/admin/UserAccessDialog.tsx`) is a three-state row per feature — *Follow
  plan* stores nothing and follows later plan changes; *Allow* / *Block* are deliberate overrides
  that survive plan changes. The row shows what the plan itself gives, so an override is never a
  mystery, and a live count shows how many features the account actually holds.
- **Password** (`components/admin/UserPasswordDialog.tsx`) sets a password through better-auth's
  admin endpoint. Every session for the account is signed out; the dialog says so. Password and
  confirmation must match and be 8–128 characters. An admin cannot use it on their own row.
- Both actions are guarded server-side: `user:entitlements` and `user:set-password`, granted to
  moderator and above. Plan changes require `user:entitlements`.

## Data and failure behaviour

`database/models/entitlement.model.ts` stores `userId` (unique), `plan`, `allow`, `deny`,
`updatedBy`, with timestamps. `accessFor` is wrapped in React's `cache`, so the layout, page guard
and chart share one read per request. **A failed lookup resolves to the free plan**, never to
everything: an entitlement read must not become a permission bypass. All writes re-validate feature
names with `cleanFeatures`.

## Limits (accepted)

- An already-rendered page stays open; new loads fail within the session-cookie window (≤60s).
- A chart already open keeps its drawings until reload; the next save trims them server-side.
- Plans and features live in code. Changing a plan is a deploy; per-account exceptions are live.
- The editor is the only UI: there is no customer-facing upgrade page yet.

## Files

Core: `lib/plans.ts`, `lib/tools/access.ts`, `lib/entitlements-server.ts`,
`database/models/entitlement.model.ts`, `components/shell/AccessContext.tsx`.

Wiring: `app/(root)/layout.tsx`, all nine gated pages, `app/(root)/tools/page.tsx`,
`app/(root)/profile/page.tsx`, `components/shell/{AppShell,Sidebar,TabBar}.tsx`,
`components/SearchCommand.tsx`, `components/tools/ToolsHub.tsx`, `lib/shell/{pages,command}.ts`,
`components/stocks/{DrawingRail,ToolPalette,ChartStudiesMenu,YahooChart}.tsx`,
`lib/actions/chart-setup.actions.ts`.

Admin: `lib/actions/admin-users.actions.ts`, `components/admin/{AdminUsersTable,UserAccessDialog,UserPasswordDialog}.tsx`,
`app/(root)/admin/users/page.tsx`, `lib/authz.ts`.

Strings: `lib/i18n.ts` (`plan.*`, `admin.users.*`, `admin.access.*`, `admin.password.*`,
`access.*`, `toolsHub.locked*`, `profile.plan`) in English and Arabic.

Tests: `__tests__/plans.test.ts` — plan superset invariants, resolve/deny-wins/cleanup, page and
command filtering, tool↔feature mappings, moderator capability.

## Verification

- `npx tsc --noEmit`, eslint on changed files, `npx vitest run` (1561 passed, 4 skipped) and
  `rm -rf .next && npx next build` all clean.
- End-to-end against a local server: a free account is redirected from `/screener` to
  `/tools?locked=page.screener`; its rail shows only Cursor/Lines/Shapes/Annotation/Brush;
  `?tool=drawing:fib` is stripped while `?tool=drawing:trend` arms Lines; an access dialog saved
  `deny: ['page.screener','tool.drawing.fib']`; a plan select saved `pro`; `/profile` showed the
  plan; a password reset made the old password return 401 and the new one 200; the Arabic dialog
  rendered `٢٢ ميزة`, `احترافي · مشمولة`, `حسب الباقة / سماح / حجب`.
