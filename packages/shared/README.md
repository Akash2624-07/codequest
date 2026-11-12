# @codequest/shared

Code shared by every CodeQuest workspace. Today it holds the list of supported
languages; domain types and zod schemas used by both the API and the web app
will live here too.

## Exports

| Export | Kind | What it is |
|---|---|---|
| `LANGUAGE_IDS` | value | Each language's Judge0 `language_id`, declared `as const` |
| `Language` | type | `'cpp' \| 'c' \| 'java' \| 'python' \| 'javascript'`, derived from the keys of `LANGUAGE_IDS` |

```ts
import { LANGUAGE_IDS, type Language } from "@codequest/shared";
```

Import from the package root only. `exports` in `package.json` blocks deep
imports such as `@codequest/shared/src/languages.js`.

`exports` has two conditions, tried in order:

| Condition | File | Who asks for it |
|---|---|---|
| `development` | `./src/index.ts` | `tsx --conditions=development` (the api's `dev` script), and tsconfigs with `customConditions: ["development"]`; Vite adds it in dev (Day 10) |
| `default` | `./dist/index.js` | Plain `node`, e.g. `npm start` in `apps/api` |

So in development, edits to `src/` are picked up without a build. Anything
that runs plain `node` needs `dist/`: `tsc -b` in a dependent package builds
it first through project references. `tsc` itself also needs this package's
`.d.ts` built, even with the `development` condition, because project
references swap the source for its declaration output.

## Conventions

- **`interface` for object shapes written by hand; `type` for everything
  else:** unions, types derived from values (`keyof typeof`, `z.infer`) and
  function types. Interfaces are not used for declaration merging.
- **Derive types from values** rather than writing a list twice, as
  `Language` does.
- **`src/index.ts` is the public API.** Values are re-exported with
  `export { … }` and types with `export type { … }`, as
  `verbatimModuleSyntax` requires.
- Relative imports end in `.js` (`NodeNext` resolution).

## Scripts

| Command | What it does |
|---|---|
| `npm run build -w packages/shared` | Compiles `src/` to `dist/` (`.js`, `.d.ts`, source maps) |
| `npm run typecheck -w packages/shared` | Type-checks this package without writing output |
| `npm run build` / `npm run typecheck` (repo root) | The same, for every workspace |
