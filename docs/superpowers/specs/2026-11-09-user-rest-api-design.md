# Rovex REST API v1 — customer-facing market data

Status: implemented on `feat/drawing-rail`
Audience: paying customers (Pro and Premium), plus per-account exceptions granted from the admin panel.

## Why

The chart parity audit has one gap left: a customer cannot read Rovex data from their own
scripts. Everything else the terminal does is behind a session and a browser. An API turns the
same candles, quotes and indicators into a product: a key on the profile page, a documented
contract, and a quota that matches the plan.

## What v1 returns

| Endpoint | Cost | Body |
| --- | --- | --- |
| `GET /api/v1/me` | 0 | account, plan, key name, quota, usage |
| `GET /api/v1/candles` | 1 | OHLCV bars for one symbol and interval |
| `GET /api/v1/quote` | 1 per symbol | last price, change, percent, time |
| `GET /api/v1/indicators` | 1 | one study computed over the same bars |

Patterns, screener scans and strategy runs are deliberately out of v1. They are heavier, they
change more often, and the first release should be a contract we can keep.

## Authentication

Two header forms, because both are common in the wild:

```
x-api-key: rvx_...
Authorization: Bearer rvx_...
```

A key is shown exactly once, when it is created. The server stores only its SHA-256 hash, plus a
short prefix and the last four characters for display. Revoking a key is immediate: the row keeps
its history but `revokedAt` makes the guard refuse it.

Key format: `rvx_` + 32 bytes of randomness, base64url without padding. Prefix shown in the UI is
the first 12 characters; the last four are stored to help a customer recognise a key.

### Why not better-auth's `apiKey` plugin

The app pins `better-auth` 1.7.10, and that version does not ship the `apiKey` plugin (it lands in
later releases). Upgrading the auth core to get a key table is a larger, riskier change than the
feature itself. The owned module is small: one collection, three actions, one guard, and the only
cryptography is "hash a random string and compare hashes" — no password storage, no signing.

## Plans and quotas

The feature is `api.rest`, added to `lib/plans.ts`. It is included in `pro` and `premium`; the
free plan has no key. An admin can grant it to any account with the existing exception list, and
the quota follows the plan that account is on:

| Plan | Requests per hour |
| --- | --- |
| free (granted by exception) | 60 |
| pro | 600 |
| premium | 3,000 |

The window is fixed and hourly, stored in the existing `rate_limits` collection under
`api:<keyId>`. Every response carries `RateLimit-Limit`, `RateLimit-Remaining` and
`RateLimit-Reset` (seconds until the window turns over); a refusal is `429` with `Retry-After`.

`/api/v1/me` does not consume quota — it is how a customer checks where they stand.

## Shape

Every success is JSON. Every failure is:

```json
{ "error": { "code": "invalid_symbol", "message": "symbol is required" } }
```

Codes: `unauthorized`, `invalid_key`, `revoked_key`, `expired_key`, `plan_required`,
`rate_limited`, `invalid_symbol`, `invalid_interval`, `invalid_param`, `not_found`, `upstream_error`.

Candles are compact because they are the hot path:

```json
{
  "symbol": "2222.SR",
  "interval": "1d",
  "currency": "SAR",
  "previousClose": 28.4,
  "candles": [{ "t": 1762387200, "o": 28.4, "h": 28.9, "l": 28.2, "c": 28.7, "v": 5123400 }]
}
```

Indicators reuse the chart's own pure functions (`lib/chart/indicators.ts`) so the API and the
chart can never disagree about what RSI 14 means. `limit` trims the returned tail after the study
is computed, so a customer can ask for the last 10 readings without losing the warm-up bars.

## Where the pieces live

- `database/models/api-key.model.ts` — the `api_keys` collection.
- `lib/actions/api-key.actions.ts` — list, create, revoke (server actions, signed-in).
- `lib/api/limits.ts` — quota table (pure).
- `lib/api/request.ts` — parameter parsing and the error envelope.
- `lib/api/serialize.ts` — bar/quote shaping (pure, tested).
- `lib/api/guard.ts` — key extraction, hashing, entitlement, quota, headers.
- `app/api/v1/{me,candles,quote,indicators}/route.ts` — the four routes.
- `components/profile/ApiKeysPanel.tsx` — the profile UI.
- `app/(marketing)/api-docs` stays the architecture page; the customer contract lives at
  `app/(marketing)/api/page.tsx` and is linked from the profile panel and the old page.

## Failure modes

- A key with no entitlement is refused with `plan_required`, not silently treated as free.
- A failed access lookup resolves to no access (the existing entitlement rule).
- `lastUsedAt` is written at most once a minute per key, so a hot script does not turn every read
  into a second write.
- Indicators require enough bars; a short series returns `upstream_error` rather than an array of
  nulls pretending to be data.
