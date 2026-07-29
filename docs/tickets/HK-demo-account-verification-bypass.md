# HK-SEC-01 — Remove the `test@test.com` verification bypass

**Status:** Open (deferred, in use) · **Priority:** Medium · **Area:** Backend / Auth · **Size:** ~4 lines · **Risk:** Low to remove, needs a demo-account plan first

## What it is

`service/impl/UserServiceImpl.create` hard-codes one address past email verification:

```java
if (email.equals("test@test.com"))
{
    verified = true;
}
```

Any signup using that address is born `verified = true` — no code issued, no email sent, no
verification screen — regardless of `app.verification.enabled`. Everyone else must enter the
6-digit code that was mailed to them.

Found during the security audit of 2026-07-29, alongside the two cross-tenant write holes
(fixed in that pass) and the account-lockout bypass (also fixed). This one is **deliberately
left in place** because the demo account depends on it.

## Why it should not stay

The address is public — it is in the source, and it is the first thing anyone types. So:

- **Anyone can own it.** The signup is first-come-first-served on the email; whoever registers
  `test@test.com` first gets a working, pre-verified account. If the demo account is ever
  deleted or a database is reset, an outsider can claim it.
- **It is a real account, not a sandbox.** It gets a store, parties, items and transactions
  like any other, and counts against nothing. The isolation fixes mean it can't reach other
  shops' data — but it is still an unverified-identity account inside production.
- **It cannot be revoked without a code change.** There is no config switch and no expiry; the
  only way to close it is a redeploy.

## Options, roughly in order of preference

1. **Seed the demo account instead of bypassing verification for it.** Create it explicitly at
   boot (or once, by hand) with `verified = true` and a known password, then delete the branch.
   Nothing special-cased in the signup path, and the address stops being a public door.
2. **Move the address to config** — `app.demo.email` — so at least it is per-environment and
   can be blanked in production without a code change. Weaker: the door still exists wherever
   the value is set, it just isn't in the source.
3. **Make demo accounts a real concept** (a `demo` flag, read-only or auto-reset nightly). Most
   work, and only worth it if the demo becomes a selling tool rather than a convenience.

Option 1 is almost certainly right. The bypass exists to save one manual step at seed time,
which is not a good enough reason for a permanent hole.

## To do

1. Decide how the demo account gets created (option 1 unless there's a reason not to).
2. Seed it that way, and confirm login works end to end.
3. Delete the `test@test.com` branch from `UserServiceImpl.create`.
4. Check nothing else keys on the address:
   ```
   grep -rn "test@test.com" src/
   ```
   Note that the API tests sign up as `u<contactNumber>@x.com`, so they do not depend on it —
   but confirm before deleting.

## Done when

- `grep -rn "test@test.com" src/backend/src/main` returns nothing.
- Signing up as `test@test.com` gets the same verification flow as any other address.
- The demo account still logs in, without a code change to keep it working.
