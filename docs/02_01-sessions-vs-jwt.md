# 02_01 · Sessions vs JWT

_A discussion from 2026-09-25. It is an architecture decision
record (a short document that writes down one design decision and the reasons
for it). It goes deeper into two parts of `02-architecture.md`: §2.5, which
says why CodeQuest uses sessions, and §7.1, which says how those sessions
work._

## What this is about, in one paragraph

When you log in to a website, the server has to remember who you are on every
later request. There are two common ways to do that. With a **JWT** (JSON Web
Token), the server writes your details (your id, your role) into a signed
token and gives it to the browser, and the browser sends it back each time.
With a **server-side session**, the server gives the browser only a random id,
and keeps your details on its own side. The old CodeQuest used JWTs. This
document looks at the problems that caused, explains why "the web prefers JWT"
is not really true, and explains why the new CodeQuest uses sessions instead.
It also covers the clever ways people try to make JWTs revocable, and why each
one ends up costing about the same as a session.

**The decision:** CodeQuest uses **server-side sessions**. The browser holds a
random id in an `httpOnly` cookie (a cookie that JavaScript running in the page
cannot read), and the session data itself lives in Redis (a fast in-memory
database). CodeQuest does **not** use JWTs for its own logins. JWTs still show
up where they make sense, such as the ID token Google sends back during "Sign
in with Google" (see Topic 3, part 3.4).

A few words used throughout:

| Word | Meaning |
|---|---|
| **Claim** | One piece of information inside a JWT, such as `role: 'admin'` |
| **Revoke** | Make a login stop working before it would normally expire |
| **Lookup** | The server asking a database (Redis or MongoDB) for something |
| **Blocklist** | A list of things that are **not** allowed. Anything not on it gets in |
| **Allowlist** | A list of things that **are** allowed. Anything not on it is refused |
| **401 / 403** | HTTP error codes. 401 means "I don't know who you are". 403 means "I know who you are, and you're not allowed" |

---

## Topic 1: JWT problems in the old CodeQuest

All file references in this topic point to the old project in `../codequest/`.
The problems are listed with the most serious first.

### 1.1 A demoted admin stays an admin for up to an hour (a security bug)

This is the worst one. Here is how it happens, step by step:

- In `src/middleware/adminMiddleware.js`, line 30 checks `payload.role`. That
  is the role that was written into the token **at login time**.
- Line 37 then loads the user from MongoDB. But it never looks at the user's
  **current** role in that record.
- Now suppose an admin demotes someone using `updateUserRole`
  (`src/controller/userController.js`, line 190). The database now says that
  person is a normal user. But their token still says `role: 'admin'`, and it
  will keep saying that until the token expires. Tokens expire 60 minutes
  after login (`userController.js`, line 70).
- Meanwhile the frontend's `AdminRoute.jsx` (line 10) reads the fresh role
  from the `/me` endpoint, and so it hides the admin pages. **The result is
  that the UI says "you're not an admin", while the API still treats the
  person as an admin.**

**The root cause:** treating data that can change (the role) as if it were
fixed, just because it was put inside a signed token.

**The fix:** check `user.role` from the database record that line 37 already
loads, instead of the role in the token.

### 1.2 The token needs no lookup, yet every request did two lookups anyway

On every request, `userMiddleware.js` ran three steps:

- `jwt.verify` (line 21), which checks the token's signature.
- A Redis `EXISTS` check against the blocklist (line 32), to see if the token
  had been logged out.
- A MongoDB `findById` (line 33), to load the user.

The main selling point of a JWT is that the server can trust it **without**
any lookup, because the signature proves it is genuine. The old app made two
lookups on every request anyway. So it got none of the JWT's benefit, and it
still paid all of the JWT's costs described below.

### 1.3 Logout relied on a blocklist, and the blocklist "fails open"

"Fails open" means that when something breaks, it lets people **in** rather
than keeping them out.

- Logout (`userController.js`, line 92) added the token to a blocklist stored
  in Redis.
- Redis can lose that data. It can restart without persistence (without saving
  its data to disk), someone can flush it (wipe it), or it can evict keys
  (throw some away) when it runs low on memory. When the blocklist entries
  disappear, **tokens that were logged out start working again**, until they
  expire on their own.
- Logout only cancelled the one token sent with that request. There was no
  "log out everywhere", because the server never kept track of which other
  tokens existed for that user.
- Deleting an account only worked because of the `findById` from 1.2: a
  deleted user is not found by that lookup, so the request fails. In other
  words, **the database lookup was doing the real authentication, not the
  JWT.**

### 1.4 One secret signed every token, including admin tokens

- A JWT is signed with a secret key, here `JWT_SECRET_KEY`. If that secret
  ever leaks (through the `.env` file, a log line or a backup), anyone can
  create a token that the server will accept as valid.
- Combine that with bug 1.1. An attacker only needs the `_id` of some existing
  user, and the API handed those out (`userController.js`, line 76). A forged
  token containing `{ _id, role: 'admin' }` would pass `adminMiddleware`.
- The tokens had no key id (the `kid` claim, which says which key signed the
  token). Without it, you can't have an old and a new key working side by side.
  So changing the secret would log out every single user at once.

### 1.5 The cookie was missing security flags

- `userController.js` line 72 set the cookie with only
  `{ maxAge, httpOnly: true }`.
- There was no `secure` flag. Without it, the browser would also send the
  cookie over plain, unencrypted HTTP.
- There was no explicit `sameSite` setting. (`sameSite` controls whether the
  browser sends the cookie on requests coming from other websites.)
- It still worked in development because `localhost:5173` and `localhost:7000`
  count as the same **site** (for this rule, the port number doesn't matter).
  But if the frontend and the API had been deployed on different domains, the
  cookie would have needed `SameSite=None; Secure`, plus CSRF protection.
  (CSRF, cross-site request forgery, is an attack where another website tricks
  your browser into sending a request, with your cookie, to the API.)

### 1.6 A hard one-hour expiry with no refresh

- Imagine someone working on a hard problem for 70 minutes. When they press
  Submit, they get a 401, because their token expired at the 60-minute mark.
- The usual JWT fix for this is a **refresh token**: a second, longer-lived
  token used to get a new access token. But a refresh token has to be stored
  on the server and be revocable. That makes it a session anyway (see
  Topic 5).

### 1.7 Smaller issues

- **Two copies of the same check drifted apart.** When the token was missing,
  `userMiddleware` returned 401, but `adminMiddleware` returned 403 (line 14).
  403 means "we know who you are, and you're not allowed", so it was the wrong
  code for "no token at all". The admin check should be the normal user check
  plus a role check on top, not a second, separate copy.
- **`jwt.verify` didn't pin an algorithm.** Pinning means passing
  `{ algorithms: ['HS256'] }`, so that only that one signing algorithm is
  accepted. The library version in use, jsonwebtoken 9.0.3, already blocks
  the classic attacks by default (`alg: none`, which means "this token isn't
  signed at all", and key-type confusion, where the attacker tricks the server
  into using the wrong kind of key). So the risk was low, but you should pin it
  anyway.
- **The email was inside the token's payload.** JWTs are **signed, not
  encrypted**. Signing stops people changing the contents, but it doesn't hide
  them. Anyone holding the cookie can decode it and read the email.
- **The whole token string was used as the Redis blocklist key.** The standard
  approach is to give each token a short unique id (the `jti` claim) and use
  that as the key.

### 1.8 What the old code did right

It wasn't all bad. These parts were correct:

- The token was stored in an `httpOnly` cookie rather than in `localStorage`
  (where any script on the page could read it).
- Each blocklist entry was set to expire at exactly the moment the token
  itself expired (`EXAT` = `exp`). `EXAT` is the Redis option "expire at this
  timestamp", and `exp` is the token's expiry claim. So the blocklist never
  kept entries longer than needed.
- A minimum length for the secret was enforced by env validation (the code
  that checks environment variables at startup).
- The login returned the same "Invalid Credentials" message for a wrong email
  and for a wrong password (`userController.js`, lines 57 to 63). That way an
  attacker can't use the message to find out which emails are registered.

### 1.9 Bonus finding, not about JWT: a timing leak at login

The message was the same, but the **time taken** was not. `bcrypt.compare`
(the slow password check) only ran when the user existed. At cost 12 (bcrypt's
difficulty setting) it takes a few hundred milliseconds. So a login for a
registered email was noticeably slower than one for an unknown email, and the
response time still revealed whether an email was registered.

**The fix:** always run a hash comparison. When the user doesn't exist, compare
against a dummy hash, so both cases take about the same time.

---

## Topic 2: Is "web standards prefer JWT" true?

**Not quite.** JWT (defined in RFC 7519, the official standard document) is
just a **format** for signed claims. It is not a recommendation to use it for
logins.

The standards that do use JWTs, OAuth 2.0 and OpenID Connect, use them in one
specific situation: **when the service checking the token is not the one that
issued it.** For example, Google issues an ID token, and your app verifies it.
Your app can't look inside Google's database, so a signed token is the right
tool.

For a first-party web app, where the **same backend** both issues the login
and checks it, cookie sessions are the normal, mainstream default.
`express-session`, Django and Laravel all store sessions on the server.

**Size doesn't decide it either.** Large apps such as GitHub use sessions too.
What decides it is whether the same backend issues and checks the login.

### Two separate choices

People often mix up two different questions. This table pulls them apart:

| | Sent in a cookie | Sent in an `Authorization` header |
|---|---|---|
| **Opaque id** (a meaningless random id; the server stores the data) | **New CodeQuest** | Mobile apps, API keys |
| **Self-contained** (the JWT carries the data itself) | **Old CodeQuest** | OAuth access tokens between services |

"Session vs JWT" is really about the **rows**: where the user's data lives.
"Cookie vs header" is the **columns**: a separate choice about how the token
travels to the server.

---

## Topic 3: Defending sessions

### 3.1 The argument in brief

This is the short version you could say in an interview or review:

> "The browser and API are first-party, on one origin. I need instant
> revocation for logout, bans, role changes and password resets, and that
> means a lookup per request whichever token I pick. Once a lookup is
> unavoidable, a random session id is smaller, can't be forged, and
> revocation is just deleting it. I'd choose JWTs when the checking service
> can't reach the issuer's data cheaply: multiple services, third-party API
> clients, or edge verification."

In plain words: the frontend and the API belong to the same project and live
on one origin (the same domain). CodeQuest needs to cancel logins instantly
for logout, bans, role changes and password resets. Doing that needs a lookup
on every request, no matter which kind of token you use. And once you are
doing a lookup anyway, a random session id is the better choice: it is
smaller, nobody can forge it, and revoking it is just deleting it. JWTs are
the better choice when the service checking the token can't cheaply reach the
issuer's data. Examples are many separate services, third-party developers
calling your API, or "edge verification" (checking tokens on servers spread
around the world, far from the main database).

### 3.2 Where JWT genuinely wins

- When many independent services each need to check who the user is.
- When external developers call your API.
- When there are so many requests that a Redis lookup on each one becomes a
  bottleneck. CodeQuest is nowhere near that: at its scale, a Redis `GET`
  costs well under a millisecond.

### 3.3 If JWT were ever needed

Use a short-lived access JWT, valid for 5 to 15 minutes and checked with no
lookup, together with a refresh token that is stored on the server and can be
revoked. Topic 5 explains what that setup costs.

### 3.4 JWTs still appear in the new app

In Google sign-in (Phase 1), Google sends back an **ID token**, which is a
JWT. CodeQuest verifies its signature and its `aud` claim (the "audience",
which says which app the token was made for, so a token meant for another app
is rejected). This is JWT used across a trust boundary between two parties,
Google and CodeQuest, which is exactly the job it was designed for.

---

## Topic 4: The architectural difference, side by side

This table compares the old design with the new one described in architecture
§7.1.

| | Old (JWT) | New (sessions) |
|---|---|---|
| What the cookie holds | Signed claims: `_id`, email, role | A random 32-byte id, nothing else |
| Where the truth lives | Partly in the token, partly in the database | Only on the server |
| The check on each request | Is this token on the **blocklist**? | Is this session on the **allowlist** (does it exist)? |
| If Redis is wiped | **Logged-out tokens work again** (fails open) | Everyone is logged out (fails closed) |
| Logout | Blocklist this one token until it expires | `DEL` (delete) the session |
| Log out everywhere | Impossible | Delete every session in the user's set |
| Role change | Out of date for up to an hour (bug 1.1) | Takes effect on the very next request, because the role is read from the database |
| If the secret leaks | Anyone can forge a token for any user, admins included | Nothing to forge; Redis stores only hashes of the ids |
| Expiry | Fixed at 1 hour | Extends each time you use it (30 days), with an optional overall cap |
| Middleware | Two copies that drifted apart | `requireAuth` plus `requireRole('admin')` |

"Fails closed" is the opposite of "fails open": when something breaks, people
are kept **out**. Here the worst case is that everyone has to log in again,
which is annoying but safe.

"Redis stores only hashes of the ids" means Redis doesn't keep the session id
itself, only a fingerprint of it (made with SHA-256). So even someone who reads
Redis can't copy a real session id into a cookie.

The new `requireAuth` middleware looks roughly like this:

```ts
const sid = req.cookies.sid;
const session = sid && await redis.get(`sess:${sha256(sid)}`);   // must exist (allowlist)
if (!session) throw new Unauthorized();
req.user = await usersRepo.findById(session.userId);              // role is always fresh
```

What each line does:

1. Read the session id from the `sid` cookie.
2. Hash it with SHA-256 and look up `sess:<hash>` in Redis. The session must
   exist there; that is the allowlist check.
3. If there is no session, refuse the request with a 401.
4. Load the user from the database, so the role is always the current one.

This makes the **same number of lookups** as the old middleware. The
difference is that now each lookup answers a question that actually matters.

---

## Topic 5: Can a JWT be revoked or banned instantly?

### 5.1 Why a token blocklist can't ban someone

There is an important difference between logging out and being banned:

- **At logout, the server has the token.** The user's browser sends it in the
  cookie with the logout request, so the server can put it on the blocklist.
- **When an admin bans someone, the server doesn't have their token.**
  `jwt.sign` creates the token, puts it in a cookie, and keeps no record of it.
  So the server doesn't know which tokens that user holds, or on how many
  devices.

The only way to know every token is to record each one when it is issued. But
then the server is storing every active login, and that is exactly what a
session store is.

### 5.2 Ways to revoke instantly, and what each costs

| Approach | How it works | Instant ban? | Lookup on every request? |
|---|---|---|---|
| **Blocklist by token** (the old code) | Store the token, or its `jti`, at logout | Only for tokens you've seen | Yes |
| **Blocklist by user** | Store `banned:<userId>` in Redis and check it on every request | ✅ | Yes |
| **Token version / cutoff** | Keep a `user.tokensValidAfter` time, and reject any token whose `iat` (issued-at time) is older. Move that time forward on a ban, a password change or "log out everywhere" | ✅ | Yes |
| **Short access token + refresh token** | Access JWTs last 5 to 15 minutes; ban by revoking the stored refresh token | ❌ The access token keeps working until it expires | No, only when refreshing |

Here is what a cutoff check looks like:

```ts
const payload = jwt.verify(token, secret, { algorithms: ['HS256'] });
const cutoff = await redis.get(`auth:cutoff:${payload.sub}`);   // ← a lookup per request
if (cutoff && payload.iat < Number(cutoff)) throw new Unauthorized();
```

Line by line: verify the token (with the algorithm pinned to `HS256`), fetch
the cutoff time for this user (`payload.sub` is the user id) from Redis, and
refuse the request if the token was issued before that cutoff. Note the second
line: that is a lookup on every request.

**Every design that gives an instant ban adds a lookup on every request.** The
only design that avoids the lookup gives up instant revocation.

**So you can't have both no-lookup checking and instant revocation.** You have
to pick one:

- **Instant revocation:** you pay for a lookup on every request. The JWT then
  becomes just a signed pointer to data on the server, and a random session id
  does the same job more simply.
- **No lookup:** you accept that revoking takes as long as the access token's
  lifetime.

### 5.3 In the old code, banning would have been one line

The old middleware already loaded the user on every request
(`userMiddleware.js`, line 33). So a ban check would have been just this:

```js
if (!user || user.isBanned) throw new AppError(403, "Account suspended");
```

That is instant. But it is instant **because of the database lookup, not
because of the JWT**. It is the same one-line pattern as the fix for bug 1.1.

---

## Topic 6: Access + refresh tokens, the honest JWT compromise

This is the most common way real systems use JWTs for login. You get two
tokens: a short-lived **access token** sent with every request, and a
longer-lived **refresh token** used only to get a new access token when the old
one expires.

### 6.1 What is stateful and what isn't

"Stateful" means the server has to store something and look it up.
"Stateless" means it doesn't.

- **Refreshing is stateful.** The server stores the refresh token and checks
  it.
- **Checking each normal request stays stateless.** The access token is
  verified from its signature alone.

That split is the whole point of the design. Starting, renewing and ending the
login (the session lifecycle) is stateful; checking each request is not.
(Strictly speaking, JWT is only a format. What makes stateless checking
possible is that the token is **self-contained**, meaning it carries all the
data needed.)

**Summary:** access + refresh is really a session, with a short-lived
stateless token (the JWT) in front of it to cut down on lookups.

### 6.2 What it costs

1. **The access token's lifetime is how long revocation takes.** A banned or
   demoted user keeps access until their access token expires. Role changes
   lag in the same way, because the role inside the token stays out of date
   until the next refresh.
2. **It adds complexity:**
   - Refresh-token rotation (handing out a new refresh token each time one is
     used), with reuse detection in case one is stolen.
   - Code in the client that notices a 401, refreshes, and tries the request
     again.
   - A race condition when several browser tabs refresh at the same moment and
     one of them sends a refresh token that was just replaced. If that is
     handled naively, the user gets logged out.
3. **The saving is smaller than it looks.** It saves one lookup per access-token
   lifetime per active device, not per user. And most requests still hit the
   database for their actual data anyway. What's saved is only the **auth**
   lookup.

**The access token's lifetime is a security setting.** Five minutes means more
refreshes but faster bans. An hour means fewer refreshes, but a leaked token
keeps working for an hour. Most real systems choose 5 to 15 minutes.

**In one line:** you are trading instant revocation and simpler code for fewer
lookups.

---

## Topic 7: Instant revocation on top of access + refresh

You can still revoke instantly with access + refresh tokens. The real question
is what the lookup costs. The trick is to put a session id claim (`sid`) inside
the access token, and then choose one of three levels.

### 7.1 Option 1: ask Redis on every request ("pull")

```
request ──► API ──"is sid revoked?"──► Redis ──► API ──► response
request ──► API ──"is sid revoked?"──► Redis ──► API ──► response
request ──► API ──"is sid revoked?"──► Redis ──► API ──► response
```

The diagram shows that every single request makes a trip to Redis to ask "is
this `sid` revoked?" before the API answers. The code:

```ts
if (await redis.exists(`revoked:${payload.sid}`)) throw new Unauthorized();
```

This is fully instant. But it costs the same as sessions, the access token's
benefit (no lookup) is gone, and you still have all the refresh machinery.
**If you're paying this price, plain sessions give the same result more
simply.**

### 7.2 Option 2: a revocation list in each server's memory, kept in sync by pub/sub ("push")

Pub/sub (publish/subscribe) is a messaging feature in Redis: one part of the
system publishes a message on a named channel, and everything subscribed to
that channel receives it straight away.

```
admin bans user ──► Redis PUBLISH "revoked" sid ──► API server A: revoked.add(sid)
                                                └──► API server B: revoked.add(sid)

request ──► API: revoked.has(sid)?  (memory, no network) ──► response
request ──► API: revoked.has(sid)?  (memory, no network) ──► response
```

The top part shows what happens on a ban: the `sid` is published once on the
`"revoked"` channel, and every API server adds it to its own in-memory list.
The bottom part shows normal requests: each one only checks the server's own
memory, with no network call.

```ts
const revoked = new Set<string>();                          // lives in this process's memory
subscriber.subscribe('revoked', (sid) => revoked.add(sid)); // once, at startup
// per request:
if (revoked.has(payload.sid)) throw new Unauthorized();
```

The first two lines run once, when the server starts: create an empty set in
memory, and subscribe to the `revoked` channel so each published `sid` gets
added. The last line runs on each request and is just a check of that set.

Points to know about this option:

- **The list stays tiny.** An entry only needs to be kept for as long as an
  access token can live. After that, any token with that `sid` has expired
  anyway. (This is the same idea as the old `EXAT` blocklist, but keyed by
  `sid` and held in memory.)
- **This is the option that keeps both benefits:** no lookup per request, and
  revocation within milliseconds.
- **The cost is the work of getting it right.** If a server process restarts,
  or briefly loses its connection to Redis, it misses any messages sent during
  that time. It must reload the list from Redis when it reconnects. Otherwise
  it lets revoked tokens through until they expire. The list fails open, so
  this reload logic is essential.

### 7.3 Option 3: check only on sensitive routes

Stay stateless (no lookup) for reading. Do the Redis check only for dangerous
actions: admin endpoints, payments, password or email changes, and deleting
data. A banned user can still **browse** for up to 15 minutes but can't **do
harm**. Many real systems accept this trade-off.

### 7.4 How options 1 and 2 differ

The difference is **where the revocation list lives at the moment a request
checks it**, and so which event causes network traffic.

- **Option 1** keeps one single copy of the truth (in Redis) and pays a network
  round trip to read it on every request. **The work grows with the number of
  requests.**
- **Option 2** keeps a copy inside every server, so reading costs nothing, and
  pays instead for keeping those copies in sync. **The work grows with the
  number of revocations.**

Requests happen constantly: every click, every poll for a submission's result.
Revocations are rare: a few bans a day. At 1,000 requests per second, option 1
makes 1,000 Redis calls per second, while option 2 sends one message per ban.

| | Option 1 (pull) | Option 2 (push) |
|---|---|---|
| Where the check happens | In Redis, over the network | In the server's own memory |
| Cost per request | A network round trip (about 0.2 to 1 ms) | A set lookup (nanoseconds) |
| What causes network traffic | Every request | Every revocation |
| Always up to date? | Yes: Redis is the one copy | Almost: each copy updates milliseconds after a ban |
| If Redis is down | You can't check. You must either reject everyone or let everyone in | Existing lists keep working, but new bans don't reach anyone |
| If a server misses a message | Can't happen | That server accepts the revoked token until it expires, unless it reloads on reconnect |
| Complexity | One line | Subscribe, reload on startup and on reconnect, drop entries after 15 minutes |

### 7.5 The one-line summary

> You can revoke instantly, but you pay for it: check Redis on every request
> (sessions with extra steps), keep a revoked list in memory synced via
> pub/sub (fast but tricky), or only check on sensitive routes (a banned user
> can still read for a few minutes).

---

## Topic 8: Sessions don't need refresh tokens, they use sliding expiration

**Refresh tokens solve a problem that only JWTs have.** A self-contained token
can't be revoked, so it is kept short-lived, and a revocable refresh token is
used to issue new ones. A session, on the other hand, is already checked on the
server on every request. So it can live for a long time and still be revoked at
any moment. There is nothing to refresh.

Instead, a session uses **sliding expiration**, also called an **idle
timeout**: every time the session is used, its expiry moves forward. (Be
careful: the phrase "sliding window" usually means a rate-limiting technique,
which is something different.)

### 8.1 Five details that make it correct

**1. An absolute cap as well as the idle timeout.** With sliding expiry alone,
a session that is used every day would never expire. So a stolen session id
could be kept alive forever. OWASP's session guidance (OWASP is a well-known
web security organisation) recommends having both limits:

- **Idle timeout (30 days):** the session ends after 30 days without being
  used.
- **Absolute timeout (90 days after login):** the session ends at that point no
  matter what. This is enforced by storing `createdAt` in the session.

**2. Extend the Redis expiry in the same round trip as the read.** The Redis
command `GETEX key EX <seconds>` returns the value **and** resets its expiry in
one command. So sliding the expiry costs no extra network call:

```ts
const raw = await redis.getEx(`sess:${hash}`, IDLE_SECONDS);   // GETEX: read + slide in one round trip
if (!raw) throw new Unauthorized();
const session = JSON.parse(raw);
if (nowSec() - session.createdAt > ABSOLUTE_SECONDS) {         // absolute cap
  await destroySession(hash);
  throw new Unauthorized();
}
```

What it does: read the session and push its expiry forward by `IDLE_SECONDS`
in one call; refuse if it doesn't exist; parse the stored JSON; and if more
than `ABSOLUTE_SECONDS` have passed since `createdAt`, delete the session and
refuse.

**3. Slide the cookie too, or the browser drops it anyway.** Suppose login set
the cookie with `Max-Age=30 days`. The browser will delete that cookie after 30
days, even though Redis kept extending the session. So when the session is
extended, the server should send `Set-Cookie` again with a fresh `Max-Age`.
Doing this once a day is enough.

**4. A new session id at login.** Always create a brand-new session id when the
user logs in. Never reuse an id the browser already had. This prevents
**session fixation**, an attack where the attacker plants a session id they
know into the victim's browser, the victim logs in, and now the attacker's id
is logged in as the victim. Also issue a new id whenever the account's
privileges change.

**5. Require a recent login for sensitive actions.** A 30-day session is fine
for browsing, but not for changing your email or password, or deleting your
account. Store `authenticatedAt` (the time the user last logged in) in the
session. On those sensitive routes, require it to be recent (within 10
minutes); otherwise ask for the password again. This gives you the "short-lived
for risky things" benefit of access tokens, without any refresh machinery.

### 8.2 Each JWT mechanism has a simpler session version

| JWT + refresh | Sessions |
|---|---|
| Short access-token lifetime | Recent-login check for sensitive actions |
| Refresh-token rotation | New session id at login and when privileges change |
| Refresh-token expiry | Idle timeout (sliding) plus an absolute cap |
| Revocation by blocklist | `DEL` the session |
| Retry-on-401 logic in the client | Not needed |

Every one of these problems still exists with sessions. The difference is that
each one is solved by a few lines on the server, instead of needing the client
and the server to coordinate.

---

## Topic 9: Rules of thumb from this discussion

These are general lessons that apply beyond logins.

- **Blocklists fail open; allowlists fail closed.** A blocklist lets you in
  unless it finds a reason not to. So if its data is lost, every revocation is
  lost too. An allowlist keeps you out unless it finds a reason to let you in.
  So if its data is lost, users just have to sign in again. For security,
  prefer the design that fails closed.
- **Caching data that changes creates staleness bugs.** "Stale" means out of
  date. A role inside a token is a copy of the database value, and that copy
  can't be updated or deleted. Every copy needs some way to be refreshed or
  rebuilt. In the new app the same rule applies to `users.xpTotal`, which must
  be rebuildable from `xp_events`.
- **"Can this be revoked?" really means "does the server check something it
  controls on every request?"** This is true for any credential: sessions,
  JWTs, API keys. A credential the server never looks up again after issuing it
  can only expire; it can't be revoked.
- **State the cost in the same sentence as the benefit.** For example: "Saves
  a lookup per request, at the cost of up to N minutes of revocation delay."
- **Pull vs push:**
  - **Pull** means fetching fresh data every time you need it. Use it when
    every read must be exactly right, or when the data changes often.
  - **Push** means having changes sent to you when they happen. Use it when
    reads far outnumber changes, and a copy that is a few milliseconds old is
    fine.
  - The same choice appears elsewhere in CodeQuest: submission status is
    pulled, while contest leaderboards (in v2) are pushed over SSE
    (Server-Sent Events, a way for the server to keep sending updates to the
    browser over one open connection).
- **Cheap checks for low-risk requests, strict checks for high-risk ones.**
  Examples: Option 3 in Topic 7, the recent-login check in Topic 8, and profile
  stats that are cached for 60 seconds while verdicts and XP are always exact.
- **Keep the hot path to one round trip.** The "hot path" is the code that runs
  most often. Every logged-in request runs the session check, so using `GETEX`
  (read and extend in one command) instead of `GET` followed by `EXPIRE` halves
  the Redis calls on the most frequently run code in the whole app.

---

## In short

- CodeQuest uses server-side sessions: a random id in an `httpOnly` cookie,
  with the data in Redis. JWTs are only used where another party issues the
  token, like Google's ID token.
- The old JWT setup had real bugs: demoted admins kept admin access for up to
  an hour, logout could be undone by losing Redis data, and one leaked secret
  could forge admin tokens.
- Instant revocation always needs a lookup on every request. Once you pay for
  that lookup, a session is simpler than a JWT.
- Access + refresh tokens are really a session with a short-lived JWT in front.
  They save lookups but delay revocation and add complexity.
- Sessions handle the same problems more simply: sliding 30-day idle timeout, a
  90-day absolute cap, a new id at login, and a recent-login check for
  sensitive actions.
- General lesson: prefer designs that fail closed, and always say what a
  benefit costs.
