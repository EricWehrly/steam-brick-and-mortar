# Glue Work Roadmap (After Phase 1, Before Full Phase 2 Ramp)

Purpose: consolidate cleanup + debt scheduling + tooling stabilization without inventing a new formal phase.
Think of this as a short transition lane while Phase 2 planning firms up.

## Goals
1. Stabilize current branch quality for merge and handoff
2. Reduce known architecture friction before broader Phase 2 work
3. Schedule/defer tech debt intentionally (not ad-hoc)
4. Keep momentum: no long freeze, just targeted glue tasks

---

## Glue Work Buckets

### A. Quality / Tooling (Central Focus)
- Lint pass strategy and baseline cleanup
- Fix high-noise formatting/encoding regressions (emoji/symbol corruption in source comments)
- eslint `max-params` rule: enforce param count threshold requiring a declared type (investigate config)
- TD comment ID convention: encourage `// TD [tag-id]: description` format for easier search/grep
  (see AGENTS.md - PR #39 feedback from reviewer)
- Add guardrails where we repeatedly trip (event payload mutability, panel token usage)

### B. Layout and UX polish (open items post-merge)
- ShelfSide.Front/Back naming is backwards vs player-facing intuition
  (Front=-localZ=far, Back=+localZ=near). Deferred rename to Near/Far. Currently documented with inline comment.
- Back-row suppression: hardcoded `rowIndex < 4` needs a ShelfLayoutPolicy type (see threads doc)
- Recently played recency freshness (manual trigger first - see threads doc)
- ShelfSurfaceUtils sort order (top-to-bottom): no unit test yet - `// TD [shelf-surface-sort]`
- suppressEmit flag in GpuStorePropsRenderer.calculateShelfBoundsAndLayout: reviewer dislikes this pattern.
  Priority: address in upcoming work. Likely fix: emit only from a single dedicated call site,
  not gate behind a flag.
- GpuStorePropsRenderer is too long - layout-related functionality should be extracted to its own class.
  Tracked as a medium-priority refactor.

### C. Tech-debt triage + scheduling
- Review `docs/roadmaps/tech-debt.md` in one pass
- Mark each item: Do Now / Phase 2 / Later / Drop
- Create explicit target windows for each retained item

### D. Data pipeline prep for Phase 2
- Steam tags pipeline split: Lambda exposure first, client consumption second
- CDN/image-fetch instrumentation to understand current bandwidth behavior
- Direct CDN artwork URL pattern (see docs/research/steam-api-legitimacy.md) - skip appdetails for art
- SteamInfo/steaminfo.com research (separate from official API research - see open-subagent-threads.md)
- Steam review scores + Metacritic for detail page

### E. Deferred / carry-forward items
- Neon sign spike (see open-subagent-threads.md P3)
- Demo branch sync: done - openclaw/feat-demo-store reset to current tip
- Parallel subagent workspace setup (user copying directory for parallel branch work)
- FOV/camera options to explore when XR work begins (note: flatscreen default is now 70 deg)
- Mid texture missing on some shelves (LOD distance issue - investigate on demo-store branch)
- WorkerErrorUtils should eventually fold into ManagedWorker (reviewer noted this on PR #39)

---

## Candidate Sequence
1. Lint baseline mini-sprint (max-params rule + TD ID convention first)
2. suppressEmit refactor (GpuStorePropsRenderer single emit call site)
3. GpuStorePropsRenderer split (extract layout class)
4. Tech debt review session (schedule/defer matrix)
5. Tags + image instrumentation kickoff (feeds Phase 2 planning)

---

## Exit Criteria for Glue Work
- Lint baseline agreed and applied (at least to touched files)
- suppressEmit pattern resolved
- Tech debt has explicit schedule/defer labels
- Phase 2 roadmap updated with near-term dependencies from this list

---

## Notes
- This is intentionally not a new phase label.
- Active background items live in docs/plans/open-subagent-threads.md.