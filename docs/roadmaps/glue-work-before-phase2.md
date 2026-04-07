# Glue Work Roadmap (After Phase 1, Before Full Phase 2 Ramp)

Purpose: consolidate cleanup + debt scheduling + tooling stabilization **without inventing a new formal phase**.
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
- Fix high-noise formatting/encoding regressions (emoji/symbol corruption sources)
- Add guardrails where we repeatedly trip (event payload mutability, panel token usage)

### B. Layout & UX polish to finish current branch
- Arc layout tuning (walkability constraints, front/back density policy)
- Game box orientation correctness across non-axis-aligned shelves
- Back-row backside suppression policy formalization
- Recently played recency freshness (daily debounced update)

### C. Tech-debt triage + scheduling
- Review `docs/roadmaps/tech-debt.md` in one pass
- Mark each item: Do Now / Phase 2 / Later / Drop
- Create explicit target windows for each retained item

### D. Data pipeline prep for Phase 2
- Steam tags pipeline split: Lambda exposure first, client consumption second
- CDN/image-fetch instrumentation to understand current bandwidth behavior

---

## Candidate Sequence (lightweight)
1. **Merge-ready polish** (current branch): layout + rotation + regressions
2. **Lint baseline mini-sprint** (small, high-signal rules first)
3. **Tech debt review session** (schedule/defer matrix)
4. **Tags + image instrumentation kickoff** (feeds Phase 2 planning)

---

## Exit Criteria for Glue Work
- Current feature branch merged cleanly
- Lint baseline agreed and applied (at least to touched files)
- Tech debt has explicit schedule/defer labels
- Phase 2 roadmap updated with near-term dependencies from this list

---

## Notes
- This is intentionally **not** a new phase label.
- Keep it short and operational: enough structure to prevent drift, not bureaucracy.