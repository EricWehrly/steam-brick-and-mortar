# WORK.md — feat-section-per-layout-v2

**Branch:** `openclaw/feat-section-per-layout-v2`
**Base:** `openclaw/feat-renderer-lifetime-clean` (includes ordering + reload/layout split fixes)

## Goal
Implement Section-Per-Layout (SPL) so shelf distribution is section-owned (not global overflow), and remove transitional coupling hacks that emerged in renderer-lifetime split work.

## Why now
- Current branch has stabilizing fixes we want.
- Additional cleanup before SPL likely causes churn.
- SPL should simplify several awkward coordination paths by making section budgets explicit.

---

## Milestone 1 (vertical slice)

### A. Section-owned shelf budgets
- Compute shelf allocation per section from section game counts (with sane min/max constraints)
- Stop relying on global overflow behavior for arc back row as primary distribution mechanism

### B. Placement consumes section budgets directly
- Placement loops by section using explicit allocated shelf count
- Ensure each section’s shelf range is deterministic and stable across layout switches

### C. Keep event contracts stable
- Preserve existing core events where possible (`SectionsReady`, `ShelfReady`, `ShelfLayoutDetermined`)
- Avoid introducing broad new lifecycle events unless absolutely required

### D. Arc squish validation
- Validate genre-heavy libraries no longer collapse visually into back-row squish

---

## Initial file targets (expected)
- [ ] `client/src/scene/props/shared/ArcLayoutUtils.ts`
- [ ] `client/src/scene/shelves/ShelfLayoutCoordinator.ts`
- [ ] `client/src/scene/spawning/GameBoxSpawner.ts`
- [ ] `client/src/scene/categorization/*` (if section metadata needs extension)
- [ ] test updates in `client/test/unit/scene/*` + targeted integration coverage

---

## Constraints / Notes
- Keep renderer lifecycle improvements intact (no art reload on layout switch).
- Keep split clear events (`LayoutClearRequest`, `LibraryReloadRequest`).
- Prefer explicit section semantics over inferred global capacity math.
- Avoid speculative refactors unrelated to SPL vertical slice.
