# Feature: Loading Placeholder Boxes

**Act**: 2 (Also In Act 2 — Best Effort)
**Status**: 📋 Design — see [`loading-placeholder-boxes-plan.md`](../plans/loading-placeholder-boxes-plan.md); not started
**Priority**: Medium (perceived quality; grew from a concrete liminal-mode report)

## Goal

When a game box's shelf slot is known but its artwork hasn't resolved yet, render a cheap, generic
"art incoming" box in that slot rather than leaving it empty — swapped for real artwork in place
once it resolves.

## Why

Shelves are pure procedural geometry and appear immediately. Artwork requires a network fetch,
decode, and GPU upload. The interval between them currently renders nothing, so boxes visibly
arrive after the shelves they sit on.

Surfaced concretely during liminal-mode Story 5 testing (2026-07-30) — but it is **not**
liminal-specific. It affects every layout on initial build and re-sort; liminal only makes it
repeat every few steps instead of once at startup, which is what made it obvious.

## Locked Decisions

| Decision | Resolution |
|----------|------------|
| **Genericity** | One **shared** placeholder texture for every pending box. Explicitly *not* a per-game render (name, genre color, label box) — too expensive to generate at library scale for a brief, transient state. This constraint is what makes the whole design cheap. |
| **Rendering** | The placeholder is an ordinary artwork instance pointed at one reserved MID texture-array slot. No new `InstancedMesh`, no new draw call, no shader change, no new material. |
| **Promotion** | Real artwork replaces the placeholder **in place** via the existing `setInstanceArtwork()` repoint path (built for liminal's treadmill) — not by allocating a second instance. |
| **Scope of the fix** | Layout-agnostic. Lives at the placement/artwork rendezvous, so every layout benefits; liminal gets no special-casing. |

## Acceptance Criteria

- A slot with a known position never renders empty while its artwork is in flight
- Exactly one instance exists per placement — no duplicates when artwork is already cached and
  resolution happens synchronously within the intent dispatch
- The same game occupying multiple slots simultaneously (liminal's ring wrap) promotes each of its
  placements independently and correctly
- A game whose artwork permanently fails still ends up showing its **name** (label fallback
  preserved — no information regression vs. today)
- Placeholder instances that are never promoted are counted in the placement run summary, not
  silently invisible
- No measurable per-frame cost while placeholders are on screen (static v1)

## Stories / Tasks

Sequencing, rationale, and the three correctness traps are in the
[design plan](../plans/loading-placeholder-boxes-plan.md) §7. Summary:

- [ ] **Story 0** — Capacity audit: confirm `placementCapacity` fits one artwork instance per *game*
      (not per artwork *success*). Blocks the rest.
- [ ] **Story 1** — Reserve + paint the placeholder texture slot
- [ ] **Story 2** — Add `placementId` to `PlacementIntentReady` / `PlacementResolved` (per-placement identity)
- [ ] **Story 3** — Place placeholders on `PlacementIntentReady`
- [ ] **Story 4** — Promote in place on `PlacementResolved`
- [ ] **Story 5** — Failure path: retire placeholder, fall through to label
- [ ] **Story 6** — Liminal: repoint to placeholder instead of leaving a stale previous occupant
- [ ] **Story 7** — Visual tuning; decide static vs. shimmer

Stories 3–5 are one reviewable unit — Story 3 without Story 5 leaves failed-artwork games showing
a permanent nameless placeholder.

## Notes / Open Questions

- **Static or animated?** v1 recommendation is a static generic case; a shimmer would need either
  per-frame texture upload (rejected) or a `LitArtworkMaterial` shader uniform (viable follow-up).
  Decide after seeing the static version in-app — the gap is often brief, and a shimmer may read
  worse than a calm box. Plan §5.
- **Instance slots are not reclaimable.** The failure path leaks one artwork instance per
  permanently-failed game because `allocateInstanceIndex()` is a monotonic counter with no
  free-list. Accepted and bounded for v1; the real fix is a free-list, which belongs with
  [Idempotent Library Scene Sync](idempotent-library-scene-sync.md) and its already-recorded
  "reconcile's unbounded slot leak". Plan §4.3.

## Related

- [`loading-placeholder-boxes-plan.md`](../plans/loading-placeholder-boxes-plan.md) — design plan;
  source of truth for mechanism, traps, and sequencing
- [Act 2 — Ready for Friends](../acts/act2-ready-for-friends.md) — where the idea was captured
- [Game Box Construction Chain](game-box-construction-chain.md) — natural tie-in if it lands (the
  placeholder occupies the interval between `ArtworkRenderRequested` and `ArtworkTextureResolved`),
  but **not** a dependency
- [Liminal Mode](liminal-mode.md) — reported the symptom; also the beneficiary of Story 6
- [Idempotent Library Scene Sync](idempotent-library-scene-sync.md) — right home for the instance
  free-list follow-up
- [`desktop-startup-load-ordering-plan.md`](../plans/desktop-startup-load-ordering-plan.md) —
  independently reached the same "show *something* for not-yet-ready slots" conclusion

---
— P1 / O2 / T1
