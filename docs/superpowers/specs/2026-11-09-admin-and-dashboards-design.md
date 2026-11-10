# Admin control panel, tools hub, and dashboards — design

Five pieces, built in order. Each is independently shippable; ③ and ④ depend on ⓪.

| # | Piece | Route(s) | Depends on |
|---|---|---|---|
| ⓪ | Authorization foundation | — | — |
| ① | Tools hub + navigation reorg | `/tools` | — |
| ② | Customizable user dashboard | `/dashboard` | ① (nav) |
| ③ | Operations panel | `/admin/ops` | ⓪ |
| ④ | Admin panel (users, content, flags) | `/admin`, `/admin/users`, `/admin/content`, `/admin/flags` | ⓪ |

## 1. Authorization foundation

### Vocabulary (`lib/authz.ts`, client-safe)

One source of truth: a capability matrix as plain data. Capabilities are `resource:action` strings.

```ts
export const STATEMENTS = {
  user:    ['list', 'get', 'ban', 'update', 'set-password', 'set-role', 'delete'],
  session: ['list', 'revoke'],
  content: ['view', 'manage'],
  flag:    ['manage'],
  ops:     ['view'],
} as const;

export const ROLES = ['user', 'viewer', 'support', 'moderator', 'admin'] as const;
```

The matrix the user approved:

| Capability | viewer | support | moderator | admin |
|---|:--:|:--:|:--:|:--:|
| `user:list`, `user:get`, `session:list`, `ops:view` | ✅ | ✅ | ✅ | ✅ |
| `user:ban`, `user:update`, `user:set-password` | — | ✅ | ✅ | ✅ |
| `content:view`, `content:manage` | view | view | ✅ | ✅ |
| `flag:manage` | — | — | — | ✅ |
| `user:set-role`, `user:delete` | — | — | — | ✅ |

`user` holds nothing. Helpers: `isRole`, `roleOf`, `capabilitiesOf`, `can(role, cap)`, `isStaff(role)`
(staff = any role with at least one capability).

### Storage and enforcement

- **better-auth admin plugin** (1.7.10) supplies the `role`, `banned`, `banReason`, `banExpires`
  fields, the ban check at session creation, and the `/admin/*` endpoints. `defaultRole: 'user'`,
  `adminRoles: ['admin']`.
- The same matrix is handed to the plugin as access-control roles (`createAccessControl(STATEMENTS)`
  → `ac.newRole(...)`), so the plugin's own endpoints enforce exactly the matrix above. One
  definition, two consumers.
- **Bootstrap from env**: `ADMIN_EMAILS` (comma-separated). On first use of `getAuth()`, one
  idempotent `updateMany({ email: { $in: emails }, role: { $ne: 'admin' } }, { $set: { role: 'admin' } })`
  against the `user` collection. After that the DB is the source of truth. There is no route that
  can promote an account, so the allowlist cannot lock the owner out.
- **Guards** (`lib/authz-server.ts`): `currentUser()`, `requireCapability(cap)` for actions
  (throws `Forbidden`), `requireCapabilityPage(cap)` for pages (redirects to `/dashboard` when the
  role lacks it). Both read `roleOf(session.user)`.
- **Middleware is unchanged**: it still only checks cookie presence. The real gate is server-side in
  the admin layout and every admin action.

### Known trade-off

The session cookie is cached five minutes, so a role change can take up to five minutes to apply.

## 2. Tools hub and navigation

`lib/shell/pages.ts` gains an optional `requires?: Capability` on `PageDef`, and role-aware readers
`visiblePages(role)` / `visiblePagesInSection(section, role)`. The shell (Sidebar, MenuBar, TabBar,
SearchCommand) filters through them, so a page a role cannot open is not offered.

New page `/tools` (`nav.tools`, section `tools`) indexes every destination grouped by purpose —
Markets, My desk, Analysis, Account, Resources — with a client-side filter box. It reads the same
`PAGES` registry, so it can never drift from the rail.

`/admin` is registered in `PAGES` with `requires: 'ops:view'`... no: it requires *any* staff
capability, so `PageDef.requires` is joined by a `requiresStaff?: true` flag that admits any role
with at least one capability. The rail shows one "Admin" entry, not one per sub-page.

## 3. Customizable user dashboard

`/dashboard` keeps its chart terminal and gains a **board** above it: a grid of cards the user
arranges, hides, or restores. Persistence is per user.

- `database/models/dashboard.model.ts`: `{ userId, widgets: [{ id, hidden }], order: string[] }`.
- `lib/dashboard.ts`: the widget catalogue (id, label key, description key, href, span) as plain
  data, plus `normalizeLayout` (drop unknown ids, append new ones, keep the order) — pure and tested.
- `lib/actions/dashboard.actions.ts`: `getDashboardLayout()` (falls back to the default) and
  `saveDashboardLayout(input)`.
- Widgets: portfolio, watchlist, alerts, scanner, strategies, screeners. Each is a small server
  component; the board is a client component that owns the edit mode (move up/down, hide, reset).
- Visibility of the whole board is a feature flag (`dashboard.board`, default on) — the first real
  consumer of ④'s flags.

## 4. Operations panel (`/admin/ops`)

Read-only, `ops:view`. No new infrastructure:

- **Provider health**: live probes with a timeout and a measured latency — Yahoo chart API,
  Finnhub (skipped when no key), Google News RSS. Each reports ok / slow / down / skipped.
- **Database**: document counts for the collections the app owns.
- **Schedules**: the Inngest cron table (id, trigger, description) read from a static list that
  mirrors `lib/inngest/functions.ts`, plus the newest alert event timestamp.
- **Recent alert events**: the last few rows from `alertevents`.

## 5. Admin panel

All under `app/(root)/admin/`, sharing a guarded layout (`requireCapabilityPage`-style: any staff).

- `/admin` — home: the signed-in role, its capabilities, and a card per section the role can open.
- `/admin/users` — `user:list`: search, paginate, per-row role select (`user:set-role`), ban/unban
  (`user:ban`), remove (`user:delete`). Every action re-checks its capability server-side.
- `/admin/content` — `content:view`/`content:manage`: the site notice (message in both languages,
  level, link, expiry) that `NoticeBar` renders, and the waitlist table.
- `/admin/flags` — `flag:manage`: feature flags (`key`, `enabled`, `description`) with
  `isFlagEnabled(key, fallback)` in `lib/flags.ts`.

New models: `site-notice.model.ts`, `feature-flag.model.ts`.

## Error handling

- Every guard returns a typed refusal; pages redirect, actions throw `Forbidden` and the client
  shows a toast. No admin action trusts a client-supplied role or user id.
- Every admin write validates input (role ∈ `ROLES`, notice length caps, flag key shape).
- A failed provider probe in ops is a reported state, never a thrown page.

## Testing

- `lib/authz.ts` matrix: every role × every capability, plus `roleOf`/`isRole` edges.
- `lib/dashboard.ts` `normalizeLayout`: unknown ids dropped, new widgets appended, order preserved.
- `lib/shell/pages.ts` role filtering: a viewer sees `/admin`, a plain user does not.
- Guard behaviour: `requireCapability` throws for a missing capability.
- Actions: role validation rejects an unknown role.
- Full gate: `tsc`, `eslint`, `vitest`, `next build`, plus a browser pass on `/tools`, `/dashboard`,
  `/admin`, `/admin/users`, `/admin/ops` in both languages.

## Out of scope

- Real-time ops metrics (no metrics backend), an error store, per-user permission editing,
  drag-and-drop reordering (up/down is enough), notification scheduling.
