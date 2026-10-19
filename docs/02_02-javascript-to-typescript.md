# 02_02 · JavaScript → TypeScript

_A discussion from 2026-09-25. It is an architecture decision
record (a short document that writes down one design decision and the reasons
for it), and it goes into more detail on section 2.2 of `02-architecture.md`._

## What this is about, in one paragraph

This document explains why CodeQuest is written in TypeScript instead of plain
JavaScript. The short answer: the project is a monorepo where several apps
share one package, and TypeScript makes sure they all agree on the shape of
the data they pass around. The document also shows real bugs from the old
project that TypeScript would have caught, explains the one big thing
TypeScript can't do (check data coming in from outside), and lists what to
learn, in what order, and which settings the project uses.

**The decision in one sentence:** CodeQuest is written in TypeScript with
`strict: true` turned on from the very first commit. A library called zod
checks data at every "boundary" (every place where data enters the program
from outside), and TypeScript checks the code after that point.

---

## Topic 1: why switch at all?

TypeScript isn't required. Plenty of real production apps run on plain
JavaScript. Using it is a choice, and for this project the choice pays off for
three reasons.

1. **The monorepo needs one shared contract.** The API, the worker and the web
   app all import code from `packages/shared`. TypeScript turns that package
   into a contract (an agreement every side must follow). If you change the
   shape of a response in one place, every piece of code that still expects
   the old shape fails to compile, so you find out immediately.
2. **The old project's commit history is full of bugs TypeScript would have
   caught.** Topic 2 lists them.
3. **It is the industry default.** Most Node and React codebases now use
   TypeScript, so tools and libraries treat it as a first-class citizen. For
   example, libraries ship type information and editors support it well.

---

## Topic 2: old bugs TypeScript would have caught before the code ran

All of these come from the old project in the `../codequest` folder. The
first column says where each bug lives in the old history: a commit id, or in
one case a file and line number.

| Commit | The bug | What TypeScript would have done |
|---|---|---|
| `4865915` | The server sent a field called `userinfo`, but the frontend read `userInfo` (capital I). Login showed "Invalid response". | With a shared `LoginResponse` type, writing `{ userinfo: … }` doesn't compile, because the name doesn't match the type. |
| `83c29ff` | The frontend read `action.payload?.message`, but the payload was a plain string, not an object. | Reading `.message` on a `string` is a compile error. |
| `91cc60c` | A MongoDB `ObjectId` was passed to Redis where a string was needed. | The Redis client's types only accept strings and Buffers, not an `ObjectId`, so this is an error. |
| `d257265` | Two mistakes: a wrong file path (`models/users`), and `module.exports = { problemRouter }`, which exported an object containing the router instead of the router itself. | The wrong path gives a "Cannot find module" error. And `app.use` rejects a plain object. |
| `submissionController.js:145` | The code read `results[index].stdout` and assumed Judge0 always returned one result per test case. When it returned fewer, this broke (the "partial-batch bug"). | With the `noUncheckedIndexedAccess` setting, `results[index]` has the type `Result \| undefined`, so TypeScript forces you to handle the "missing" case. |

### One more bug, in the old logout code

```ts
const payload = jwt.decode(token);   // type: string | JwtPayload | null
await redis.set(`token:${token}`, 'Blocked', { EXAT: payload.exp });
//                                                  ~~~~~~~ 'payload' is possibly 'null'.
```

What is happening here:

- `jwt.decode(token)` reads a login token. Its result can be a string, a
  decoded payload object, or `null` (if the token can't be decoded).
- The next line uses `payload.exp` straight away. If `payload` were `null`,
  this would crash. TypeScript points this out with the error
  `'payload' is possibly 'null'`.

In the old app it didn't actually crash. The only reason was that
`userMiddleware` (a function that runs before the logout code and checks the
token) always ran first. But **TypeScript can't know that**, because the
guarantee lives in a different file and depends on the order things run in.

This pushes you toward a better design. Instead of decoding the token a second
time, the middleware attaches the already-verified session to `req` (the
request object), and the logout code just reads it from there. Nothing decodes
the token twice.

### One old bug TypeScript would *not* have caught

In commit `708cffa`, the `age` field arrived from the form as the string
`"18"` instead of the number `18`. This is runtime data: it only exists while
the program is running, and it comes from outside. TypeScript never sees it.
Topic 3 explains why, and what catches this kind of bug instead.

---

## Topic 3: TypeScript checks your code, not your data

When TypeScript code runs, all the types are erased (removed). What actually
runs is plain JavaScript. So anything that enters the program from outside is
truly unknown while the program runs, no matter what type you wrote on it.
Examples of data from outside:

- request bodies (what a user sends to the API)
- Judge0 responses
- `process.env` (environment variables)
- database reads
- OAuth profiles (the user info that a login provider such as Google sends
  back)

So the rule is **"parse at the boundary, trust inside"**:

- **zod** checks the data at every entry point, while the program runs.
- **TypeScript** checks all the code after that, before the program runs.

```ts
const body = registerSchema.parse(req.body);   // runtime check: unknown → RegisterInput
createUser(body);                              // compile-time check from here on
```

Line by line:

- `registerSchema.parse(req.body)` checks the incoming request body against a
  zod schema (a description of what valid data looks like). If the data is
  wrong, it throws an error. If it is right, you get back a value whose type
  is `RegisterInput` instead of "unknown".
- `createUser(body)` is now ordinary code. From here on, TypeScript checks
  that `body` is used correctly.

zod schemas can also produce the matching TypeScript types for you, using
`z.infer`. So you write one definition and get both checks: the runtime check
from zod and the compile-time type for TypeScript.

---

## Topic 4: what to expect day to day

- **Errors show up in the editor before anything runs.** You also get
  autocomplete on your own objects (like users, problems and submissions), and
  you can safely rename something across the whole repo.
- **Gotcha: `tsx` and Vite don't type-check.** `tsx` (the tool that runs
  TypeScript files directly in Node) and Vite (the frontend dev server) simply
  strip the types out and run the code anyway, even if there are type errors.
  Only `tsc --noEmit` checks the types. In this project you run it with
  `npm run typecheck`. While coding, rely on the errors your editor shows. CI
  (the automatic checks on GitHub) will block any merge that fails the type
  check.
- **You'll be slower for the first week or two, and faster afterwards.** Once
  the types are in place, they do the remembering for you (what fields an
  object has, what a function returns, and so on).
- **Library types:** zod, Mongoose, BullMQ and Vitest ship their own type
  information. Express and cookie-parser don't, so you install separate
  `@types/…` packages for them.
- **Common frustrations:**
  - Long error messages. Tip: read the *last* line first, because it usually
    names the actual problem.
  - Mongoose's complicated types.
  - The temptation to silence errors with `any` (which turns type checking
    off for that value) or `as` (which tells TypeScript "trust me, it's this
    type").
- **House rules for this project:**
  - The linter bans `any`.
  - Use `unknown` for values you don't trust yet. Unlike `any`, `unknown`
    forces you to check the value before using it.
  - Every `as` needs a comment explaining why it is safe.
- **One-time setup tasks:**
  - Telling TypeScript that Express's `req` object has a `req.user` field.
    This is done with a small `.d.ts` file (a file that only holds type
    declarations) using "declaration merging", which means adding extra fields
    to a type that was declared somewhere else, here in Express's own types.
  - Choosing the `tsconfig` settings (Topic 6).

---

## Topic 5: what to learn, and when

The learning is split into tiers, from "needed now" to "skip".

### Tier 1: needed in Phase 0

The TypeScript Handbook chapters *The Basics*, *Everyday Types* and
*Narrowing* cover all of this.

- **Annotations vs inference.** An annotation is when you write the type
  yourself. Inference is when TypeScript works it out. The rule: annotate
  function parameters, and let TypeScript infer the rest.
- **`type` vs `interface`.** Both can describe the shape of an object. Pick
  one for object shapes and use it consistently.
- **Union and literal types.** A union means "one of these". A literal type is
  an exact value. Together:
  `type Difficulty = 'easy' | 'medium' | 'hard'` means a difficulty can only
  be one of those three strings.
- **`null` and `undefined` under `strict`, and narrowing.** With `strict` on,
  TypeScript makes you deal with values that might be missing. "Narrowing"
  means TypeScript learns more about a type from your checks. For example,
  after `if (!user) throw …`, TypeScript knows `user` is not null on the
  following lines.
- **Function types, and how `async` functions return `Promise<T>`.** An
  `async` function that returns a `T` actually has the return type
  `Promise<T>`.
- **`unknown` vs `any`.** Both accept any value, but `unknown` makes you check
  it before use, while `any` switches checking off.
- **`import type`, and the `.js` extension on relative imports.** `import type`
  imports only a type, which is removed from the output. Relative imports
  (imports of your own files, like `./languages.js`) must end in `.js`. See
  `02-architecture.md` section 2.1 for the reason.

### Tier 2: Phases 1 and 2, learned when a feature needs it

- **Generics.** Types that take another type as a parameter. Used for
  `Page<T>` (a page of cursor-paginated results, where `T` is whatever is on
  the page) and for repository interfaces.
- **Discriminated unions.** A union where each option has a field that tells
  them apart. Used for test results and verdicts. With these, a `switch`
  statement can be checked by the compiler, so it tells you if you forgot a
  case.
- **Utility types.** Built-in helpers that make new types from existing ones.
  `Record<Language, string>` (one string per language) is used for starter
  code. Also `Pick`, `Omit` and `Partial`.
- **Deriving types from values.** The old `languages.js` had a comment saying
  it was the "single source of truth", but nothing enforced that. This
  replaces the comment with something the compiler actually enforces:
  ```ts
  export const LANGUAGE_IDS = { cpp: 54, c: 50, java: 62, python: 71, javascript: 63 } as const;
  export type Language = keyof typeof LANGUAGE_IDS;   // 'cpp' | 'c' | 'java' | 'python' | 'javascript'
  ```
  The first line is a normal value: each language and its Judge0 id. `as const`
  tells TypeScript to treat it as fixed. The second line builds the `Language`
  type from the keys of that object. Add a language to `LANGUAGE_IDS` and the
  type updates by itself, so the list is never written twice.
- `z.infer`, `satisfies`, typing Mongoose results with `.lean()`, and
  declaration merging for Express.

### Tier 3: later, and optional

- **Type guards** (functions with the return type `x is T`, which tell
  TypeScript what a value is after the check passes).
- **Branded ids.** Every id in the project is a UUID string. That means
  calling `finalize(problemId, userId)` with the two arguments swapped still
  compiles, because both are just strings. A "brand" makes each kind of id its
  own type, so swapping them becomes an error:
  ```ts
  type UserId = string & { readonly __brand: 'UserId' };
  ```
- **Mapped and conditional types.** Mostly useful for *reading* the types that
  libraries ship. You will rarely write your own.

### Skip these

Skip `enum` (use unions instead), `namespace`, decorators, and code built
heavily around classes. The `erasableSyntaxOnly` setting enforces this. It also
keeps the code compatible with Node's built-in type stripping (Node's own
ability to run TypeScript by simply removing the types).

### Learning order

There is no separate study phase. You pick up Tier 1 by writing the first real
files (`config/env.ts`, `languages.ts`, `AppError.ts`). You learn each Tier 2
topic the first time a feature needs it.

---

## Topic 6: the `tsconfig` settings this project uses

`tsconfig` is TypeScript's settings file. These are the important flags and
why each is on.

| Flag | What it does and why |
|---|---|
| `strict: true` | Turns on null checks and the other strict checks. Turning it on later would mean fixing hundreds of errors at once, so it is on from the start. |
| `noUncheckedIndexedAccess` | Reading `arr[i]` gives the type `T \| undefined`, because the item might not exist. This would have caught the partial-batch bug from Topic 2. |
| `module` / `moduleResolution: "NodeNext"` | Produces modern ES modules (ESM, the `import`/`export` style) that Node can run as they are. It also requires the `.js` extension on relative imports. |
| `erasableSyntaxOnly` | Bans `enum`, `namespace` and parameter properties (a class shortcut like `constructor(private x: number)`). These are features that can't simply be erased, because they generate real JavaScript code. |
| `verbatimModuleSyntax` | Makes you mark type-only imports explicitly with `import type`, so it is predictable which imports are removed from the output. |

---

## Topic 7: the main lessons

- **All the bugs TypeScript would catch in the old history happen where two
  pieces of code meet.** Response shapes, import paths, wrong argument types.
  Bugs inside a single function are usually caught by tests. Bugs *between*
  modules are what types catch. A monorepo has more of these meeting points,
  so the benefit is bigger there.
- **TypeScript can improve your design, not just catch mistakes.** Sometimes
  your code relies on a guarantee the compiler can't see (like "the
  middleware ran first"). The fix is usually to make that guarantee visible,
  by passing the verified value along, rather than silencing the error.
- **Types don't validate data.** Use zod at the boundary and TypeScript inside.

---

## In short

- CodeQuest uses TypeScript with `strict: true` from the first commit, mainly
  so the shared package works as a contract between the API, the worker and
  the web app.
- Five bugs from the old project (plus the logout bug) would have been caught
  at compile time. The `"18"` age bug would not, because it was outside data.
- TypeScript checks code, zod checks incoming data: "parse at the boundary,
  trust inside".
- `tsx` and Vite don't type-check; only `npm run typecheck` (`tsc --noEmit`)
  does, and CI blocks merges that fail it.
- House rules: no `any`, `unknown` for untrusted values, a comment on every
  `as`. Skip `enum`, `namespace` and decorators.
- Learn Tier 1 through the first real files, and Tier 2 when a feature needs
  it.
