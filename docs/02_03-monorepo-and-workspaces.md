# 02_03 · Monorepo, npm workspaces and Turborepo

_Discussion, 2026-09-25. An architecture decision record that expands
`02-architecture.md` §2.3._

**Decision:** one repository managed with **npm workspaces**
(`apps/api`, `apps/web`, `packages/shared`). **No Turborepo yet**; add it when
a measured trigger is hit (§5).

---

## 1. Was the old codequest a monorepo?

Loosely, yes: two projects in one git repo. But it had none of the benefits
that make a monorepo worth it. Evidence from `../codequest`:

- **The backend was the repo root, and the frontend sat inside it.** That's
  why `eslint.config.mjs:8` had to exclude it with
  `globalIgnores(['frontend/', …])`.
- **Two separate installs and two lockfiles:** `package-lock.json` and
  `frontend/package-lock.json`.
- **CI only covered the backend.** `.github/workflows/test.yml` runs
  `npm ci`, lint and test at the root. **The frontend was never linted, built
  or tested in CI**, so a change that broke the frontend build could merge
  with a green check.
- **No shared code.** The language list was copied by hand, with a warning
  comment in `src/utils/languages.js` to keep the two in sync.

So it was a monorepo **by location, not by tooling**: effectively two repos
that happened to share a `.git` folder.

---

## 2. Why use a monorepo

**What you gain**

- **One commit changes everything that must change together.** The shared
  schema, the API and the frontend change in one PR and are compile-checked
  together. The old `userinfo` / `userInfo` bug (commit `4865915`) would have
  been one PR that couldn't merge broken.
- **Share code without publishing it** to npm.
- **One install, one lockfile, one CI workflow, one release tag** per
  milestone.
- **One set of configs:** `tsconfig.base.json`, one ESLint config, one
  Prettier config.

**What it costs**

- The workspace setup, which is the fiddliest part of Phase 0.
- CI runs everything unless you filter it.
- Building a Docker image for one app needs the root lockfile plus the shared
  package, not just that app's folder.

**The alternative, separate repos (a "polyrepo"),** would mean publishing
`@codequest/shared` to a registry and bumping its version in each repo. That's
pure overhead for a solo project.

---

## 3. What npm workspaces does

```jsonc
// root package.json
{ "private": true, "workspaces": ["packages/*", "apps/*"] }

// apps/api/package.json
{ "name": "@codequest/api", "dependencies": { "@codequest/shared": "*" } }
```

It does four things:

1. **One install, one lockfile.** `npm install` at the root installs every
   workspace's dependencies.
2. **Linking.** It creates a symlink
   `node_modules/@codequest/shared → packages/shared`. So
   `import { LANGUAGE_IDS } from '@codequest/shared'` resolves to the local
   folder, and edits show up instantly with nothing to publish.
3. **Hoisting.** Dependencies used by several workspaces are installed once,
   in the root `node_modules`.
4. **Running scripts per workspace or across all of them:**
   - `npm run dev -w apps/api` runs one workspace's script.
   - `npm run test --workspaces --if-present` runs it in every workspace that
     has one.

### What it doesn't do

- **No dependency-aware order.** `npm run build --workspaces` runs in the
  listed order, not by what depends on what. That's why `packages/*` comes
  first above. TypeScript's `tsc -b` (project references) also builds in the
  right order.
- **No parallel runs.** To run the API and web dev servers together you need
  a small helper like `concurrently`.
- **No caching.** Every run redoes all the work.
- **Gotcha: phantom dependencies.** Because packages are hoisted to the root,
  `apps/web` can import a package that only `apps/api` declared. It works on
  your machine and breaks in an isolated Docker build. A lint rule can catch
  it (`import/no-extraneous-dependencies`).
- **No `workspace:*` version syntax** (pnpm and Yarn have it), so shared
  packages are declared with `"*"`.

---

## 4. What Turborepo adds

**Turborepo doesn't replace workspaces; it runs on top of them.** It adds
exactly what §3 lists as missing:

- **Dependency-aware order:** `"build": { "dependsOn": ["^build"] }` builds
  `shared` before `api` and `web` automatically.
- **Parallel runs.**
- **Caching:** it fingerprints each task's inputs, and unchanged tasks replay
  their previous output instantly. A remote cache can share this with CI.
- **Filtering:** it can run tests only in packages affected by a change.

---

## 5. Why not Turborepo yet

- **With 3 packages, builds and tests take seconds**, so caching saves almost
  nothing.
- **Build order is already covered** by the workspace order and `tsc -b`.
- **Learn it in the right order.** Wire up workspaces by hand first, so you
  know exactly what Turborepo automates. Starting with it means copying config
  you don't yet understand.
- **It's cheap to add later.** It's one dev dependency and a `turbo.json`; the
  existing scripts don't change. Waiting costs nothing.

**When to add it:**

- CI regularly takes more than about 5 minutes, or
- you catch yourself wanting to "only test what changed".

That's likely around v2, when there may be more packages (for example a
`packages/judge-client`). Adding it then also comes with a measured reason
("CI went from X to Y minutes"). Same "measure first" approach as the BullMQ
buffer in the brief.

### Alternatives worth knowing

- **pnpm workspaces:** faster, supports `workspace:*`, and its stricter
  `node_modules` layout prevents phantom dependencies entirely. The most
  likely upgrade from npm, possibly adopted together with Turborepo.
- **Nx:** heavier and more opinionated. Overkill here.

---

## 6. Takeaways

- **The old CI gap was a monorepo problem.** Because the frontend was nested
  inside the backend's package, the root `npm test` naturally meant "backend
  tests". With workspaces, `npm run test --workspaces` includes every package
  by default, so nothing can be silently left out of CI.
- **Tools come in layers:**
  - The package manager (npm) installs and links.
  - A task runner (Turborepo) orders and caches tasks.
  - TypeScript project references order the compiles.

  Knowing which layer solves which problem is what lets you judge "do I need
  Turborepo?" instead of adopting it because templates include it.
