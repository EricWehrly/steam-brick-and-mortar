# File/Class Review Prompt Template

Use this when a reviewer flags a specific file/class and wants a fast, high-signal review.

---

## Prompt

Review this file/class as a seasoned senior engineer. Be strict but practical.

### Target
- Repo: <owner/repo>
- Branch: <branch>
- File: <path>
- Optional focus lines: <line-range or PR comment links>

### Goals
1. Identify correctness risks (bugs, race conditions, broken invariants)
2. Identify maintainability risks (naming, lifecycle complexity, dead code)
3. Identify API/contract mismatches with related classes
4. Suggest minimal patch-level improvements suitable for this branch
5. Mark what should be deferred to follow-up refactor

### Output format
- **Summary verdict** (ship / ship-with-notes / do-not-ship)
- **Critical issues** (must-fix)
- **Important issues** (should-fix)
- **Minor issues** (can defer)
- **Suggested patch set** (small, concrete edits)
- **Defer list** (explicitly tracked debt)

### Constraints
- Prefer minimal diffs over broad rewrites unless requested.
- Preserve existing behavior unless behavior is clearly wrong.
- If unsure, state assumptions explicitly.
- Include test recommendations for every must-fix issue.

### Optional deep checks
- Lifecycle shape (single-phase vs two-phase init)
- Error flow consistency with base classes/utilities
- Allocation/memory hot spots
- Logging quality and observability
- Public method contracts vs actual usage

---

## Example invocation notes
- "Review PixelDataCache.ts with emphasis on two-phase init, crash behavior, and unnecessary methods."
- "Review GpuStorePropsRenderer.ts for event emission lifecycle and layout extraction seams."
