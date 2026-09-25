# 02_02 · JavaScript → TypeScript

_Discussion, 2026-09-25. An architecture decision record that expands
`02-architecture.md` §2.2._

**Decision:** CodeQuest is written in TypeScript with `strict: true` from the
first commit. zod checks data at every boundary; TypeScript checks the code
after that.

---

## 1. Why switch at all?

TypeScript isn't required. Plenty of production apps run on JavaScript. It's
a choice, and for this project it pays off for three reasons:

1. **The monorepo needs one shared contract.** The API, the worker and the web
   app all import `packages/shared`. TypeScript turns that package into a
   contract: change a response shape in one place and every consumer that
   disagrees fails to compile.
2. **The old commit history is full of bugs it catches** (§2).
3. **Industry default:** most Node and React codebases now use TypeScript, so
   tooling and library types treat it as first-class.

---

## 2. Old bugs TypeScript would have caught before running

All from `../codequest`.

| Commit | The bug | What TypeScript does |
|---|---|---|
| `4865915` | Server sent `userinfo`, frontend read `userInfo`, so login showed "Invalid response" | With a shared `LoginResponse` type, `{ userinfo: … }` doesn't compile |
| `83c29ff` | Frontend read `action.payload?.message`, but the payload was a string | `.message` on a `string` is a compile error |
| `91cc60c` | An `ObjectId` was passed to Redis where a string was needed | The Redis client's types accept strings and Buffers, not `ObjectId` |
| `d257265` | Wrong path (`models/users`), and `module.exports = { problemRouter }` exported an object instead of the router | "Cannot find module", and `app.use` rejects a plain object |
| `submissionController.js:145` | `results[index].stdout` assumed Judge0 returned one result per test case (the partial-batch bug) | `noUncheckedIndexedAccess` types it as `Result \| undefined` |

The old logout code has one more:

```ts
const payload = jwt.decode(token);   // type: string | JwtPayload | null
await redis.set(`token:${token}`, 'Blocked', { EXAT: payload.exp });
//                                                  ~~~~~~~ 'payload' is possibly 'null'.
```

It didn't crash only because `userMiddleware` ran first, and **TypeScript
can't know that**. That pushes toward a better design: the middleware
attaches the verified session to `req`, and nothing decodes the token a
second time.

**One old bug TypeScript would *not* have caught:** `708cffa`, where `age`
arrived from the form as the string `"18"`. That's runtime data, which
TypeScript never sees. See §3.

---

## 3. TypeScript checks your code, not your data

Types are erased when the code runs. Everything that enters from outside is
unknown at runtime, whatever its type annotation says:

- request bodies
- Judge0 responses
- `process.env`
- database reads
- OAuth profiles

So the pattern is **parse at the boundary, trust inside**:

- **zod** checks data at every entry point.
- **TypeScript** checks everything after that.

```ts
const body = registerSchema.parse(req.body);   // runtime check: unknown → RegisterInput
createUser(body);                              // compile-time check from here on
```

zod schemas produce the TypeScript types (`z.infer`), so one definition
covers both checks.

---

## 4. What to expect day to day

- **Errors show up in the editor before anything runs.** You also get
  autocomplete on your own domain objects and safe renames across the repo.
- **Gotcha: `tsx` and Vite don't type-check.** They strip the types and run
  the code anyway. Only `tsc --noEmit` (`npm run typecheck`) checks types.
  Rely on the editor while coding; CI blocks merges that fail.
- **Slower for the first week or two, faster afterwards**, once types start
  doing the remembering.
- **Library types:** zod, Mongoose, BullMQ and Vitest ship their own. Express
  and cookie-parser need `@types/…` packages.
- **Common frustrations:**
  - Long error messages. Read the *last* line first.
  - Mongoose's complex types.
  - The temptation to silence errors with `any` or `as`.
- **House rules:**
  - Lint bans `any`.
  - `unknown` for untrusted values.
  - Every `as` needs a comment explaining why.
- **One-time setups:** typing `req.user` on Express (a small `.d.ts` file
  using declaration merging), and the `tsconfig` flags (§6).

---

## 5. What to learn, and when

### Tier 1: Phase 0

The TypeScript Handbook chapters *The Basics*, *Everyday Types* and
*Narrowing* cover all of it.

- Annotations vs inference: annotate function parameters, let TypeScript infer
  the rest.
- `type` vs `interface`: pick one for object shapes and be consistent.
- Union and literal types: `type Difficulty = 'easy' | 'medium' | 'hard'`.
- `null` and `undefined` under `strict`, and **narrowing**
  (`if (!user) throw …`, after which `user` is non-null).
- Function types and `async` → `Promise<T>`.
- `unknown` vs `any`.
- `import type`, and the `.js` extension on relative imports (see
  `02-architecture.md` §2.1).

### Tier 2: Phases 1–2, learned when a feature needs it

- **Generics:** `Page<T>` for cursor-paginated responses; repository
  interfaces.
- **Discriminated unions** for test results and verdicts, with `switch`
  statements the compiler checks for missing cases.
- **Utility types:** `Record<Language, string>` for starter code; `Pick`,
  `Omit`, `Partial`.
- **Deriving types from values.** This replaces the old "single source of
  truth" comment in `languages.js` with something the compiler enforces:
  ```ts
  export const LANGUAGE_IDS = { cpp: 54, c: 50, java: 62, python: 71, javascript: 63 } as const;
  export type Language = keyof typeof LANGUAGE_IDS;   // 'cpp' | 'c' | 'java' | 'python' | 'javascript'
  ```
- `z.infer`, `satisfies`, typing Mongoose with `.lean()`, and declaration
  merging for Express.

### Tier 3: later, optional

- Type guards (`x is T`).
- **Branded ids.** Every id is a UUID string, so `finalize(problemId, userId)`
  with the arguments swapped still compiles. Brands fix that:
  ```ts
  type UserId = string & { readonly __brand: 'UserId' };
  ```
- Mapped and conditional types: mostly for *reading* library types, rarely
  for writing your own.

### Skip

`enum` (use unions), `namespace`, decorators, and class-heavy patterns. The
`erasableSyntaxOnly` flag enforces this and keeps the code compatible with
Node's built-in type stripping.

### Learning order

No separate study phase. Tier 1 is picked up through the first real files
(`config/env.ts`, `languages.ts`, `AppError.ts`); Tier 2 when a feature first
needs it.

---

## 6. `tsconfig` flags this project uses

| Flag | Why |
|---|---|
| `strict: true` | Turns on null checks and the other strict checks. Turning it on later means fixing hundreds of errors at once |
| `noUncheckedIndexedAccess` | `arr[i]` is `T \| undefined`. Would have caught the partial-batch bug |
| `module` / `moduleResolution: "NodeNext"` | Emits ESM that Node runs as-is; enforces `.js` extensions on relative imports |
| `erasableSyntaxOnly` | Bans `enum`, `namespace` and parameter properties |
| `verbatimModuleSyntax` | Makes type-only imports explicit (`import type`), so they're removed from the output predictably |

---

## 7. Takeaways

- **The bugs TypeScript catches in the old history are all mistakes where two
  pieces of code meet:** response shapes, import paths, wrong argument types.
  Bugs inside one function are usually caught by tests; bugs between modules
  are what types catch. The benefit grows with a monorepo, which has more
  such meeting points.
- **TypeScript can improve design, not just catch mistakes.** When the
  compiler can't see a guarantee you're relying on ("middleware ran first"),
  the fix is usually to make the guarantee visible by passing the verified
  value along, rather than silencing the error.
- **Types don't validate data.** zod at the boundary, TypeScript inside.
