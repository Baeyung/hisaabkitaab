# Signup & Login — FE Integration Tickets

Auth is **HTTP Basic**, stateless. There is no login endpoint that returns a session/token.
The client collects the identifier + password once and attaches an `Authorization` header
to **every** authenticated request.

- Base URL: `/api`
- Auth header: `Authorization: Basic base64(identifier:password)`
- Identifier = user's **contact number OR email** (either works)
- `passwordHash` is never returned in any response

---

## HK-1 — Signup screen

**Endpoint:** `POST /api/auth/signup` (public, no auth header)

**Request body**
```json
{
  "name": "Ahmad",
  "contactNumber": "03001234567",
  "email": "ahmad@example.com",
  "password": "secret123"
}
```

Validation (server-enforced, mirror on FE):
- `name` — required, not blank
- `contactNumber` — required, not blank
- `email` — must be a valid email format
- `password` — required, not blank

**Success — 200**
```json
{
  "id": "uuid",
  "contactNumber": "03001234567",
  "name": "Ahmad",
  "email": "ahmad@example.com"
}
```

**Errors**
- `400` — validation failed (missing/blank field, bad email)

**FE tasks**
- [ ] Build signup form (name, contactNumber, email, password)
- [ ] Client-side validation matching the rules above
- [ ] On 200, treat as logged in (see HK-3 for credential handling) and route to the app
- [ ] Surface 400 field errors

---

## HK-2 — Login screen

There is no dedicated login POST. "Logging in" = collecting credentials and verifying them
against `GET /api/auth/me`.

**Flow**
1. User enters identifier (contact number or email) + password.
2. Build `Authorization: Basic base64(identifier:password)`.
3. Call `GET /api/auth/me` with that header.
4. `200` → credentials valid; store them (HK-3) and enter the app.
   `401` → reject, show "invalid credentials".

**Endpoint:** `GET /api/auth/me` (authenticated)

**Success — 200** — same user shape as signup
```json
{
  "id": "uuid",
  "contactNumber": "03001234567",
  "name": "Ahmad",
  "email": "ahmad@example.com"
}
```

**Errors**
- `401` — bad/missing credentials

**FE tasks**
- [ ] Build login form (identifier + password)
- [ ] Verify via `GET /api/auth/me`, branch on 200 vs 401
- [ ] Show error on 401

---

## HK-3 — Auth state & request wiring

Because Basic auth re-sends credentials on every request, the FE must hold the
credentials for the session and attach them to all authenticated calls.

**FE tasks**
- [ ] Hold credentials in memory for the session (a store/context)
- [ ] HTTP interceptor: attach `Authorization: Basic ...` to every `/api` call except `POST /api/auth/signup`
- [ ] On any `401`, clear credentials and redirect to login
- [ ] Logout = clear the held credentials (no server call needed)

> ⚠️ Basic auth means the raw password lives client-side for the whole session.
> Fine for now; revisit with JWT if we need token expiry, logout/revocation, or to stop
> retaining the plaintext password.

---

## Endpoint summary

| Ticket | Method | Path              | Auth        | Purpose                          |
|--------|--------|-------------------|-------------|----------------------------------|
| HK-1   | POST   | `/api/auth/signup`| public      | Create account                   |
| HK-2   | GET    | `/api/auth/me`    | Basic       | Verify credentials / current user|
