# Feature: Prop Placement Anchors

**Act**: 2 (Best Effort)
**Status**: 📐 Design signed off — ready to implement Stories 0–3; see
[`placement-anchor-system-plan.md`](../plans/placement-anchor-system-plan.md)
**Priority**: Medium-High (blocks nothing today; every new prop system pays for its absence)

## Goal

Give props a way to say **what they're attached to** instead of **where they ended up**, so that
when the thing they're attached to moves, they move with it — without each prop system growing its
own follow logic.

Today every placer computes an absolute world position once and never revisits it. That held while
scene geometry only changed on resize or layout switch. Liminal mode's treadmill made geometry
change continuously — shelf units recycle, the room shell translates with the camera every frame —
and every one of those cached positions is now wrong.

## The shape of it

Two attachable frames:

| Frame | Backed by | Members |
|---|---|---|
| `room` | `RoomManager`'s `roomGroup` — a real Object3D that already follows the player in liminal | the shell and its fixed features: entrance mat, back-wall title sign, lighting rig, ceiling fixtures |
| `shelf:<index>` | nothing — shelf units are GPU-instanced | corridor content: shelf-cap props, shelf signs, stickers, and (in liminal) wall posters |

Membership is not fixed per prop type — wall posters are `room` in arc/row/spoke and `shelf` in
liminal, because a poster hanging in a finite room and a poster you walk past in an endless corridor
are different relationships to the world.

There is deliberately no `world` frame. World is the space frames resolve *into*, not something you
attach to: layout definitions compute shelf positions in world coordinates and the room envelope is
fitted around them, so shelves don't anchor to world — they **are** the anchors. Naming a frame
whose semantics are "no transform applied" would just invite props to be filed there by default,
which is today's failure mode wearing an enum value. Not attaching remains the escape hatch, and
costs nothing to formalize later if evidence shows up. (Plan §3.0.)

The room frame is solved by ordinary Three.js parenting (the group already exists and already
moves — props just need to be children of it instead of siblings copying its position). The shelf
frame needs one new class, `ShelfAnchorRegistry`, that does what parenting would do if instanced
shelves had an Object3D to parent to.

### Attachment is the easy half

Transform-following alone is too rigid. A sign may need to re-render when its anchor moves, a poster
set may need to redistribute across a resized wall, a prop may need to re-pick a shelf. So the
primitive is **"your anchor changed — recompute yourself"**, with rigid transform-following as its
default implementation. Frame owners expose `onReshaped(id, callback)`, mirroring the existing
`RenderLoopRegistry` shape — not a new event type, since three events already announce discrete
geometry change.

The load-bearing constraint: **a frame notifies when its shape or membership changes, never when its
position merely drifts.** The room frame translates every frame in liminal; rigid following handles
that for free, and firing re-layout callbacks at frame rate would be a stall. Shelf recycles are
discrete (one per 2.6 m walked) and safe to re-populate on. (Plan §3.3.)

## Locked Decisions

| Decision | Resolution |
|----------|------------|
| **Scope** | Anchoring + re-population + the async content lifecycle. Slot enumeration, density, no-overlap, and aesthetic selection policy stay per-placer. |
| **`AnchorZone`** | Stays killed. The 2026-07-23 rejection of a shared zone/selection abstraction still holds — the two real placers' selection policies have nothing in common. |
| **Frame count** | Two attachable frames. No `world` frame — see above. |
| **Room frame** | Real Three.js parenting under `roomGroup`, published as `DataKey.RoomFrame`. Not a new mechanism. |
| **Shelf frame** | `ShelfAnchorRegistry` — a scene-graph container plus a callback registry, not an orchestrator; `attach()`/`resolve()`/`onReshaped()` are the same category of call as `scene.add()` and `RenderLoopRegistry.register()`. |
| **Reshape signal** | No new event type — frame owners re-broadcast the three existing discrete-change events via `onReshaped`. Position drift never notifies. |
| **Lighting's 1.0 m offset** | Deliberate (confirmed 2026-07-31). Preserved as an explicit room-local offset, not normalized away. |
| **Liminal discriminator** | **Shell vs. corridor content** — not uniform-vs-distinctive (revised 2026-07-31). Shell and its fixed features follow the camera; content placed along the corridor treadmills past. |
| **Title sign in liminal** | Stays on the back wall, which stays a fixed distance ahead. A rigid room-frame child — the simplest case, delivered by Story 1. |
| **Wall posters in liminal** | Corridor content: they travel along the side walls and recede. Shelf-frame in liminal, room-frame elsewhere. |
| **Frame is per (prop × layout)** | A prop does not pick one frame globally. Posters prove it. |
| **Composite props** | One anchor per composite, at its root — a sign is a *child of* its poster/shelf mount, never separately anchored. |
| **Activation is part of anchoring** | A reshape can mean appear / disappear / change content, not just move. The *rules* belong to the sign-rules plans; this feature owes only the seam. |
| **No shared frame abstraction** | The room and shelf frames share nothing but the word "frame". No common base class or interface. |

## Acceptance Criteria

- A prop declares a frame + local offset; its world position follows that frame automatically.
- A dependent that needs more than a new matrix can re-populate itself on reshape instead —
  including appearing and disappearing, not just moving.
- A composite prop (sign on a poster, sign on a shelf) cannot drift out of alignment, because only
  its root is anchored.
- The back-wall title sign stays on the back wall in liminal; posters travel down the side walls.
- Shelf-cap props ride a liminal recycle instead of being left behind.
- Room-anchored props stay correct across resize, layout switch, and the liminal per-frame follow.
- The liminal per-frame follow triggers **no** re-population work — measured, not assumed.
- The `centerOffset (+ STORE_FRONT_OFFSET)` arithmetic exists in exactly one place, not four, and
  lighting's deliberate 1.0 m offset survives the migration unchanged.
- User props are re-placed (not stranded) after a layout switch / re-arrange / library reload.
- Adding a new prop type requires choosing a frame — not auditing whether it needs follow logic.

## Stories / Tasks

Sequencing lives in the plan doc §5 — that's the source of truth. Summary:

- **Story 0:** publish `roomGroup` as `DataKey.RoomFrame`, plus `onReshaped` on discrete resize only.
- **Story 1:** migrate room-anchored props (entrance mat, posters, title sign, lighting) onto it;
  delete the duplicated offset math.
- **Story 2:** build `ShelfAnchorRegistry` (`attach` / `resolve` / `onReshaped`); extract
  `UserPropPlacer`'s composition math into it.
- **Story 3:** migrate `UserPropPlacer` onto the registry.
- **Story 4:** corridor-content anchoring in liminal — per-layout frame selection for wall posters,
  poster rank + recycle (Q2 below), composite-prop alignment.
- **Story 4b:** shelf-sign (de)activation on reshape — the *seam* only; visibility and content rules
  belong to [`sign-placement-rules-plan.md`](../plans/sign-placement-rules-plan.md) and
  [`layout-sign-responsibility-plan.md`](../plans/layout-sign-responsibility-plan.md). Sequence
  after those have a shape, or it'll invent rules they already own.
- **Story 5:** shared async *content*-readiness lifecycle across placers (shrunk once `onReshaped`
  absorbed the re-place half; refactor value, droppable).
- **Story 6 (deferred to a debt entry):** unify `ShelfReady` / `ShelfUnitRepositionRequested`
  behind a discriminating field, once the registry has left them with ~2 consumers instead of 7.

## Notes / Open Questions

- **The liminal discriminator is membership, not geometry (revised 2026-07-31).** An earlier pass
  split props into *uniform* (may follow the camera) and *distinctive* (must not, or they read as
  glued to the player). That was wrong: the "glued" artifact only appears when a prop's
  **surroundings don't follow with it**. The back wall *is* shell, so a sign mounted on it moves in
  lockstep with its own surface and reads as a terminus you never reach — which is the liminal
  aesthetic, not an artifact. The correct split is **shell** (follows) vs. **corridor content**
  (treadmills past). Uniformity is why the illusion holds, not the rule for choosing a frame: side
  walls being featureless along depth is exactly what lets a poster slide convincingly along a wall
  that is itself following the camera. See plan §4.1.
- **Correction:** [`bugs.md`](../bugs.md)'s title-sign entry was right all along. A previous note
  here claimed its expectation ("stays anchored to the now player-following back wall") described
  behavior nobody wanted. It's the intent. That entry needs no revision — just the Story 1 fix.
- **Q1 — resolved (2026-07-31).** Current back-wall distance already works — no change needed. The
  answer widened the requirement instead: the sign's back-wall position must hold **across every
  layout mode**, including when shelf layout shape changes (dynamic layout switching), not just in
  liminal. `computeRoomEnvelopeFromShelfBounds()` already refits room depth to shelf bounds on every
  layout run — Story 1 confirms the sign, as a rigid room-frame child, tracks that refit correctly
  everywhere, not only in liminal.
- **Q2 — resolved (2026-07-31).** Posters keep their **own** placement sequence
  (`WallPosterLayout.computeWallPosterSlots()`) rather than locking to shelf ranks — in liminal it
  just extends down the corridor instead of stopping at a finite wall. And **content cycling
  generalizes beyond liminal**: posters should cycle through the screenshot set in every layout
  mode, not only the endless corridor. That's new scope for `WallPosterPlacer` itself (today it
  fills its slots once and never revisits them, anywhere) — tracked in
  [`wall-poster-placement-plan.md`](../plans/wall-poster-placement-plan.md), not owned by this
  feature. What this feature still owns for Story 4: choosing `room` vs. `shelf` frame for the
  poster group per layout mode. **Gates only Story 4**; Stories 0–3 are unaffected.
- **Lighting's 1.0 m offset is deliberate, but currently invisible as intent.** `LightingRenderer`
  positions its group at the raw `centerOffset` while three other consumers add
  `STORE_FRONT_OFFSET` — so a deliberate offset reads as a missing line, and is one "consistency
  cleanup" away from being silently removed. Story 1 preserves it as an explicit room-local
  `z = -STORE_FRONT_OFFSET`, where the intent is legible.
- **Props riding the treadmill forever.** A shelf-attached prop follows its unit as that unit
  recycles, so the player sees the same handful of props cycling past. Correct per frame semantics,
  and consistent with how the shelves themselves recycle. Not solving it in v1.

## Related

- [`placement-anchor-system-plan.md`](../plans/placement-anchor-system-plan.md) — the plan; source of
  truth for everything below the Locked Decisions table above
- [Liminal Mode](../features/liminal-mode.md) — the mode that forced the issue
- [`liminal-props-must-follow-player`](../tech-debt.md#id-liminal-props-must-follow-player) — the
  debt entry whose "audit every prop system" prescription this feature replaces
- [Scene Clutter & Props (harvested)](scene-clutter-and-props.md) ·
  [Fabricated Set Dressing](fabricated-set-dressing.md) — both named "where fixtures go" as the real
  unbuilt engineering; both consume this
- [Wall Art & Framed Posters](wall-art-framed-posters.md) / [User Prop Folder](user-prop-folder.md)
  — the two real placers this design was extracted from

---
*— P1 / O2*
