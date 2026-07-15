# Feature: Idempotent Library Scene Sync

**Act**: 2 (Also In Act 2 — Best Effort)
**Status**: Not started — north star captured, no code written
**Priority**: Low (architecture quality; no user-facing bug forcing it — see "Why not now")

---

## Goal

Replace `LibraryReloadRequest`'s reset-tier model (reconcile / full) with one idempotent
operation: "make the scene match this game set." No teardown event, no tiers to route between —
the renderer diffs internally (keep / add / remove) on every apply, whether that's the first
library render, a local-scan relaunch, or a future in-session remote refresh.

---

## Motivation

This grew out of a self-review of the startup/reload reconciliation work
(`docs/plans/startup-reload-review-findings.md`, F4). Quoting the finding directly:

> Every reset "tier" is "the destructive `LibraryReloadRequest`, but preserving a bit more each
> time" — placement-run reset < reconcile < soft < full. The genuinely streamlined model is an
> idempotent "make the scene match this game set" operation with no reset event and no tiers.
> `reconcileForLibraryReload` is already ~80% of that shape.

The soft-reset tier and its `generation` counter were already deleted in the F1 pass (see that
doc, and [Label and Placement Reset Architecture Review](../architecture/label-and-placement-reset-architecture-review.md)'s
"Library Reload Lifecycle" section for the full before/after). What's left is a two-way branch —
`GameBoxSpawner.resetForLibraryReload()` picks **reconcile** (capacity-compatible, diff known) or
**full** (dispose + rebuild) — not zero branches. This feature is the step that removes the
remaining branch: fold capacity growth into "grow the texture array in place, copy existing slots
forward, then apply the diff" instead of dispose+rebuild, so `reconcile` becomes the only path,
called unconditionally, every time.

### What this closes out for free

Two latent issues recorded in the review findings stop existing once there's no full-reset
disposal path left to trigger them:

- **F5 — full reset's disposal race.** In-flight prefetches from the outgoing library resolve
  after `dispose()` has cleared the tier map, logging `Unknown tier: mid` and no-opping. Harmless
  today (the old orchestrator is unreferenced), but it's the same symptom family as
  [`lod-tier-reset-race-condition`](../tech-debt.md#id-lod-tier-reset-race-condition). An
  idempotent apply never disposes the orchestrator mid-session, so the race has no path to occur.
- **F6 — reconcile's slot leak on repeated reconciles.** `reconcileForLibraryReload` doesn't
  reclaim removed games' texture slots today; that's bounded to one leak per process launch
  because desktop only reconciles once. It stops being bounded once in-session remote refresh
  (Tier 3 of [Desktop Startup Load Ordering](../plans/desktop-startup-load-ordering-plan.md))
  reconciles repeatedly. An idempotent "grow in place, apply diff" model needs slot
  reclamation/compaction as a first-class part of its diff step anyway (it can't be an
  after-the-fact patch once tiers are gone) — this feature is where that gets designed in, not
  bolted on later. See [`reconcile-slot-leak-on-repeated-reload`](../tech-debt.md#id-reconcile-slot-leak-on-repeated-reload).

### Why not now

Nothing user-visible is broken by keeping the two-tier split. This is a legibility/maintainability
improvement, not a bug fix — worth doing before Tier 3 (in-session remote refresh) lands, since
Tier 3 is what makes F6 stop being bounded, but not worth doing ahead of a concrete need.

---

## Target Shape

- Delete `StorePropsEventTypes.LibraryReloadRequest` as a teardown signal. Library apply becomes a
  single call: "sync scene to this game set."
- `LodTextureArrayManager` (or its successor) supports growing a `DataArrayTexture` in place —
  allocate a new, larger array, copy existing layers forward, swap — instead of the caller having
  to dispose and rebuild everything above it. This is the one piece that doesn't exist today; WebGL
  array-texture depth is fixed at construction, so "grow" is necessarily "allocate new + copy",
  never a true in-place resize, but it doesn't require disposing sibling systems
  (`LodArtworkOrchestrator`, `InstancedLabelRenderer`) the way today's `fullReset()` does.
- `LodArtworkOrchestrator.reconcileForLibraryReload()` (already ~80% of the target shape per the
  finding) becomes the only apply path — no branching on capacity or on whether the caller
  supplied a diff. The diff is always computed (already true post-F1, via `computeLibraryDiff()` in
  `Library.ts`) and always applied the same way.
- Reconcile's diff step gains slot reclamation: a removed game's texture slot becomes available for
  reuse instead of sitting orphaned until the atlas grows past `maxTextures`.

---

## Related Work

- Conceptually adjacent to [Game Box Construction Chain](game-box-construction-chain.md) — both
  replace an imperative "rebuild everything" call with an explicit, re-enterable, diff-aware
  pipeline. Worth designing together or at least sequencing so one informs the other's event shape,
  not required to land together.
- Gates cleanly ahead of Tier 3 in
  [Desktop Startup Load Ordering](../plans/desktop-startup-load-ordering-plan.md) — Tier 3
  (periodic in-session remote refresh) is the first caller that would actually exercise repeated
  reconciles and surface F6 if this feature hasn't landed first.

---

## Stories / Tasks

- [ ] Design in-place growth for the artwork/label texture arrays (allocate-larger + copy-forward)
- [ ] Add slot reclamation/compaction to `reconcileForLibraryReload` (analogous to the existing
      `compactMidTier`)
- [ ] Collapse `GameBoxSpawner.resetForLibraryReload()`'s reconcile/full branch into a single apply
      path
- [ ] Retire `StorePropsEventTypes.LibraryReloadRequest` as a teardown signal (or repurpose it as a
      plain "library changed" notification with no reset semantics)
- [ ] Update `docs/architecture/label-and-placement-reset-architecture-review.md`'s "Library Reload
      Lifecycle" section once implemented

## Open Questions

- Does in-place growth belong on `LodTextureArrayManager` itself, or a level above it (a manager
  that owns "current array" and swaps it, so the array class stays simple)?
- Should label texture arrays and artwork texture arrays grow independently, or is there a shared
  growth primitive worth extracting first?

## Acceptance Criteria

- A capacity-growing library reload (demo → real library, or a scan that gains many games) no
  longer disposes `LodArtworkOrchestrator`/`LodTextureArrayManager` — it grows in place
- `reconcileForLibraryReload` is the only path `GameBoxSpawner` calls on
  `StorePropsEventTypes.LibraryReloadRequest` (or its replacement)
- Repeated in-session reconciles (simulated in a test — no real Tier 3 needed to verify this) do
  not monotonically grow the texture array; removed games' slots are reused
- No `Unknown tier: mid` log line is reachable from any library-reload path

---
*— A1*
