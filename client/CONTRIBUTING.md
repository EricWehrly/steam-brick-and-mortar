# Contributing to Steam Brick and Mortar Client

## Pre-review gate: `yarn validate`

Run `yarn validate` before opening a PR or requesting review. It runs:
1. `yarn type-check` — TypeScript compilation (must be clean)
2. `yarn test` — unit tests with 4 workers (fast; ~30s)
3. `yarn lint` — ESLint (warnings expected; **errors are not**)

This is the readiness signal. If `validate` passes, the code is ready for human eyes.

---

## Test Types & Scripts

### Use the cheapest test that catches the failure

| Command | What runs | When to use |
|---------|-----------|-------------|
| `yarn test <pattern>` | Unit tests matching pattern | Default — after any change |
| `yarn test` | All unit tests | Before committing |
| `yarn test:integration` | Integration tests (`*.int.test.ts`) | When cross-module behavior changes |
| `yarn test:performance` | Performance benchmarks | Before perf-sensitive merges |
| `yarn test:all` | Unit + integration + performance | Full sweep, no live/visual |
| `yarn test:visual` | Playwright screenshots / tools | **Opt-in only.** Not in automated flows. |
| `yarn test:live` | Real API calls | **Opt-in only.** Requires API access. |

### Rules
- `yarn test:visual` and `yarn test:live` are **never** run automatically — they are tools, not CI tests.
- `yarn validate` uses `yarn test` (unit only) — not `test:all`.
- Add unit tests for all new features and bugfixes.
- Integration tests should be thin — prefer unit coverage where possible.

---

## Code quality

- Lint warnings are tracked in `docs/plans/linter-contract.md`. Do not add suppressions without a comment.
- `setTimeout` and anonymous function declarations in production code should be flagged in review.
  - Prefer named functions and render-loop / ManagedWorker patterns for deferred work.
- Do not add `requestIdleCallback` or `setTimeout` to the ESLint globals — violations should be visible so they get replaced.

---

For more context see `docs/plans/linter-contract.md` and `docs/roadmaps/tech-debt.md`.
