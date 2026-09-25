# CodeQuest Revamped — Project Brief

_Planning discussion, 2026-09-25. This records what was decided and why. The
architecture (`02-architecture.md`) and the decision records (`02_NN-*.md`)
build on it._

> The previous version lives at `../codequest`. It's a reference for what went
> wrong and what worked, not a template.

---

## 1. Goal

- **Rebuild CodeQuest from scratch in a more structured way:** a TypeScript
  monorepo with deliberate, documented architecture decisions.
- **Built in phases**, each ending in a deployable milestone. No fixed
  deadline.
- **Every significant decision gets a record** (`02_NN-*.md`) stating what
  was chosen, the alternatives, and when to revisit it.

---

## 2. What the old codequest taught us

### Keep

- zod validation at the edges. `validate()` replaces `req.body` with the parsed
  result, which strips unknown keys. That closed mass assignment and
  `problemCreator` spoofing without code in any controller.
- Central `AppError` plus one error handler. Express 5 forwards rejected async
  handlers by itself.
- Redis JWT blocklist on logout, with `EXAT` set to the token's own `exp` so
  entries expire exactly when the token would.
- Cursor pagination instead of `skip`/`limit`.
- Feature branches, PRs, conventional commits, and CI running lint and tests.
- Reference solutions verified through Judge0 before a problem is saved.
- Judge0 client hardening: wall-clock poll budget, 502/503/504 mapping,
  partial-batch rejection, test-case caps.

### Fix

| Old problem | What it caused | New design |
|---|---|---|
| Submit holds the HTTP request open while polling Judge0 (20s budget) | Only ~8 users can finish a submit within 20s on the 4-CPU box | Async judging (§5) |
| `password` required on User | OAuth users can't exist | Separate `accounts` collection; password optional |
| `problemSolved` array on the user doc | Grows forever; no history, so no XP, streaks or heatmap | Event log + daily summary table (§6) |
| Problems have no slug, order or topic; `tags` are free-form | No journey; the topic radar can't group | Fixed topic list + tracks and modules |
| Language list copied by hand in frontend and backend | The two drift apart | `packages/shared` |
| CommonJS | `vi.mock` doesn't work; `vi.spyOn` + `require.cache` workarounds | ESM + TypeScript |
| `post('findOneAndDelete')` hook for cascading deletes | `deleteOne` / `deleteMany` skip it and leave orphans | Deletes go through repositories; real foreign keys after Postgres |
| No rate limit or `helmet`; resend-verification leaks whether an account exists | Still open | Phase 1 |

---

## 3. Decisions

| Area | Decision | Why | Revisit when |
|---|---|---|---|
| Language | TypeScript, ESM | A restart is the cheapest time to switch; types are shared across API and web | — |
| Repo | Monorepo with npm workspaces: `apps/api`, `apps/web`, `packages/shared` | One source of truth for schemas, types and the language list. `apps/api` has two entry points: the HTTP server and a worker process (judge poller, background jobs) | — |
| Main DB (v1) | MongoDB with Mongoose | Already known and hosted; fewer new things at once | Planned migration before v2 (§4) |
| Later DB | PostgreSQL with Drizzle | Relational data, foreign keys, joins for stats, ledger and payments | After v1 |
| Redis | Background jobs, live leaderboard, rate limits, JWT blocklist, cache | Fast data that can be rebuilt if lost | — |
| Judging | Async: return 202; a background poller in the worker process batch-fetches results from Judge0 | Judge0 already queues. `wait=true` ties up Judge0's web process and `callback_url` ties up its workers; one poller ties up neither (§5) | Add a BullMQ buffer if v2 load tests fill Judge0's queue |
| Background jobs | BullMQ: daily problem, emails, summary updates, rating recalculation | Retries and schedules that survive restarts | — |
| Contest scoring | Rating: Elo-style first, maybe Glicko-2 later | Gives a meaningful rating curve; worth implementing yourself | — |
| Profile | Public by default; each chart can be hidden | Shareable; stats endpoints can be cached by URL | — |
| Sign-in | Email + verification, Google, GitHub. OAuth 2.0 authorization code + PKCE + `state` | — | — |
| Payments | Razorpay; entitlements, not an `isPaid` flag | Usual choice in India; supports UPI | v3 |
| AI | A provider interface: hosted API for live features, self-hosted ollama for batch jobs | ollama on the Oracle box runs on CPU, too slow for live hints | v3 |
| Charts | React Flow (learning path), Recharts (line, radar, donut), heatmap hand-built in SVG | The heatmap is a good first exercise in drawing with data | — |
| Time | Each user stores a timezone; each event gets its local date when it is written | Streak and heatmap day boundaries | — |

---

## 4. Database: MongoDB now, PostgreSQL later

### Why Postgres eventually

Almost everything this app stores is a relationship: users↔accounts,
tracks↔modules↔problems, module prerequisites, friendships,
contests↔problems↔participants, contest results, XP events, hint unlocks,
the revisit schedule, badges↔users, subscriptions↔entitlements. Only problems
really look like documents.

Two places where the difference shows:

**1. Keeping related data in sync.** The old `src/models/user.js`:

```js
userSchema.post('findOneAndDelete', async function (userInfo) {
  await mongoose.model('submissions').deleteMany({ userId: userInfo._id });
});
```

Mongoose query hooks fire only for the method they're attached to.
`User.deleteOne()` skips this hook and leaves orphaned submissions. In
Postgres the rule lives in the database itself, so no code path can get around
it:

```sql
user_id uuid REFERENCES users(id) ON DELETE CASCADE
```

**2. Stats queries.** The topic radar:

```sql
SELECT t.name, COUNT(DISTINCT s.problem_id) AS solved
FROM submissions s
JOIN problem_topics pt ON pt.problem_id = s.problem_id
JOIN topics t          ON t.id = pt.topic_id
WHERE s.user_id = $1 AND s.verdict = 'accepted'
GROUP BY t.name;
```

```js
db.submissions.aggregate([
  { $match: { userId, verdict: 'accepted' } },
  { $group: { _id: '$problemId' } },
  { $lookup: { from: 'problems', localField: '_id', foreignField: '_id', as: 'p' } },
  { $unwind: '$p' }, { $unwind: '$p.topics' },
  { $group: { _id: '$p.topics', solved: { $sum: 1 } } },
]);
```

Both work. MongoDB is capable; Postgres is built for this.

### Rules that keep the switch cheap

1. **Repository layer.** Services call `problemRepo.findBySlug()` and never
   import a Mongoose model. Switching databases means rewriting repositories,
   not services or controllers.
2. **Domain types come from `packages/shared` (zod), not Mongoose.** Nothing
   outside a repository sees `Document`, `ObjectId` or `populate`.
3. **Ids are opaque strings in the API.** Consider UUIDv7 as `_id`, so ids
   survive the move unchanged. Public URLs use slugs and usernames.
4. **Embed only value objects** such as test cases and per-language starter
   code. Anything with its own identity (modules, contests, friendships, XP
   events) gets its own collection with references, so each maps 1:1 to a
   table later.
5. **Migrations from day one with `migrate-mongo`.** Every schema or data
   change is a versioned script. "Database migrations" is then true from
   Phase 0, not only after the switch.
6. **Tests target the repository interfaces**, so the same tests later verify
   the Postgres implementation.

### When to switch

**Between v1 and v2, before contests.** Contest results and rating history are
join-heavy, and payment data (v3) should never have to be migrated while live.
Don't let the switch slide past this point.

### How to switch (Phase 6 outline)

1. Postgres schema and Drizzle migrations.
2. Postgres repositories behind the same interfaces. Run the repository tests
   against both databases.
3. Backfill script that copies Mongo → Postgres and can be re-run safely.
4. Dual-write: writes go to both databases, reads still come from Mongo.
5. Verify: record counts and per-user checks (solved count, XP total) match.
6. Switch reads to Postgres behind a flag, and watch.
7. Stop writing to Mongo, then remove it.

This is the **expand/contract** pattern. Record *why* the migration happened in
a decision record as it goes; the reasons matter as much as the steps.

---

## 5. Judging: Judge0's queue and ours

Judge0 already runs its own Redis-backed queue with workers. The old problem
wasn't a missing queue. **Our API held the user's HTTP request open** while
polling Judge0, up to a 20s budget, so "Judge0 is busy" turned into "your
request failed".

The fix is async on our side, not a second queue in front of Judge0's. The
user's request returns immediately. The remaining question is how *our
backend* learns each result from Judge0.

### Three ways to get results from Judge0

Checked against the Judge0 docs and source on 2026-09-25:

| Option | How it works | Why not |
|---|---|---|
| `wait=true` | Judge0 responds only once the code has run | It runs the code inside Judge0's **web process** (`perform_now`). The docs: *"We do not recommend the use of `wait=true` feature because it does not scale well."* |
| `callback_url` | Judge0 sends the result to our API with a `PUT` | The `PUT` runs inside the **Judge0 worker**, in the `ensure` block of `perform`, after the code has run. If our API is slow or down, that worker is held for up to `CALLBACKS_TIMEOUT` (5s) × `CALLBACKS_MAX_TRIES` (3) = 15s instead of judging. With 6 workers, one API hiccup during a contest stalls judging. Also: only exceptions are retried, so a 5xx reply counts as delivered and the result is lost. Callbacks are unsigned, Judge0 must be able to reach our API, and there are open reports of callbacks not firing ([#539](https://github.com/judge0/judge0/issues/539)). |
| Poll `GET /submissions/batch?tokens=…` | We ask | The old codequest polled **inside the user's request**. That was the problem, not polling itself |

### Decision: one background poller

Polling was fine; polling *once per user request* was the problem. Move it
into a single loop in a worker process:

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

Why this scales:

- **Load on Judge0 depends on how often we poll, not on how many users are
  waiting.** One `GET` covers tokens from many different users' submissions.
- **Judge0 workers only run code.** They never wait on us.
- **Nothing is lost.** A token stays pending in Mongo until the poller sees it
  finished. If the worker crashes, the next run picks up where it left off.
- **Works in dev** with no inbound route to the developer's machine.
- **Browser polling is cheap:** it reads our API and Mongo and never reaches
  Judge0.

The cost is latency: a result can arrive up to one poll interval later than a
callback would. At 500ms that's invisible next to compile and run time.

### The hard parts (this is where the learning is)

- **Exactly one poller.** With two worker instances, both loops would process
  the same tokens. Take a Redis lock (`SET key value NX PX …`), or run the loop
  as a BullMQ repeatable job, which runs once per tick across instances.
- **Deciding the verdict exactly once.** If the worker crashes between saving
  results and deciding the verdict, the next tick sees the same submission
  again. Include `status: 'pending'` in the finishing update's filter so a
  second attempt does nothing; the unique index on XP events catches the rest.
- **Adaptive interval.** Poll quickly while submissions are pending, and back
  off to a few seconds when there are none.
- **Stuck submissions.** If a token is still pending after a limit (say 2
  minutes), mark the submission as an internal error instead of polling
  forever.
- **Playground runs never say "Accepted".** With no `expected_output`, Judge0's
  status 3 means "ran and exited", not "correct". The old
  `Code-Playground-Plan.md` covers this.

### Where BullMQ still fits

- **Scheduled and retryable jobs:** daily problem, emails, notifications,
  rating recalculation after a contest, AI generation, and possibly the judge
  poller itself.
- **Contest bursts (v2), only if measured.** Judge0's queue is bounded
  (`MAX_QUEUE_SIZE`, raised to 500 on the old box) and returns 503 when full.
  It is also first come, first served, with no priorities. If a load test (k6)
  shows contest bursts reaching that limit, put a BullMQ queue with a rate
  limiter in front, so submissions wait instead of failing and contest
  submissions go first. Measure first; build it only if needed.

---

## 6. Features

### Your original list

- Problems page (exists in the old app)
- **Journey:** a structured path, Arrays I → Binary Search → Strings → …
- Contests, daily problem, XP and points, hints, AI integration
- **Paid:** generate quizzes from existing or completely new problems; private
  contests among friends or run by an organizer
- Sign-in with Google OAuth 2.0 and other methods
- Profile page with chart-based stats

### Added during the discussion (⭐ = strongest picks)

- ⭐ Spaced-repetition revisit queue (SM-2 scheduling)
- ⭐ Streak heatmap (GitHub-style)
- ⭐ Friends and a friend leaderboard
- ⭐ AI review after an accepted solution (complexity feedback)
- ⭐ Notifications: contest reminders, "your streak ends in 3 hours"
- ⭐ Friend compare on the profile (overlaid topic radars)
- Editorials and community solutions, unlocked after solving
- Code playground (plan already exists: `../codequest/session-logs/plans/Code-Playground-Plan.md`)
- Virtual contests (replay a past contest against its original leaderboard)
- Badges
- Public profile with a share image
- Runtime percentile ("beats 87%")
- Mock interview mode
- Plagiarism check for contests
- Admin analytics (acceptance rate per problem, journey drop-off)

### What each feature needs underneath

| Feature | What it needs |
|---|---|
| Journey | Track → Module → Problem models (many-to-many), prerequisites as a graph, unlock rules (e.g. 70% of A unlocks B), per-user progress |
| XP and levels | An append-only XP event log; award only once per first accepted solution (unique index on user + source) |
| Daily problem | A scheduled job, a pick that avoids recent repeats, streak tracking |
| Hints | Tiered hints (concept → approach → pseudocode); each reveal costs XP. Hand-written first, AI later |
| Contests | Async judging, Redis sorted-set leaderboard (`ZADD` / `ZREVRANGE`), a scoring rule, live updates over SSE |
| Private contests and quizzes | Invite codes, an organizer role, AI-generated problems that must pass Judge0 checks, plan limits |
| Sign-in | OAuth 2.0 authorization code + PKCE + `state`, an `accounts` collection, account linking by verified email |
| Paid tier | Entitlements, payment webhooks handled idempotently |

### Profile page charts

| Chart | What it shows | Data source |
|---|---|---|
| Learning-path graph | The journey as a map; nodes colored by completion, locked ones greyed out | Tracks, modules, prerequisites + user progress |
| Topic radar | Strength per topic: Arrays, Strings, Binary Search, DP, Graphs… | Solved problems grouped by topic |
| Contest rating line | Rating over time, a marker per contest | Contest results history |
| Solved breakdown | Easy / Medium / Hard donut, "142 / 400" | Solved problems by difficulty |
| Activity heatmap | GitHub-style daily activity calendar | Daily summary table |
| XP over time | Cumulative XP with level-ups marked | XP event log |
| Verdict and language mix | Accepted / Wrong / TLE / Runtime Error rates; languages used | Submissions |
| Friend compare | Your topic radar overlaid on a friend's | Two topic radars |
| Runtime percentile | "Beats 87%", on the problem page after an accepted solution | Runtimes per problem |

### Stats pipeline rules

- **Raw events are the source of truth.** Submissions, XP events and contest
  results are only ever appended.
- **`user_daily_stats`** (user, date, solved, submissions, xp…) is a summary
  updated when a verdict lands. It powers the heatmap, the XP chart and
  streaks, and it can always be rebuilt by replaying the events.
- **Topics are a fixed list**, not free-form tags.
- **Contest results store rating before and after**, so the rating chart can
  be drawn later.
- **One endpoint per chart**, so each loads and caches on its own.
- **Redis rule of thumb:** "If Redis were wiped right now, would we lose
  something we can't rebuild?" If yes, it doesn't belong only in Redis.

### XP economy

**Design goal: reward consistent learning.** Showing up regularly and
re-solving on schedule matter as much as difficulty.

#### Three rules that hold everywhere

1. **The streak multiplier applies to all problem XP** (first solves and
   revisits).
2. **Flat bonuses are never multiplied** and never reduced by hints.
3. **Hints reduce problem XP only.**

```
problem XP = round(base × revisitShare × (1 − hintPenalty) × multiplier)
```

#### Problem XP

| Difficulty | Base (first solve) | At the 2.0× cap |
|---|---|---|
| Easy | 30 | 60 |
| Medium | 75 (2.5×) | 150 |
| Hard | 150 (5×) | 300 |

Only a **first** accepted solve earns base XP. Re-submitting an already-solved
problem earns nothing unless it's a due revisit.

#### Streak multiplier

- **A streak day** is a local day with at least one of: a first accepted solve
  of a new problem, a due revisit solved, or today's daily problem solved.
  Re-submitting old solutions doesn't count.
- **Day 1 = 1.0×.** Each consecutive streak day adds **+0.1×**, up to a
  **2.0× cap**, reached on day 11.
- **Missing days:** each missed day removes **1/5 of the extra you had when the
  streak broke**, so anyone at any stage is back to 1.0× after 5 missed days.
  From the cap: 2.0 → 1.8 → 1.6 → 1.4 → 1.2 → 1.0.
- **Coming back:** continue from the reduced value; +0.1× resumes
  on the next consecutive day. The displayed streak *day count* resets on a
  miss; only the multiplier decays gradually.
- Stored as whole hundredths (100–200), because decay produces values like
  1.24×.

#### Flat bonuses

| Bonus | XP | Rule |
|---|---|---|
| First streak-day solve of the day | +10 | Once per local day. Tied to a streak-day solve so re-submitting old answers can't farm it |
| Today's daily problem | +50 | Once per day, on top of its problem XP and the +10. Counts as a streak day. If the user solved it before, solving it **counts as a revisit** (due or not): revisit XP at the next step of the ladder below, and the revisit schedule restarts from today |

#### Revisits (only when due)

| Revisit | 1st | 2nd | 3rd | 4th and later |
|---|---|---|---|---|
| Share of base | 50% | 30% | 20% | 10% |

× the current multiplier, − any hint penalty. **Base** here means the
difficulty base (30 / 75 / 150), not the XP earned at the first solve. That
first-solve XP included the multiplier and hint penalty of that day, which
shouldn't carry forward.

#### Hints

| Hints revealed this attempt | 1 | 2 | 3 |
|---|---|---|---|
| Problem XP reduced by | 15% | 35% | 60% |

Hints only cost XP when there's XP to earn: before the first solve, or while
a revisit is due. Browsing hints on a solved, not-yet-due problem is free, and
each revisit starts at 0 hints. The hint button shows "(−15% XP)" only when
XP is at stake.

#### Worked example

Streak day 12 (2.0×). Today's daily problem is a new medium, solved with 1
hint, and it's the first solve of the day:
75 × 0.85 × 2.0 = 127.5 → **128** + 50 (daily problem) + 10 (first of day) =
**188 XP**.

#### XP per example user (no revisits; they add roughly 40–70%)

| User | Week 1 | Month 1 | Month 6 | Year 1 |
|---|---|---|---|---|
| Casual: 3 easy/week, never consecutive (stays at 1.0×) | 120 | ~520 | ~3,100 | ~6,200 |
| Regular: 1 easy + 1 medium/day, ~20 dailies/month | ~1,275 | ~7,000 | ~45,000 | ~90,000 |
| Grinder: 3 easy + medium + hard/day, every daily | ~3,300 | ~19,000 | — | — |

Grinder vs regular: ~2.7×, inside the 2–4× target. In practice the grinder
runs out of new problems within a month or two, after which dailies and
revisits drive their XP. That also fits "consistent learning".

#### Level curve

**Chosen: total XP to reach level n = 100 × n²**, so
`level = floor(√(xp / 100))`.

- **Round numbers:** level 10 = 10,000 XP, level 20 = 40,000, level 30 =
  90,000.
- **Each level costs 200 XP more than the one before:** 0→1 costs 100, 9→10
  costs 1,900, 19→20 costs 3,900.
- **Calibrated with revisits included:** a regular user earns ~7,000 XP in
  month 1 without revisits and ~10–12k with them, which lands at about level
  10.

| Curve | Casual wk 1 | Casual mo 1 | Regular wk 1 | Regular mo 6 | Regular yr 1 | Grinder mo 1 |
|---|---|---|---|---|---|---|
| **k = 2, base 100 (chosen)** | **1** | **2** | **3** | **21** | **30** | **13** |
| k = 1.5, base 220 | 0 | 1 | 3 | 34 | 55 | 19 |
| k = 2, base 70 | 1 | 2 | 4 | 25 | 35 | 16 |
| k = 2.5, base 22 | 1 | 3 | 5 | 21 | 27 | 14 |

(Levels computed without revisit XP.)

#### Explaining an award

Every solve or revisit event stores the inputs of its formula, so the UI can
show a breakdown like a receipt:

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

## 7. Release plan

**v1 · Learn** (the core learning loop, on MongoDB)
- Sign in with email, Google and GitHub
- Problems and async judging
- Code playground
- Journey with prerequisites
- XP and levels
- Daily problem, streak and heatmap
- Hand-written hints and editorials
- Spaced-repetition revisit queue
- Public profile: heatmap, solved donut, topic radar, learning-path graph, XP chart

**Phase 6 · Migration**
- MongoDB → PostgreSQL (§4)

**v2 · Compete**
- Friends
- Public contests: live leaderboard, Elo-style rating, rating chart
- Virtual contests
- Friend compare, runtime percentile
- Badges
- Notifications
- Load test; add a BullMQ buffer in front of Judge0 only if needed

**v3 · Pro**
- Payments and entitlements (Razorpay)
- AI hints and AI review after an accepted solution
- Private contests and quizzes with AI-generated problems (must pass Judge0 checks)
- Mock interview mode
- Plagiarism check
- Admin analytics

---

## 8. Timeline

Estimates are in **sessions** of about 2–3 focused hours, not calendar days.

| Phase | What gets built | Sessions | Running total |
|---|---|---|---|
| 0 · Foundations | Monorepo, TypeScript, ESM, Docker (Mongo + Redis), `migrate-mongo`, CI, frontend shell | 10–12 | ~11 |
| 1 · Auth | Email + verification, Google, GitHub, account linking, rate limits, **first deploy** | 14–16 | ~26 |
| 2 · Judge | Problems, admin, async judging (worker + poller), problem page with Monaco, playground | 20–24 | ~48 |
| 3 · Journey | Tracks and modules, prerequisites, unlock rules, learning-path graph | 8–10 | ~57 |
| 4 · Gamification | XP events, levels, daily problem, streaks, hints, editorials, revisit queue | 12–14 | ~70 |
| 5 · Profile | Stats endpoints, daily summary table, heatmap, radar, donut, XP chart | 8–10 | **~79 = v1** |
| 6 · Migration | MongoDB → PostgreSQL | 10–14 | ~91 |
| v2 · Compete | Friends, contests, live leaderboard, rating, virtual contests, badges, notifications | 32–38 | ~126 |
| v3 · Pro | Payments, AI hints and review, AI quizzes, mock interview, analytics | 35–42 | ~164 |

Each phase includes about 15% buffer for debugging and detours. Estimates are
rescaled after each phase using the actual session count.

---

## 9. Milestones and releases

Each milestone is a git tag and a GitHub release (`v0.1.0` = M1, `v0.2.0` = M2,
…) with release notes.

| Milestone | What it delivers |
|---|---|
| M1 | A live deployment; sign-in with email, Google and GitHub |
| M2 | An online judge with async judging: a separate worker process batch-polls self-hosted Judge0 |
| M3 | v1: learning journey, gamification, public profile with charts |
| M3.5 | Running on PostgreSQL after an expand/contract migration (backfill, verification, cutover) |
| M4 | v2: contests with a real-time leaderboard (Redis sorted sets + SSE) and Elo rating |
| M5 | v3: payments and AI features |

**Ordering principle:** every phase adds a complete feature from database to
UI. We never build the whole backend and then the whole frontend, which is
why each milestone can be demoed on its own.

---

## 10. Related documents

- `02-architecture.md`: monorepo layout, collections and indexes, repository
  interfaces, the judging pipeline, the OAuth flow, the stats pipeline.
- Decision records:
  - `02_01-sessions-vs-jwt.md`
  - `02_02-javascript-to-typescript.md`
  - `02_03-monorepo-and-workspaces.md`
  - `02_04-keycloak-and-identity-providers.md`
