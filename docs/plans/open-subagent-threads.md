# Open Subagent Threads

Tracks work that is a good fit for isolated subagents.

> Keep this short and current. Delete completed items quickly.

---

## Status Key
`idea` | `planned` | `in-progress` | `blocked` | `done`

## Complexity Key
XS (<2h) | S (2-8h) | M (1-3d) | L (3d+)

---

## P0 - Active

### PR #40 review follow-through
**Status**: `done`
**Complexity**: S
**Scope**:
- Keep PR comments at zero stale/unaddressed.
- Maintain minimal diffs; avoid architecture churn on this branch.
- Add targeted regression tests where a bug was fixed.

### Anonymous mode signage/layout polish
**Status**: `done`
**Complexity**: S
**Scope**:
- Keep recency signage fully data-driven (only when recency data exists).
- Validate time-bucket signs are mounted above shelf tops and aligned to shelf facing.
- Keep anonymous store free of Recently Played semantics.

### Class-level review workflow (agent prompt)
**Status**: `done`
**Complexity**: XS
**Scope**:
- Prompt template now lives in workspace (`.openclaw/workspace-threejs-developer/prompts/`).
- Run periodic class reviews on utility/lifecycle-heavy classes (e.g. worker wrappers).

---

## P1 - Next

### Test-suite cost reduction pass
**Status**: `planned`
**Complexity**: M
**Scope**:
- Audit slow/duplicative tests.
- Consolidate overlapping integration tests.
- Keep behavioral coverage while reducing wall-clock runtime and setup overhead.
- Produce a concrete "cheap tests first" plan before broad edits.

### Playwright scene-health collector (anonymous first)
**Status**: `planned`
**Complexity**: M
**Scope**:
- One pass per mode with shared collectors (logs, memory snapshot, startup smoothness, screenshot pointer).
- Avoid duplicated app loads and result clobbering.

### Raycast drag suppression
**Status**: `planned`
**Complexity**: XS
**Scope**:
- Suppress click selection after meaningful mouse drag delta.
- Add small unit/integration guard test.

---

## P2 - Isolated feature spikes (good delegation targets)

### Neon sign "&" 3D tube spike
**Status**: `human-review` (branch `openclaw/spike-neon-sign-agent`, commit `d1ced42`)  
**Complexity**: M  
**Ref**: `docs/plans/neon-sign-3d-design.md` (on spike branch)  
**Scope**:
- Prototype complete: TubeGeometry ampersand, emissive neon material, tests.
- Wired into scene at `(0, 2.5, -3)` via `GpuStorePropsRenderer.handleAllBatchesComplete`.
- Needs human review before iteration: visual check, position/scale feedback.

### Popcorn ceiling texture quality pass
**Status**: `human-review`  
**Complexity**: S-M  
**Ref**: `docs/plans/popcorn-ceiling-plan.md`  
**Notes**: Plan written, implementation not started. Needs human sign-off on approach (cellular granules vs. drop-ceiling fallback) before delegating to Flash.

---

## Notes
- Prefer one bounded subagent task per run.
- Prefer cheap models for mechanical/documentation tasks.
- Avoid launching large refactors before lint branch kickoff.

### [HIGH] Research: offline access / bookmarklet export format
**Status:** open
**Context:** demo-games.ts fixture format should eventually match whatever static export format we land on for offline/bookmarklet access (circumventing Lambda). When that research resolves, dovetail the fixture format to match.
**Source:** PR #40 r3048468746
**Location:** client/src/steam/fixtures/demo-games.ts:26
