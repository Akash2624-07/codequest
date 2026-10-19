# CodeQuest Revamped — Project Brief

## What this is about, in one paragraph

This document is the starting point for the new CodeQuest. It was written after
a planning discussion on 2026-09-25 and records **what was decided and why**.
It covers the goal of the rebuild, the lessons learned from the old CodeQuest,
the main technology choices, the plan to move from MongoDB to PostgreSQL later,
how code judging will work, the full feature list (including how XP is
calculated), the release plan, a time estimate, and the milestones. The other
design documents build on it: the architecture document (`02-architecture.md`)
and the decision records (the files named `02_NN-*.md`, where `NN` is a
number).

One note before starting: the previous version of the project lives in the
folder `../codequest`. The brief treats it as **a reference for what went wrong
and what worked**, not as a template to copy.

---

## Topic 1: the goal

There are three parts to the goal.

- **Rebuild CodeQuest from scratch, in a more structured way.** The new version
  is a TypeScript monorepo (one repository that holds several related
  packages). Its architecture decisions are made on purpose and written down.
- **Build it in phases.** Each phase ends in a milestone that can actually be
  deployed. There is no fixed deadline.
- **Every significant decision gets a record.** These are the `02_NN-*.md`
  files. Each one says what was chosen, which alternatives were considered, and
  when the decision should be looked at again.

---

## Topic 2: what the old CodeQuest taught us

The old app was looked at honestly. Some things worked well and are kept. Other
things caused real problems and get a new design.

### What to keep

- **zod validation at the edges.** zod is a library that checks incoming data
  against a schema (a description of what the data must look like). "At the
  edges" means right where data enters the app. The old `validate()` function
  replaced `req.body` (the data the user sent) with zod's parsed result, and
  that result drops any keys the schema doesn't know about. This one trick
  closed two security holes without any extra code in the controllers:
  - **Mass assignment**, where a user sends extra fields (for example a field
    they should not be allowed to set) and the app saves them blindly.
  - **`problemCreator` spoofing**, where a user could fill in the
    `problemCreator` field themselves instead of the server setting it.
- **One central `AppError` class plus one error handler.** All errors flow to
  one place. Express 5 helps here: when an `async` route handler fails (its
  promise is "rejected"), Express 5 passes the error to the error handler by
  itself.
- **A Redis blocklist for JWTs on logout.** A JWT (JSON Web Token) is a signed
  login token. When a user logs out, the token is added to a "blocked" list in
  Redis. The entry is stored with the `EXAT` option set to the token's own
  `exp` (its expiry time), so the Redis entry disappears at exactly the moment
  the token would have stopped working anyway.
- **Cursor pagination instead of `skip`/`limit`.** With `skip`/`limit`, the
  database counts past all the earlier rows to reach page 50. With cursor
  pagination, each page says "continue after this item", which stays fast.
- **Good team habits:** feature branches, pull requests (PRs), conventional
  commits (commit messages like `feat: ...` or `fix: ...`), and CI
  (automatic checks on every push) running lint and tests.
- **Reference solutions are checked through Judge0 before a problem is saved.**
  Judge0 is the open-source code-running service CodeQuest uses. A new problem
  is only accepted if its official solution actually passes its own tests.
- **A hardened Judge0 client.** The code that talks to Judge0 had several
  safety measures:
  - a wall-clock poll budget (a maximum total time to keep asking for results),
  - turning Judge0's 502, 503 and 504 errors into proper app errors,
  - rejecting a batch when only part of it was accepted,
  - caps on the number of test cases.

### What to fix

Each row is an old problem, the trouble it caused, and the new design that
fixes it.

| Old problem | What it caused | New design |
|---|---|---|
| A submit kept the user's HTTP request open while it polled Judge0 (with a 20s budget) | Only about 8 users could finish a submit within 20s on the 4-CPU server | Async judging (Topic 5) |
| `password` was required on the User model | Users who sign in with OAuth (Google, GitHub) have no password, so they couldn't exist | A separate `accounts` collection; password is optional |
| A `problemSolved` array on the user document | It grows forever, and it keeps no history, so there can be no XP, streaks or heatmap | An event log plus a daily summary table (Topic 6) |
| Problems had no slug, order or topic, and `tags` were free text | No learning journey was possible, and the topic radar chart couldn't group problems | A fixed topic list, plus tracks and modules |
| The list of languages was copied by hand into both frontend and backend | The two copies drift apart over time | One copy in `packages/shared` |
| CommonJS (the old `require()` module style) | `vi.mock` (Vitest's way to fake a module) didn't work, so tests needed `vi.spyOn` plus `require.cache` workarounds | ESM (modern `import`/`export`) plus TypeScript |
| A `post('findOneAndDelete')` hook for cascading deletes | `deleteOne` and `deleteMany` skip that hook and leave orphans (rows that point to a deleted user) | Deletes go through repositories; real foreign keys once on Postgres |
| No rate limit or `helmet`, and the "resend verification email" endpoint reveals whether an account exists | Still open | Fixed in Phase 1 |

A few words from that table:

- A **slug** is the readable part of a URL, like `two-sum` in
  `/problems/two-sum`.
- **`helmet`** is an Express middleware that sets safe HTTP security headers.
- A **rate limit** caps how many requests one person can make in a time window.
- A **foreign key** is a database rule that says "this column must point to a
  real row in another table".

---

## Topic 3: the main decisions

Here is each decision in plain words, with the reason and when it should be
revisited. Where no reason or revisit point was given, that is said.

- **Language: TypeScript, using ESM.** A full restart is the cheapest moment to
  switch languages, and the same types can be shared by the API and the web
  app. No revisit planned.
- **Repository: a monorepo with npm workspaces.** It has three parts:
  `apps/api`, `apps/web` and `packages/shared`. The reason is one single source
  of truth for schemas, types and the language list. `apps/api` has **two
  entry points** (two ways to start it): the HTTP server, and a worker process
  that runs the judge poller and other background jobs. No revisit planned.
- **Main database for v1: MongoDB with Mongoose.** It is already known and
  already hosted, so there are fewer new things to learn at once. A move to
  another database is planned before v2 (Topic 4).
- **Later database: PostgreSQL with Drizzle.** Drizzle is a TypeScript library
  for talking to SQL databases. Postgres suits this app's data because it is
  relational, it has foreign keys, and it handles joins well for stats, the XP
  ledger and payments. This happens after v1.
- **Redis is used for:** background jobs, the live leaderboard, rate limits,
  the JWT blocklist and caching. All of this is fast data that can be rebuilt
  if Redis loses it. No revisit planned.
- **Judging is async.** The API answers with status 202 ("accepted, still
  working"), and a background poller in the worker process fetches results from
  Judge0 in batches. The reasons: Judge0 already has its own queue,
  `wait=true` ties up Judge0's web process, and `callback_url` ties up Judge0's
  workers, while one poller ties up neither (details in Topic 5). Revisit: add
  a BullMQ buffer if v2 load tests fill up Judge0's queue.
- **Background jobs: BullMQ.** BullMQ is a job queue library built on Redis. It
  will run the daily problem, emails, summary updates and rating recalculation.
  The reason is that it supports retries and schedules that survive restarts.
  No revisit planned.
- **Contest scoring: a rating system, Elo-style first, maybe Glicko-2 later.**
  Elo is the rating system used in chess; Glicko-2 is a more advanced version
  of the same idea. It gives users a meaningful rating curve, and it is worth
  implementing yourself as a learning exercise. No revisit planned.
- **Profiles are public by default, and each chart can be hidden.** Public
  profiles are shareable, and the stats endpoints can be cached by URL. No
  revisit planned.
- **Sign-in: email with verification, Google, and GitHub.** The OAuth 2.0 flow
  used is "authorization code + PKCE + `state`". (OAuth 2.0 is the standard
  for "Sign in with Google". PKCE, Proof Key for Code Exchange, and the `state`
  value are two extra safety checks in that flow.) No separate reason or
  revisit point is given.
- **Payments: Razorpay, using entitlements instead of an `isPaid` flag.**
  Razorpay is the usual choice in India and it supports UPI. An
  **entitlement** is a record of what a user is allowed to use (for example
  "can create private contests"), which is more flexible than one yes/no flag.
  Revisit at v3.
- **AI: a provider interface.** The code talks to "an AI provider" through one
  interface, so the provider can be swapped. A hosted API is used for live
  features, and a self-hosted ollama (a tool for running AI models on your own
  server) is used for batch jobs. The reason: ollama on the Oracle server runs
  on the CPU only, which is too slow for live hints. Revisit at v3.
- **Charts:** React Flow for the learning path, Recharts for the line, radar
  and donut charts, and the heatmap hand-built in SVG. The heatmap is a good
  first exercise in drawing with data. No revisit planned.
- **Time:** each user stores a timezone, and each event gets its local date
  saved at the moment it is written. This matters for where a "day" starts and
  ends for streaks and the heatmap. No revisit planned.

---

## Topic 4: the database plan (MongoDB now, PostgreSQL later)

### Why Postgres eventually

Almost everything this app stores is a **relationship** between things, for
example:

- users and their accounts,
- tracks, which contain modules, which contain problems,
- prerequisites between modules,
- friendships,
- contests, their problems and their participants,
- contest results,
- XP events,
- hint unlocks,
- the revisit schedule,
- badges and the users who earned them,
- subscriptions and their entitlements.

Only problems really look like "documents", which is what MongoDB is best at.

The brief shows two places where the difference becomes clear.

**Example 1: keeping related data in sync.** The old `src/models/user.js` had
this code:

```js
userSchema.post('findOneAndDelete', async function (userInfo) {
  await mongoose.model('submissions').deleteMany({ userId: userInfo._id });
});
```

It means: "after a user is deleted with `findOneAndDelete`, also delete their
submissions". The catch is that Mongoose query hooks only run for the exact
method they are attached to. If someone deletes a user with `User.deleteOne()`
instead, the hook never runs and the user's submissions are left behind as
orphans.

In Postgres, the rule lives inside the database itself, so no code path can get
around it:

```sql
user_id uuid REFERENCES users(id) ON DELETE CASCADE
```

This says: "`user_id` must point to a real user, and when that user is deleted,
delete this row too."

**Example 2: stats queries.** Here is the topic radar (how many problems a user
has solved per topic), first in SQL:

```sql
SELECT t.name, COUNT(DISTINCT s.problem_id) AS solved
FROM submissions s
JOIN problem_topics pt ON pt.problem_id = s.problem_id
JOIN topics t          ON t.id = pt.topic_id
WHERE s.user_id = $1 AND s.verdict = 'accepted'
GROUP BY t.name;
```

And the same thing as a MongoDB aggregation pipeline:

```js
db.submissions.aggregate([
  { $match: { userId, verdict: 'accepted' } },
  { $group: { _id: '$problemId' } },
  { $lookup: { from: 'problems', localField: '_id', foreignField: '_id', as: 'p' } },
  { $unwind: '$p' }, { $unwind: '$p.topics' },
  { $group: { _id: '$p.topics', solved: { $sum: 1 } } },
]);
```

Both work. The conclusion in the brief: **MongoDB is capable, but Postgres is
built for this kind of work.**

### Six rules that keep the later switch cheap

These rules are followed from the start, so moving databases later is a
contained job.

1. **Use a repository layer.** Services call functions like
   `problemRepo.findBySlug()` and never import a Mongoose model directly. A
   "repository" is a small module whose only job is talking to the database.
   Switching databases then means rewriting the repositories only, not the
   services or controllers.
2. **Domain types come from `packages/shared` (written with zod), not from
   Mongoose.** Nothing outside a repository ever sees Mongoose-specific things
   like `Document`, `ObjectId` or `populate`.
3. **Ids are opaque strings in the API.** "Opaque" means the rest of the app
   treats an id as just a string and doesn't care what's inside. The brief
   suggests considering UUIDv7 (a modern unique-id format) as the Mongo `_id`,
   so ids survive the move unchanged. Public URLs use slugs and usernames
   instead of ids.
4. **Only embed value objects.** Value objects are small pieces of data with no
   identity of their own, such as test cases and per-language starter code;
   they can live inside the problem document. Anything that has its own
   identity (modules, contests, friendships, XP events) gets its own collection
   and is linked by reference. That way each collection maps one-to-one onto a
   table later.
5. **Use migrations from day one, with `migrate-mongo`.** A migration is a
   versioned script that changes the database's schema or data. Every change
   is written as one. This means the project truly has "database migrations"
   from Phase 0, not only after the switch.
6. **Tests target the repository interfaces.** The same tests can later check
   the Postgres version of each repository.

### When to switch

**Between v1 and v2, before contests are built.** Two reasons:

- Contest results and rating history need a lot of joins.
- Payment data (coming in v3) should never have to be migrated while the app is
  live.

The brief is firm: don't let the switch slide past this point.

### How to switch (an outline of Phase 6)

1. Create the Postgres schema and the Drizzle migrations.
2. Write Postgres repositories behind the same interfaces. Run the repository
   tests against both databases.
3. Write a backfill script that copies data from Mongo into Postgres. It must
   be safe to run more than once.
4. Turn on dual-write: every write goes to both databases, but reads still come
   from Mongo.
5. Verify: record counts match, and per-user checks (like solved count and XP
   total) match.
6. Switch reads over to Postgres behind a flag (a setting you can turn off
   again), and watch closely.
7. Stop writing to Mongo, and then remove it.

This approach is called the **expand/contract** pattern: first you expand (run
old and new side by side), then you contract (remove the old one). The brief
also says to record **why** the migration happened in a decision record while
it is happening, because the reasons matter as much as the steps.

---

## Topic 5: judging, Judge0's queue and ours

### What the real problem was

Judge0 already runs its own queue (backed by Redis) with workers that run the
code. So the old problem was **not** a missing queue. The problem was that
**our API kept the user's HTTP request open** while it kept asking Judge0 for
the result, for up to 20 seconds. That turned "Judge0 is busy" into "your
request failed".

The fix is to be async on **our** side, not to add a second queue in front of
Judge0's. The user's request returns straight away. The only remaining question
is how **our backend** finds out each result from Judge0.

### Three ways to get results from Judge0

These were checked against the Judge0 documentation and source code on
2026-09-25.

**Option 1: `wait=true`.** Judge0 only replies once the code has finished
running.

- Why not: it runs the code inside Judge0's **web process** (using
  `perform_now`, which runs the job right away in that same process instead of
  handing it to a worker). The Judge0 docs themselves say: *"We do not recommend
  the use of `wait=true` feature because it does not scale well."*

**Option 2: `callback_url`.** Judge0 sends the result to our API with a `PUT`
request when it's done.

- Why not, part 1: the `PUT` is sent from inside the **Judge0 worker**, in the
  `ensure` block of `perform` (the part that always runs at the end of the job),
  after the code has run. If our API is slow or down, that worker is stuck for
  up to `CALLBACKS_TIMEOUT` (5s) × `CALLBACKS_MAX_TRIES` (3) = 15s, when it
  should be judging. With 6 workers, one hiccup in our API during a contest
  would stall judging.
- Why not, part 2: only exceptions are retried. If our API replies with a 5xx
  error, Judge0 counts that as delivered, and the result is lost.
- Why not, part 3: callbacks are not signed (so we can't prove they came from
  Judge0), Judge0 must be able to reach our API over the network, and there are
  open reports of callbacks not firing at all
  ([#539](https://github.com/judge0/judge0/issues/539)).

**Option 3: poll `GET /submissions/batch?tokens=…`.** We ask Judge0 for the
results ourselves.

- This is fine in itself. The old CodeQuest's mistake was polling **inside the
  user's request**. That was the problem, not polling.

### The decision: one background poller

Polling was never the issue; polling **once per user request** was. So the
polling moves into **one single loop** that runs in a worker process. Here is
the flow from the brief:

```
Browser ──POST /submissions──► API ── create Submission { status: pending, tokens }
                                   ── POST Judge0 /submissions/batch (wait=false)
        ◄──── 202 { id } ──────────┘

Judge poller (worker process, one loop, ~every 500ms while work is pending)
   ── find pending submissions in Mongo, collect their Judge0 tokens
   ── GET Judge0 /submissions/batch?tokens=…
      (chunks of MAX_SUBMISSION_BATCH_SIZE; Judge0 returns 400 above it)
   ── for each finished test case: record the result
   ── all test cases done? decide the verdict once, emit events (XP, stats, streak)

Browser ──GET /submissions/:id (poll, later SSE)──► API   (reads Mongo, never Judge0)
```

In words:

1. The browser sends the code to our API with `POST /submissions`.
2. The API saves a Submission in Mongo with `status: pending` and the Judge0
   tokens (a token is Judge0's id for one test-case run). It sends the code to
   Judge0 with `wait=false`, so it doesn't wait.
3. The API immediately answers the browser with `202 { id }`.
4. Separately, the judge poller runs in the worker process, about every 500ms
   while there is pending work. Each time, it finds pending submissions in
   Mongo and collects their tokens.
5. It asks Judge0 for all those tokens in one `GET /submissions/batch` call.
   The tokens are sent in chunks of `MAX_SUBMISSION_BATCH_SIZE`, because
   Judge0 returns a 400 error if you send more than that.
6. For each finished test case, it records the result.
7. When all of a submission's test cases are done, it decides the verdict
   **once** and emits events (for XP, stats and the streak).
8. Meanwhile the browser checks `GET /submissions/:id` (by polling now, and
   later with SSE, Server-Sent Events, where the server pushes updates). That
   endpoint only reads Mongo and never talks to Judge0.

### Why this scales

- **The load on Judge0 depends on how often we poll, not on how many users are
  waiting.** One `GET` can cover tokens from many different users'
  submissions.
- **Judge0 workers only run code.** They never wait on our API.
- **Nothing gets lost.** A token stays pending in Mongo until the poller sees
  that it finished. If the worker crashes, the next run picks up where the last
  one stopped.
- **It works in development** even though nothing on the internet can reach the
  developer's machine.
- **Browser polling is cheap**, because it only reads our API and Mongo and
  never reaches Judge0.

**The cost is latency.** A result can arrive up to one poll interval later than
a callback would have delivered it. At 500ms, that delay is invisible next to
the time it takes to compile and run the code.

### The hard parts (where the learning is)

- **There must be exactly one poller.** If two worker instances were running,
  both loops would process the same tokens. Two ways to prevent this:
  - take a Redis lock with `SET key value NX PX …` (`NX` means "only set it if
    it doesn't exist yet" and `PX` sets an expiry in milliseconds), or
  - run the loop as a BullMQ repeatable job, which runs once per tick across
    all instances.
- **The verdict must be decided exactly once.** If the worker crashes after
  saving results but before deciding the verdict, the next tick will see the
  same submission again. To make the second attempt harmless, the "finish"
  update includes `status: 'pending'` in its filter. Once the first attempt has
  changed the status, a second attempt matches nothing and does nothing. The
  unique index on XP events catches anything that still slips through (the
  database refuses a duplicate XP event).
- **The interval adapts.** Poll quickly while submissions are pending, and slow
  down to every few seconds when there are none.
- **Stuck submissions get a time limit.** If a token is still pending after a
  limit (for example 2 minutes), mark the submission as an internal error
  instead of polling forever.
- **Playground runs never say "Accepted".** In the playground there is no
  `expected_output`, so Judge0's status 3 only means "the code ran and exited",
  not "the answer is correct". The old `Code-Playground-Plan.md` covers this.

### Where BullMQ still fits

- **Scheduled and retryable jobs:** the daily problem, emails, notifications,
  rating recalculation after a contest, AI generation, and possibly the judge
  poller itself.
- **Contest bursts in v2, but only if measured.** Judge0's queue has a size
  limit (`MAX_QUEUE_SIZE`, which was raised to 500 on the old server), and it
  returns 503 when full. It is also first come, first served, with no
  priorities. If a load test (with the tool k6) shows contest bursts reaching
  that limit, then a BullMQ queue with a rate limiter goes in front of Judge0.
  Submissions would then wait instead of failing, and contest submissions could
  go first. The rule is: **measure first, and build it only if it's needed.**

---

## Topic 6: features

### The original feature list

These were the features Akash wanted from the start:

- The problems page (it already exists in the old app).
- **Journey:** a structured learning path, for example Arrays I, then Binary
  Search, then Strings, and so on.
- Contests, a daily problem, XP and points, hints, and AI integration.
- **Paid features:** generate quizzes from existing problems or completely new
  ones, and private contests among friends or run by an organizer.
- Sign-in with Google OAuth 2.0 and other methods.
- A profile page with stats shown as charts.

### Features added during the discussion

The ones marked ⭐ are the strongest picks.

- ⭐ A spaced-repetition revisit queue, using SM-2 scheduling. (Spaced
  repetition means re-solving a problem after growing gaps of time so you
  remember it. SM-2 is a well-known algorithm for choosing those gaps.)
- ⭐ A streak heatmap, in the style of GitHub's contribution calendar.
- ⭐ Friends and a friend leaderboard.
- ⭐ AI review after an accepted solution (feedback on time and space
  complexity).
- ⭐ Notifications, such as contest reminders or "your streak ends in 3 hours".
- ⭐ Friend compare on the profile (your topic radar drawn over a friend's).
- Editorials and community solutions, unlocked only after you solve the
  problem.
- A code playground. A plan already exists at
  `../codequest/session-logs/plans/Code-Playground-Plan.md`.
- Virtual contests: replay a past contest against its original leaderboard.
- Badges.
- A public profile with a share image.
- A runtime percentile, like "beats 87%".
- A mock interview mode.
- A plagiarism check for contests.
- Admin analytics, such as the acceptance rate per problem and where users drop
  off in the journey.

### What each feature needs underneath

| Feature | What it needs |
|---|---|
| Journey | Track, Module and Problem models with many-to-many links; prerequisites stored as a graph; unlock rules (for example, finishing 70% of module A unlocks module B); progress per user |
| XP and levels | An append-only XP event log (events are only added, never edited); XP is awarded only once per first accepted solution, enforced by a unique index on user + source |
| Daily problem | A scheduled job, a way of picking that avoids recent repeats, and streak tracking |
| Hints | Tiered hints: first the concept, then the approach, then pseudocode. Each reveal costs XP. Hand-written first, AI later |
| Contests | Async judging, a leaderboard stored as a Redis sorted set (using `ZADD` to add scores and `ZREVRANGE` to read the top ones), a scoring rule, and live updates over SSE |
| Private contests and quizzes | Invite codes, an organizer role, AI-generated problems that must pass Judge0 checks, and limits per plan |
| Sign-in | OAuth 2.0 authorization code + PKCE + `state`, an `accounts` collection, and account linking by verified email |
| Paid tier | Entitlements, and payment webhooks handled idempotently (so if the payment provider sends the same notification twice, it only counts once) |

### The profile page charts

| Chart | What it shows | Where the data comes from |
|---|---|---|
| Learning-path graph | The journey as a map; nodes colored by how complete they are, locked ones greyed out | Tracks, modules, prerequisites, plus the user's progress |
| Topic radar | Strength in each topic: Arrays, Strings, Binary Search, DP, Graphs and so on | Solved problems grouped by topic |
| Contest rating line | Rating over time, with a marker for each contest | Contest results history |
| Solved breakdown | An Easy / Medium / Hard donut, with a count like "142 / 400" | Solved problems by difficulty |
| Activity heatmap | A GitHub-style calendar of daily activity | The daily summary table |
| XP over time | Total XP growing over time, with level-ups marked | The XP event log |
| Verdict and language mix | Rates of Accepted / Wrong / TLE (Time Limit Exceeded) / Runtime Error, and which languages were used | Submissions |
| Friend compare | Your topic radar drawn on top of a friend's | Two topic radars |
| Runtime percentile | "Beats 87%", shown on the problem page after an accepted solution | Runtimes per problem |

### Rules for the stats pipeline

- **Raw events are the source of truth.** Submissions, XP events and contest
  results are only ever added to, never changed.
- **`user_daily_stats`** is a summary table with columns like user, date,
  solved, submissions, xp and so on. It is updated whenever a verdict comes in.
  It powers the heatmap, the XP chart and streaks. Because it is only a
  summary, it can always be rebuilt by replaying the raw events.
- **Topics are a fixed list**, not free-form tags.
- **Contest results store the rating before and after** each contest, so the
  rating chart can be drawn later.
- **Each chart has its own endpoint**, so each one loads and is cached on its
  own.
- **A Redis rule of thumb:** ask "If Redis were wiped right now, would we lose
  something we can't rebuild?" If the answer is yes, that data must not live
  only in Redis.

---

## Topic 7: the XP economy (how points are calculated)

This is the most detailed part of the brief. The **design goal is to reward
consistent learning**: showing up regularly and re-solving problems on schedule
should matter as much as solving hard problems.

### Three rules that apply everywhere

1. **The streak multiplier applies to all problem XP**, both first solves and
   revisits.
2. **Flat bonuses are never multiplied**, and hints never reduce them.
3. **Hints only reduce problem XP.**

The formula for problem XP is:

```
problem XP = round(base × revisitShare × (1 − hintPenalty) × multiplier)
```

- `base` is the XP for the problem's difficulty (see the next table).
- `revisitShare` is the fraction you get on a revisit (for a first solve it is
  simply the full amount).
- `hintPenalty` is how much the hints you used take off.
- `multiplier` is your current streak multiplier.
- `round` rounds the result to a whole number.

### Problem XP by difficulty

| Difficulty | Base XP (first solve) | At the 2.0× cap |
|---|---|---|
| Easy | 30 | 60 |
| Medium | 75 (2.5× Easy) | 150 |
| Hard | 150 (5× Easy) | 300 |

Only the **first** accepted solve of a problem earns base XP. Submitting an
already-solved problem again earns nothing, unless it is a revisit that is due.

### The streak multiplier

- **What counts as a streak day:** a day (in your local time) on which you do at
  least one of these:
  - solve a new problem for the first time,
  - solve a revisit that is due,
  - solve today's daily problem.

  Re-submitting old solutions does not count.
- **How it grows:** day 1 is 1.0×. Each day in a row adds **+0.1×**, up to a
  **cap of 2.0×**, which you reach on day 11.
- **What happens when you miss days:** each missed day removes **one fifth of
  the extra you had when the streak broke**. This means anyone, at any level,
  is back to 1.0× after 5 missed days. Starting from the cap, it goes 2.0, then
  1.8, 1.6, 1.4, 1.2 and finally 1.0. (As another example, if you were at 1.6×,
  the extra is 0.6, so each missed day removes 0.12.)
- **Coming back:** you continue from the reduced value, and the +0.1× per day
  starts again on your next day in a row. The streak **day count** shown to the
  user resets to zero on a miss; only the multiplier fades gradually.
- **Storage:** the multiplier is stored as whole hundredths (a number from 100
  to 200), because the decay produces values like 1.24×.

### Flat bonuses

| Bonus | XP | Rule |
|---|---|---|
| First streak-day solve of the day | +10 | Once per local day. It is tied to a streak-day solve, so re-submitting old answers can't be used to farm it |
| Today's daily problem | +50 | Once per day, on top of its problem XP and the +10. It counts as a streak day. If the user has solved this problem before, solving it **counts as a revisit** (whether due or not): it earns revisit XP at the next step of the revisit ladder below, and the revisit schedule restarts from today |

### Revisits (only when they are due)

| Revisit | 1st | 2nd | 3rd | 4th and later |
|---|---|---|---|---|
| Share of base XP | 50% | 30% | 20% | 10% |

That share is then multiplied by your current streak multiplier and reduced by
any hint penalty.

An important detail: **"base" here means the difficulty base** (30, 75 or 150),
**not** the XP you actually earned on your first solve. Your first-solve XP
included that day's multiplier and hint penalty, and those shouldn't carry
forward to later revisits.

### Hints

| Hints revealed in this attempt | 1 | 2 | 3 |
|---|---|---|---|
| Problem XP reduced by | 15% | 35% | 60% |

Hints only cost XP **when there is XP to earn**, which means before the first
solve, or while a revisit is due. Looking at hints on a problem you've already
solved and that isn't due yet is free. Each revisit starts again at 0 hints.
The hint button shows "(−15% XP)" only when XP is actually at stake.

### A worked example

You are on streak day 12, so your multiplier is at the cap of 2.0×. Today's
daily problem is a medium you have never solved. You solve it using 1 hint,
and it's your first solve of the day.

- Problem XP: 75 × 0.85 × 2.0 = 127.5, which rounds to **128**.
- Plus 50 for the daily problem.
- Plus 10 for the first solve of the day.
- Total: **188 XP**.

### How much XP different users would earn

These estimates leave out revisits. Revisits add roughly 40 to 70% on top.

| User | Week 1 | Month 1 | Month 6 | Year 1 |
|---|---|---|---|---|
| Casual: 3 easy problems a week, never on consecutive days (so they stay at 1.0×) | 120 | about 520 | about 3,100 | about 6,200 |
| Regular: 1 easy + 1 medium a day, about 20 daily problems a month | about 1,275 | about 7,000 | about 45,000 | about 90,000 |
| Grinder: 3 easy + 1 medium + 1 hard a day, every daily problem | about 3,300 | about 19,000 | not estimated | not estimated |

The grinder earns about 2.7× what the regular user earns, which is inside the
target range of 2 to 4×. In practice the grinder runs out of new problems within
a month or two. After that, daily problems and revisits drive their XP, which
also fits the goal of "consistent learning".

### The level curve

**The chosen rule: the total XP needed to reach level n is 100 × n².** Turned
around, that gives `level = floor(√(xp / 100))` (`floor` means round down).

Why this curve:

- **Round numbers:** level 10 needs 10,000 XP, level 20 needs 40,000, and level
  30 needs 90,000.
- **Each level costs 200 XP more than the one before.** Going from level 0 to
  level 1 costs 100 XP, from level 9 to level 10 costs 1,900, and from level 19
  to level 20 costs 3,900.
- **It was calibrated with revisits included.** A regular user earns about
  7,000 XP in month 1 without revisits, and about 10 to 12 thousand with them,
  which lands at about level 10.

The other curves that were compared are also of the form "total XP = base ×
n^k". This table shows which level each example user would reach under each
curve (levels computed **without** revisit XP):

| Curve | Casual week 1 | Casual month 1 | Regular week 1 | Regular month 6 | Regular year 1 | Grinder month 1 |
|---|---|---|---|---|---|---|
| **k = 2, base 100 (chosen)** | **1** | **2** | **3** | **21** | **30** | **13** |
| k = 1.5, base 220 | 0 | 1 | 3 | 34 | 55 | 19 |
| k = 2, base 70 | 1 | 2 | 4 | 25 | 35 | 16 |
| k = 2.5, base 22 | 1 | 3 | 5 | 21 | 27 | 14 |

### Explaining an award to the user

Every solve or revisit event **stores the inputs of its formula**. That lets the
UI show a breakdown, like a receipt:

```
Binary Search (medium)            75
× streak day 12                × 2.0
× 1 hint                       × 0.85   (−15%)
= problem XP                     128
+ today's daily problem          +50
+ first solve today              +10
──────────────────────────────────────
                                 188 XP
```

---

## Topic 8: the release plan

The work is grouped into three versions, with a database migration phase in
between.

**v1, "Learn":** the core learning loop, running on MongoDB.

- Sign-in with email, Google and GitHub
- Problems and async judging
- The code playground
- The journey with prerequisites
- XP and levels
- Daily problem, streak and heatmap
- Hand-written hints and editorials
- The spaced-repetition revisit queue
- A public profile with the heatmap, the solved donut, the topic radar, the
  learning-path graph and the XP chart

**Phase 6, "Migration":**

- Move from MongoDB to PostgreSQL (Topic 4)

**v2, "Compete":**

- Friends
- Public contests with a live leaderboard, Elo-style rating and a rating chart
- Virtual contests
- Friend compare and runtime percentile
- Badges
- Notifications
- A load test, and a BullMQ buffer in front of Judge0 only if it turns out to be
  needed

**v3, "Pro":**

- Payments and entitlements (Razorpay)
- AI hints, and AI review after an accepted solution
- Private contests and quizzes with AI-generated problems (which must pass
  Judge0 checks)
- Mock interview mode
- Plagiarism check
- Admin analytics

---

## Topic 9: the timeline

Estimates are counted in **sessions**, where one session is about 2 to 3
focused hours. They are not calendar days.

| Phase | What gets built | Sessions | Running total |
|---|---|---|---|
| 0, Foundations | Monorepo, TypeScript, ESM, Docker (Mongo + Redis), `migrate-mongo`, CI, frontend shell | 10–12 | about 11 |
| 1, Auth | Email + verification, Google, GitHub, account linking, rate limits, **first deploy** | 14–16 | about 26 |
| 2, Judge | Problems, admin, async judging (worker + poller), problem page with Monaco (the code editor used inside VS Code), playground | 20–24 | about 48 |
| 3, Journey | Tracks and modules, prerequisites, unlock rules, learning-path graph | 8–10 | about 57 |
| 4, Gamification | XP events, levels, daily problem, streaks, hints, editorials, revisit queue | 12–14 | about 70 |
| 5, Profile | Stats endpoints, daily summary table, heatmap, radar, donut, XP chart | 8–10 | **about 79, which completes v1** |
| 6, Migration | MongoDB to PostgreSQL | 10–14 | about 91 |
| v2, Compete | Friends, contests, live leaderboard, rating, virtual contests, badges, notifications | 32–38 | about 126 |
| v3, Pro | Payments, AI hints and review, AI quizzes, mock interview, analytics | 35–42 | about 164 |

Each phase already includes about 15% extra time as a buffer for debugging and
detours. After each phase, the remaining estimates are rescaled using the
number of sessions that phase actually took.

---

## Topic 10: milestones and releases

Each milestone becomes a git tag and a GitHub release with release notes. The
tags are numbered `v0.1.0` for M1, `v0.2.0` for M2, and so on.

| Milestone | What it delivers |
|---|---|
| M1 | A live deployment, with sign-in by email, Google and GitHub |
| M2 | An online judge with async judging: a separate worker process polls a self-hosted Judge0 in batches |
| M3 | v1: the learning journey, gamification, and a public profile with charts |
| M3.5 | Running on PostgreSQL after an expand/contract migration (backfill, verification, cutover) |
| M4 | v2: contests with a real-time leaderboard (Redis sorted sets + SSE) and Elo rating |
| M5 | v3: payments and AI features |

**The ordering principle:** every phase adds a complete feature, all the way
from the database to the UI. The project never builds the whole backend first
and the whole frontend afterwards. That is why each milestone can be demoed on
its own.

---

## Related documents

The brief points to these documents for the details:

- **`02-architecture.md`** covers the monorepo layout, the collections and
  their indexes, the repository interfaces, the judging pipeline, the OAuth
  flow and the stats pipeline.
- **The decision records:**
  - `02_01-sessions-vs-jwt.md`
  - `02_02-javascript-to-typescript.md`
  - `02_03-monorepo-and-workspaces.md`
  - `02_04-keycloak-and-identity-providers.md`

---

## In short

- CodeQuest is being rebuilt from scratch as a TypeScript monorepo, in phases,
  with every big decision written down along with its alternatives.
- It starts on MongoDB but follows strict rules (repositories, shared zod types,
  opaque ids, migrations) so that the planned move to PostgreSQL between v1 and
  v2 stays cheap.
- Judging becomes async: the API answers right away with 202, and one
  background poller fetches results from Judge0 in batches. This avoids the old
  20-second request problem and the downsides of `wait=true` and callbacks.
- Stats are built from append-only event logs plus a rebuildable daily summary
  table, with one endpoint per chart.
- XP rewards consistency: a streak multiplier from 1.0× to 2.0×, flat bonuses,
  revisits at a shrinking share of base XP, hint penalties, and levels at
  100 × n² XP.
- The plan is about 79 sessions to v1 and about 164 to v3, with milestones M1
  to M5 each released as a git tag.
