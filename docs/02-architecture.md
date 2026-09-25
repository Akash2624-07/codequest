# CodeQuest Revamped — Architecture

_2026-09-25 · Builds on `01-project-brief.md`. Covers v1 in detail. v2 and v3
appear only where they affect a v1 decision._

---

## 1. The system at a glance

```
Browser
  │  HTTPS, one origin
  ▼
nginx ─── "/"      ──► static files (apps/web build)
      └── "/api/*" ──► API process        (apps/api/src/main.ts)
                          │                     │ POST /submissions/batch
                          ▼                     ▼
                     MongoDB  ◄──┐          Judge0  (its own queue + workers)
                     Redis    ◄──┤              ▲
                                 │              │ GET /submissions/batch
                          Worker process   (apps/api/src/worker.ts)
                           ─ judge poller
                           ─ BullMQ jobs: emails, daily problem, …
```

- **API process:** handles HTTP. It validates input, reads and writes the
  database, and hands code to Judge0. It never waits for code to finish.
- **Worker process:** does everything slow or scheduled. It polls Judge0 for
  every user at once, decides verdicts, awards XP, and runs BullMQ jobs.
- **The API and the worker never call each other.** They share state through
  MongoDB and jobs through Redis. Either can restart without the other
  noticing. That's why the worker doesn't "send" a result to the API: it
  writes the verdict into MongoDB, and the API reads it from there when the
  browser asks.
- **Both processes come from the same codebase** (`apps/api`) with two entry
  points, so they share services, repositories and config.

---

## 2. What changes from the old codequest, and why

For each change: **why** we're changing, **what we gain**, and **new effects**
(what now works differently, or what you now have to handle). Section 2.16
lists what stays the same, and why.

### 2.1 CommonJS → ES modules (ESM)

First, the naming: `.cjs` and `.mjs` are file extensions that force one module
system for a single file. The old repo was **CommonJS** (`require`,
`module.exports`, `"type": "commonjs"`), which is why its `eslint.config.mjs`
needed `.mjs`: it's an ESM file inside a CommonJS package. We're moving
**from CommonJS to ESM**. With `"type": "module"` in every `package.json`,
plain `.ts` and `.js` files are ESM, and no `.mjs` is needed.

**Why**
- ESM is JavaScript's standard module system. The old frontend was already
  ESM, so the backend was the odd one out. With `packages/shared` imported by
  both, one module system avoids shipping two formats.
- Vitest is built around ESM. `vi.mock` works with `import`. With `require` it
  silently didn't, which forced the `vi.spyOn` + `require.cache` workarounds
  in `reference/testing-faq.md`.
- TypeScript with `module: "NodeNext"` emits ESM that Node runs as-is.
- New libraries increasingly ship ESM only. Recent Node can `require()` many
  ESM packages, but ESM is where the ecosystem is heading.

**Gains**
- Real module mocking in tests.
- Top-level `await` in entry files (`await connectDatabase()`).
- One import style everywhere: API, worker, web, shared.

**New effects on the project**

1. **Syntax.**
   ```ts
   // Old (CommonJS)
   const { LANGUAGE_MAP } = require('./utils/languages');
   module.exports = { submitBatch };

   // New (ESM + TypeScript)
   import { LANGUAGE_MAP } from './languages.js';
   export function submitBatch() { /* … */ }
   ```
2. **Relative imports need a file extension, and it's `.js` even though the
   file is `.ts`.** TypeScript maps `./languages.js` to `languages.ts`. Leaving
   it off gives `ERR_MODULE_NOT_FOUND` at runtime. Expect this on day one.
3. **Imports are hoisted: every imported module runs before your file's
   body.** The old `src/index.js` relied on statement order:
   ```js
   require('dotenv').config();                      // ran first…
   const redisClient = require('./config/redis');   // …so this saw the env
   ```
   In ESM, `config/redis` would run *before* any `dotenv.config()` call in the
   body. New rule: the environment is loaded by Node before any module runs
   (`node --env-file=.env`), and only `config/env.ts` reads `process.env`
   (see 2.12).
4. **`__dirname` and `__filename` don't exist.** Use `import.meta.dirname` and
   `import.meta.filename`.
5. **JSON imports need an attribute:** `import data from './x.json' with { type: 'json' }`,
   or read the file with `fs`.
6. **Circular imports fail differently.** An ESM cycle can throw
   `ReferenceError: Cannot access 'x' before initialization`. Keep
   dependencies flowing one way (routes → controllers → services →
   repositories) and cycles don't form.
7. **CommonJS-only packages still work.** Import their default export and
   destructure it if named imports fail.
8. **Config files for tools that expect CommonJS** get a `.cjs` extension:
   the mirror image of the old `eslint.config.mjs`.

### 2.2 JavaScript → TypeScript

> Full reasoning, the old bugs it would have caught, and a learning path:
> `02_02-javascript-to-typescript.md`.

**Why:** shared types across API, worker and web, and whole classes of bugs
caught before running.

**Gains**
- **One schema gives both runtime validation and a static type.** A zod
  schema in `packages/shared` validates the request on the server, validates
  the form in the browser, and `z.infer` produces the TypeScript type for
  both.
- **`noUncheckedIndexedAccess` would have flagged the old partial-batch bug.**
  `submissionController.js:145` read `results[index].stdout`, assuming Judge0
  returned exactly one result per test case. With this flag, `results[index]`
  has type `Result | undefined`, so the compiler makes you handle the missing
  case.
- The environment config is typed: `env.JUDGE0_URL` is a `string`, never
  `undefined`.

**New effects**
- **A build step.** `tsx watch` runs `.ts` directly in dev; `tsc` compiles to
  `dist/` for production. CI adds `npm run typecheck`.
- **Mongoose and TypeScript:** schemas are typed with `InferSchemaType`, and
  repositories return plain objects (`.lean()`) typed as domain types, never
  Mongoose documents (see 2.8).
- **`strict: true` from the first commit.** Turning it on later means fixing
  hundreds of errors at once.
- The cost is real: generics, library type errors, and a slower first few
  days.

### 2.3 Two folders → an npm-workspaces monorepo

> Full reasoning, what workspaces do and don't do, and why not Turborepo yet:
> `02_03-monorepo-and-workspaces.md`.

**Why:** the old backend (repo root) and `frontend/` each had their own
`package.json` and copies of the same knowledge. The language list lived in
two places, and the header comment in `utils/languages.js` had to warn about
it.

**Gains:** `packages/shared` holds the zod schemas, domain types and language
list once. One `npm install`. One CI workflow runs every package.

**New effects**
- Commands target a workspace: `npm run dev -w apps/api`,
  `npm install zod -w packages/shared`.
- **Wiring `packages/shared` is the fiddliest part of Phase 0.** In dev, Vite
  and tsx compile its TypeScript source directly. For production builds,
  TypeScript project references (`tsc -b`) build it before `apps/api`. Phase 0
  sets this up step by step.
- One repo, one version history, one set of release tags.

### 2.4 Judging inside the request → worker process + poller

**Why:** the old `submitCode` held the user's HTTP request open while polling
Judge0, so the 20s budget capped throughput at about 8 users. Judge0's own
options move the waiting into Judge0 instead (`wait=true` ties up its web
process, `callback_url` ties up its workers). Full reasoning in brief §5.

**Gains:** Judge0's load depends on how often we poll, not how many users are
waiting. Nothing is lost if a process crashes. There's no hard time limit
from the user's point of view: a busy Judge0 means slower results, not errors.

**New effects**
- **Two processes** to run in dev, and two containers in production.
- **The API returns `202 Accepted`** with a submission id. The frontend polls
  `GET /api/submissions/:id` until it's done, and the UI shows
  Queued → Running → verdict.
- **Runs must now be stored.** The Run button and the playground are async
  too, so the browser needs something to poll. They go in a separate `runs`
  collection that deletes itself after 24 hours (a TTL index), never in
  `submissions`. This keeps the old playground plan's rule: runs never count
  as submissions.
- **Exactly one poller** must run at a time (a Redis lock or a BullMQ job
  scheduler).
- **MongoDB transactions** are needed for finishing a submission (§6.4),
  which means a **replica set** everywhere: a one-node replica set in dev's
  Docker Compose, and `MongoMemoryReplSet` in tests.

### 2.5 JWT + Redis blocklist → server-side sessions in Redis

> Full reasoning, including the old code's JWT bugs and the JWT revocation
> options: `02_01-sessions-vs-jwt.md`.

**Why:** look at what the old `userMiddleware` did on **every** request:
`jwt.verify`, then `redisClient.exists('token:…')`, then `Users.findById`. It
already made a Redis call and a database call per request. A JWT's selling
point is that the server can verify it without a lookup, and the app was
paying for that without using it.

**The new design:** a random 32-byte session id goes in an `httpOnly` cookie.
Redis stores the hashed id → `{ userId, createdAt, userAgent }` with a
sliding 30-day expiry. A per-user set of session ids makes "log out
everywhere" possible.

**Gains**
- Logout is one `DEL`. No blocklist, no `EXAT` arithmetic.
- A "your devices" list and "log out everywhere" come for free.
- No `JWT_SECRET_KEY` to rotate.
- Only the hash of the id is stored, so a Redis leak doesn't leak working
  sessions.

**New effects**
- **Wiping Redis logs everyone out.** By the brief's Redis rule, that's
  acceptable: annoying, not data loss. Turn on Redis AOF persistence so a
  restart doesn't do it.
- **A new cookie setup:** `HttpOnly; Secure; SameSite=Lax`, named `__Host-sid`
  in production (the `__Host-` prefix pins the cookie to our exact origin).
- **CSRF protection:** `SameSite=Lax` plus JSON-only endpoints covers most of
  it. Also reject state-changing requests whose `Origin` header isn't ours.

### 2.6 Password-only → email, Google and GitHub

> Why this is built by hand rather than delegated to Keycloak or a hosted
> provider: `02_04-keycloak-and-identity-providers.md`.

**Why:** users expect social sign-in, and OAuth 2.0 is worth knowing
properly.

**The new design:** an `accounts` collection (`provider`,
`providerAccountId`, `userId`). `users.passwordHash` becomes optional. The
flow is written by hand with `fetch`, without Passport, because the protocol
is the thing to learn (§7).

**New effects**
- **Account linking by email is a security decision.** An OAuth login links
  to an existing user **only if the provider says the email is verified**
  (Google's `email_verified`; GitHub's `/user/emails` → `verified`). Otherwise
  anyone could register a provider account with your email and take over
  your CodeQuest account.
- **OAuth users need a username.** Profiles are public at `/u/:username`, so
  sign-up generates one (e.g. from the email's local part plus a suffix) and
  lets the user change it.
- Two new sets of credentials in env, and redirect URLs registered per
  environment (localhost vs production).

### 2.7 The `problemSolved` array → progress, events and daily stats

**Why:** the array only answered "which problems are solved". XP, streaks,
the heatmap, the revisit queue and journey progress all need *when* and *how
many*.

**The new design**
- `user_problem_progress`: one document per (user, problem). First solved at,
  attempts, hints revealed, spaced-repetition schedule.
- `xp_events`: append-only, with a unique index on (user, source).
- `user_daily_stats`: one document per (user, local date).

**Gains:** every profile chart has a cheap source. XP can't be awarded twice.
Everything derived can be rebuilt from events.

**New effects:** finishing a submission writes to several collections, and
they must succeed or fail together, hence the transaction (§6.4). The
cached totals on `users` (`xpTotal`, `currentStreak`) are caches. A rebuild
script must be able to recompute them.

### 2.8 Controllers calling Mongoose → layers with repositories

**Why:** the Postgres switch before v2 (brief §4). The worker also needs the
same business logic as the API. For example, "finish this submission" runs
in the worker but belongs to the submissions domain.

**The new design:** routes → controllers → services → repositories (§4).

**Gains:** services are testable without HTTP, the worker reuses them
directly, and the database switch touches only `repositories/`.

**New effects:** more files per feature, and a strict rule that nothing
outside `repositories/` imports a Mongoose model.

### 2.9 ObjectId → UUIDv7 string ids

**Why:** ids should survive the Postgres move unchanged, so URLs, references
and logs keep working.

**Gains:** UUIDv7 sorts by creation time, like ObjectId, which keeps indexes
efficient. It's opaque, and Postgres has a native `uuid` type.

**New effects:** `_id: { type: String, default: () => uuidv7() }` on every
schema. A 36-character string is larger than a 12-byte ObjectId, which is
irrelevant at this scale. Public URLs use slugs and usernames, not ids.

### 2.10 No migrations → `migrate-mongo` from Phase 0

**Why:** schema and data changes should be versioned, repeatable scripts,
never manual edits in a Mongo shell.

**Gains:** "database migrations" is true from the first week. Seeding,
index creation and backfills all go through one mechanism, and it rehearses
the discipline Phase 6 needs.

**New effects:** a `migrations/` folder and a `changelog` collection. Every
PR that changes a schema's shape or indexes includes a migration.

### 2.11 Cross-origin + CORS → one origin behind nginx

**Why:** the old app served the frontend and API from different origins, so
it needed CORS configuration, and the cookie was one CORS mistake away from
breaking.

**The new design:** in production, nginx serves the web build at `/` and
proxies `/api/*` to the API. In dev, Vite's `server.proxy` forwards `/api` to
the API, which mimics production.

**Gains:** no CORS in production at all, first-party cookies, and one fewer
env variable (`CLIENT_URL` for CORS).

**New effects:** every API route lives under `/api`. The frontend calls
relative URLs (`/api/problems`), never a hostname.

### 2.12 dotenv ordering and scattered `process.env` → one typed config module

**Why:** the old `config/env.js` validated the environment but, in its own
words, "the app keeps reading `process.env` directly". With ESM hoisting
(2.1), reading `process.env` while a module loads is fragile.

**The new design:** `config/env.ts` parses `process.env` with zod once and
exports a typed, frozen `env` object. Nothing else reads `process.env`.
Clients (Mongo, Redis) are created by functions called from the entry point,
not when a module loads.

**Gains:** one place to see every setting, defaults that actually apply, and
tests that inject config instead of mutating `process.env`.

### 2.13 Redux thunks → TanStack Query for server data

**Why:** most of the old Redux state was really server data (the current
user, problems) with hand-written loading and error flags. Async judging
makes this acute: polling a submission until it's done is one option in
TanStack Query.
```ts
refetchInterval: (query) => (query.state.data?.status === 'done' ? false : 1000)
```

**Gains:** caching, background refetching, polling and retries without
reducers.

**New effects:** a new mental model built around query keys and cache
invalidation. The little client-only state left (editor preferences, theme)
lives in React state or a small store.

### 2.14 `console.log` → structured logs (pino)

**Why:** with two processes, following one submission means matching log
lines across both.

**Gains:** JSON logs with `requestId`, `userId` and `submissionId` fields,
so you can filter by any of them.

**New effects:** `pino-pretty` in dev for readable output. Log objects, not
concatenated strings.

### 2.15 bcrypt → argon2id

**Why:** OWASP's Password Storage Cheat Sheet lists Argon2id first. bcrypt is
still acceptable, so this is a small, defensible improvement you can explain.

**New effects:** the `argon2` package, and parameters chosen once (OWASP
minimum: 19 MiB memory, 2 iterations, parallelism 1) and written down.

### 2.16 What stays the same

| Kept | Why keep it |
|---|---|
| Express 5 | You know it. The learning budget goes to TypeScript, ESM and queues, not a new framework. Async error forwarding still works |
| MongoDB + Mongoose | Decided in the brief; Postgres comes in Phase 6 |
| Redis | Sessions, locks, rate limits, BullMQ, and later leaderboards |
| zod | Now shared between the front end and back end |
| Central `AppError` + error handler | It worked; now typed |
| Cursor pagination | Still the right choice for problem lists and history |
| Vitest + supertest + mongodb-memory-server | Better under ESM; switch to the replica-set variant |
| React + Vite + react-router + React Hook Form | No reason to change |
| Tailwind + Monaco | No reason to change |
| Self-hosted Judge0 on the Oracle box | Now used asynchronously |
| Branches, PRs, conventional commits, CI | Plus typecheck, and release tags per milestone |

---

## 3. Repository layout

```
codequest-revamped/
├── package.json            # npm workspaces root, shared dev tooling
├── tsconfig.base.json      # strict settings every package extends
├── docker-compose.yml      # dev: MongoDB (1-node replica set) + Redis
├── .github/workflows/      # CI: lint, typecheck, test, build
├── docs/                   # brief, architecture, day-by-day plans
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── main.ts         # entry: HTTP server
│   │   │   ├── worker.ts       # entry: judge poller + BullMQ workers
│   │   │   ├── app.ts          # builds the Express app (no listening, for tests)
│   │   │   ├── config/         # env.ts, logger.ts
│   │   │   ├── infra/          # mongo.ts, redis.ts, judge0.ts, mailer.ts, queue.ts
│   │   │   ├── middleware/     # auth, validate, rate limits, errors
│   │   │   ├── modules/        # one folder per domain
│   │   │   │   ├── auth/       #   routes.ts controller.ts service.ts repository.ts model.ts
│   │   │   │   ├── problems/
│   │   │   │   ├── judge/      #   submissions, runs, poller, verdict logic
│   │   │   │   ├── journey/
│   │   │   │   ├── progress/   #   progress, XP, streaks, daily stats, revisits
│   │   │   │   ├── daily/
│   │   │   │   └── profile/    #   stats endpoints
│   │   │   └── jobs/           # BullMQ job definitions
│   │   ├── migrations/         # migrate-mongo scripts
│   │   └── test/
│   └── web/
│       └── src/
│           ├── app/            # router, providers, layouts
│           ├── features/       # auth, problems, judge, journey, profile, admin, playground
│           │   └── <feature>/  #   api.ts (query hooks), components/, pages/
│           └── shared/         # UI components, api client, formatting helpers
└── packages/
    └── shared/
        └── src/
            ├── schemas/        # zod: auth, problems, submissions, profile…
            ├── languages.ts    # the one language list
            └── index.ts
```

**Folders by domain (`modules/judge/`), not by layer (`controllers/`).** A
feature's route, service and repository sit together, so a change to judging
touches one folder. The layering (§4) still applies inside each folder.

---

## 4. Backend layers

```
routes ──► controller ──► service ──► repository ──► Mongoose model
 (HTTP)     (HTTP ↔ domain)  (rules)     (database)
```

| Layer | Does | Never |
|---|---|---|
| **Routes** | Path, middleware (auth, rate limit, `validate(schema)`), controller | Contain logic |
| **Controller** | Reads validated input from `req`, calls a service, shapes the HTTP response | Touches the database; holds business rules |
| **Service** | Business rules: "a first solve awards XP", "module B unlocks at 70% of A" | Knows about `req` or `res`; imports Mongoose |
| **Repository** | Database reads and writes; returns plain domain objects | Holds business rules |

- **The worker calls services directly.** `judgeService.finalize(submissionId)`
  is the same code whether the poller or a test calls it.
- **Errors:** services throw typed `AppError`s (`NotFound`, `Conflict`,
  `Forbidden`…). One error middleware maps them to HTTP responses, and logs
  5xx responses with their cause, as in the old app.
- **Validation:** `validate({ body, query, params })` parses with zod schemas
  from `packages/shared` and replaces `req.body` with the result, which
  strips unknown keys. This keeps the old mass-assignment protection.

---

## 5. Data model (MongoDB, v1)

**Conventions**
- `_id` is a UUIDv7 string.
- Every collection has `createdAt` and `updatedAt`.
- Collection names are snake_case plurals.
- Indexes are created in migrations, not with Mongoose `autoIndex`.
- **→ PG** notes how a collection maps to Postgres in Phase 6.

### `users`
| Field | Notes |
|---|---|
| `username` | unique, lowercase; public URL `/u/:username` |
| `email` | unique, lowercase |
| `emailVerified` | bool |
| `passwordHash` | optional (OAuth-only users have none) |
| `displayName`, `avatarUrl` | |
| `role` | `user` \| `admin` |
| `timezone` | IANA name, e.g. `Asia/Kolkata`; defaults from the browser at sign-up |
| `profile.hiddenCharts` | chart ids the user has hidden |
| `xpTotal`, `level` | **cache**, rebuildable from `xp_events` |
| `streak.current`, `streak.longest`, `streak.lastDate` | **cache**, rebuildable from `user_daily_stats` |
| `streak.multiplier` | whole hundredths, 100–200 (brief §6, "XP economy"); decayed on read after missed days |

Indexes: `{ username: 1 }` unique, `{ email: 1 }` unique.

### `accounts`
`userId`, `provider` (`google` \| `github`), `providerAccountId`, `email` (as
the provider reported it).
Indexes: `{ provider: 1, providerAccountId: 1 }` unique, `{ userId: 1 }`.

### `topics`
`slug`, `name`, `order`. The fixed list the radar groups by. Seeded by a
migration.

### `problems`
| Field | Notes |
|---|---|
| `slug` | unique; URL `/problems/:slug` |
| `title`, `difficulty` (`easy` \| `medium` \| `hard`) | |
| `topicIds` | refs to `topics` (→ PG: `problem_topics` join table) |
| `statement`, `constraints` | markdown |
| `examples` | visible cases, embedded: `{ input, output, explanation }` |
| `limits` | `{ cpuTimeSec, memoryKb }`, passed to Judge0 per problem |
| `starterCode` | `{ [language]: code }` |
| `referenceSolutions` | `{ [language]: code }`, excluded from normal reads |
| `hints` | `[{ tier: 1–3, body }]` |
| `editorial` | markdown, returned only after a solve |
| `status` | `draft` \| `published` |
| `authorId` | |
| `stats` | `{ submissions, accepted }`, updated asynchronously (§6.4) |

Indexes: `{ slug: 1 }` unique, `{ status: 1, difficulty: 1, _id: 1 }` for
filtered cursor pagination, `{ topicIds: 1 }`.

### `problem_testcases`
`problemId`, `order`, `input`, `output`.

**Why separate from `problems`:** hidden test cases can never be sent to a
client by accident (the old code relied on `.select()` in every query).
Problem reads stay small, and large inputs don't push a problem toward
MongoDB's 16 MB document limit. Creating a problem with its test cases is one
transaction.
Index: `{ problemId: 1, order: 1 }` unique.

### `submissions` (graded, kept forever)
| Field | Notes |
|---|---|
| `userId`, `problemId`, `language`, `code` | |
| `status` | `queued` → `running` → `done`, or `error` |
| `verdict` | `accepted` \| `wrong_answer` \| `time_limit` \| `memory_limit` \| `runtime_error` \| `compile_error` \| `internal_error` |
| `tests` | `[{ token, status, timeMs, memoryKb }]`, one entry per test case |
| `failedCase` | `{ index, input?, expected?, actual?, message? }` (input and output only for visible cases) |
| `timeMs`, `memoryKb` | max across test cases |
| `localDate` | submitter's local date (YYYY-MM-DD), stamped at creation |
| `judgedAt` | |

Indexes:
- `{ userId: 1, problemId: 1, createdAt: -1 }`: your submissions for a problem.
- `{ userId: 1, createdAt: -1 }`: history and profile.
- `{ status: 1 }` **partial**, where `status: 'running'`: the poller's scan
  stays tiny however many finished submissions pile up.

### `runs` (Run button + playground, deleted after 24h)
Same shape as `submissions`, plus `kind` (`example` \| `playground`), `stdin`,
`stdout`, `stderr`, `compileOutput` and `expiresAt`. No `verdict` for
playground runs (brief §5: status 3 means "finished", not "correct").
Indexes: `{ expiresAt: 1 }` with `expireAfterSeconds: 0` (MongoDB deletes
documents once `expiresAt` passes), plus the same partial `running` index.

### `user_problem_progress`
`userId`, `problemId`, `attempts`, `firstSolvedAt?`, `lastSubmittedAt`,
`hintsThisAttempt` (0–3), `srs: { reps, intervalDays, ease, dueAt }`.
`hintsThisAttempt` only counts reveals while XP is available (before the
first solve, or while a revisit is due), and resets to 0 after each accepted
solve.
Indexes: `{ userId: 1, problemId: 1 }` unique, and
`{ userId: 1, 'srs.dueAt': 1 }` for the revisit queue.

### `xp_events` (append-only)
`userId`, `source: { type, id }`, `amount`, `localDate`, `submissionId`,
`meta`, `createdAt`.

- **`submissionId`** groups the events one submission produced, so the UI can
  show them together as one breakdown (brief §6, "Explaining an award").
- **`meta`** on `solve` and `revisit` events holds
  `{ base, share, hintsThisAttempt, hintPenalty, multiplier }` **as they were
  at award time**. These can't be recomputed later: the problem's difficulty
  may be edited, `hintsThisAttempt` resets, the multiplier moves, and XP
  config may be rebalanced. A rebuild script can also re-run `problemXp(meta)`
  and check it equals `amount`.

Source types:
- `solve` (id = problemId): first-solve problem XP
- `revisit` (id = `problemId:reps`): due-revisit problem XP
- `first_of_day` (id = localDate): the +10
- `daily_problem` (id = daily problem date): the +50

There are no streak or hint events: the multiplier and hint penalty are
already inside each `solve` or `revisit` amount. Amounts follow brief §6, "XP
economy".
Index: **`{ userId: 1, 'source.type': 1, 'source.id': 1 }` unique.** This is
the rule that makes a double award impossible.

### `user_daily_stats`
`userId`, `date` (the user's local date), `submissions`, `accepted`,
`newlySolved`, `xp`.
Index: `{ userId: 1, date: 1 }` unique.

### `tracks` and `modules`
- `tracks`: `slug`, `title`, `description`, `order`.
- `modules`: `trackId`, `slug`, `title`, `order`, `prerequisiteIds`
  (module ids), `unlockRule: { minSolvedPct }`, `items: [{ problemId, order }]`.
  (→ PG: `module_prerequisites` and `module_problems` join tables.)

One problem can appear in several modules. Progress per module isn't stored;
it's computed from `user_problem_progress` (§8).

### `daily_problems`
`date` (unique, UTC), `problemId`.

### Later (sketched so v1 doesn't block them)
- **v2:** `friendships`, `contests`, `contest_participants`,
  `contest_submissions`, `contest_results` (rank, score, rating before and
  after), `badges`, `user_badges`, `notifications`.
- **v3:** `subscriptions`, `entitlements`, `payments`, `ai_generations`.

---

## 6. Judging pipeline

### 6.1 States

```
queued ──(sent to Judge0)──► running ──(all tests finished)──► done + verdict
   │                            │
   └── Judge0 refused ──► error └── stuck > 2 min ──► done + internal_error
```

### 6.2 Submit (API process)

1. `POST /api/problems/:slug/submissions`: validate, rate-limit per user.
2. Load the problem and its test cases. Insert the submission as `queued`
   with the user's `localDate`.
3. `POST` to Judge0's `/submissions/batch` with `wait=false`, in chunks of at
   most `MAX_SUBMISSION_BATCH_SIZE`. Save the tokens in `tests[]` and set
   `status: 'running'`.
4. Respond `202 { id }`.
5. If Judge0 refuses (queue full → 503, unreachable), set `status: 'error'`
   and return 503 "Judge is busy, try again". The old client's
   502/503/504 mapping carries over.

### 6.3 The poller (worker process)

```
every tick (500ms while work is pending, 3s when idle):
  hold the Redis lock "judge:poller" (SET NX PX, renewed each tick) or skip this tick
  load submissions and runs with status 'running'
  collect tokens of tests not yet finished
  for each chunk of ≤ MAX_SUBMISSION_BATCH_SIZE tokens:
      GET /submissions/batch?tokens=…&fields=token,status,time,memory,stdout,stderr,compile_output,message
  for each result with status.id ≥ 3 (finished):
      record it in its test entry (positional $set on tests.$)
  for each submission whose tests are now all finished:
      judgeService.finalize(submissionId)
  for each submission running longer than 2 minutes:
      finalize as internal_error
```

- **The lock** means a second worker instance only takes over if the first
  dies. Moving this loop to a BullMQ job scheduler later is an equally good
  option.
- **Verdict logic** is a pure function: test results in, verdict and
  `failedCase` out. It's the easiest part of judging to unit-test thoroughly.

### 6.4 Finishing a submission (one transaction)

Inside `session.withTransaction(…)`, which retries on transient errors:

1. `submissions.updateOne({ _id, status: 'running' }, { $set: { status: 'done', verdict, … } })`.
   **If nothing was modified, stop.** Another tick already finished it.
2. Upsert `user_daily_stats` for (user, `localDate`): `$inc` submissions, and
   accepted if accepted.
3. Upsert `user_problem_progress`: `$inc` attempts. If accepted and there's no
   `firstSolvedAt` yet, set it: **this is a first solve.**
4. Decide whether this is a **streak-day solve**: a first solve, a due
   revisit, or today's daily problem. An already-solved daily problem counts
   as a revisit, due or not. If it's none of these, stop here; no XP.
5. If it's the first streak-day solve of the local day, update
   `users.streak`. Apply decay for missed days, then +0.1× if yesterday was a
   streak day, capped at 2.0×. Insert the `first_of_day` event (+10).
6. Insert the `solve` or `revisit` event, whose amount comes from the pure
   function `problemXp(base, revisitShare, hintsThisAttempt, multiplier)`. On a
   revisit, advance the SM-2 schedule. Reset `hintsThisAttempt`.
7. If it's today's daily problem, insert the `daily_problem` event (+50).
8. `$inc` `users.xpTotal` and the day's `xp` by the sum of the inserted
   events, and recompute `level`.

After the commit:
- `INCR stats:ver:<userId>`, which invalidates that user's cached charts (§10).
- `problems.stats` is updated **outside** the transaction. During a contest,
  hundreds of transactions writing the same popular problem's document would
  conflict and retry.

**Why a transaction:** `$inc` isn't idempotent. Without a transaction, a
crash between step 1 and step 2 either loses the stats (the verdict is saved,
so the submission is never finished again) or double-counts them (if step 2
ran first). Inside a transaction, all of it happens or none of it does.

### 6.5 Runs and the playground

Same submit path and the same poller, but finishing a run only fills in
stdout, stderr and status. No transaction, no XP, no stats. Playground runs
omit `expected_output`, and the UI shows "Finished", never "Accepted".

### 6.6 Failure handling

| What fails | What happens |
|---|---|
| Judge0 queue full / unreachable at submit | Submission `error`, user sees "busy, try again" (503) |
| Judge0 unreachable while polling | Tokens stay `running`; next ticks retry; 2-minute limit applies |
| Worker crashes mid-finish | Transaction rolls back; next tick finishes it |
| Two workers running | Lock: only one polls; the `status: 'running'` filter stops double finishes |
| API crashes after sending to Judge0, before saving tokens | Submission stuck `queued` → a cleanup job marks old `queued` rows `error` |

### 6.7 Dev setup

The worker only makes outbound requests to Judge0, so any route from the dev
machine to a Judge0 instance works: a local one, or a forwarded port to a
remote one. Nothing needs to reach *into* the dev machine, unlike with
callbacks.

---

## 7. Authentication

### 7.1 Sessions

No access + refresh tokens: those solve a JWT-only problem (a token that
can't be revoked). A session is checked on the server on every request, so it
can live long and still be revoked at any moment. Reasoning in
`02_01-sessions-vs-jwt.md` §8.

- **Cookie:** `__Host-sid` in production (`sid` in dev);
  `HttpOnly; Secure; SameSite=Lax; Path=/`.
- **Redis:** `sess:<sha256(id)>` → `{ userId, createdAt, authenticatedAt, userAgent }`.
  `user_sess:<userId>` is a set of that user's session hashes, used for "log
  out everywhere" and the devices list.
- **Two timeouts:**
  - **Idle: 30 days**, extended on use (sliding expiration).
  - **Absolute: 90 days** from `createdAt`, whatever the activity.
- **`requireAuth`:**
  - Hash the cookie value.
  - Run `GETEX sess:<hash> EX <idle>`, which reads and extends in one round
    trip. A missing session → 401.
  - Past the absolute cap → destroy the session, 401.
  - Load the user from the database, so the role is always current.
- **Slide the cookie too.** When the session is extended, re-send `Set-Cookie`
  with a fresh `Max-Age`, at most once a day. Otherwise the browser deletes
  the cookie on the date set at login, while Redis still holds a live session.
- **A new session id at login**, never one the browser brought with it. This
  prevents session fixation. Also issue a new id when the account's privileges
  change.
- **Recent login for sensitive actions:** changing email or password, deleting
  the account, and later payment actions require `authenticatedAt` within 10
  minutes. Otherwise the user re-enters their password, and
  `authenticatedAt` is updated.
- **Composition:** `requireRole('admin')` runs after `requireAuth` and checks
  `req.user.role`. There is one copy of the session check, not two.

### 7.2 Email and password
- Register → argon2id hash → a verification token in Redis with a TTL →
  email a link. This is the old flow, kept.
- **`resend-verification` answers the same way whether or not the account
  exists.** This closes the account-enumeration leak left open in the old
  `Things-to-DO.md`. The trade-off: a typo'd email gets no specific error.
- Rate limits per IP on register, login and resend, stored in Redis
  (`express-rate-limit` + `rate-limit-redis`), so they hold across
  processes.

### 7.3 OAuth (Google, GitHub)

```
1. Browser  → GET /api/auth/google/start
2. API      → create state + PKCE code_verifier, store both in a short-lived httpOnly cookie
            → redirect to Google with state + code_challenge
3. User approves at Google
4. Google   → redirect to /api/auth/google/callback?code=…&state=…
5. API      → check that state matches the cookie (stops login CSRF)
            → exchange code + code_verifier for tokens (server to server)
            → fetch the profile: id, email, email_verified
6. API      → accounts has (google, id)?         → log in as that user
            → else a user has this verified email? → link the account, log in
            → else                                → create user + account (generate a username)
7. API      → create session, set cookie, redirect to the web app
```

- **`state` is always used; PKCE wherever the provider supports it.** Google
  does. Check GitHub's current docs when you build it.
- **GitHub may not return an email on `/user`.** Call `/user/emails` and use
  the primary, verified one.
- Link by email **only** when it's verified (2.6).

### 7.4 Security checklist (Phase 1 done-when)
- [ ] `helmet`
- [ ] rate limits on auth routes and on submit/run
- [ ] `Origin` check on state-changing requests
- [ ] zod on every body, query and params
- [ ] no hidden test case or reference solution in any response (a test asserts it)
- [ ] generic resend-verification response
- [ ] account linking only on a verified email
- [ ] new session id at login; idle (30 days) and absolute (90 days) timeouts enforced
- [ ] recent-login check on email/password change and account deletion
- [ ] login takes the same time whether or not the email exists (compare against a dummy hash)

---

## 8. Journey and progress

- `GET /api/tracks/:slug` returns the modules. For a logged-in user, each
  module adds `{ solved, total, pct, unlocked }`.
- **How it's computed:** one query loads the user's progress for all problem
  ids in the track (`$in`). `pct` per module is solved/total. A module is
  unlocked when every prerequisite's `pct ≥ unlockRule.minSolvedPct`.
- **Prerequisites form a graph.** The admin editor must reject cycles, so a
  topological sort validates every save.
- Locked modules stay visible but can't be opened, so the map shows what's
  ahead.

---

## 9. Gamification

- **XP** comes only from `xp_events` inserts inside the finish transaction
  (§6.4). The rules live in brief §6, "XP economy". The amounts live in one
  config object, so rebalancing is a one-line change. Revealing a hint only
  increments `hintsThisAttempt`; the penalty is applied when XP is awarded.
- **Levels** are a pure function: `levelFor(xp) = Math.floor(Math.sqrt(xp / 100))`
  (brief §6). The XP needed for level n is `100 * n ** 2`, which the profile
  uses for "X / Y XP to next level".
- **Daily problem:** a BullMQ job scheduler runs at 00:00 UTC. It picks a
  published problem not used in the last N days and inserts it into
  `daily_problems`. Everyone gets the same problem, and it rotates at the
  same moment worldwide (5:30 am IST).
- **Streaks** count consecutive **local** days with at least one streak-day
  solve (a first solve, a due revisit, or the daily problem). Re-submitting old
  solutions doesn't count. The local date comes from
  `new Intl.DateTimeFormat('en-CA', { timeZone }).format(now)` (the `en-CA`
  locale formats as `YYYY-MM-DD`).
- **Nothing is reset overnight.** On read, a streak whose `lastDate` is before
  yesterday shows a day count of 0. The multiplier shown is computed from the
  stored value and the number of missed days. The stored values change only
  on the next streak-day solve.
- **Revisit queue:** `GET /api/me/revisits` returns progress entries with
  `srs.dueAt ≤ now`. Solving one advances the SM-2 schedule.

---

## 10. Profile stats

| Endpoint (`/api/users/:username/stats/…`) | Reads |
|---|---|
| `heatmap?year=` | `user_daily_stats` |
| `solved` | `user_problem_progress` + `problems.difficulty` |
| `radar` | `user_problem_progress` + `problems.topicIds` |
| `xp` | `xp_events`, cumulative by date |
| `verdicts` | `submissions`, grouped by verdict and language |
| `journey` | same computation as §8 |

- **Visibility:** a hidden chart's endpoint returns 404 for everyone except
  the owner.
- **Caching with versioned keys:** each result is cached in Redis under
  `stats:<userId>:<ver>:<chart>`, where `ver` is the value of
  `stats:ver:<userId>`. Finishing a submission increments `ver`, so old keys
  are never read again and simply expire. Nothing has to find and delete them.
- Public responses also send `Cache-Control: public, max-age=60`.

---

## 11. Frontend

- **Routes:** `/`, `/login`, `/signup`, `/verify`, `/problems`,
  `/problems/:slug`, `/journey`, `/journey/:track`, `/playground`,
  `/u/:username`, `/settings`, `/admin/*`.
- **Server data:** TanStack Query hooks live in each feature's `api.ts`, with
  query keys like `['problem', slug]` and `['submission', id]`.
- **The API client** is a small `fetch` wrapper that parses responses with the
  shared zod schemas, so a changed API shape fails loudly in dev.
- **Forms:** React Hook Form with `zodResolver` and the same schemas the
  server uses.
- **Problem page:** Monaco editor. Submit → `202` → poll the submission →
  show Queued → Running → verdict.
- **Charts:**
  - Heatmap: hand-built SVG.
  - Radar, donut, lines: Recharts.
  - Learning path: React Flow.
  - The theme's CSS variables drive chart colors, so charts follow
    dark and light mode.

---

## 12. Environments, deployment and CI

| | Dev | Production |
|---|---|---|
| MongoDB | Docker, 1-node replica set on **27018**, member advertised as `localhost:27018` (off the default port, so a forwarded 27017 on the dev machine can never be reached by mistake) | existing self-hosted replica set |
| Redis | Docker on **6380**, AOF on | existing, with AOF on |
| Judge0 | the self-hosted instance, reached over a forwarded port | same server, private network |
| API + worker | `tsx watch`, both started by one `npm run dev` | two containers from one image, different commands |
| Web | Vite dev server with `/api` proxy | static build served by nginx |
| TLS | none | nginx + Let's Encrypt on a subdomain of your domain |

- **CI on every PR:** lint → typecheck → test (all workspaces) → build.
- **Release on tag** (`v0.1.0` = M1): build images, push to GitHub Container
  Registry, deploy over SSH. Built in Phase 1 alongside the first deploy.
- **Health endpoints:** `/api/health` (process up) and `/api/ready`
  (Mongo and Redis reachable).
- **Capacity:** Judge0, MongoDB, Redis, the app and ollama share 4 CPUs.
  Judge0 is the CPU-hungry one. Watch the load before v2's contest load tests.

---

## 13. Testing strategy

| Level | What | Tools |
|---|---|---|
| Unit | Verdict logic, `levelFor`, streak math, SM-2, unlock rules, prerequisite cycle check | Vitest |
| Repository | Every repository method against a real in-memory replica set. Reused unchanged against Postgres in Phase 6 | Vitest + `MongoMemoryReplSet` |
| HTTP | Routes end to end, with auth, validation and error shapes | Vitest + supertest |
| Judge pipeline | Poller + finish, against a fake Judge0 HTTP server | Vitest + a small fake server |
| End to end (end of v1) | Sign up → solve → XP appears on the profile | Playwright |

Pure functions carry most of the business rules, so most tests are the fast
kind.

---

## 14. Open decisions (settled in the day plans)

| Decision | Options | Settled in |
|---|---|---|
| UI component library | daisyUI (known) vs shadcn/ui (accessible primitives, you own the code) | Phase 0 |
| Exact `packages/shared` wiring | source in dev + `tsc -b` for builds, vs a bundler for the API | Phase 0 |
| Username rules | length, allowed characters, renames allowed how often | Phase 1 |
| XP economy + level curve | brief §6 | before Phase 4 |
| Rating algorithm | Elo vs Glicko-2 | v2 |
