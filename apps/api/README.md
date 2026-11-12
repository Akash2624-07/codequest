# @codequest/api

The CodeQuest HTTP API: Express 5 on Node 24, ESM, strict TypeScript. It
listens on **port 7100**. Every route is under `/api`.

## Endpoints

| Route | Returns |
|---|---|
| `GET /api/health` | `{"status":"ok"}`: the process is up |
| `GET /api/languages` | `LANGUAGE_IDS` from `@codequest/shared`, e.g. `{"cpp":54,…}` |

## Files

| File | What it does |
|---|---|
| `src/app.ts` | `createApp()` builds the Express app. It never listens, so tests can import it |
| `src/main.ts` | Entry point: creates the app and listens on the port |

## Scripts

Run from the repo root with `-w apps/api`, or from this folder without it.

| Command | What it does |
|---|---|
| `npm run dev -w apps/api` | `tsx watch` with the `development` condition: runs `src/` directly, loads `@codequest/shared` from its source, restarts on changes in either |
| `npm run build -w apps/api` | `tsc -b`: builds `packages/shared` first (project reference), then `src/` → `dist/` |
| `npm start -w apps/api` | `node --enable-source-maps dist/main.js`: runs the build; stack traces point at `.ts` lines |
| `npm run typecheck -w apps/api` | Same as `build` (see below) |

## How `@codequest/shared` is wired

`shared`'s `exports` maps the `development` condition to `src/index.ts` and
`default` to `dist/index.js` (see `packages/shared/README.md`).

- **`dev`** passes `--conditions=development`, so no build is needed and edits
  to `shared/src` restart the server.
- **`start`** runs plain `node`, which uses `default`, so it needs `dist/` for
  both packages: run `build` first.
- **Type checking** goes through the project reference, which checks imports
  against `shared`'s built `.d.ts`. That is why `typecheck` is `tsc -b` rather
  than `tsc --noEmit` (fails on a fresh clone with TS6305), and not
  `tsc -b --noEmit` (TS6310: a referenced project may not disable emit).

## Gotchas

- **`tsx` forgives a missing `.js` on a relative import; `node` doesn't.**
  `import "./app"` runs under `dev`, but `start` fails with
  `ERR_MODULE_NOT_FOUND`. `typecheck` catches it first (TS2835).
- **Delete `dist/` and `tsconfig.tsbuildinfo` together.** With only `dist/`
  gone, `tsc -b` thinks the package is up to date, skips it, and reports
  TS6305.
