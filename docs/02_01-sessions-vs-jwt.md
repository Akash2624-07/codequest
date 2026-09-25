# 02_01 · Sessions vs JWT

_Discussion, 2026-09-25. An architecture decision record that expands
`02-architecture.md` §2.5 (why sessions) and §7.1 (how sessions work)._

**Decision:** CodeQuest uses **server-side sessions**: a random id in an
`httpOnly` cookie, with the session data in Redis. It does not use JWTs for
its own logins. JWTs still appear where they belong, such as Google's ID
token during sign-in (§3.4).

---

## 1. JWT problems in the old codequest

All references are to `../codequest/`. Most serious first.

### 1.1 A demoted admin stays an admin for up to an hour (security bug)

- `src/middleware/adminMiddleware.js:30` checks `payload.role`, which is the
  role written into the token at login.
- Line 37 then loads the user from MongoDB, but never checks the user's
  *current* role.
- When an admin demotes someone with `updateUserRole`
  (`src/controller/userController.js:190`), that person's token still says
  `role: 'admin'` until it expires, 60 minutes after login
  (`userController.js:70`).
- The frontend's `AdminRoute.jsx:10` reads the fresh role from `/me` and hides
  the admin pages. **The UI says "not admin" while the API still accepts
  them as admin.**
- **Cause:** treating data that can change (the role) as fixed once it's
  inside a signed token.
- **Fix:** check `user.role` from the database record that line 37 already
  loads.

### 1.2 The token needs no lookup, yet every request did two lookups anyway

On every request, `userMiddleware.js` ran:

- `jwt.verify` (line 21)
- a Redis `EXISTS` check against the blocklist (line 32)
- a MongoDB `findById` (line 33)

A JWT's selling point is that the server can trust it *without* a lookup.
The old app made two lookups per request anyway, so it got none of that
benefit and kept all of the costs below.

### 1.3 Logout relied on a blocklist, and the blocklist fails open

- Logout (`userController.js:92`) added the token to a Redis blocklist.
- If Redis restarts without persistence, gets flushed, or evicts keys under
  memory pressure, the blocklist entries vanish. **Logged-out tokens then
  work again** until they expire.
- Logout revoked only the current token. There was no "log out everywhere",
  because the server never knew which other tokens existed.
- Account deletion worked only because of the `findById` in 1.2: a deleted
  user fails that lookup. **The database lookup was doing the real
  authentication, not the JWT.**

### 1.4 One secret signed every token, including admin tokens

- If `JWT_SECRET_KEY` ever leaks (through `.env`, a log line or a backup),
  anyone can create a valid token.
- Combined with 1.1, the attacker only needs an existing user's `_id`, and
  the API returned those (`userController.js:76`). A forged
  `{ _id, role: 'admin' }` token passes `adminMiddleware`.
- Tokens had no key id (`kid`), so changing the secret logs out every user.

### 1.5 The cookie was missing security flags

- `userController.js:72` set only `{ maxAge, httpOnly: true }`.
- No `secure`: the cookie would also be sent over plain HTTP.
- No explicit `sameSite`.
- It worked in dev because `localhost:5173` and `localhost:7000` count as the
  same *site* (ports don't matter). Deploying the frontend and API on
  different domains would have required `SameSite=None; Secure` plus CSRF
  protection.

### 1.6 A hard one-hour expiry with no refresh

- Someone working on a hard problem for 70 minutes gets a 401 on Submit.
- The standard JWT fix is a refresh token, which has to be stored and
  revocable on the server. That makes it a session anyway (§5).

### 1.7 Smaller issues

- **Two copies of the check drifted apart.** A missing token returned 401
  from `userMiddleware` but 403 from `adminMiddleware` (line 14). 403 means
  "we know who you are, and you're not allowed", so it was the wrong code.
  Admin should be the user check plus a role check, not a second copy.
- **`jwt.verify` didn't pin an algorithm** (`{ algorithms: ['HS256'] }`).
  jsonwebtoken 9.0.3 blocks the classic attacks (`alg: none`, key-type
  confusion) by default, so the risk was low, but pin it anyway.
- **The email was in the payload.** JWTs are signed, not encrypted, so anyone
  holding the cookie can decode and read it.
- **The whole token string was the Redis blocklist key.** The standard
  approach is a short unique id per token (the `jti` claim).

### 1.8 What was done right

- An `httpOnly` cookie rather than `localStorage`.
- Blocklist entries set to expire exactly when the token does (`EXAT` = `exp`).
- A minimum secret length, enforced by env validation.
- The same "Invalid Credentials" message for a wrong email and a wrong
  password (`userController.js:57–63`).

### 1.9 Bonus finding, not about JWT: a timing leak at login

The login message was the same, but the timing wasn't. `bcrypt.compare` only
ran when the user existed (a few hundred ms at cost 12), so response time
still revealed whether an email was registered. Fix: always run a hash
comparison, against a dummy hash when the user doesn't exist.

---

## 2. Is "web standards prefer JWT" true?

**Not quite.** JWT (RFC 7519) is a *format* for signed claims, not a
recommendation. The standards that use it, OAuth 2.0 and OpenID Connect, use
it where **the service checking the token isn't the one that issued it**. For
example, Google issues an ID token and your app verifies it.

For a first-party web app, where the same backend issues and checks the
login, cookie sessions are the mainstream default. `express-session`, Django
and Laravel all store sessions on the server.

**Size isn't the deciding factor.** Large apps like GitHub use sessions too.
What decides it is whether the same backend issues and checks the login.

### Two independent choices

| | Cookie | `Authorization` header |
|---|---|---|
| **Opaque id** (server stores the data) | **New CodeQuest** | Mobile apps, API keys |
| **Self-contained** (JWT carries the data) | **Old CodeQuest** | OAuth access tokens between services |

"Session vs JWT" is really about the rows: where the data lives. Cookie vs
header is a separate choice about how the token travels.

---

## 3. Defending sessions

### 3.1 The argument in brief

> "The browser and API are first-party, on one origin. I need instant
> revocation for logout, bans, role changes and password resets, and that
> means a lookup per request whichever token I pick. Once a lookup is
> unavoidable, a random session id is smaller, can't be forged, and
> revocation is just deleting it. I'd choose JWTs when the checking service
> can't reach the issuer's data cheaply: multiple services, third-party API
> clients, or edge verification."

### 3.2 Where JWT genuinely wins

- Many independent services that each need to check identity.
- External developers calling your API.
- Request volumes where a Redis lookup per request becomes a bottleneck. At
  CodeQuest's scale, a Redis `GET` costs well under a millisecond.

### 3.3 If JWT were needed

Use a short-lived access JWT (5–15 minutes, no lookup) plus a refresh token
stored on the server, which can be revoked. See §5 for what that costs.

### 3.4 JWTs still appear in the new app

In Google sign-in (Phase 1), Google returns an **ID token**, which is a JWT.
Its signature and `aud` claim get verified. That's JWT used for a trust
boundary between two parties, which is the job it was designed for.

---

## 4. The architectural difference, side by side

| | Old (JWT) | New (sessions, architecture §7.1) |
|---|---|---|
| Cookie holds | Signed claims: `_id`, email, role | A random 32-byte id, nothing else |
| Where the truth lives | Partly in the token, partly in the DB | Only on the server |
| Check per request | Is this token on the *blocklist*? | Is this session on the *allowlist* (it must exist)? |
| If Redis is wiped | **Revoked tokens work again** (fails open) | Everyone is logged out (fails closed) |
| Logout | Blocklist this one token until it expires | `DEL` the session |
| Log out everywhere | Impossible | Delete every session in the user's set |
| Role change | Stale for up to an hour (1.1) | Takes effect on the next request (role read from the DB) |
| Secret leaks | Anyone can forge a token for any user, admins included | Nothing to forge; Redis stores only hashes of the ids |
| Expiry | Fixed 1 hour | Extends with use (30 days), cap optional |
| Middleware | Two diverging copies | `requireAuth` + `requireRole('admin')` |

The new `requireAuth`, roughly:

```ts
const sid = req.cookies.sid;
const session = sid && await redis.get(`sess:${sha256(sid)}`);   // must exist (allowlist)
if (!session) throw new Unauthorized();
req.user = await usersRepo.findById(session.userId);              // role is always fresh
```

It makes the same number of lookups as the old middleware. The difference is
that each lookup now answers a question that matters.

---

## 5. Can a JWT be revoked or banned instantly?

### 5.1 Why a token blocklist can't ban someone

- **At logout, the server has the token.** The user sends it in the cookie,
  so it can be blocklisted.
- **When an admin bans someone, the server doesn't.** `jwt.sign` creates the
  token, puts it in a cookie, and keeps no record of it. The server doesn't
  know which tokens that user holds, or on how many devices.

The only way to know every token is to record each one when it's issued. At
that point the server stores every active login, which is exactly what a
session store is.

### 5.2 Ways to revoke instantly, and what each costs

| Approach | How it works | Instant ban? | Needs a lookup per request? |
|---|---|---|---|
| **Blocklist by token** (old code) | Store the token or its `jti` on logout | Only for tokens you've seen | Yes |
| **Blocklist by user** | `banned:<userId>` in Redis; check it on every request | ✅ | Yes |
| **Token version / cutoff** | `user.tokensValidAfter`; reject tokens whose `iat` (issued-at time) is older. Bump it on ban, password change or "log out everywhere" | ✅ | Yes |
| **Short access token + refresh token** | 5–15 minute access JWTs; ban by revoking the stored refresh token | ❌ The access token works until it expires | No, only on refresh |

A cutoff check:

```ts
const payload = jwt.verify(token, secret, { algorithms: ['HS256'] });
const cutoff = await redis.get(`auth:cutoff:${payload.sub}`);   // ← a lookup per request
if (cutoff && payload.iat < Number(cutoff)) throw new Unauthorized();
```

**Every design that gives an instant ban adds a lookup on every request.** The
only one that avoids the lookup gives up instant revocation.

**You can't have both no-lookup verification and instant revocation.** Pick
one:

- **Instant revocation:** pay a lookup per request. The JWT becomes a signed
  pointer to data on the server, and a random session id does the same job
  more simply.
- **No lookup:** accept a revocation delay equal to the access token's
  lifetime.

### 5.3 In the old code, banning would have been one line

The middleware already loaded the user on every request
(`userMiddleware.js:33`):

```js
if (!user || user.isBanned) throw new AppError(403, "Account suspended");
```

That's instant, but **because of the database lookup, not because of the
JWT**. It's the same one-line pattern as fixing 1.1.

---

## 6. Access + refresh tokens: the honest JWT compromise

### 6.1 What's stateful and what isn't

- **Refreshing is stateful.** The server stores and checks the refresh token.
- **Checking each request stays stateless.** The access token is verified
  from its signature alone.

That split is the point of the design. The session lifecycle becomes
stateful; checking each request does not. (JWT itself is just a format. What
makes stateless checking possible is a *self-contained* token.)

**Summary:** access + refresh = a session, with a short-lived stateless token
(JWT) in front of it to cut lookups.

### 6.2 What it costs

1. **The access token's lifetime is how long revocation takes.** A banned or
   demoted user keeps access until their access token expires. Role changes
   lag the same way, because the role in the token stays out of date until
   the next refresh.
2. **Complexity:**
   - Refresh-token rotation, with reuse detection in case one is stolen.
   - Client logic that catches a 401, refreshes, and retries.
   - A race when several tabs refresh at once and one presents a token that
     was just rotated. Handled naively, that logs the user out.
3. **It's one lookup per access-token lifetime per active device, not per
   user.** Most requests still hit the database for their actual data; what's
   saved is only the *auth* lookup.

**The access token's lifetime is a security setting.** Five minutes means more
refreshes but faster bans. An hour means fewer refreshes, but a leaked token
works for an hour. Most real systems choose 5–15 minutes.

**In one line:** it's a trade of fewer lookups against instant revocation and
simpler code.

---

## 7. Instant revocation on top of access + refresh

You can still revoke instantly. The question is what the lookup costs. Put a
session id claim (`sid`) in the access token, then choose one of three levels.

### 7.1 Option 1: ask Redis on every request (pull)

```
request ──► API ──"is sid revoked?"──► Redis ──► API ──► response
request ──► API ──"is sid revoked?"──► Redis ──► API ──► response
request ──► API ──"is sid revoked?"──► Redis ──► API ──► response
```

```ts
if (await redis.exists(`revoked:${payload.sid}`)) throw new Unauthorized();
```

Fully instant. But the cost equals sessions, the access token's benefit is
gone, and the refresh machinery remains. **If you're paying this, plain
sessions are simpler for the same result.**

### 7.2 Option 2: a revocation list in each server's memory, synced by pub/sub (push)

```
admin bans user ──► Redis PUBLISH "revoked" sid ──► API server A: revoked.add(sid)
                                                └──► API server B: revoked.add(sid)

request ──► API: revoked.has(sid)?  (memory, no network) ──► response
request ──► API: revoked.has(sid)?  (memory, no network) ──► response
```

```ts
const revoked = new Set<string>();                          // lives in this process's memory
subscriber.subscribe('revoked', (sid) => revoked.add(sid)); // once, at startup
// per request:
if (revoked.has(payload.sid)) throw new Unauthorized();
```

- **The list stays tiny.** An entry only needs to live as long as the access
  token's maximum lifetime; after that the token has expired anyway. (Same
  idea as the old `EXAT` blocklist, keyed by `sid` and held in memory.)
- **This is the option that keeps both benefits**: no lookup per request, and
  revocation within milliseconds.
- **The cost is correctness work.** A process that restarts or briefly loses
  its Redis connection misses the messages sent meanwhile. It must reload the
  list from Redis on reconnect, or it lets revoked tokens through until they
  expire. The list fails open, so the reload logic is essential.

### 7.3 Option 3: check only on sensitive routes

Stay stateless for reads. Do the Redis check only on dangerous actions: admin
endpoints, payments, password or email changes, deleting data. A banned user
can still *browse* for up to 15 minutes but can't *do harm*. Many real
systems accept this.

### 7.4 How options 1 and 2 differ

The difference is **where the revocation list lives when a request checks
it**, and therefore which event causes network traffic.

- **Option 1** keeps one copy of the truth and pays a network round trip to
  read it on every request. **The work grows with the number of requests.**
- **Option 2** keeps a copy in every server so reading is free, and pays in
  keeping those copies in sync. **The work grows with the number of
  revocations.**

Requests are constant: every click, every submission poll. Revocations are
rare: a few bans a day. Option 1 makes a Redis call for each of 1,000
requests per second; option 2 sends one message per ban.

| | Option 1 (pull) | Option 2 (push) |
|---|---|---|
| Where the check happens | Redis, over the network | The server's own memory |
| Cost per request | A network round trip (~0.2–1 ms) | A set lookup (nanoseconds) |
| Network traffic caused by | Every request | Every revocation |
| Always up to date? | Yes: Redis is the one copy | Almost: each copy updates milliseconds after a ban |
| If Redis is down | You can't check. Reject everyone, or let everyone in | Existing lists keep working, but new bans don't reach anyone |
| If a server misses a message | Can't happen | That server accepts the revoked token until it expires, unless it reloads on reconnect |
| Complexity | One line | Subscribe, reload on startup and reconnect, drop entries after 15 min |

### 7.5 The one-line summary

> You can revoke instantly, but you pay for it: check Redis on every request
> (sessions with extra steps), keep a revoked list in memory synced via
> pub/sub (fast but tricky), or only check on sensitive routes (a banned user
> can still read for a few minutes).

---

## 8. Sessions don't need refresh tokens: sliding expiration

**Refresh tokens solve a problem only JWTs have.** A self-contained token
can't be revoked, so it's kept short-lived and a revocable refresh token
re-issues it. A session is already checked on the server every request, so it
can live a long time and still be revoked at any moment. There's nothing to
refresh.

Instead, a session uses **sliding expiration**, also called an **idle
timeout**: every use pushes its expiry forward. ("Sliding window" usually
means a rate-limiting technique, which is different.)

### 8.1 Five details that make it correct

**1. An absolute cap as well as the idle timeout.** With sliding alone, a
session used every day never expires, so a stolen session id could be kept
alive forever. OWASP's session guidance recommends both limits:

- **Idle timeout** (30 days): the session ends after this long without use.
- **Absolute timeout** (90 days after login): the session ends regardless.
  Enforced with `createdAt` stored in the session.

**2. Extend the Redis expiry in the same round trip as the read.**
`GETEX key EX <seconds>` returns the value and resets its expiry in one
command, so sliding costs no extra network call:

```ts
const raw = await redis.getEx(`sess:${hash}`, IDLE_SECONDS);   // GETEX: read + slide in one round trip
if (!raw) throw new Unauthorized();
const session = JSON.parse(raw);
if (nowSec() - session.createdAt > ABSOLUTE_SECONDS) {         // absolute cap
  await destroySession(hash);
  throw new Unauthorized();
}
```

**3. Slide the cookie too, or the browser drops it anyway.** If login set the
cookie to `Max-Age=30 days`, the browser deletes it after 30 days even though
Redis kept extending the session. When the session is extended, re-send
`Set-Cookie` with a fresh `Max-Age`. Once a day is enough.

**4. A new session id at login.** Always create a brand-new id at login;
never reuse one the browser brought with it. This prevents **session
fixation**: an attacker plants a known session id in the victim's browser,
the victim logs in, and the attacker's id is now authenticated. Also issue a
new id when the account's privileges change.

**5. Require a recent login for sensitive actions.** A 30-day session is fine
for browsing but not for changing email or password, or deleting the
account. Store `authenticatedAt` in the session. On those routes, require it
to be recent (10 minutes); otherwise ask for the password again. This gives
the "short-lived for risky things" benefit of access tokens without any
refresh machinery.

### 8.2 Each JWT mechanism has a simpler session counterpart

| JWT + refresh | Sessions |
|---|---|
| Short access-token lifetime | Recent-login check for sensitive actions |
| Refresh-token rotation | New session id at login and on privilege change |
| Refresh-token expiry | Idle timeout (sliding) + absolute cap |
| Revocation by blocklist | `DEL` the session |
| Retry-on-401 logic in the client | Not needed |

Every problem still exists with sessions, but each is solved by a few lines
on the server rather than coordination between client and server.

---

## 9. Rules of thumb from this discussion

- **Blocklists fail open; allowlists fail closed.** A blocklist allows access
  unless it finds a reason not to, so losing its data means losing
  revocations. An allowlist denies access unless it finds a reason to allow,
  so losing its data only means users sign in again. For security, prefer the
  design that fails closed.
- **Caching data that changes creates staleness bugs.** A role inside a token
  is a copy of the database value that can't be updated or deleted. Every
  copy needs a way to be refreshed or rebuilt. In the new app, the same
  applies to `users.xpTotal`, which must be rebuildable from `xp_events`.
- **"Can this be revoked?" means "does the server check something it controls
  on each request?"** This applies to any credential: sessions, JWTs, API
  keys. A credential the server never looks up after issuing it can only
  expire.
- **State the cost in the same sentence as the benefit.** "Saves a lookup per
  request, at the cost of up to N minutes of revocation delay."
- **Pull vs push:**
  - **Pull** means fetching fresh data every time you need it. Use it when
    every read must be exact, or when changes are frequent.
  - **Push** means having changes delivered to you when they happen. Use it
    when reads far outnumber changes and a copy that's a few milliseconds
    old is fine.
  - The same choice appears elsewhere in CodeQuest: submission status is
    pulled; contest leaderboards (v2) are pushed over SSE.
- **Cheap checks for low-risk requests, strict checks for high-risk ones.**
  Option 3 above, the recent-login check in §8, and profile stats cached for
  60 seconds while verdicts and XP are exact.
- **Put the hot path in one round trip.** Every authenticated request runs the
  session check, so `GETEX` (read + extend) instead of `GET` + `EXPIRE` halves
  the Redis calls on the most frequent code path in the app.
