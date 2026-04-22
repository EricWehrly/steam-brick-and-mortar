# WORK.md — feat-section-per-layout-v2

**Branch:** `openclaw/feat-section-per-layout-v2`
**Base:** `openclaw/feat-renderer-lifetime-clean`

## Goal
Section-Per-Layout (SPL): section-owned shelf geometry across arc/row/spoke, clean event phase boundaries, and correct artwork/label lifecycle for re-sorting and layout switching.

---

## Done on this branch

- [x] Split clear events (`LayoutClearRequest`, `LibraryReloadRequest`)
- [x] `LibraryManifestReady` event (immutable membership seam)
- [x] `GameDataReady` moved to `SteamIntegration` (single definitions-ready owner)
- [x] Section-aware layout: arc, row, spoke each compute shelves per section
- [x] Arc ring-band geometry (smallest section → innermost ring, contiguous row ownership)
- [x] Spoke aisle-width clamped to angular geometry (no adjacent-spoke overlap)
- [x] `ShelfSectionPlanner` sign threshold fixed (waits for one shelf per section, not game-count math)
- [x] `InstancedShelfRenderer` capacity scaled to library size at setup time
- [x] `ArtworkSettled` gated on `AllBatchesComplete` — prevents premature label compact when background fetch batches arrive after cached batch prewarm finishes
- [x] Debug: `window.__debugSectionPlanner.labelAllShelves()` labels every shelf with `section·index`
- [x] Event seam docs updated (layout-pipeline-plan, gamesort-full-pipeline, component-interaction-map)
- [x] Integration test: `event-ordering-library-readiness.int.test.ts`

---

## Known open items on this branch

- [ ] **Spoke inside-surface placement**: games may be appearing on the outward face of spoke shelves instead of the aisle face. `SpokeStockStrategy` selects `Near` (inward) correctly, but the `buildStockSurfaces` local-Z calculation for `Near` uses `backZ` — worth verifying against a rotated spoke shelf. Use `window.__debugSectionPlanner.labelAllShelves()` to confirm shelf orientations, then check whether `ShelfFace.Near` is truly the aisle side at spoke rotations.
- [ ] Sorting issues (deferred — will change with multi-group work)
- [ ] `DataLoaded` rename to `SteamSessionReady` or similar (low priority, cosmetic)

---

## Next branch: multi-group placement

**See:** `docs/plans/multi-group-placement-plan.md` (written below — move to that file)

---

## Remaining follow-ups (carry to MEMORY.md on close)
- Arc ring geometry working, sections assigned contiguous rings
- Spoke geometry improved but inside-surface placement needs visual verification
- Label atlas exhaustion root cause was `ArtworkSettled` firing between batch waves — now gated
