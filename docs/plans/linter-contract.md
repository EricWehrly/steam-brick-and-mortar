# Linter Contract: ESLint Setup for Steam Brick and Mortar

**Status:** Draft — review and iterate before treating as settled  
**Branches:** `openclaw/feat-linter-foundation` (auto-fixes done), `openclaw/feat-linter-wip` (WIP, judgment calls)

---

## Current State (Updated)

Started at **348** findings. Current state on `openclaw/feat-linter-wip`:

| Rule | Count | Category |
|------|-------|----------|
| `@typescript-eslint/no-non-null-assertion` | 36 | Type safety |
| `@typescript-eslint/no-explicit-any` | 8 | Type safety |
| `@typescript-eslint/no-unused-vars` | 4 | Cleanup |
| `@typescript-eslint/prefer-optional-chain` | 3 | Style |
| `prefer-const` | 1 | Style |
| **Total** | **52** | |

### What already landed in this branch
- Auto-fix baseline + config corrections (`queueMicrotask`/`CustomEvent` globals)
- Disabled `prefer-nullish-coalescing` until strictNullChecks is enabled
- `no-case-declarations` fixed
- `no-useless-assignment` fixed
- Bulk pass on easy `no-unused-vars` + `no-explicit-any`
- Added `DataManager.getOrThrow()` and migrated representative call sites
- Removed unused legacy `client/src/steam/cache/CacheManager.ts`

---

## Config Decisions Made (Auto-Fix Branch)

### Turned Off
**`prefer-nullish-coalescing`** — requires `strictNullChecks` to work correctly. With `strict: false` in tsconfig, this fires a configuration error on every single file (was 217 of our 348 "violations"). Turned off until we enable `strictNullChecks`.

> **TD:** Re-enable when `strict: true` in tsconfig. This is a meaningful rule — `??` vs `||` matters when values can be `0` or `""`.

### Added Globals
`queueMicrotask`, `CustomEvent` — missing browser globals causing false `no-undef` errors.

---

## Proposed Rules Contract

### Philosophy
- **Errors** = things that are definitely wrong or will cause bugs. Zero tolerance.  
- **Warnings** = things we want to move toward but won't block on. Track, fix opportunistically.  
- **Off** = patterns we've consciously accepted, with rationale.

### Keep as Errors (Non-Negotiable)
```js
'no-undef': 'error'           // Missing browser globals → add to config, don't suppress
'no-unreachable': 'error'     // Dead code
'no-var': 'error'             // Always let/const
'no-dupe-keys': 'error'       // Object literal duplicates
'no-duplicate-case': 'error'  // Switch case duplicates
'no-constant-condition': 'error'
```

### Keep as Warnings (Want, Not Blocking)
```js
'@typescript-eslint/no-unused-vars': 'warn'   // With argsIgnorePattern: '^_'
'@typescript-eslint/no-explicit-any': 'warn'  // Warn, don't block — see discussion below
'@typescript-eslint/no-non-null-assertion': 'warn'  // See discussion below
'prefer-const': 'warn'
```

### Turn Off (With Rationale)
```js
'@typescript-eslint/prefer-nullish-coalescing': 'off'   // Needs strictNullChecks
'@typescript-eslint/explicit-function-return-type': 'off' // Too verbose for this codebase
'@typescript-eslint/explicit-module-boundary-types': 'off' // Same
```

---

## Discussion Points

### 1. `no-explicit-any` (44 violations)

Most `any` usages here fall into a few categories:

- **Three.js escape hatches** — `(window as any).someDebugUtil = ...` — legitimate, hard to type
- **Event handler casts** — casting `event.detail` before we had typed events; most are now replaced by generic `CustomEvent<T>` 
- **Legacy glue code** — parts of the codebase written before type discipline was established

**Recommendation:** Keep as `warn`. The 44 are worth triaging — maybe 20 are worth fixing properly, the rest get `// eslint-disable-next-line` with a comment explaining why. Don't mass-suppress.

**Connection to ReadOnly events:** You mentioned moving to `Readonly<T>` emissions. Several `any` casts in event handlers exist because the event detail type was loose. Tightening `GameBoxSpawnedEvent`, `ShelfReadyEvent` etc. with `Readonly<>` will eliminate some of these naturally. Do that as the architectural work progresses, not as a lint-driven sed pass.

### 2. `no-non-null-assertion` (36 violations — `!` operator)

Most `!` usage is:
- After existence checks that TS can't see through (common Three.js pattern)
- DataManager `.get<T>()` returns `T | undefined` but callers know it's set

**Recommendation:** Keep as `warn`. The right fix for DataManager is a `getOrThrow<T>()` method that narrows the type — not scattering `!` everywhere, and not suppressing the rule. That's a separate small refactor.

**Don't** auto-fix these by adding `eslint-disable` comments — it buries real problems.

### 3. `no-case-declarations` (4 violations)

Lexical declarations (`let`, `const`, `class`) inside `case` blocks without braces. This is a real correctness issue — the variable leaks scope to other cases. Easy fix: wrap the case body in `{}`.

**Recommendation:** Fix in WIP branch. It's 4 files, zero ambiguity, no behavioral change.

### 4. `no-unused-vars` (34 violations)

Mix of:
- Exported types/interfaces that are "unused" from lint's perspective but are part of the public API (`SignStyles`, `GameBoxTextureOptions`)
- Actually dead code
- Params that should be prefixed `_`

**Recommendation:** Triage in WIP branch. Exported types used by consumers get `/* eslint-disable */` or restructure imports. True dead code gets deleted. Unused params get `_` prefix.

### 5. `prefer-optional-chain` (3 remaining)

Auto-fixable but requires judgment — some chains are deliberately written long-form for clarity. Review before fixing.

---

## Rules We're Consciously Not Adding (Yet)

### `@typescript-eslint/no-unsafe-*`
Requires `strictNullChecks` and full type-checking mode. Valuable, but gated on tsconfig work.

### `@typescript-eslint/consistent-type-imports`
Would enforce `import type` everywhere. Low-priority style rule — adds noise to diffs, doesn't catch bugs. Worth revisiting if we see type-import issues.

### `@typescript-eslint/no-floating-promises`
Would catch unawaited promises. **This is a good rule** and would catch real bugs (we have some `setupProps()` calls that should probably be awaited). Gated on `strict` mode. Add to the TD.

### `@typescript-eslint/readonly-return-type` / immutability rules
Connected to your desire for `Readonly<T>` event emissions. The right approach is architectural (emit `Readonly<T>`, consume `Readonly<T>`) — not a lint rule that forces it mechanically. The lint rule to consider later is `@typescript-eslint/prefer-readonly-parameter-types` (very strict, many false positives with Three.js objects).

---

## Suggested Next Rule Additions (When Ready)

Priority order:

1. **`@typescript-eslint/no-floating-promises`** — real bug-catcher, add after strict mode  
2. **`no-console`** (warn, with `allow: ['warn', 'error']`) — we have a Logger, this enforces it  
3. **`@typescript-eslint/consistent-type-imports`** — cosmetic, low priority  
4. **`prefer-nullish-coalescing`** — re-enable with strict mode  

---

## What the WIP Branch Should Fix

In priority order — these are the judgment-call fixes, not auto-fixable:

1. `no-case-declarations` × 4 — wrap case blocks in braces. Zero ambiguity.
2. `no-useless-assignment` × 1 — dead assignment, just delete it.
3. `no-unused-vars` — triage: prefix unused params with `_`, delete actually dead code, `/* eslint-disable */` legitimately-exported-but-unused types with comment.
4. `prefer-optional-chain` × 3 remaining — manual review before applying.
5. `no-explicit-any` + `no-non-null-assertion` — **do not mass-fix**. Fix the meaningful ones, suppress the intentional ones with explanatory comments. Track the rest as known tech debt.

---

## What We're Deliberately Not Fixing Right Now

- The `no-explicit-any` instances in debug/devtools code — acceptable for console-facing utilities
- Three.js `(window as any)` assignments — architectural concern, not a lint quickfix
- `no-non-null-assertion` in DataManager call sites — fix by improving DataManager typing, not suppression
- All `strictNullChecks`-dependent rules — blocked on tsconfig work

---

## Strict Mode Enablement Checklist (Hard vs Soft)

We currently have `"strict": false` in `tsconfig.json`.

### Hard requirements (must do)
1. **Enable `strictNullChecks`** (either directly or via `strict: true`) and fix resulting type errors.
2. **Keep `noImplicitAny` on** (comes with strict) and remove remaining implicit any sites.
3. **Fix constructor/initializer definite assignment issues** (`strictPropertyInitialization`) in classes that currently rely on runtime init ordering.
4. **Fix index access assumptions** where values can be undefined under stricter checks.
5. **Stabilize build + tests under strict tsconfig** (tsc must pass in CI).

### Soft requirements (can be staged with temporary exceptions)
1. Introduce `getOrThrow` migration incrementally instead of all-at-once.
2. Keep a few targeted `eslint-disable-next-line @typescript-eslint/no-explicit-any` at known type-system boundaries (constructor-forwarding mixins, debug globals) with comments.
3. Delay strict lint rules that depend on strict mode (`prefer-nullish-coalescing`, `no-floating-promises`, `no-unsafe-*`) until strict compile is green.
4. Use localized `// @ts-expect-error` only when truly blocked, and track each one with a TD note.

### Recommended rollout order
1. Add a **strict-check tsconfig** (`tsconfig.strict.json`) and run it in CI as non-blocking.
2. Burn down errors category-by-category (DataManager callers, scene init, cache/indexing).
3. Flip strict CI gate to required.
4. Re-enable strict-dependent lint rules.

## Notes

- This document should be updated as counts change; keep it as the source of truth for lint policy status.
- Phase labels: we now refer to cleanup/glue effort as **Intermission**.
