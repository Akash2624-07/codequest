# 02_03 · Monorepo, npm workspaces and Turborepo

_A discussion from 2026-09-25. It is an architecture decision
record (a short document that writes down one design decision and the reasons
for it), and it goes into more detail on section 2.3 of `02-architecture.md`._

## What this is about, in one paragraph

A monorepo is a single git repository that holds several projects (packages)
side by side. This document explains how CodeQuest is organised as one: what
went wrong with the old project's layout, what you gain and lose with a
monorepo, what npm's built-in "workspaces" feature does and doesn't do, and
what an extra tool called Turborepo would add. It ends with the decision not
to use Turborepo yet, and the clear signs that will tell you when it's time.

**The decision in one sentence:** CodeQuest is one repository managed with
**npm workspaces**, with three packages (`apps/api`, `apps/web` and
`packages/shared`). **There is no Turborepo yet.** It gets added only when a
measured trigger is hit (Topic 5).

---

## Topic 1: was the old codequest a monorepo?

Loosely, yes, because it had two projects in one git repo. But it had none of
the benefits that make a monorepo worth having. The evidence, from the old
project in `../codequest`:

- **The backend was the root of the repo, and the frontend sat inside it.**
  That is why the ESLint config had to tell the linter to skip the frontend
  folder, at `eslint.config.mjs:8`, with
  `globalIgnores(['frontend/', …])`.
- **There were two separate installs and two lockfiles:**
  `package-lock.json` and `frontend/package-lock.json`.
- **CI only covered the backend.** The workflow file
  `.github/workflows/test.yml` runs `npm ci` (a clean install), lint and test,
  all at the root. **The frontend was never linted, built or tested in CI.**
  So a change that broke the frontend build could still be merged with a green
  check mark.
- **No code was shared.** The list of languages was copied by hand into both
  projects, with a warning comment in `src/utils/languages.js` reminding you
  to keep the two copies in sync.

So it was a monorepo **by location, not by tooling**. In practice it was two
separate repos that just happened to share one `.git` folder.

---

## Topic 2: why use a monorepo

### What you gain

- **One commit can change everything that must change together.** The shared
  schema, the API and the frontend can all change in one PR (pull request),
  and they are type-checked together. The old `userinfo` / `userInfo` bug
  (commit `4865915`, where the server and frontend used different spellings of
  a field name) would have been one PR that couldn't be merged while broken.
- **You can share code without publishing it** to npm.
- **One install, one lockfile, one CI workflow, and one release tag** for each
  milestone.
- **One set of configs:** one `tsconfig.base.json`, one ESLint config and one
  Prettier config for the whole repo.

### What it costs

- Setting up the workspaces, which is the fiddliest part of Phase 0.
- CI runs everything on every change, unless you add filtering.
- Building a Docker image for one app needs more than that app's folder. It
  also needs the root lockfile and the shared package.

### The alternative: separate repos

The other option is one repo per project, called a "polyrepo". Then
`@codequest/shared` would have to be published to a registry (a package
server like npm), and every other repo would have to bump its version number
each time it changed. For a project with one developer, that is pure overhead.

---

## Topic 3: what npm workspaces does

Workspaces are set up with two kinds of `package.json` file:

```jsonc
// root package.json
{ "private": true, "workspaces": ["packages/*", "apps/*"] }

// apps/api/package.json
{ "name": "@codequest/api", "dependencies": { "@codequest/shared": "*" } }
```

- The **root** `package.json` lists the folders that hold packages.
- Each **package** has its own `package.json`. Here the API says it depends on
  `@codequest/shared`. The `"*"` means "any version", which in practice means
  "the local copy".

With that in place, npm workspaces does four things:

1. **One install, one lockfile.** Running `npm install` at the root installs
   the dependencies of every workspace at once.
2. **Linking.** npm creates a symlink (a shortcut) at
   `node_modules/@codequest/shared` that points to the `packages/shared`
   folder. So when code writes
   `import { LANGUAGE_IDS } from '@codequest/shared'`, it gets the local
   folder. Your edits show up instantly, and there is nothing to publish.
3. **Hoisting.** If several workspaces use the same dependency, it is
   installed only once, in the `node_modules` folder at the root. ("Hoisting"
   means lifting it up to the top level.)
4. **Running scripts in one workspace or in all of them:**
   - `npm run dev -w apps/api` runs the `dev` script of one workspace only.
   - `npm run test --workspaces --if-present` runs the `test` script in every
     workspace that has one. `--if-present` skips workspaces without that
     script instead of failing.

### What it doesn't do

- **It doesn't work out the right order.** `npm run build --workspaces` runs
  the builds in the order the folders are listed, not based on which package
  depends on which. That's why `packages/*` is listed first in the root
  `package.json` above: the shared package must be built before the apps that
  use it. TypeScript's `tsc -b` (build mode, using "project references") also
  builds packages in the right order.
- **It doesn't run things in parallel.** To run the API and web dev servers at
  the same time, you need a small helper tool such as `concurrently`.
- **It doesn't cache anything.** Every run redoes all the work from scratch.
- **Gotcha: phantom dependencies.** Because packages are hoisted to the root,
  `apps/web` can import a package that only `apps/api` listed as a
  dependency. It works on your machine, because the package happens to be in
  the root `node_modules`. Then it breaks in an isolated Docker build, where
  only the web app's own dependencies are installed. A lint rule can catch
  this: `import/no-extraneous-dependencies`.
- **It has no `workspace:*` version syntax.** Other package managers (pnpm
  and Yarn) have a special `workspace:*` version that means "always use the
  local package". npm doesn't, so shared packages are declared with `"*"`
  instead.

---

## Topic 4: what Turborepo adds

**Turborepo doesn't replace workspaces. It runs on top of them.** It adds
exactly the things Topic 3 lists as missing:

- **Dependency-aware order.** A setting like
  `"build": { "dependsOn": ["^build"] }` means "before building a package,
  first build the packages it depends on". So `shared` is built before `api`
  and `web` automatically.
- **Parallel runs.** Tasks that don't depend on each other run at the same
  time.
- **Caching.** Turborepo takes a fingerprint of each task's inputs (its
  files and settings). If nothing changed, it replays the previous output
  instantly instead of running the task again. A remote cache can share these
  results with CI.
- **Filtering.** It can run tests only in the packages affected by a change.

---

## Topic 5: why not Turborepo yet

- **With 3 packages, builds and tests take seconds**, so caching would save
  almost nothing.
- **Build order is already handled** by the workspace order and by `tsc -b`.
- **Learn things in the right order.** Set up workspaces by hand first, so you
  know exactly what Turborepo is automating. If you start with it, you end up
  copying config you don't understand yet.
- **It's cheap to add later.** It's one dev dependency plus a `turbo.json`
  file, and the existing scripts don't change. Waiting costs nothing.

### When to add it

Add Turborepo when one of these happens:

- CI regularly takes more than about 5 minutes, or
- you catch yourself wanting to "only test what changed".

That will probably be around v2, when there may be more packages (for
example a `packages/judge-client`). Adding it at that point also gives you a
measured reason, such as "CI went from X to Y minutes". This is the same
"measure first" approach as the BullMQ buffer in the brief.

### Alternatives worth knowing

- **pnpm workspaces.** pnpm is another package manager. It is faster, supports
  `workspace:*`, and its stricter `node_modules` layout makes phantom
  dependencies impossible. It is the most likely upgrade from npm, possibly
  adopted at the same time as Turborepo.
- **Nx.** Another monorepo tool, heavier and more opinionated (it decides more
  things for you). Overkill for this project.

---

## Topic 6: the main lessons

- **The old CI gap was really a monorepo problem.** Because the frontend was
  nested inside the backend's package, running `npm test` at the root
  naturally meant "the backend tests" only. With workspaces,
  `npm run test --workspaces` includes every package by default, so nothing
  can be quietly left out of CI.
- **Tools come in layers, and each layer solves a different problem:**
  - The package manager (npm) installs and links packages.
  - A task runner (Turborepo) puts tasks in order and caches them.
  - TypeScript project references put the compiles in the right order.

  Knowing which layer solves which problem lets you answer "do I need
  Turborepo?" yourself, instead of adopting it just because project templates
  include it.

---

## In short

- CodeQuest is one repo with three packages (`apps/api`, `apps/web`,
  `packages/shared`), managed with npm workspaces.
- The old project was a monorepo only by location: two lockfiles, no shared
  code, and a frontend that CI never checked.
- Workspaces give one install, one lockfile, local linking and hoisting, but
  no build ordering, no parallel runs and no caching. Watch out for phantom
  dependencies.
- Turborepo adds ordering, parallel runs, caching and filtering on top of
  workspaces, but isn't worth it yet with 3 small packages.
- Add Turborepo when CI regularly takes more than about 5 minutes, or when you
  want to "only test what changed". pnpm is the likely upgrade from npm.
