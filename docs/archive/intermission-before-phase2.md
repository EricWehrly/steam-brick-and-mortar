# Intermission Roadmap (After Phase 1, Before Full Phase 2 Ramp)

Purpose: consolidate cleanup + debt scheduling + tooling stabilization without inventing a new formal phase.
Think of this as a short intermission lane while Phase 2 planning firms up.

---

## Three Goals (Exit Criteria)

The intermission is done when all three of these are met:

1. **Key metrics instrumented and hitting targets** — memory, frame time, time-to-interactive, and hitches are all tracked and under control
2. **Background tab drops resource usage measurably** — focus loss triggers real frame time + memory reduction
3. **UI standardization complete** — remaining panels token-ified, LayoutSortPanel polished, no layout regressions

---

## Goal 1 — Key Metrics (Highest Priority)

The most important outcome of the intermission is having a genuine handle on our critical metrics:
- **Memory usage** — how much we're consuming and when it spikes
- **Frame time** — consistent framing, no hitches that block input
- **Time-to-interactive** — make "interactive" happen as aggressively early as possible
- **Hitches** — any interruption in input responsiveness after first-interactive

Instrumentation comes first. We can't tune what we can't measure. Once we have data, we target the worst offenders.

**Implementation shape:**
- Hookup `StartupEventTracker` / `StartupPhase` to report time-to-interactive precisely
- Add frame time monitoring (already partially in `PerformanceMonitor` / `RenderLoopDiagnostics`)
- Add memory sampling at key lifecycle points (via `GpuMemoryEstimator` or equivalent)
- Hitch detection: track frames that exceed a threshold (e.g. >16ms spike during input window)

---

## Goal 2 — Background Tab / Focus Loss Resource Reduction

When the app is not in focus, it should drop as much resource usage as possible:
- **Frame time** — free up GPU/CPU for launched games
- **Memory** — same deal; can tune gradually

**Implementation shape:**
- Page Visibility API (`document.visibilitychange`) to detect focus loss
- Drop frame rate (e.g. throttle to 5–10fps or pause entirely) on blur
- **Swag pass on LOD:** disabling high-LOD on focus loss and re-enabling on focus may be a quick win using existing code paths — worth trying before doing anything more invasive

The memory reduction is explicitly a "tune later" item. The frame time reduction should happen in this intermission.

---

## Goal 3 — UI Standardization Completion

Finish the UI normalization work started in Phase 1 (Milestone 6.6):
- Remaining panels that haven't been migrated to `tokens.css` variables
- Any layout regressions introduced by the sort panel work
- `LayoutSortPanel` polish (visual consistency, spacing, state handling)
- Audit all checkboxes/toggles in the settings panel — connect or clearly mark unimplemented ones

---

## Pull-Forward from Act 2

The categorization work (GameSorter, ShelfSectionPlanner, sort modes) is in good shape from Phase 1.
This can be pulled forward into the intermission if bandwidth allows — it doesn't need to wait for full Phase 2 ramp.
Specifically: wiring category-based shelf assignment and sign labeling are natural next steps that don't require broader Phase 2 infrastructure.

---

## Intermission Buckets

The following A–E buckets capture the detailed work. They map to the goals above:
- **A (Quality/Tooling)** → supports Goal 1 instrumentation baseline
- **B (Layout/UX polish)** → supports Goal 3 UI standardization
- **C (Tech debt triage)** → cross-cutting, feeds Phase 2 planning
- **D (Data pipeline prep)** → Phase 2 setup; lower priority for intermission exit
- **E (Deferred/carry-forward)** → do not block intermission exit on these

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
1. Metrics instrumentation sprint (frame time, memory, time-to-interactive hookup)
2. Focus loss / background tab reduction (Page Visibility API + LOD swag pass)
3. UI standardization pass (remaining panels, LayoutSortPanel polish)
4. Lint baseline mini-sprint (max-params rule + TD ID convention)
5. suppressEmit refactor (GpuStorePropsRenderer single emit call site)
6. GpuStorePropsRenderer split (extract layout class)
7. Tech debt review session (schedule/defer matrix)
8. Tags + image instrumentation kickoff (feeds Phase 2 planning)

---

## Notes
- This is intentionally not a new formal phase label.
- Active background items live in docs/plans/open-subagent-threads.md.
