# CodeQuest Revamped — Architecture

## What this is about, in one paragraph

This is the technical plan for CodeQuest Revamped. It was written on
2026-09-25 and builds on `01-project-brief.md` (the project brief, which says
what the product is). It describes version 1 (v1) in detail. Versions 2 and 3
(v2 and v3) only appear where they change a v1 decision. It explains how the
pieces of the system fit together, what changes compared with the old
codequest and why, how the folders are laid out, how the database is
designed, how submitted code gets judged, how login works, how XP and streaks
are calculated, how the frontend is built, how the app is deployed and
tested, and which decisions are still open.

The plan has 14 parts, and each one is a topic below, in the same order.

---

## Topic 1: the system at a glance

Here is the overall picture. Everything below this diagram is a detail of
one of its boxes.

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

How to read it:

- The **browser** talks to the server over HTTPS, and everything comes from
  **one origin** (one address, meaning the same protocol, domain and port).
- **nginx** (a web server that sits in front of the app) splits the traffic.
  Requests for `/` get the static files of the built web app (`apps/web`).
  Requests for `/api/*` are passed on to the API process.
- **Judge0** is the separate service that actually compiles and runs users'
  code. It has its own queue and its own workers.
- **MongoDB** is the main database. **Redis** is a fast in-memory store used
  for sessions, locks and job queues.
- **BullMQ** is a job-queue library that stores its jobs in Redis.

The two processes of the app:

- **The API process** handles HTTP requests. It validates input, reads from
  and writes to the database, and hands code over to Judge0 (with
  `POST /submissions/batch`). It never waits for that code to finish
  running.
- **The worker process** does everything that is slow or that runs on a
  schedule. It asks Judge0 for results (with `GET /submissions/batch`) for
  every user at once, a technique called **polling** (checking again and
  again). It also decides verdicts, awards XP, and runs BullMQ jobs such as
  emails and the daily problem.

Two important rules:

- **The API and the worker never call each other.** They share data through
  MongoDB and share jobs through Redis. Because of that, either one can
  restart without the other noticing. This is also why the worker doesn't
  "send" a result to the API. It writes the verdict into MongoDB, and the API
  reads it from there when the browser asks.
- **Both processes come from the same codebase** (`apps/api`). There are just
  two entry points (two starting files, `main.ts` and `worker.ts`), so both
  share the same services, repositories and config.

---

## Topic 2: what changes from the old codequest, and why

This is the biggest part of the plan. Each change is described in three
parts:

- **Why** we are changing it.
- **Gains**, meaning what we get out of it.
- **New effects**, meaning what now works differently, or what you now have
  to take care of.

Section 2.16 at the end lists what stays the same, and why.

### 2.1 From CommonJS to ES modules (ESM)

**First, the names.** JavaScript has two module systems (two ways for files
to share code with each other):

- **CommonJS** is the older Node.js system. It uses `require` and
  `module.exports`, and a package opts into it with `"type": "commonjs"`.
- **ES modules (ESM)** are the official JavaScript standard. They use
  `import` and `export`.

The file extensions `.cjs` and `.mjs` force one system for a single file,
whatever the package says. The old repo was CommonJS, which is why its
`eslint.config.mjs` needed `.mjs`: it was an ESM file inside a CommonJS
package. The new project moves **from CommonJS to ESM**. Every
`package.json` has `"type": "module"`, so plain `.ts` and `.js` files are ESM,
and no `.mjs` files are needed.

**Why**

- ESM is JavaScript's standard module system. The old frontend was already
  ESM, so the backend was the odd one out. Since `packages/shared` is
  imported by both the frontend and the backend, using one module system
  avoids having to ship the shared code in two formats.
- Vitest (the test runner) is built around ESM. Its `vi.mock` function works
  with `import`. With `require` it silently didn't work, which forced the
  `vi.spyOn` + `require.cache` workarounds described in
  `reference/testing-faq.md`.
- TypeScript, when set to `module: "NodeNext"`, produces ESM output that Node
  can run as it is.
- New libraries increasingly ship as ESM only. Recent versions of Node can
  `require()` many ESM packages, but ESM is where the ecosystem is heading.

**Gains**

- Real module mocking in tests (replacing a whole imported module with a
  fake one).
- Top-level `await` in entry files, so you can write
  `await connectDatabase()` directly at the top level of a file, outside any
  function.
- One import style everywhere: the API, the worker, the web app and the
  shared package.

**New effects on the project.** There are eight things to know.

1. **The syntax changes.**
   ```ts
   // Old (CommonJS)
   const { LANGUAGE_MAP } = require('./utils/languages');
   module.exports = { submitBatch };

   // New (ESM + TypeScript)
   import { LANGUAGE_MAP } from './languages.js';
   export function submitBatch() { /* … */ }
   ```
2. **Relative imports need a file extension, and it is `.js` even though the
   file is `.ts`.** A relative import is one that starts with `./` or `../`.
   TypeScript understands that `./languages.js` means `languages.ts`. If you
   leave the extension off, you get `ERR_MODULE_NOT_FOUND` when the code runs.
   Expect to hit this on day one.
3. **Imports are hoisted, meaning every imported module runs before the body
   of your file.** The old `src/index.js` relied on the order of its lines:
   ```js
   require('dotenv').config();                      // ran first…
   const redisClient = require('./config/redis');   // …so this saw the env
   ```
   In ESM, `config/redis` would run *before* any `dotenv.config()` call in
   the body, so it would not see the environment variables. The new rule:
   Node loads the environment before any module runs
   (`node --env-file=.env`), and only `config/env.ts` reads `process.env`
   (see 2.12).
4. **`__dirname` and `__filename` don't exist in ESM.** Use
   `import.meta.dirname` and `import.meta.filename` instead.
5. **Importing a JSON file needs an attribute:**
   `import data from './x.json' with { type: 'json' }`. The alternative is to
   read the file with `fs`.
6. **Circular imports fail differently.** A circular import is when file A
   imports file B and file B (directly or indirectly) imports file A. In ESM
   this can throw
   `ReferenceError: Cannot access 'x' before initialization`. The fix is to
   keep dependencies flowing one way only: routes import controllers,
   controllers import services, and services import repositories. Then
   cycles don't form.
7. **Packages that only support CommonJS still work.** Import their default
   export and destructure it (pull out the parts you need) if named imports
   fail.
8. **Config files for tools that expect CommonJS** get a `.cjs` extension.
   This is the mirror image of the old `eslint.config.mjs`.

### 2.2 From JavaScript to TypeScript

> The full reasoning, the old bugs TypeScript would have caught, and a
> learning path are in `02_02-javascript-to-typescript.md`.

**Why:** types can be shared across the API, the worker and the web app, and
whole classes of bugs are caught before the code even runs.

**Gains**

- **One schema gives you both runtime validation and a static type.** A zod
  schema (a description of what valid data looks like) lives in
  `packages/shared`. It validates the request on the server, validates the
  form in the browser, and `z.infer` turns it into the TypeScript type used
  by both.
- **The `noUncheckedIndexedAccess` setting would have caught the old
  partial-batch bug.** In `submissionController.js:145`, the old code read
  `results[index].stdout`. It assumed Judge0 always returned exactly one
  result per test case. With this setting, `results[index]` has the type
  `Result | undefined`, so the compiler forces you to handle the case where
  the result is missing.
- The environment config is typed: `env.JUDGE0_URL` is a `string`, never
  `undefined`.

**New effects**

- **There is now a build step.** In development, `tsx watch` runs `.ts`
  files directly and restarts on changes. For production, `tsc` (the
  TypeScript compiler) compiles the code to `dist/`. CI (the automatic checks
  on GitHub) adds `npm run typecheck`.
- **Mongoose and TypeScript together:** Mongoose is the library that talks to
  MongoDB. Schemas are typed with `InferSchemaType`, and repositories return
  plain objects (using `.lean()`) typed as domain types. They never return
  Mongoose documents (see 2.8).
- **`strict: true` is on from the first commit.** Turning it on later would
  mean fixing hundreds of errors at once.
- The cost is real: generics, confusing type errors from libraries, and a
  slower first few days.

### 2.3 From two folders to an npm-workspaces monorepo

> The full reasoning, what workspaces do and don't do, and why Turborepo is
> not used yet are in `02_03-monorepo-and-workspaces.md`.

A **monorepo** is one repository holding several packages. **npm
workspaces** is npm's built-in feature for managing them together.

**Why:** in the old project, the backend (at the repo root) and `frontend/`
each had their own `package.json` and their own copies of the same
knowledge. The list of programming languages lived in two places, and the
header comment in `utils/languages.js` had to warn people about it.

**Gains:** `packages/shared` holds the zod schemas, the domain types and the
language list exactly once. There is one `npm install`, and one CI workflow
checks every package.

**New effects**

- Commands say which workspace they target with `-w`, for example
  `npm run dev -w apps/api` or `npm install zod -w packages/shared`.
- **Wiring up `packages/shared` is the fiddliest part of Phase 0.** In
  development, Vite and tsx compile its TypeScript source directly. For
  production builds, TypeScript project references (`tsc -b`) build the
  shared package before `apps/api`. Phase 0 sets this up step by step.
- There is one repo, one version history and one set of release tags.

### 2.4 From judging inside the request to a worker process and a poller

**Why:** the old `submitCode` kept the user's HTTP request open while it
kept asking Judge0 for results. Requests had a 20-second budget, and that
limited the app to about 8 users at a time. Judge0's own built-in options
only move the waiting into Judge0: `wait=true` ties up Judge0's web process,
and `callback_url` ties up its workers. The full reasoning is in section 5
of the brief.

**Gains**

- Judge0's load depends on how often we poll, not on how many users are
  waiting.
- Nothing is lost if a process crashes.
- From the user's point of view there is no hard time limit. A busy Judge0
  means slower results, not errors.

**New effects**

- **There are two processes** to run in development, and two containers in
  production.
- **The API answers `202 Accepted`** (an HTTP code meaning "received, but not
  finished yet") with a submission id. The frontend then polls
  `GET /api/submissions/:id` until it is done, and the screen shows Queued,
  then Running, then the verdict.
- **Runs must now be stored too.** The Run button and the playground are
  also asynchronous, so the browser needs something to poll. They go in a
  separate `runs` collection that cleans itself up after 24 hours (using a
  TTL index, a "time to live" index that makes MongoDB delete old documents
  automatically). They never go in `submissions`. This keeps the rule from
  the old playground plan: runs never count as submissions.
- **Exactly one poller** may run at a time. This is enforced with a Redis
  lock or a BullMQ job scheduler.
- **MongoDB transactions are needed** for finishing a submission (see Topic
  6, section 6.4). A transaction groups several writes so they all succeed
  or all fail. MongoDB only supports transactions on a **replica set** (a
  group of database servers that copy each other), so a replica set is
  needed everywhere: a one-node replica set in development's Docker Compose
  setup, and `MongoMemoryReplSet` in tests.

### 2.5 From JWT plus a Redis blocklist to server-side sessions in Redis

> The full reasoning, including the old code's JWT bugs and the ways a JWT
> can be revoked, is in `02_01-sessions-vs-jwt.md`.

A **JWT** (JSON Web Token) is a signed token the browser sends with each
request. A **session** is a random id the server looks up in its own
storage.

**Why:** look at what the old `userMiddleware` did on **every** request. It
ran `jwt.verify`, then `redisClient.exists('token:…')` to check the
blocklist, then `Users.findById`. So it already made one Redis call and one
database call on every request. The main selling point of a JWT is that the
server can check it *without* looking anything up. The app was paying the
cost of JWTs without getting that benefit.

**The new design**

- A random 32-byte session id is stored in an `httpOnly` cookie (a cookie
  that JavaScript in the page cannot read).
- Redis stores the **hash** of that id as a key, and the value is
  `{ userId, createdAt, userAgent }`. The entry has a sliding 30-day expiry,
  meaning the 30 days restart every time the session is used.
- Each user also has a set of their session ids, which makes "log out
  everywhere" possible.

**Gains**

- Logging out is one Redis `DEL` command. There is no blocklist and no
  `EXAT` arithmetic (calculating expiry timestamps, as the old blocklist
  had to).
- A "your devices" list and "log out everywhere" come for free.
- There is no `JWT_SECRET_KEY` that needs rotating.
- Only the hash of each id is stored, so if Redis leaked, the leaked data
  would not contain working sessions.

**New effects**

- **Wiping Redis logs everyone out.** The brief's rule about Redis says that
  is acceptable: annoying, but not data loss. Turn on Redis AOF persistence
  (Redis writing its data to disk) so that a simple restart doesn't log
  everyone out.
- **A new cookie setup:** `HttpOnly; Secure; SameSite=Lax`. In production
  the cookie is named `__Host-sid`. The `__Host-` prefix makes the browser
  tie the cookie to our exact origin.
- **CSRF protection.** CSRF (cross-site request forgery) is when another
  website tricks the browser into sending a request to our site. Using
  `SameSite=Lax` plus endpoints that only accept JSON covers most of it. On
  top of that, reject any request that changes something if its `Origin`
  header is not ours.

### 2.6 From password-only login to email, Google and GitHub

> Why this is built by hand rather than handed to Keycloak or a hosted login
> provider is explained in `02_04-keycloak-and-identity-providers.md`.

**Why:** users expect to be able to sign in with Google or GitHub, and OAuth
2.0 (the standard protocol behind "Sign in with ...") is worth knowing
properly.

**The new design**

- A new `accounts` collection with `provider`, `providerAccountId` and
  `userId`.
- `users.passwordHash` becomes optional.
- The login flow is written by hand with `fetch`, without the Passport
  library, because learning the protocol is the point (see Topic 7).

**New effects**

- **Linking accounts by email is a security decision.** An OAuth login is
  linked to an existing user **only if the provider says the email is
  verified**. For Google that is the `email_verified` field. For GitHub it is
  the `verified` field from its `/user/emails` endpoint. Without this check,
  anyone could create a Google or GitHub account with your email address and
  take over your CodeQuest account.
- **OAuth users need a username.** Profiles are public at `/u/:username`,
  so sign-up generates a username (for example from the part of the email
  before the `@`, plus a suffix) and lets the user change it.
- There are two new sets of credentials in the environment variables, and
  redirect URLs must be registered with each provider for each environment
  (localhost and production).

### 2.7 From the `problemSolved` array to progress, events and daily stats

**Why:** the old array could only answer "which problems has this user
solved?". XP, streaks, the heatmap, the revisit queue and journey progress
all need to know *when* and *how many*.

**The new design**

- `user_problem_progress`: one document per (user, problem) pair. It holds
  when the problem was first solved, the number of attempts, the hints
  revealed, and the spaced-repetition schedule (when to show the problem
  again for review).
- `xp_events`: append-only (new rows are added, old ones are never changed),
  with a unique index on (user, source).
- `user_daily_stats`: one document per (user, local date) pair.

**Gains**

- Every chart on the profile has a cheap place to read from.
- XP can't be awarded twice.
- Everything derived from the events can be rebuilt from them.

**New effects:** finishing a submission now writes to several collections,
and those writes must succeed or fail together. That is why a transaction
is needed (section 6.4). The totals stored on `users` (`xpTotal`,
`currentStreak`) are only caches (saved copies for speed), and a rebuild
script must be able to recalculate them.

### 2.8 From controllers calling Mongoose to layers with repositories

**Why:** the plan is to switch to Postgres before v2 (brief section 4). Also,
the worker needs the same business logic as the API. For example, "finish
this submission" runs in the worker but belongs to the submissions part of
the app.

**The new design:** each request goes through four layers. Routes call
controllers, controllers call services, and services call repositories (see
Topic 4).

**Gains**

- Services can be tested without HTTP.
- The worker reuses services directly.
- The database switch only touches the `repositories/` code.

**New effects:** more files per feature, and a strict rule that nothing
outside `repositories/` imports a Mongoose model.

### 2.9 From ObjectId to UUIDv7 string ids

MongoDB's default id type is the **ObjectId**. A **UUIDv7** is a standard
36-character id whose first part is a timestamp.

**Why:** ids should survive the move to Postgres unchanged, so that URLs,
references between records, and logs keep working.

**Gains:** a UUIDv7 sorts by creation time, just like an ObjectId, which
keeps indexes efficient. It is opaque (it reveals nothing meaningful), and
Postgres has a native `uuid` type for it.

**New effects**

- Every schema gets `_id: { type: String, default: () => uuidv7() }`.
- A 36-character string is larger than a 12-byte ObjectId. At this scale,
  that doesn't matter.
- Public URLs use slugs (readable names like `two-sum`) and usernames, not
  ids.

### 2.10 From no migrations to `migrate-mongo` from Phase 0

A **migration** is a script that changes the database's structure or data in
a recorded, repeatable way. `migrate-mongo` is a tool that runs them for
MongoDB.

**Why:** changes to schemas and data should be versioned, repeatable
scripts, never manual edits typed into a Mongo shell.

**Gains**

- The claim "uses database migrations" is true from the first week.
- Seeding (filling in starting data), creating indexes and backfills
  (filling a new field into old records) all go through one mechanism.
- It practises the discipline Phase 6 (the Postgres move) will need.

**New effects:** a `migrations/` folder, and a `changelog` collection where
`migrate-mongo` records which migrations have run. Every PR that changes the
shape or the indexes of a schema includes a migration.

### 2.11 From cross-origin requests with CORS to one origin behind nginx

**CORS** (cross-origin resource sharing) is the set of rules a browser uses
when a page on one origin calls an API on another origin.

**Why:** the old app served the frontend and the API from different origins,
so it needed CORS configuration, and the login cookie was one CORS mistake
away from breaking.

**The new design**

- In production, nginx serves the web build at `/` and proxies (forwards)
  `/api/*` to the API.
- In development, Vite's `server.proxy` setting forwards `/api` to the API.
  This copies how production behaves.

**Gains:** no CORS at all in production, first-party cookies (cookies from
the same site as the page), and one less environment variable (`CLIENT_URL`,
which was only used for CORS).

**New effects:** every API route lives under `/api`. The frontend calls
relative URLs (`/api/problems`), never a full hostname.

### 2.12 From dotenv ordering and scattered `process.env` to one typed config module

**Why:** the old `config/env.js` validated the environment variables but,
in its own words, "the app keeps reading `process.env` directly". Because
ESM hoists imports (see 2.1, point 3), reading `process.env` while a module
is loading is fragile.

**The new design**

- `config/env.ts` parses `process.env` with zod once and exports a typed,
  frozen (unchangeable) `env` object.
- Nothing else reads `process.env`.
- Clients for Mongo and Redis are created by functions that the entry point
  calls, not automatically when a module loads.

**Gains:** one place to see every setting, default values that actually get
applied, and tests that pass in their own config instead of changing
`process.env`.

### 2.13 From Redux thunks to TanStack Query for server data

**Redux** is a library for app-wide state, and **thunks** are its way of
running async code. **TanStack Query** is a library made specifically for
fetching and caching data from a server.

**Why:** most of the old Redux state was really server data (the current
user, the problems), with loading and error flags written by hand.
Asynchronous judging makes this problem sharper. With TanStack Query,
polling a submission until it is done is a single option:

```ts
refetchInterval: (query) => (query.state.data?.status === 'done' ? false : 1000)
```

This line says: if the submission's status is `'done'`, stop refetching;
otherwise fetch it again every 1000 milliseconds (once a second).

**Gains:** caching, refetching in the background, polling and retries, all
without writing reducers.

**New effects:** a new way of thinking built around query keys (the names
that identify cached data) and cache invalidation (marking cached data as
out of date). The small amount of state that only lives in the browser
(editor preferences, the theme) goes in React state or a small store.

### 2.14 From `console.log` to structured logs with pino

**pino** is a logging library that writes logs as JSON.

**Why:** with two processes, following one submission means matching up log
lines from both of them.

**Gains:** JSON logs carry `requestId`, `userId` and `submissionId` fields,
so you can filter by any of them.

**New effects:** in development, `pino-pretty` makes the output readable.
Log objects, not strings glued together.

### 2.15 From bcrypt to argon2id

Both **bcrypt** and **argon2id** are algorithms for hashing passwords
safely.

**Why:** OWASP's Password Storage Cheat Sheet (OWASP is a well-known web
security organisation) lists Argon2id first. bcrypt is still acceptable, so
this is a small improvement that you can defend and explain.

**New effects:** the `argon2` package is added. Its parameters are chosen
once and written down. The OWASP minimum is 19 MiB of memory, 2 iterations,
and parallelism 1.

### 2.16 What stays the same

| Kept | Why keep it |
|---|---|
| Express 5 | You already know it. The learning budget goes to TypeScript, ESM and queues, not a new framework. Express 5 still passes errors from async handlers to the error handler automatically |
| MongoDB + Mongoose | Decided in the brief. Postgres comes in Phase 6 |
| Redis | Used for sessions, locks, rate limits, BullMQ, and later leaderboards |
| zod | Now shared between the frontend and the backend |
| Central `AppError` + error handler | It worked. Now it is typed |
| Cursor pagination | Still the right choice for problem lists and history (pages are fetched with "give me the items after this one" instead of page numbers) |
| Vitest + supertest + mongodb-memory-server | Works better under ESM. Switch to the replica-set variant |
| React + Vite + react-router + React Hook Form | No reason to change |
| Tailwind + Monaco | No reason to change |
| Self-hosted Judge0 on the Oracle box | Now used asynchronously |
| Branches, PRs, conventional commits, CI | Plus a typecheck step, and release tags for each milestone |

---

## Topic 3: repository layout

This is how the folders are arranged. The comments say what each one holds.

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

A few things worth noticing:

- `app.ts` builds the Express app but doesn't start listening on a port.
  That lets tests use the app without starting a real server. `main.ts` is
  what actually starts the HTTP server.
- `infra/` holds the code that connects to outside systems: MongoDB, Redis,
  Judge0, email and the job queue.
- On the web side, each feature folder has an `api.ts` with its query hooks,
  plus `components/` and `pages/`.

**Folders are grouped by domain (`modules/judge/`), not by layer
(`controllers/`).** A domain is one area of the app, such as judging or
auth. A feature's route, service and repository sit next to each other, so a
change to judging only touches one folder. The layering from Topic 4 still
applies inside each folder.

---

## Topic 4: backend layers

```
routes ──► controller ──► service ──► repository ──► Mongoose model
 (HTTP)     (HTTP ↔ domain)  (rules)     (database)
```

A request passes through these layers in order. Each layer has one job and
some things it must never do:

| Layer | Does | Never |
|---|---|---|
| **Routes** | Sets the path, the middleware (auth, rate limit, `validate(schema)`) and which controller handles it | Contains logic |
| **Controller** | Reads the already-validated input from `req`, calls a service, and shapes the HTTP response. It translates between HTTP and the domain | Touches the database, or holds business rules |
| **Service** | Holds the business rules, such as "a first solve awards XP" or "module B unlocks at 70% of A" | Knows about `req` or `res`, or imports Mongoose |
| **Repository** | Reads from and writes to the database, and returns plain domain objects | Holds business rules |

Three more rules:

- **The worker calls services directly.** `judgeService.finalize(submissionId)`
  is exactly the same code whether the poller calls it or a test does.
- **Errors:** services throw typed `AppError`s (`NotFound`, `Conflict`,
  `Forbidden`, and so on). One error middleware turns them into HTTP
  responses. It also logs 5xx responses (server errors) together with their
  cause, as the old app did.
- **Validation:** `validate({ body, query, params })` checks the request
  with zod schemas from `packages/shared` and replaces `req.body` with the
  result. That strips out any keys the schema doesn't know. This keeps the
  old protection against mass assignment (an attack where someone sends
  extra fields, like `role: "admin"`, hoping they get saved).

---

## Topic 5: data model (MongoDB, v1)

This topic lists every collection (a MongoDB "table") and what goes in it.

### Conventions that apply to every collection

- `_id` is a UUIDv7 string.
- Every collection has `createdAt` and `updatedAt`.
- Collection names are snake_case plurals (like `user_daily_stats`).
- Indexes are created in migrations, not by Mongoose's `autoIndex` feature.
- Notes marked **PG** (short for Postgres) say how a collection will map to
  Postgres in Phase 6.

### `users`

| Field | Notes |
|---|---|
| `username` | Unique, lowercase. The public URL is `/u/:username` |
| `email` | Unique, lowercase |
| `emailVerified` | True or false |
| `passwordHash` | Optional (users who only log in with OAuth have none) |
| `displayName`, `avatarUrl` | |
| `role` | `user` or `admin` |
| `timezone` | An IANA time zone name, for example `Asia/Kolkata`. It defaults to the browser's time zone at sign-up |
| `profile.hiddenCharts` | The ids of charts the user has hidden |
| `xpTotal`, `level` | A **cache**, rebuildable from `xp_events` |
| `streak.current`, `streak.longest`, `streak.lastDate` | A **cache**, rebuildable from `user_daily_stats` |
| `streak.multiplier` | Stored in whole hundredths, from 100 to 200 (brief section 6, "XP economy"). It is decayed (reduced) when read, after missed days |

Indexes: `{ username: 1 }` unique, and `{ email: 1 }` unique.

### `accounts`

Fields: `userId`, `provider` (`google` or `github`), `providerAccountId`,
and `email` (as the provider reported it).

Indexes: `{ provider: 1, providerAccountId: 1 }` unique, and
`{ userId: 1 }`.

### `topics`

Fields: `slug`, `name`, `order`. This is the fixed list of topics that the
radar chart groups problems by. It is filled in (seeded) by a migration.

### `problems`

| Field | Notes |
|---|---|
| `slug` | Unique. The URL is `/problems/:slug` |
| `title`, `difficulty` (`easy`, `medium` or `hard`) | |
| `topicIds` | References to `topics`. PG: becomes a `problem_topics` join table |
| `statement`, `constraints` | Markdown text |
| `examples` | The visible test cases, stored inside the problem: `{ input, output, explanation }` |
| `limits` | `{ cpuTimeSec, memoryKb }`, passed to Judge0 for each problem |
| `starterCode` | `{ [language]: code }`, the starting code per language |
| `referenceSolutions` | `{ [language]: code }`, left out of normal reads |
| `hints` | `[{ tier: 1–3, body }]` |
| `editorial` | Markdown, only returned after the user has solved the problem |
| `status` | `draft` or `published` |
| `authorId` | |
| `stats` | `{ submissions, accepted }`, updated asynchronously (section 6.4) |

Indexes:

- `{ slug: 1 }` unique.
- `{ status: 1, difficulty: 1, _id: 1 }` for filtered cursor pagination.
- `{ topicIds: 1 }`.

### `problem_testcases`

Fields: `problemId`, `order`, `input`, `output`.

**Why test cases are kept separate from `problems`:**

- Hidden test cases can never be sent to a browser by accident. The old
  code relied on remembering `.select()` in every query to leave them out.
- Reading a problem stays small and fast.
- Large inputs don't push a problem document toward MongoDB's 16 MB limit
  per document.
- Creating a problem together with its test cases is done in one
  transaction.

Index: `{ problemId: 1, order: 1 }` unique.

### `submissions` (graded, kept forever)

| Field | Notes |
|---|---|
| `userId`, `problemId`, `language`, `code` | |
| `status` | Goes from `queued` to `running` to `done`, or ends as `error` |
| `verdict` | One of `accepted`, `wrong_answer`, `time_limit`, `memory_limit`, `runtime_error`, `compile_error`, `internal_error` |
| `tests` | `[{ token, status, timeMs, memoryKb }]`, one entry per test case. The token is the id Judge0 gives each run |
| `failedCase` | `{ index, input?, expected?, actual?, message? }`. The input and outputs are only included for visible test cases |
| `timeMs`, `memoryKb` | The maximum across all test cases |
| `localDate` | The submitter's local date (YYYY-MM-DD), stamped when the submission is created |
| `judgedAt` | |

Indexes:

- `{ userId: 1, problemId: 1, createdAt: -1 }`: your submissions for one
  problem, newest first.
- `{ userId: 1, createdAt: -1 }`: for history and the profile.
- `{ status: 1 }` as a **partial** index, only covering documents where
  `status: 'running'`. A partial index only includes some documents. This
  keeps the poller's search tiny no matter how many finished submissions
  pile up.

### `runs` (the Run button and the playground, deleted after 24 hours)

Same shape as `submissions`, plus these fields: `kind` (`example` or
`playground`), `stdin`, `stdout`, `stderr`, `compileOutput` and
`expiresAt`.

Playground runs have no `verdict`. The brief (section 5) explains why:
Judge0's status 3 means "finished", not "correct".

Indexes:

- `{ expiresAt: 1 }` with `expireAfterSeconds: 0`. This tells MongoDB to
  delete each document once its `expiresAt` time has passed.
- The same partial `running` index as `submissions`.

### `user_problem_progress`

Fields: `userId`, `problemId`, `attempts`, `firstSolvedAt?` (the `?` means
optional), `lastSubmittedAt`, `hintsThisAttempt` (0 to 3), and
`srs: { reps, intervalDays, ease, dueAt }` (the spaced-repetition schedule:
how many reviews so far, the gap in days, an "ease" factor, and when the
next review is due).

`hintsThisAttempt` only counts hint reveals while XP can still be earned:
before the first solve, or while a revisit is due. It resets to 0 after each
accepted solve.

Indexes: `{ userId: 1, problemId: 1 }` unique, and
`{ userId: 1, 'srs.dueAt': 1 }` for the revisit queue.

### `xp_events` (append-only)

Fields: `userId`, `source: { type, id }`, `amount`, `localDate`,
`submissionId`, `meta`, `createdAt`.

- **`submissionId`** groups together the events produced by one
  submission, so the screen can show them as one breakdown (brief section
  6, "Explaining an award").
- **`meta`** on `solve` and `revisit` events stores
  `{ base, share, hintsThisAttempt, hintPenalty, multiplier }` **exactly as
  they were when the XP was awarded**. These values can't be worked out
  again later, because the problem's difficulty may be edited,
  `hintsThisAttempt` resets, the multiplier changes, and the XP settings may
  be rebalanced. A rebuild script can also re-run `problemXp(meta)` and check
  that the result equals `amount`.

The source types:

| Type | Its id | What it is |
|---|---|---|
| `solve` | the problemId | XP for solving a problem for the first time |
| `revisit` | `problemId:reps` | XP for solving a problem whose revisit is due |
| `first_of_day` | the localDate | The +10 for the first streak-day solve of the day |
| `daily_problem` | the daily problem's date | The +50 for the daily problem |

There are no separate events for streaks or hints. The multiplier and the
hint penalty are already included in each `solve` or `revisit` amount. The
amounts follow brief section 6, "XP economy".

Index: **`{ userId: 1, 'source.type': 1, 'source.id': 1 }` unique.** This
is the rule that makes awarding the same XP twice impossible: the database
refuses a second event with the same user, type and id.

### `user_daily_stats`

Fields: `userId`, `date` (the user's local date), `submissions`,
`accepted`, `newlySolved`, `xp`.

Index: `{ userId: 1, date: 1 }` unique.

### `tracks` and `modules`

- `tracks`: `slug`, `title`, `description`, `order`.
- `modules`: `trackId`, `slug`, `title`, `order`, `prerequisiteIds` (ids of
  other modules), `unlockRule: { minSolvedPct }`, and
  `items: [{ problemId, order }]`. PG: these become `module_prerequisites`
  and `module_problems` join tables.

One problem can appear in several modules. Progress per module is not
stored. It is calculated from `user_problem_progress` (see Topic 8).

### `daily_problems`

Fields: `date` (unique, in UTC) and `problemId`.

### Later collections (sketched now so v1 doesn't block them)

- **v2:** `friendships`, `contests`, `contest_participants`,
  `contest_submissions`, `contest_results` (rank, score, and rating before
  and after), `badges`, `user_badges`, `notifications`.
- **v3:** `subscriptions`, `entitlements`, `payments`, `ai_generations`.

---

## Topic 6: the judging pipeline

This topic follows one submission from the moment the user presses Submit to
the moment XP is awarded.

### 6.1 The states a submission goes through

```
queued ──(sent to Judge0)──► running ──(all tests finished)──► done + verdict
   │                            │
   └── Judge0 refused ──► error └── stuck > 2 min ──► done + internal_error
```

In words:

- A submission starts as `queued`.
- Once it is sent to Judge0 it becomes `running`.
- When all its tests have finished, it becomes `done` with a verdict.
- If Judge0 refuses it while it is `queued`, it becomes `error`.
- If it stays `running` for more than 2 minutes, it becomes `done` with the
  verdict `internal_error`.

### 6.2 Submitting (in the API process)

1. The browser calls `POST /api/problems/:slug/submissions`. The API
   validates the input and applies a per-user rate limit.
2. The API loads the problem and its test cases, and inserts the submission
   as `queued`, with the user's `localDate`.
3. It sends the code to Judge0's `/submissions/batch` with `wait=false`
   (meaning "don't wait for the result"), in chunks of at most
   `MAX_SUBMISSION_BATCH_SIZE` test cases. It saves the tokens Judge0 returns
   in `tests[]` and sets `status: 'running'`.
4. It answers `202 { id }`.
5. If Judge0 refuses (its queue is full and it answers 503, or it can't be
   reached), the API sets `status: 'error'` and answers 503 with "Judge is
   busy, try again". The old client's handling of 502, 503 and 504 errors
   carries over.

### 6.3 The poller (in the worker process)

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

What this pseudo-code does, step by step. A "tick" is one round of the loop.
It runs every 500 milliseconds while there is work waiting, and every 3
seconds when there is nothing to do.

1. It tries to hold the Redis lock named `"judge:poller"`. `SET NX PX` means
   "set this key only if it doesn't exist yet, and let it expire after a
   number of milliseconds". The lock is renewed on every tick. If another
   worker holds it, this worker skips the tick.
2. It loads all submissions and runs whose status is `'running'`.
3. It collects the tokens of the tests that haven't finished yet.
4. It asks Judge0 for those tokens in chunks of at most
   `MAX_SUBMISSION_BATCH_SIZE`, asking only for the listed fields.
5. For every result whose `status.id` is 3 or more (meaning finished), it
   saves the result into the matching entry of the `tests` array. It uses
   MongoDB's positional `$set` on `tests.$`, which updates just that one
   array entry.
6. For every submission whose tests are now all finished, it calls
   `judgeService.finalize(submissionId)`.
7. Any submission that has been running for more than 2 minutes is
   finalized as `internal_error`.

Two notes:

- **The lock** means a second worker only takes over if the first one dies
  (because the lock then expires without being renewed). Moving this loop to
  a BullMQ job scheduler later would be an equally good option.
- **The verdict logic is a pure function.** A pure function only uses its
  inputs and has no side effects. Here, test results go in and the verdict
  and `failedCase` come out. That makes it the easiest part of judging to
  unit-test thoroughly.

### 6.4 Finishing a submission (all in one transaction)

Everything below happens inside `session.withTransaction(…)`, which
automatically retries when it hits temporary errors.

1. Run
   `submissions.updateOne({ _id, status: 'running' }, { $set: { status: 'done', verdict, … } })`.
   **If nothing was changed, stop.** That means another tick already
   finished this submission.
2. Upsert `user_daily_stats` for (user, `localDate`). "Upsert" means update
   the document if it exists, or create it if it doesn't. Use `$inc`
   (increase by) on `submissions`, and on `accepted` too if the verdict is
   accepted.
3. Upsert `user_problem_progress` and `$inc` the attempts. If the verdict
   is accepted and there is no `firstSolvedAt` yet, set it. **This is a
   first solve.**
4. Decide whether this counts as a **streak-day solve**. It does if it is a
   first solve, a due revisit, or today's daily problem. A daily problem the
   user had already solved counts as a revisit, whether or not the revisit
   was due. If it is none of these, stop here, and no XP is awarded.
5. If this is the first streak-day solve of the user's local day, update
   `users.streak`. First apply the decay for any missed days. Then add +0.1×
   to the multiplier if yesterday was a streak day, with a cap of 2.0×.
   Insert the `first_of_day` event (+10).
6. Insert the `solve` or `revisit` event. Its amount comes from the pure
   function `problemXp(base, revisitShare, hintsThisAttempt, multiplier)`.
   On a revisit, move the SM-2 schedule forward (SM-2 is a classic
   spaced-repetition algorithm that decides when to review next). Reset
   `hintsThisAttempt`.
7. If this is today's daily problem, insert the `daily_problem` event
   (+50).
8. `$inc` `users.xpTotal` and the day's `xp` by the total of the events
   just inserted, and recalculate `level`.

After the transaction is committed (saved):

- Run `INCR stats:ver:<userId>`, which invalidates that user's cached charts
  (see Topic 10).
- `problems.stats` is updated **outside** the transaction. The reason:
  during a contest, hundreds of transactions all writing to the same popular
  problem's document would conflict with each other and keep retrying.

**Why a transaction is needed:** `$inc` is not idempotent. An idempotent
operation gives the same result if you run it twice; `$inc` adds again each
time. Without a transaction, a crash between step 1 and step 2 would either
lose the stats or count them twice:

- If step 1 ran first, the verdict is already saved, so the submission is
  never finished again, and its stats are lost.
- If step 2 ran first, a retry would count the stats a second time.

Inside a transaction, either all of it happens or none of it does.

### 6.5 Runs and the playground

Runs use the same submit path and the same poller. The difference is that
finishing a run only fills in stdout, stderr and the status. There is no
transaction, no XP and no stats. Playground runs leave out
`expected_output`, and the screen shows "Finished", never "Accepted".

### 6.6 What happens when something fails

| What fails | What happens |
|---|---|
| Judge0's queue is full, or it can't be reached, at submit time | The submission becomes `error`, and the user sees "busy, try again" (503) |
| Judge0 can't be reached while polling | The tokens stay `running`, and the next ticks try again. The 2-minute limit still applies |
| The worker crashes while finishing a submission | The transaction is rolled back (undone), and the next tick finishes it |
| Two workers are running | Thanks to the lock, only one polls. The `status: 'running'` filter stops a submission from being finished twice |
| The API crashes after sending to Judge0 but before saving the tokens | The submission is stuck as `queued`. A cleanup job marks old `queued` rows as `error` |

### 6.7 Development setup

The worker only makes outgoing requests to Judge0. So any way of reaching a
Judge0 instance from the development machine works: a local Judge0, or a
forwarded port to a remote one. Nothing needs to reach *into* the
development machine, which would be needed if Judge0 sent results back
through callbacks.

---

## Topic 7: authentication

### 7.1 Sessions

There are no access tokens and refresh tokens. That pair exists to solve a
problem that only JWTs have: a token that can't be revoked (cancelled). A
session is checked on the server on every request, so it can last a long
time and still be revoked at any moment. The reasoning is in
`02_01-sessions-vs-jwt.md`, section 8.

**The cookie:** named `__Host-sid` in production (`sid` in development),
with `HttpOnly; Secure; SameSite=Lax; Path=/`.

**What Redis stores:**

- The key `sess:<sha256(id)>` (the SHA-256 hash of the session id) holds
  `{ userId, createdAt, authenticatedAt, userAgent }`.
- The key `user_sess:<userId>` is a set of that user's session hashes. It is
  used for "log out everywhere" and for the devices list.

**Two timeouts:**

- **Idle timeout: 30 days.** It is extended every time the session is used
  (sliding expiration).
- **Absolute timeout: 90 days** from `createdAt`, no matter how active the
  user is.

**What `requireAuth` (the middleware that checks login) does:**

1. Hash the cookie's value.
2. Run `GETEX sess:<hash> EX <idle>`, which reads the session and extends
   its expiry in one trip to Redis. If the session is missing, answer 401
   (not logged in).
3. If the session is older than the absolute cap, destroy it and answer
   401.
4. Load the user from the database, so the user's role is always up to
   date.

**More rules:**

- **Slide the cookie too.** When the session is extended, send
  `Set-Cookie` again with a fresh `Max-Age`, at most once a day. Otherwise
  the browser deletes the cookie on the date that was set at login, while
  Redis still holds a live session.
- **Create a new session id at login**, never reuse one the browser
  brought with it. This prevents session fixation (an attack where someone
  plants a known session id in your browser before you log in). Also issue
  a new id whenever the account's privileges change.
- **Recent login for sensitive actions.** Changing the email or password,
  deleting the account, and (later) payment actions require
  `authenticatedAt` to be within the last 10 minutes. Otherwise the user
  types their password again, and `authenticatedAt` is updated.
- **Composition:** `requireRole('admin')` runs after `requireAuth` and
  checks `req.user.role`. There is only one copy of the session check, not
  two.

### 7.2 Email and password

- **Registering works like the old flow, which is kept.** The password is
  hashed with argon2id, a verification token is stored in Redis with a TTL
  (an expiry time), and the user is emailed a link.
- **`resend-verification` gives the same answer whether or not the account
  exists.** This closes the account-enumeration leak (letting an attacker
  find out which emails have accounts) that the old `Things-to-DO.md` had
  left open. The trade-off: someone who mistypes their email gets no
  specific error message.
- **Rate limits per IP address** on register, login and resend. They are
  stored in Redis (using `express-rate-limit` + `rate-limit-redis`), so they
  hold across both processes.

### 7.3 OAuth with Google and GitHub

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

The same flow in plain words:

1. The browser goes to `GET /api/auth/google/start`.
2. The API creates a random `state` value and a PKCE `code_verifier` (PKCE
   is an extra safety step: a secret the API keeps, so a stolen code is
   useless on its own). It stores both in a short-lived `httpOnly` cookie,
   then redirects the browser to Google with the `state` and the
   `code_challenge` (a value derived from the verifier).
3. The user approves the login at Google.
4. Google redirects back to `/api/auth/google/callback?code=…&state=…`.
5. The API checks that `state` matches the cookie. This stops login CSRF.
   Then, talking directly from server to server, it exchanges the `code`
   and the `code_verifier` for tokens, and fetches the user's profile: id,
   email and `email_verified`.
6. The API decides who this is:
   - If `accounts` already has (google, id), log in as that user.
   - Otherwise, if a user already has this verified email, link the account
     and log in.
   - Otherwise, create a new user and account (and generate a username).
7. The API creates a session, sets the cookie, and redirects to the web
   app.

Notes:

- **`state` is always used, and PKCE is used wherever the provider supports
  it.** Google does. Check GitHub's current docs when you build it.
- **GitHub may not return an email from `/user`.** Call `/user/emails` and
  use the primary, verified one.
- Link by email **only** when the email is verified (see 2.6).

### 7.4 Security checklist (part of Phase 1's "done-when")

- [ ] `helmet` (a package that sets safe HTTP headers)
- [ ] rate limits on auth routes and on submit and run
- [ ] `Origin` check on requests that change something
- [ ] zod validation on every body, query and params
- [ ] no hidden test case or reference solution in any response (a test
  checks this)
- [ ] a generic response from resend-verification
- [ ] account linking only on a verified email
- [ ] a new session id at login, and the idle (30 days) and absolute (90
  days) timeouts enforced
- [ ] the recent-login check on email or password change and on account
  deletion
- [ ] login takes the same time whether or not the email exists (by
  comparing against a dummy hash when there is no user), so the timing
  doesn't reveal which emails have accounts

---

## Topic 8: journey and progress

The **journey** is the learning map made of tracks and modules.

- `GET /api/tracks/:slug` returns a track's modules. For a logged-in user,
  each module also includes `{ solved, total, pct, unlocked }`.
- **How it is calculated:** one query loads the user's progress for all the
  problem ids in the track (using `$in`, "is one of these"). Each module's
  `pct` is solved divided by total. A module is unlocked when every one of
  its prerequisites has `pct ≥ unlockRule.minSolvedPct`.
- **Prerequisites form a graph** (modules pointing at other modules). The
  admin editor must reject cycles (A needs B and B needs A), so every save is
  checked with a topological sort (an algorithm that orders the modules and
  fails if there is a loop).
- Locked modules stay visible but can't be opened, so the map shows what is
  coming.

---

## Topic 9: gamification

- **XP** only comes from inserting `xp_events` inside the finishing
  transaction (section 6.4). The rules are in brief section 6, "XP economy".
  The amounts live in one config object, so rebalancing is a one-line
  change. Revealing a hint only increases `hintsThisAttempt`. The penalty is
  applied later, when XP is awarded.
- **Levels** come from a pure function:
  `levelFor(xp) = Math.floor(Math.sqrt(xp / 100))` (brief section 6). The XP
  needed to reach level n is `100 * n ** 2`. The profile uses this to show
  "X / Y XP to next level".
- **The daily problem:** a BullMQ job scheduler runs at 00:00 UTC. It picks
  a published problem that hasn't been used in the last N days and inserts
  it into `daily_problems`. Everyone gets the same problem, and it changes at
  the same moment worldwide (5:30 am IST).
- **Streaks** count consecutive **local** days on which the user made at
  least one streak-day solve (a first solve, a due revisit, or the daily
  problem). Re-submitting old solutions doesn't count. The local date is
  worked out with
  `new Intl.DateTimeFormat('en-CA', { timeZone }).format(now)`. The `en-CA`
  (Canadian English) locale is used because it formats dates as
  `YYYY-MM-DD`.
- **Nothing is reset overnight.** Instead, when a streak is read and its
  `lastDate` is before yesterday, it is shown with a day count of 0. The
  multiplier that is shown is calculated from the stored value and the
  number of missed days. The stored values only change on the user's next
  streak-day solve.
- **The revisit queue:** `GET /api/me/revisits` returns the progress entries
  whose `srs.dueAt ≤ now` (due now or earlier). Solving one moves its SM-2
  schedule forward.

---

## Topic 10: profile stats

Each chart on a profile has its own endpoint under
`/api/users/:username/stats/…`, and each one reads from a specific place:

| Endpoint | Reads from |
|---|---|
| `heatmap?year=` | `user_daily_stats` |
| `solved` | `user_problem_progress` + `problems.difficulty` |
| `radar` | `user_problem_progress` + `problems.topicIds` |
| `xp` | `xp_events`, added up over time by date |
| `verdicts` | `submissions`, grouped by verdict and language |
| `journey` | the same calculation as Topic 8 |

- **Visibility:** if the user has hidden a chart, its endpoint returns 404
  (not found) to everyone except the owner.
- **Caching with versioned keys:** each result is cached in Redis under the
  key `stats:<userId>:<ver>:<chart>`, where `ver` is the current value of
  `stats:ver:<userId>`. Finishing a submission increases `ver`, so the old
  keys are never read again and simply expire on their own. Nothing has to
  go looking for them and delete them.
- Public responses also send `Cache-Control: public, max-age=60`, which lets
  browsers and caches reuse the response for 60 seconds.

---

## Topic 11: frontend

- **Routes (pages):** `/`, `/login`, `/signup`, `/verify`, `/problems`,
  `/problems/:slug`, `/journey`, `/journey/:track`, `/playground`,
  `/u/:username`, `/settings`, `/admin/*`.
- **Server data:** TanStack Query hooks live in each feature's `api.ts`,
  with query keys like `['problem', slug]` and `['submission', id]`.
- **The API client** is a small wrapper around `fetch` that checks every
  response with the shared zod schemas. If the API's response shape
  changes, it fails loudly in development instead of breaking quietly.
- **Forms:** React Hook Form with `zodResolver` and the same schemas the
  server uses.
- **The problem page:** uses the Monaco editor (the editor from VS Code).
  When the user submits, the API answers `202`, the page polls the
  submission, and the screen shows Queued, then Running, then the verdict.
- **Charts:**
  - The heatmap is hand-built SVG.
  - The radar, donut and line charts use Recharts.
  - The learning path uses React Flow.
  - The theme's CSS variables control the chart colors, so the charts
    follow dark and light mode.

---

## Topic 12: environments, deployment and CI

How development (on your machine) and production (the real server) differ:

| | Dev | Production |
|---|---|---|
| MongoDB | Docker, a 1-node replica set on port **27018**, with the member advertised as `localhost:27018`. It is off the default port so that a forwarded 27017 on the dev machine can never be reached by mistake | The existing self-hosted replica set |
| Redis | Docker on port **6380**, AOF on | The existing one, with AOF on |
| Judge0 | The self-hosted instance, reached over a forwarded port | The same server, over the private network |
| API + worker | `tsx watch`, both started by one `npm run dev` | Two containers from one image, with different start commands |
| Web | Vite dev server with the `/api` proxy | A static build served by nginx |
| TLS (HTTPS) | None | nginx + Let's Encrypt on a subdomain of your domain |

- **CI on every PR** runs these steps in order: lint, typecheck, test (all
  workspaces), then build.
- **Releasing on a tag** (`v0.1.0` = M1, the first milestone): build the
  images, push them to GitHub Container Registry, and deploy over SSH. This
  is built in Phase 1, together with the first deploy.
- **Health endpoints:** `/api/health` says the process is up. `/api/ready`
  says Mongo and Redis can be reached.
- **Capacity:** Judge0, MongoDB, Redis, the app and ollama all share 4 CPUs.
  Judge0 is the one that uses the most CPU. Watch the load before v2's
  contest load tests.

---

## Topic 13: testing strategy

| Level | What is tested | Tools |
|---|---|---|
| Unit | The verdict logic, `levelFor`, streak math, SM-2, unlock rules, and the prerequisite cycle check | Vitest |
| Repository | Every repository method, against a real in-memory replica set. These tests will be reused unchanged against Postgres in Phase 6 | Vitest + `MongoMemoryReplSet` |
| HTTP | Routes from end to end, including auth, validation and the shape of errors | Vitest + supertest |
| Judge pipeline | The poller and the finishing step, against a fake Judge0 HTTP server | Vitest + a small fake server |
| End to end (at the end of v1) | A user signs up, solves a problem, and sees the XP appear on their profile | Playwright |

Pure functions hold most of the business rules, so most of the tests are
the fast kind.

---

## Topic 14: open decisions (to be settled in the day plans)

| Decision | Options | Settled in |
|---|---|---|
| UI component library | daisyUI (which you know) or shadcn/ui (accessible building blocks, and you own the code) | Phase 0 |
| Exactly how `packages/shared` is wired up | Use the source in dev plus `tsc -b` for builds, or use a bundler for the API | Phase 0 |
| Username rules | Length, allowed characters, and how often renames are allowed | Phase 1 |
| XP economy and level curve | See brief section 6 | Before Phase 4 |
| Rating algorithm | Elo or Glicko-2 | v2 |

---

## In short

- There are two processes from one codebase. The **API** answers requests
  quickly and never waits for Judge0. The **worker** polls Judge0, decides
  verdicts and awards XP. They only share data through MongoDB and Redis.
- The big changes are: ESM instead of CommonJS, TypeScript, a monorepo with
  `packages/shared`, async judging, Redis sessions instead of JWTs, OAuth
  login, event-based XP and progress, layered code with repositories (ready
  for Postgres), UUIDv7 ids, migrations, one origin behind nginx, one typed
  config, TanStack Query, pino logs and argon2id.
- Finishing a submission is **one MongoDB transaction**, and a unique index
  on `xp_events` makes double XP impossible.
- Sessions have a 30-day idle timeout and a 90-day absolute timeout, and
  OAuth only links accounts on a **verified** email.
- Most business rules are pure functions, so most tests are fast unit tests.
- Still open: the UI library, the shared-package wiring, username rules,
  the XP economy and the rating algorithm.
