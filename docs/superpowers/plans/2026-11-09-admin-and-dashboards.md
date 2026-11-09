# Plan — admin control panel, tools hub, and dashboards

Spec: `docs/superpowers/specs/2026-11-09-admin-and-dashboards-design.md`

Verification gate after every task: `npx tsc --noEmit`, `npx eslint <changed>`, `npx vitest run`.
`rm -rf .next && npx next build` after each piece. One commit per task.

## Piece ⓪ — authorization foundation

- [ ] T1 `lib/authz.ts` — statements, roles, matrix, helpers (`isRole`, `roleOf`, `can`,
      `capabilitiesOf`, `isStaff`). Tests: full matrix, `roleOf` fallbacks.
- [ ] T2 `lib/better-auth/auth.ts` — add the `admin` plugin with the matrix as access-control
      roles; `ADMIN_EMAILS` bootstrap sync. Tests: none (integration), covered by build + browser.
- [ ] T3 `lib/authz-server.ts` — `currentUser`, `requireCapability`, `requireCapabilityPage`.
      Tests: a stubbed-session guard test.
- [ ] T4 `/admin` layout + home page; `PAGES` gains `requires`/`requiresStaff`; shell filters by
      role (Sidebar, MenuBar, TabBar, SearchCommand); root layout passes the role. Tests: page
      filtering.
- [ ] T5 i18n keys for `admin.*` and the nav entry (both languages); `.env.example` gains
      `ADMIN_EMAILS`.

## Piece ① — tools hub

- [ ] T6 `PAGES` gains section `tools` and the `/tools` entry; MenuBar `tools` menu reorganised to
      the real destinations. Tests: registry sanity.
- [ ] T7 `/tools` page + client filter component. Tests: render + filter.

## Piece ② — user dashboard

- [ ] T8 `lib/dashboard.ts` catalogue + `normalizeLayout`. Tests.
- [ ] T9 `database/models/dashboard.model.ts` + `lib/actions/dashboard.actions.ts`. Tests: layout
      validation.
- [ ] T10 Widget server components (portfolio, watchlist, alerts, scanner, strategies, screeners).
- [ ] T11 `components/dashboard/DashboardBoard.tsx` (client: edit mode, move, hide, reset) wired
      into `/dashboard` behind the `dashboard.board` flag.

## Piece ③ — operations panel

- [ ] T12 `lib/ops/health.ts` — provider probes (timeout + latency) and DB counts. Tests: probe
      result shaping with a stubbed fetch.
- [ ] T13 `/admin/ops` page + client refresh button; cron table + recent alert events.

## Piece ④ — admin panel

- [ ] T14 `database/models/feature-flag.model.ts`, `lib/flags.ts` (`isFlagEnabled`), consume in
      `/dashboard`. Tests: flag parsing.
- [ ] T15 `database/models/site-notice.model.ts`, `lib/actions/admin-content.actions.ts`; `NoticeBar`
      reads the active notice. Tests: notice validation.
- [ ] T16 `lib/actions/admin-users.actions.ts` — list, setRole, ban, unban, remove, each guarded.
      Tests: role validation + refusal.
- [ ] T17 `/admin/users` page + client table.
- [ ] T18 `/admin/content` page + notice form + waitlist table.
- [ ] T19 `/admin/flags` page + client editor.
- [ ] T20 Final gate: full suite, build, browser pass on every new route in `en` and `ar`.
