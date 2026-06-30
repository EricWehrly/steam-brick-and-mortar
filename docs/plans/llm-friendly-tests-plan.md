# LLM-Friendly Test Infrastructure Plan

## Goals

1. `yarn test` always produces a clean, terse summary (failures count + detail) — no raw vitest noise
2. A machine-readable report file exists after every run for LLMs to read directly
3. CLAUDE.md tells LLMs exactly how to run tests and read results
4. Scoped runs documented (vitest file/pattern conventions)

---

## Current State

| Thing | State |
|---|---|
| JSON report (`test-results/test-results.json`) | ✅ written by `reporters: ['json']` in vitest.config.ts |
| Summary script (`scripts/test-summary.cjs`) | ✅ exists, parses JSON, prints failures |
| `yarn test:summary` | ❌ broken — uses `&&`, so summary never runs when tests fail |
| `yarn test` stdout | ❌ `reporters: ['default', 'json']` — verbose default output + JSON, double noise |
| LLM guidance in CLAUDE.md | ❌ lists scripts but doesn't direct LLMs to the report file or scoping syntax |
| Scoped run syntax | ❌ not documented anywhere |
| test.instructions.md | ⚠️ correct but human-written, not LLM-optimized |

---

## Not Achievable

- **Exit code = failure count**: exit codes >125 are reserved; 1 just means "error". Not a reliable signal. The summary's `FAILURES: N` line is the right substitute.
- **Zero stdout from vitest with watch mode**: watch mode (`yarn test:watch`) needs the default reporter. The fix targets `yarn test` (non-watch) only — using a separate reporter config or suppressing default in the run config.

---

## Implementation Steps

### 1. Fix `yarn test` to always print the summary

`yarn test:summary` uses `&&` which short-circuits on failure. Fix by making the test script always call the summary script regardless of vitest exit code.

Options (in order of preference):

**A. Wrapper script** — `scripts/run-tests.cjs`: spawns `vitest run`, captures exit code, always runs summary, exits with same code. Cross-platform, no shell magic.

**B. Shell compound command**: `vitest run; node scripts/test-summary.cjs` (semicolon, not `&&`). Works on Unix; on Windows with Yarn PnP this may need `cmd /c` wrapping — fragile.

Recommend **A**. Change `"test"` script in package.json from `"vitest run"` to `"node scripts/run-tests.cjs"`.

### 2. Suppress verbose vitest output during `yarn test`

Change `vitest.config.ts` reporters from `['default', 'json']` to `['json']`. The summary script becomes the only human/LLM-readable output.

`yarn test:watch` uses `vitest` (not `vitest run`), which picks up the same config — but watch mode needs visible output. Fix: either pass `--reporter=verbose` in the watch script, or create a `vitest.watch.config.ts` that includes the default reporter.

### 3. Improve failure detail in summary script

Current truncation is 100 chars — too short for most assertion errors. Change to:
- Show first 5 lines of the failure message (not a char limit)
- Preserve the `at file:line` pointer if present in the message

### 4. Add `FAILURES: N` as the first output line

Add a machine-parseable first line to the summary script output:

```
FAILURES: 3
```

This lets an LLM do a cheap line-read without parsing the full summary or JSON.

### 5. Update client/CLAUDE.md — LLM test section

Add a **Testing** section that covers:

```
yarn test                    # unit tests — always read the summary output or test-results/test-results.json
yarn test:integration        # integration suite (heavier, less frequent)
yarn test:live               # real network calls — explicit only
yarn test:all                # everything except live
```

Scoped runs (vitest passthrough):
```
yarn vitest run test/unit/scene/
yarn vitest run test/unit/scene/SceneManager-lighting.test.ts
yarn vitest run --reporter=verbose  # full output when needed
```

Key instruction: **after running `yarn test`, read `test-results/test-results.json` for full detail — don't parse the raw stdout**.

### 6. Update test.instructions.md

Add LLM-facing notes at the top (before the existing content):
- Known pre-existing failures: list them with the reason (stale expectations from refactors) so LLMs don't chase them
- Link to `test-results/test-results.json`
- Confirm vitest scoping syntax

---

## File Checklist

| File | Change |
|---|---|
| `scripts/run-tests.cjs` | New — wrapper that always runs summary |
| `scripts/test-summary.cjs` | Add `FAILURES: N` first line; expand error detail to 5 lines |
| `vitest.config.ts` | reporters: `['json']` only |
| `vitest.watch.config.ts` (new) or update watch script | restore default reporter for watch mode |
| `package.json` | `"test"` → `node scripts/run-tests.cjs`; `"test:watch"` gets explicit reporter if needed |
| `client/CLAUDE.md` | Add Testing section with commands, scoping syntax, report file pointer |
| `test.instructions.md` | Add pre-existing failures list + LLM notes at top |

---

*A1, P1, T1*
