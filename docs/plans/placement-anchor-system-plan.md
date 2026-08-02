# Placement Anchor System — Plan

**Status**: Design — ready for sign-off, not yet implemented
**Feature doc**: [Prop Placement Anchors](../features/prop-placement-anchors.md)
**Supersedes**: this file's previous contents ("Placement Commonality — Deferred Survey", 2026-07-23).
The survey deferred designing anything until **two or more real placers existed side by side**.
That trigger has now fired — see §1. The survey's code grounding is preserved in §2.

---

## 1. Why now (the deferral trigger, and what it was missing)

The 2026-07-23 decision was right for its evidence: one real placer (`UserPropPlacer`) plus a
wishlist is not enough to generalize from. Two things changed.

**Real placers now exist to compare.** `WallPosterPlacer` shipped. Counting anything that decides
where a non-game-box object goes, there are now four independent implementations:

| | `UserPropPlacer` | `WallPosterPlacer` | entrance mat (`StorePropsCoordinator`) | title sign (`SceneSignManager`) |
|---|---|---|---|---|
| Surface | shelf top cap | wall face | floor | back wall |
| Geometry source | `ShelfReady` stream | `RoomResized` | `RoomResized` | `RoomResized` |
| Slot enumeration | one per shelf index | `computeWallPosterSlots` per wall | single | single |
| Occupancy | `usedShelfIndices` | sequential fill index | — | — |
| Selection policy | weighted random (front/center bias + repulsion) | ordered fill (back wall first) | — | — |
| Async content | `pendingShelfProps` queue | `hasStartedBuild` / `contentReady` pair | none | none |
| Invalidation | clears anchors on 3 events | `lastLayoutKey` dedupe | dimension-equality guard | rebuild |
| World anchoring | absolute, computed once | absolute, computed once | absolute, computed once | absolute, from a cached `roomWorldOffsetZ` |

**Liminal mode broke the last row for all four of them at once.** Every one of them computes an
absolute world position exactly once and never revisits it. That was fine while geometry changed
only on resize or layout switch. Under liminal's treadmill, geometry changes *continuously*: shelf
units recycle to new ranks (`ShelfUnitRepositionRequested`), and `RoomManager` translates its whole
shell with the camera every frame. Anything holding a stale absolute position is left behind.

That is exactly the debt already recorded — [`liminal-props-must-follow-player`](../tech-debt.md#id-liminal-props-must-follow-player),
whose own note says *"Documented so the next liminal pass (or anyone adding a new prop system)
knows to check 'does this need to follow the player'"* — plus the open
[STEAM LIBRARY title sign bug](../bugs.md). Both are symptoms of the same missing concept, and the
debt entry's framing ("audit each system, per system, forever") is the thing this plan replaces.

**Note what is *not* being generalized.** The killed 2026-07-23 proposal was a shared
`AnchorZone`/`AnchorZoneRegistry` covering slot enumeration, density, and aesthetic selection
policy. That is still premature and still rejected — the two real placers' selection policies
(weighted random with spatial repulsion vs. ordered back-wall-first fill) have nothing in common
and should stay per-placer. This plan extracts only the two things the evidence actually supports:
**what a position is anchored to**, and **the async place/re-place lifecycle**.

---

## 2. Code grounding (carried forward from the survey, re-verified)

- **Room geometry** (`client/src/scene/RoomManager.ts`): one generic, config-driven room shape —
  four `PlaneGeometry` walls + floor + ceiling, all children of a single `roomGroup`
  (`RoomManager.ts:111`). Geometry becomes knowable when `RoomEventTypes.Resized` fires
  (`{dimensions, shelfLayout, centerOffset}`), computed in `computeRoomEnvelopeFromShelfBounds()`
  (`RoomManager.ts:52-83`).
- **Shelf layout** (`props/shared/ILayoutDefinition.ts` + `LayoutRegistry.ts`): a strategy pair per
  layout mode (arc/row/spoke/liminal). World space is meters, player at origin facing -Z, Y-up.
  `ShelfLayoutCoordinator` emits one `ShelfReadyEvent` per shelf plus a final
  `ShelfLayoutDeterminedEvent`.
- **Every prop hardcodes its own position math, self-contained per prop type.** Still true, and
  still the right default for *selection*. It is the wrong default for *anchoring*.
- **Liminal mode is now built** (Stories 0–5 landed; the treadmill recycles via
  `LiminalWindowCoordinator.advance()`). The survey's line "liminal mode is designed but not built"
  is obsolete, as is its near/far-projected shading note — that split was dropped from liminal v1.

### Three findings worth stating outright

**(a) The room-offset arithmetic is hand-rolled in four places.**
`RoomResizedEvent.centerOffset` is deliberately published in *pre-offset* coordinates, leaving each
consumer to add `RoomConstants.STORE_FRONT_OFFSET` itself. Three do:

- `StorePropsCoordinator.ts:180-182`
- `WallPosterPlacer.ts:142-144`
- `SceneSignManager.ts:135-136`

`LightingRenderer.applyLightingGroupOffset()` (`LightingRenderer.ts:491-495`) does **not** — it sets
`lightingGroup.position` to the raw `centerOffset`, leaving the lighting rig 1.0 m in Z from the room
it lights. **Confirmed deliberate** (2026-07-31): the lighting offset is intentional, not drift.
Which is the sharper version of the problem — an intentional 1.0 m difference is currently
indistinguishable from a missing line, because it is expressed as *the absence of arithmetic every
sibling performs* rather than as a stated offset. Under this plan lighting becomes a room-frame
child at an explicit local `z = -STORE_FRONT_OFFSET`, where the intent is legible and a future
reader can't "fix" it by adding the line back.

**(b) `UserPropPlacer` never re-places props after an invalidation.**
`handleShelfAnchorsInvalidated()` (`UserPropPlacer.ts:166-169`) clears `shelfAnchors` and
`usedShelfIndices` on layout switch / re-arrange / library reload — but nothing removes or moves the
models already added to `propsGroup`, and `placeModel()` only ever runs from a GLB-load. After a
layout switch, previously placed user props sit at world positions belonging to a layout that no
longer exists. Not liminal-specific; liminal just makes it continuous instead of occasional.

**(c) `ShelfReady` and `ShelfUnitRepositionRequested` carry an identical payload for an identical
fact.** Both mean "shelf N is now at transform T". They are split only because `ShelfReady` with
`shelfIndex === 0` is *overloaded* to also mean "a fresh layout wave started" — see
`ShelfUnitRepositionRequestedEvent`'s own doc comment (`PropsEvents.ts:106-112`). The overloading is
the actual smell; see §6 for why this plan deliberately doesn't fix it yet.

---

## 3. The design

> **An anchor is not a position. It is a frame plus a local offset, resolved lazily.**

If a prop declares *what it is attached to* rather than *where it ended up*, then when the frame
moves the prop moves for free — no per-frame follow code per prop system, and no "audit every prop
system" pass the next time a mode moves the world.

There are exactly **two** attachable frames:

| Frame | Backed by | Moves when | Members |
|---|---|---|---|
| `room` | `RoomManager`'s `roomGroup` — **an Object3D that already exists and already follows** | room resize; every frame in liminal | the shell, and fixed features *of* the shell: entrance mat, back-wall title sign, lighting rig, ceiling fixtures |
| `shelf:<index>` | nothing — shelf units are GPU-instanced, there is no Object3D to parent to | layout run; every liminal recycle | corridor content: shelf-cap props, shelf signs, stickers, game boxes |

Membership is **not** fixed per prop type — see §4.3(A). Wall posters are `room` in arc/row/spoke
and `shelf` in liminal, because a poster hanging in a finite room and a poster you walk past in an
endless corridor are genuinely different relationships to the world.

### 3.0 Why there is no `world` frame

An earlier draft of this plan listed a third `world` frame for "genuinely static things." Working
out its membership emptied it, and the reason is worth stating because it sharpens what the other
two frames are.

**World isn't a frame you attach to — it's the space frames resolve into.** Layout definitions
compute shelf positions in world coordinates (player at origin, facing -Z, Y-up); the room envelope
is *fitted around* those shelves by `computeRoomEnvelopeFromShelfBounds()`. So the world is where
shelves and the player live, and the room is a derived envelope that, in liminal, decouples from
that envelope and follows the camera instead.

Which means the shelves don't *anchor to* world — they **are** the anchors, and world is the
coordinate system their transforms are expressed in. Nothing else in the scene wants to be pinned
to absolute world space and simultaneously excluded from the room: the skybox is camera-relative by
construction, ambient and directional light are position-independent, and game boxes belong to
shelves.

Declaring `world` anyway would cost real clarity — a frame whose semantics are "no transform is
applied" invites props to be filed there by default, which is precisely today's every-prop-computes-
its-own-absolute-position failure wearing an enum value. If something later genuinely needs to be
left behind in world space (a marker at the store entrance as you walk into the void, say), the
escape hatch already exists and requires no API: don't attach, position directly. That is what
100% of props do today. Adding `world` back is a one-line change if evidence ever shows up.

The two remaining frames get very different treatments, and that asymmetry is the whole plan.

### 3.1 The room frame is almost free

`roomGroup` is already a `THREE.Group`, already positioned at the room's true origin, and already
translated per frame by `RoomManager.onFrame()` while liminal is active. Everything above is
currently `scene.add()`-ed and manually offset to *match* that group's position.

Parent them to it instead:

1. `RoomManager` publishes `roomGroup` under a new `DataKey.RoomFrame` (same pattern as
   `DataKey.MainScene` / `DataKey.MainCamera`).
2. Room-anchored props `roomFrame.add(obj)` and set **room-local** coordinates.
3. Delete the four copies of the `centerOffset (+ STORE_FRONT_OFFSET)` arithmetic. Room-local *is*
   the offset.

Three.js propagates the transform. `RoomManager`'s existing liminal follow carries every child
automatically. This closes the title-sign bug and the lighting bullet of
`liminal-props-must-follow-player` without either system growing follow logic of its own, and
resolves finding (a) by construction — there is only one transform left, and it lives in one place.

### 3.2 The shelf frame needs the one new piece

Shelf units are `InstancedMesh` entries. There is no per-unit Object3D, which is why
`UserPropPlacer.positionModelOnShelf()` composes the shelf quaternion with a local offset by hand —
its own comment calls this *"the equivalent of parenting the prop to the shelf transform"*.

Build the thing that comment is describing:

**`ShelfAnchorRegistry`** (`client/src/scene/shelves/ShelfAnchorRegistry.ts`) — *`Object3D.add()`
for shelves that don't have an Object3D.*

- Subscribes to **both** `ShelfReady` and `ShelfUnitRepositionRequested`; maintains
  `Map<shelfIndex, {position, rotationY}>` as the single authority on where each shelf currently is.
- `attach(shelfIndex, localOffset, object3D)` — registers an attachment and positions it now.
- On any transform change for a shelf index, re-resolves and re-applies every attachment on it.
- `resolve(shelfIndex, localOffset)` — the composition math, extracted verbatim from
  `UserPropPlacer.positionModelOnShelf()`, for callers that want a position without an attachment
  (instanced game boxes, which can't hand over an Object3D).
- On a fresh layout wave, drops attachments for shelves that no longer exist.

Being the only class that subscribes to both events, it is also the only place that needs to know
they mean the same thing — which is most of finding (c)'s value without paying finding (c)'s cost.

**On the event-driven rules.** `attach()` is a direct method call, and CLAUDE.md forbids those
*between orchestrators and handlers*. This is not that: `ShelfAnchorRegistry` is a scene-graph
container plus a callback registry, the same category as `scene.add()`, `roomGroup.add()`, or
`RenderLoopRegistry.register(id, callback)` — it holds resources and notifies subscribers, it does
not coordinate behavior. §3.3 makes the notifier half explicit.

### 3.3 Rigid and loose: attachment is the easy half

Transform-following is not enough. A sign whose anchor moved may need to re-render; a poster set
may need to re-lay-out across a wall that changed size; a prop may need to re-pick which shelf it
sits on. That is a strictly larger job than "apply a new matrix," and it's the one the current code
does worst — it's finding (b) (`UserPropPlacer` never re-places) and it's `WallPosterPlacer`'s
hand-rolled `lastLayoutKey` re-layout.

So the primitive is **"your anchor changed — recompute yourself,"** and rigid transform-following is
merely its default implementation:

| | Rigid | Loose |
|---|---|---|
| Dependent does | nothing; transform propagates | runs its own callback: re-layout, re-select content, re-render, re-pick a slot |
| Cost | ~free | arbitrary |
| Fits | a prop bolted to one spot on one shelf | a *set* of things distributed over a surface |
| Today | absent | hand-rolled per placer, incompletely |

**The signal is not a new event.** Three events already announce discrete geometry change —
`RoomResized`, `ShelfReady`, `ShelfUnitRepositionRequested` — and adding a fourth that means the
same thing is exactly what "Survey before you extend" forbids. Instead the frame owners (which
already subscribe to those three) expose a subscription in the shape `RenderLoopRegistry` already
established: `onReshaped(id, callback)` / `offReshaped(id)`. One place still knows those events mean
the same thing; dependents never re-implement subscribe → look up → recompose.

#### The frequency trap

These two must not share a channel, and getting it wrong is the failure mode most likely to reach
production as a frame-rate cliff:

- **Continuous transform drift** — the room frame's per-frame liminal follow
  (`RoomManager.onFrame()`). Rigid following handles this for free, because Three.js parenting
  already propagates it. It must **never** fire a loose notification: re-laying-out the poster wall
  every frame while walking is a stall, not a feature.
- **Discrete reshape** — room resize, a fresh layout wave, a shelf recycle. *This* is what
  `onReshaped` announces.

Liminal's recycle is comfortably discrete — one crossing per `CORRIDOR_UNIT_SPACING_Z` (2.6 m)
walked, throttled further by `LiminalBoundaryTracker`'s check interval and hysteresis — so shelf
attachments can safely re-populate on it. The rule that falls out: **a frame notifies when its
*shape or membership* changes, never when its position merely drifts.**

#### What loose buys

- Finding (b) stops being its own story — `UserPropPlacer` re-places because it's a subscriber, not
  because someone remembered to add a handler.
- `WallPosterPlacer`'s `hasStartedBuild` / `contentReady` / `lastLayoutKey` machinery collapses into
  a callback plus the shared async lifecycle, absorbing most of Story 5.
- Story 4's corridor-content anchoring becomes expressible at all: a poster set that redistributes
  itself down the corridor as slots recycle is a loose dependent, and cannot be built with rigid
  attachment alone.
- Shelf signs get their **(de)activation** path — §4.3(C). A reshape may mean appear, disappear, or
  change content, not just move; only the loose path can express that.

### 3.4 What the two frames deliberately do *not* share

No common base class, no `IPlacementFrame` interface, no registry-of-registries. The room frame is
"use Three.js parenting, which already works"; the shelf frame is "emulate parenting where Three.js
can't". Unifying two things whose entire content is *"one of these has an Object3D and one doesn't"*
would produce an abstraction with no behavior in it.

---

## 4. Shell vs. corridor content — the discriminator that actually works

> **Revised 2026-07-31.** An earlier version of this section proposed a *uniform vs. distinctive*
> split: uniform geometry follows the camera, distinctive props must not (because they'd read as
> glued to the player). That taxonomy was wrong, and it produced a wrong conclusion about the title
> sign. Both are corrected below; the original reasoning is preserved only where it still holds.

The corrected requirements are:

1. Screenshot posters travel along the side walls, receding as the player walks — with their own
   signs staying aligned to them.
2. Shelf signs stay aligned to a specific shelf and are activated/drawn with it as it advances.
3. **The STEAM LIBRARY sign stays on the back wall**, which stays a fixed distance ahead in the
   treadmill.

### 4.1 Why "distinctive" was the wrong discriminator

Requirement 3 is a *distinctive* prop that *should* follow the camera — which the old taxonomy
declared impossible. The old argument ("a sign pinned to a following frame reads as glued to the
player") is only true when the prop's **surroundings don't follow with it**. The back wall *is*
shell: it follows, so a sign on it moves in lockstep with the surface it's mounted to, and reads as
a wall you never reach rather than a sign stuck to your face. Walking toward an unreachable terminus
is the liminal aesthetic, not an artifact.

So the discriminator is not geometry, it is **membership**:

| | Shell | Corridor content |
|---|---|---|
| What it is | the room envelope and anything that is a *fixed feature of* it | things placed *along* the corridor that the player travels past |
| Liminal behavior | follows the camera | treadmills past, recycling like shelves |
| Members | floor, ceiling, walls, **the back-wall title sign** | shelf units, game boxes, shelf signs, **wall posters + their signs** |
| Frame | `room` (rigid parenting) | `shelf:<index>` |

Uniformity still matters — but as the reason the *illusion* holds, not as the rule. The side walls
being uniform along depth is exactly what lets a poster slide along them convincingly while the wall
itself follows the camera. The poster is not parented to the wall it appears to hang on; it's
corridor content that happens to be rendered at the wall's X. That only looks right because the wall
has no depth-varying features to disagree with it.

### 4.2 What this corrects

**The title sign is Story 1, not Story 4.** It is a rigid room-frame child — the simplest case in the
whole plan, and one that Stories 0–1 already deliver with no depth-slot machinery at all.

**`docs/bugs.md`'s stated expectation was right and my previous note was wrong.** "Sign stays
anchored to the (now player-following) back wall" is exactly the intent. Retracting the claim that
it "describes behavior nobody wants" — that entry needs no revision, just the fix.

### 4.3 Three assumptions this unwinds

**(A) A prop does not pick one frame — frame is (prop type × layout mode).** Wall posters are
`room`-frame in arc/row/spoke (finite room, walls don't move, posters hang on them) and
`shelf`-frame in liminal (endless corridor, posters are content you travel past). The plan
previously assumed a prop declares its frame once, globally. It can't. `WallPosterPlacer` needs a
per-layout anchoring decision, which is a real addition to Story 4's scope and a reason not to
collapse it into Story 1.

**(B) Anchors nest, and the alignment requirement depends on it.** Requirement 1 wants a sign to stay
aligned to its poster, and requirement 2 wants a sign aligned to its shelf. The safe construction is
composition, not sibling attachment: build the sign as a **child of the poster's `THREE.Group`**
(`buildPosterFrame` already returns one) and attach only the *poster* to the frame. Three.js keeps
them aligned by construction. Attaching sign and poster separately to the same frame would work
today and drift the first time either gains an offset. Worth stating as an invariant:
**one anchor per composite prop, at its root.** For the shelf-sign case the same rule applies via
`ShelfAnchorRegistry.resolve()` — the sign composes off the shelf transform, not off a
independently-resolved position.

**(C) Anchoring is not only about transform — activation is part of the contract.** Requirement 2
says shelf signs should be "(de)activated & drawn with" their shelf. So a reshape can mean *appear*,
*disappear*, or *change content*, not just *move*. This is what §3.3's loose `onReshaped` path is
for, and it makes that path load-bearing rather than a nicety. The *rules* for when a shelf sign
should be drawn are explicitly out of scope here — they belong to
[`sign-placement-rules-plan.md`](sign-placement-rules-plan.md) and
[`layout-sign-responsibility-plan.md`](layout-sign-responsibility-plan.md). What this plan owes them
is the seam: a shelf-anchored dependent that is told "your shelf changed" and may respond by
re-evaluating visibility and content, not merely by moving.

### 4.4 Open questions

Neither gates Stories 0–3.

**Q1 — resolved (2026-07-31): current behavior is correct, and the requirement is broader than
liminal.** The back wall sitting a fixed distance ahead already works as intended — no liminal
shell-depth change needed; §4's speculative "vanishing point" tuning question is dropped. What the
answer adds: **the title sign's back-wall position is a cross-layout invariant, not a liminal
special case** — it must hold in arc/row/spoke too, *including when shelf layout shape changes*
(dynamic layout switching, per [Layout Variations](../features/layout-variations.md)). Concretely:
`computeRoomEnvelopeFromShelfBounds()` refits the room envelope to the shelf bounds on every layout
run, so the room-frame's own depth already changes with layout shape — Story 1 must confirm the
sign (as a rigid room-frame child) tracks that refit correctly in every mode, not just verify it once
in liminal and assume the rest follow.

**Q2 — resolved (2026-07-31): posters keep their own placement identity; cycling generalizes beyond
liminal.**

- *Anchoring*: posters are **not** attached to shelf ranks. They keep the sequence they already have
  — `WallPosterLayout.computeWallPosterSlots()`, wall-relative slots with their own spacing — rather
  than inheriting shelf density. In liminal this sequence extends down the corridor walls instead of
  terminating at the (now-notional) side walls of a finite room; the anchor is still `shelf`-frame in
  the sense of "corridor content that recedes," but the *slot geometry* stays the poster placer's own,
  not `LiminalCorridorLayout`'s.
- *Cycling*: **posters cycle in every layout, not only liminal.** This is a real scope change, not a
  restatement — today `WallPosterPlacer` fills its slots once from `selectPosterScreenshots()` and
  never revisits them, in every mode. The requirement makes content cycling a `WallPosterPlacer`
  property in its own right (finite screenshot set, ring-addressed, recurring regardless of whether
  the walls it's mounted on are finite or endless), with liminal only affecting how far the sequence
  of *positions* extends, not whether *content* loops. Mechanically the same ring shape as
  `LiminalWindow`/`LibraryRing` (mod-index over the screenshot set), but this plan does not own
  building it — it belongs to `WallPosterPlacer` itself, per [Wall Poster Placement
  Plan](wall-poster-placement-plan.md), which should be revisited alongside Story 4 rather than
  folded into it.

Net effect on Story 4: it no longer needs to invent poster slot geometry or a recycle mechanism —
both already exist or are already scoped elsewhere. What Story 4 actually owns is narrower than
originally framed: choosing `room` vs. `shelf` frame per layout mode for the poster *group*, and
wiring reshape notifications so re-anchoring happens on a layout/mode switch.

---

## 5. Story sequence

| # | Story | Scope | Closes |
|---|---|---|---|
| 0 | Publish the room frame | `DataKey.RoomFrame`; `RoomManager` publishes `roomGroup`, plus `onReshaped` on discrete resize only (never on the per-frame follow) | — |
| 1 | Migrate room-anchored props to the frame | entrance mat, **title sign** (rigid — §4.2), lighting rig (explicit local `-STORE_FRONT_OFFSET`), non-liminal wall posters; delete 4 copies of the offset arithmetic | bug: title sign; debt: lighting bullet; finding (a) |
| 2 | `ShelfAnchorRegistry` | new class + tests; `attach`/`resolve`/`onReshaped`; extract composition math out of `UserPropPlacer` | — |
| 3 | Migrate `UserPropPlacer` onto the registry | shelf-cap props ride the treadmill; re-place on reshape | debt: "any other prop" bullet; finding (b) |
| 4 | Corridor-content anchoring in liminal | per-layout (`room` vs `shelf`) frame selection for the poster group (§4.3 A); composite-prop alignment invariant (§4.3 B). Poster slot geometry and content cycling are **not** built here — see Q2 | requirements 1 + 2 |
| 4a | *(tracked in [`wall-poster-placement-plan.md`](wall-poster-placement-plan.md), not this plan)* | `WallPosterPlacer` content cycling, generalized to every layout mode, per Q2 | — |
| 4b | Shelf-sign (de)activation on reshape | the *seam* only — visibility/content **rules** stay with the sign-rules plans (§4.3 C) | requirement 2 |
| 5 | Shared async content-readiness lifecycle | the "content arrives async, slots arrive async, act when both exist" shape — `pendingShelfProps` and the `hasStartedBuild`/`contentReady` pair | what's left of placer duplication after §3.3 |
| 6 | *(deferred — debt entry, not this plan)* | unify `ShelfReady` / `ShelfUnitRepositionRequested` behind a discriminating field | finding (c) |

Stories 0–3 are the load-bearing sequence, depend on nothing still open, and can land as one PR or
two — and Story 1 now closes the title-sign bug outright, since that turned out to be the rigid
case. Story 4 gates on Q2 (§4.4). Story 4b gates on nothing here but should sequence *after* the
sign-rules work has a shape, or it will invent rules that plan already owns. Story 5 shrank once
`onReshaped` (§3.3) absorbed the re-place half of it — what remains is only the async *content*
side, which is genuinely smaller and still droppable.

### On Story 6

After Story 3, `ShelfUnitRepositionRequested` has exactly **one** remaining subscriber
(`InstancedShelfRenderer`), because everything else goes through the registry. Unifying the two
events behind an explicit field — which is what CLAUDE.md's "prefer a discriminating field over a
sibling event" rule asks for, and which would also retire the `shelfIndex === 0` overloading — costs
7 consumers today and roughly 2 afterward. Naming it here rather than doing it now, and noting that
doing it *before* Stories 0–3 is the worse order.

## 6. Tests

- `ShelfAnchorRegistry`: composition math matches `UserPropPlacer`'s current output for the same
  inputs (a characterization test written **before** the extraction, so the refactor is provably
  behavior-preserving); an attached object follows a `ShelfUnitRepositionRequested`; attachments for
  vanished shelves are dropped on a fresh layout wave.
- Room frame: a child's *world* position tracks `roomGroup` across a liminal follow tick; the
  migrated entrance mat / poster / sign / lighting rig land at the same world positions as before
  the migration (again, characterize first — lighting's 1.0 m offset is deliberate and must survive
  unchanged).
- **The frequency trap (§3.3), asserted directly**: a `RoomManager.onFrame()` liminal follow tick
  fires **zero** `onReshaped` callbacks, while a genuine resize fires exactly one. This is the test
  most worth writing — it's the only one guarding a failure that shows up as a frame-rate cliff
  rather than a wrong pixel.
- Regression for finding (b): after `LayoutRequested`, an already-placed user prop is re-placed,
  not stranded.

## 7. Risks

- **Silent Z shift on migration.** Lighting's 1.0 m offset is deliberate, so the migration must
  carry it across as an explicit local offset rather than normalizing it away — the risk is a
  well-meaning "consistency" cleanup, in this pass or a later one, that quietly relights the room
  from the wrong place. Characterize the four world positions before touching any of them.
- **The frequency trap (§3.3) is the real performance risk.** Wiring the room frame's per-frame
  liminal follow into `onReshaped` would re-run every dependent's re-layout at frame rate. It would
  look correct and profile terribly. Guarded by an explicit test, above.
- **Story 4 is aesthetic, not mechanical** — it can't be validated by tests, only by walking the
  corridor.
- **Attachment lifetime.** The registry holds Object3D references and callbacks; anything disposing
  props must detach, or the registry keeps them alive. Bounded and obvious, but real — and the
  callback half is the easier one to leak, since a stale `onReshaped` subscriber does work rather
  than merely occupying memory.

## 8. Non-goals

- Slot enumeration, density rules, no-overlap constraints, and aesthetic selection policy stay
  per-placer. The `AnchorZone` idea killed in 2026-07-23 stays killed.
- No new prop types, no new placers.
- No change to how game boxes resolve placement (they already repoint through
  `PlacementRepointRequested`); the registry only offers them `resolve()` if it turns out useful.

## 9. Related

- [Prop Placement Anchors](../features/prop-placement-anchors.md) — feature doc
- [Liminal Mode](../features/liminal-mode.md) · [`liminal-mode-plan.md`](liminal-mode-plan.md) — the
  mode that forced the issue
- [`liminal-props-must-follow-player`](../tech-debt.md#id-liminal-props-must-follow-player) — the
  debt entry this plan replaces per-system auditing for
- [Scene Clutter & Props (harvested)](../features/scene-clutter-and-props.md) ·
  [Fabricated Set Dressing](../features/fabricated-set-dressing.md) — both flagged "where fixtures
  go" as the real unbuilt engineering; both link here
- [Wall Poster Placement Plan](wall-poster-placement-plan.md) — the second real placer, which made
  this comparison possible
- Code: `RoomManager.ts`, `shelves/ShelfLayoutCoordinator.ts`, `props/UserPropPlacer.ts`,
  `props/wall-art/WallPosterPlacer.ts`, `props/StorePropsCoordinator.ts`, `SceneSignManager.ts`,
  `LightingRenderer.ts`, `liminal/LiminalWindowCoordinator.ts`

---
*— P1 / O2*
