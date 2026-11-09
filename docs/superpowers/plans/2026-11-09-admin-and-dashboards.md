# Plan — admin control panel, tools hub, and dashboards

Spec: `docs/superpowers/specs/2026-11-09-admin-and-dashboards-design.md`

Verification gate after every task: `npx tsc --noEmit`, `npx eslint <changed>`, `npx vitest run`.
`rm -rf .next && npx next build` after each piece. One commit per task.

## Piece ⓪ — authorization foundation

- [x] T1 `lib/authz.ts` — statements, roles, matrix, helpers (`isRole`, `roleOf`, `can`,
      `capabilitiesOf`, `isStaff`). Tests: full matrix, `roleOf` fallbacks.
- [x] T2 `lib/better-auth/auth.ts` — add the `admin` plugin with the matrix as access-control
      roles; `ADMIN_EMAILS` bootstrap sync. Tests: none (integration), covered by build + browser.
- [x] T3 `lib/authz-server.ts` — `currentUser`, `requireCapability`, `requireCapabilityPage`.
      Tests: a stubbed-session guard test.
- [x] T4 `/admin` layout + home page; `PAGES` gains `requires`/`requiresStaff`; shell filters by
      role (Sidebar, MenuBar, TabBar, SearchCommand); root layout passes the role. Tests: page
      filtering.
- [x] T5 i18n keys for `admin.*` and the nav entry (both languages); `.env.example` gains
      `ADMIN_EMAILS`.

## Piece ① — tools hub

- [x] T6 `PAGES` gains section `tools` and the `/tools` entry; MenuBar `tools` menu reorganised to
      the real destinations. Tests: registry sanity.
- [x] T7 `/tools` page + client filter component. Tests: render + filter.

## Piece ② — user dashboard

- [x] T8 `lib/dashboard.ts` catalogue + `normalizeLayout`. Tests.
- [x] T9 `database/models/dashboard.model.ts` + `lib/actions/dashboard.actions.ts`. Tests: layout
      validation.
- [x] T10 Widget server components (portfolio, watchlist, alerts, scanner, strategies, screeners).
- [x] T11 `components/dashboard/DashboardBoard.tsx` (client: edit mode, move, hide, reset) wired
      into `/dashboard` behind the `dashboard.board` flag.

## Piece ③ — operations panel

- [x] T12 `lib/ops/health.ts` — provider probes (timeout + latency) and DB counts. Tests: probe
      result shaping with a stubbed fetch.
- [x] T13 `/admin/ops` page + client refresh button; cron table + recent alert events.

## Piece ④ — admin panel

- [x] T14 `database/models/feature-flag.model.ts`, `lib/flags.ts` (`isFlagEnabled`), consume in
      `/dashboard`. Tests: flag parsing.
- [x] T15 `database/models/site-notice.model.ts`, `lib/actions/admin-content.actions.ts`; `NoticeBar`
      reads the active notice. Tests: notice validation.
- [x] T16 `lib/actions/admin-users.actions.ts` — list, setRole, ban, unban, remove, each guarded.
      Tests: role validation + refusal.
- [x] T17 `/admin/users` page + client table.
- [x] T18 `/admin/content` page + notice form + waitlist table.
- [x] T19 `/admin/flags` page + client editor.
- [x] T20 Final gate: full suite, build, browser pass on every new route in `en` and `ar`.
