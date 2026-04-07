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
- eslint rule: enforce max param count requiring type declaration (investigate `max-params` rule + config)
- Add guardrails where we repeatedly trip (event payload mutability, panel token usage)

### B. Layout and UX polish (branch merge-blocking)
- [done] Arc layout tuning (walkability constraints, row gap enforcement)
- [done] Game box orientation correctness across non-axis-aligned shelves (rotation convention)
- [done] Back-row near/far side policy (near side populated, far suppressed on row 4)
- [done] ShelfSide.Front/Back naming inversion - rename to Near/Far in follow-up pass
- [partial] Back-row backside suppression: hardcoded rowIndex < 4, needs ShelfLayoutPolicy type
- [open] Recently played recency freshness (manual trigger first, see open-subagent-threads.md)
- [open] ShelfSide rename pass (Near/Far vs Front/Back)

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

### E. Overnight work not completed (capture for scheduling)
These were planned for overnight but not executed. Highest priority carry-overs:
- Neon "&" sign spike (see open-subagent-threads.md P3)
- Demo branch sync (catch up openclaw/feat-demo-store to current work branch)
- Parallel subagent workspace setup (user is copying directory for parallel branch work)
- FOV/perspective distortion investigation (subagent investigation in progress - Apr 7)
- Mid texture missing on some shelves (noted but not investigated - likely LOD distance issue)

---

## Candidate Sequence (lightweight)
1. [in-progress] Merge-ready polish (current branch - nearly done)
2. Lint baseline mini-sprint (max-params rule first, then small high-signal rules)
3. Tech debt review session (schedule/defer matrix)
4. Tags + image instrumentation kickoff (feeds Phase 2 planning)
5. Demo branch sync (cherry-pick or reference, whichever is cleaner)

---

## Exit Criteria for Glue Work
- Current feature branch merged cleanly
- Lint baseline agreed and applied (at least to touched files)
- Tech debt has explicit schedule/defer labels
- Phase 2 roadmap updated with near-term dependencies from this list

---

## Notes
- This is intentionally not a new phase label.
- Keep it short and operational: enough structure to prevent drift, not bureaucracy.
- Active background items live in docs/plans/open-subagent-threads.md, not here.