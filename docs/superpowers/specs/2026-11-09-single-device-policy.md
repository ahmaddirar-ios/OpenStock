# One active device per account

Date: 2026-11-09
Status: shipped

## Goal

A user signs in on a second device and the first device stops working. Not a device *fingerprint*
(which breaks on cleared cookies, private windows and browser updates), and not an IP binding (which
breaks on mobile networks). The session table is the only trusted record of a device, so the rule is
expressed there.

## Behaviour

- better-auth writes a `session` row on every sign-in. A `databaseHooks.session.create.after` hook
  then deletes that user's older rows, keeping the newest one.
- The old device is signed out within one cookie-cache window. `session.cookieCache.maxAge` is 60s
  (was 5 minutes), so the worst case is 60 seconds, not 5 minutes.
- Staff with `session:revoke` (support and above) get a **Sign out** button per account in
  `/admin/users`, which calls better-auth's `/admin/revoke-user-sessions`. That covers "the account
  was sold or stolen" without waiting for the owner to sign in.
- Refused on your own account, like the other destructive admin actions.

## Design notes

- The hook runs **after** the insert. If the insert fails, nobody loses their session.
- Owners are matched by both the id string and the ObjectId form of `userId`, because the adapter's
  stored type depends on the deployment. Deleting by `token` avoids the driver's `_id: ObjectId`
  typing.
- Errors are logged, never thrown: a policy failure must not break sign-in.
- The limit lives in `lib/better-auth/device-policy.ts` as `MAX_ACTIVE_SESSIONS`. Raising it to two
  devices is a one-line change, and `sessionsToRevoke` already implements the general case.

## Limits (accepted)

- A copied session cookie is still a valid session until the next sign-in or the admin revoke.
- The old device can keep an already-rendered page open; it cannot load new pages after the cache
  window.
- No user-facing message explains the eviction yet. The old device lands on `/sign-in`.

## Verification

- `__tests__/device-policy.test.ts` covers the eviction selection (newest kept, unknown-id fallback,
  missing timestamps, no input mutation).
- End-to-end against a local server: sign-up session invalidated by a second sign-in; the first
  cookie returns `null` from `/api/auth/get-session` after 60s and `/dashboard` redirects to
  `/sign-in`; admin revoke leaves zero sessions.
