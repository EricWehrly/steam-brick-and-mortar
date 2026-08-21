# Plan: Game Box Fold-Open Interaction

## Goal

Replace the flat 2D detail overlay (`BinderGameDetailPanel`, opened via
`GameLibraryBinderUI.onGameSelected`) — which doesn't render at all in VR (see `docs/bugs.md`'s
"Game detail overlay doesn't render in the VR view") — with a single in-scene 3D interaction that
works identically on flatscreen and in headset: selecting a game box "summons" a standalone,
non-instanced box model that appears near the player's hand (VR) or in front of the camera
(flatscreen) and unfolds into a flat spread showing distinct content per face. Closes the VR half
of [Game Detail Screen](../features/game-detail-screen.md) and the "Game-box open interaction
redesign" item recorded in [`vr-support-plan.md`](vr-support-plan.md)'s "Next up" addendum.

## Current state (confirmed via code survey, 2026-08-10)

- Game boxes on shelves are GPU-instanced (`GpuGameBoxRenderer` / `LodGameArtworkRenderer` /
  `InstancedLabelRenderer`) — there is no per-instance `THREE.Object3D` to "pull off the shelf." A
  single instance can't be individually detached, animated, or hidden without new per-instance
  bookkeeping the instancing layer doesn't have today.
- Selection already works everywhere it needs to. `SceneClickGameBoxRaycast` resolves a raycast hit
  (mouse NDC, gamepad/keyboard center-screen reticle, or — per the VR controllers plan — the real
  controller ray) to an `appid` and emits `GameEventTypes.Selected` (`{ appid }`). Confirmed working
  in VR by real-headset testing ("grabbing a game" verified). This plan changes nothing upstream of
  that event.
- The only consumer of `GameEventTypes.Selected` today is `GameLibraryBinderUI.onGameSelected`,
  which calls `openGameDetail(appid)` → looks the game up in
  `DataManager.get<SteamGameData[]>('steam.games')` → `BinderGameDetailPanel.show()`, a flat
  DOM/CSS overlay (`ui-slot-center` / `binder-detail-panel`). DOM overlays are camera-relative
  screen-space content — they have no representation in a WebXR session's headset-only render
  surface at all, which is the entire bug.
- `GameLibraryBinderUI` has a **second**, independent use of the same detail panel: clicking a game
  slot while manually browsing the open binder (`selectGame()`). That path isn't tied to shelf
  selection or VR grabbing at all — see Non-goals.
- No tween/animation library exists in this codebase. Per-frame animation is hand-rolled via
  `RenderLoopRegistry.register(id, callback)` (self-registering — the same "owner subscribes to the
  tick it needs" pattern `XRControllerManager.update()` established this session) or ad-hoc lerps.
  This plan follows the same convention, no new dependency.
- `XRControllerManager` tracks per-index controller/grip `THREE.Group`s and, via
  `resolvePrimaryControllerIndex()`, already knows which hand's trigger is held at raycast time —
  but it only exposes a derived ray (`getPrimaryControllerRay()`), not the grip `Object3D` itself.
  Needed here so the fold-box can be *parented* to the real grip (transform follows the hand for
  free — same precedent as controllers/camera rig) rather than re-tracked every frame.
- `DataManager`/`DataKey` (`DataDomain.Scene`) is the established way to publish a scene singleton
  for other classes to lazy-resolve — already used for `MainScene`/`MainCamera`/`MainCameraRig`/
  `XRControllerRaySource`, and reused here the same way.

## Design

### 1. `GameBoxFoldModel` — the box geometry (new file, `client/src/scene/game-box-fold/GameBoxFoldModel.ts`)

A plain `THREE.Group` builder, no events/globals — a display object only, the same role
`InstancedLabelRenderer`'s geometry code plays but non-instanced:

- **Center panel**: a thin `THREE.Mesh` (`THREE.BoxGeometry`, matching the shelf box's proportions
  — reuse whatever `SharedPropsUtils`/`LodGameArtworkRenderer` already define for box width/height
  so the summoned box doesn't visually mismatch the shelf) with a per-face material array. Front
  face = the game's existing box-art texture (already resolved for the shelf instance — reuse,
  don't refetch, see §3). This mesh never moves once summoned; it's the anchor everything else is
  parented to, and the thing actually attached to the hand/camera.
- **Left/right wing panels**: each its own thin `THREE.Mesh` (same `BoxGeometry` shape, narrower),
  parented to a **hinge `THREE.Group`** positioned at the corresponding vertical edge of the center
  panel. The hinge's local Y rotation is the single open/close parameter: `0` = closed, wing flush
  against the center panel with its *outer* face showing (contiguous with the center panel's front
  artwork, so the closed box reads as one solid cover); `π` = fully open, wing now coplanar with the
  center panel but rotated so its *inner* face — hidden while closed — now faces the player. This
  is a literal gatefold: opening the box reveals the two previously-hidden inner faces plus the
  always-visible center front, giving exactly the "3 distinct faces" asked for, and matches the
  user's own framing that the flap's *back* is what shows once open.
- **`setOpenAmount(t: number)`** (`t` in `[0,1]`): sets both hinges' rotation to `t * Math.PI`,
  called every frame by the coordinator (below) while animating. The model itself owns no
  animation/timing logic — just a pure function of its current open amount, keeping it trivially
  unit-testable.
- **Content**: each of the 3 visible faces (center-front, left-inner, right-inner) takes an
  independent `THREE.Texture`. For this plan, content is a placeholder: center reuses the existing
  box-art texture, left/right render a canvas-based placeholder panel (reuse
  `GameBoxTextureManager`'s existing canvas-label technique — the same one `InstancedLabelRenderer`
  already uses for text-on-a-box) showing game name/genre/playtime as a stand-in. **What actually
  belongs on the 3 faces is an explicit design decision the user deferred** ("design what we'll put
  in there once we've accomplished the technical") — not blocking this plan, tracked as an open
  question below.
- **`setContent(game)`**: since the model is pre-warmed and reused (see §2), this is the one method
  that changes per-selection. It redraws into the *same* canvas/texture objects created at
  construction (`ctx.clearRect` + redraw, `texture.needsUpdate = true`) rather than allocating new
  `THREE.CanvasTexture`s per selection — the actual mechanism behind "as instantaneous as we can
  manage."
- **4th-face extensibility (explicitly not built now)**: each wing panel is its own `BoxGeometry`
  mesh with front+back material slots already structurally present (just unused) hanging off its
  own hinge `THREE.Group`, so a second-stage flip — continuing one wing's rotation past `π`, or
  nesting a second hinge under it — is an additive change to `GameBoxFoldModel` later, not a
  rewrite. Left un-implemented until the 3-face version is validated; see Non-goals.

### 2. `GameBoxFoldCoordinator` — lifecycle, animation, hand attachment (new file, `client/src/scene/game-box-fold/GameBoxFoldCoordinator.ts`)

Owns exactly one summoned box at a time — selecting a new game while one is open replaces it, no
stacking. The box is **pre-warmed**: built once, up front, and reused for every selection, so
"swap in" is as close to instantaneous as this can get — no geometry/material/texture allocation
sits on the selection hot path.

- Constructor builds a single `GameBoxFoldModel` immediately (closed, untextured or
  placeholder-textured) and keeps it alive — parented nowhere yet, or parked hidden — for the
  lifetime of the coordinator. This is the only construction that ever happens; everything below
  reuses this one instance.
- Also registers for `GameEventTypes.Selected` and `InputEventTypes.CancelPressed` (same dismiss
  binding `GameLibraryBinderUI` already uses for its own panel/binder — keyboard Escape, gamepad
  B/Circle; VR has no mapped Cancel yet, see open questions, not a launch blocker since
  desktop/gamepad dismiss works day one).
- `onGameSelected({appid})`:
  1. Look up the `SteamGameData` the same way `GameLibraryBinderUI.openGameDetail` does today
     (`DataManager.get<SteamGameData[]>('steam.games')` + find by appid) — same lookup, not a new
     mechanism. Worth extracting into a shared `findGameByAppid()` helper once there's a third
     consumer of this exact snippet; not required to land this plan.
  2. Re-texture the pre-warmed `GameBoxFoldModel` in place for the newly selected game (see §1's
     content note — reuse the same canvas/texture objects and redraw, rather than allocating new
     ones per selection) and reset it closed (`t=0`). If a box is already open for a different
     game, this interrupts/replaces it directly — no separate teardown-then-rebuild cycle.
  3. Resolve an anchor to attach to:
     - **XR session active**: `XRControllerManager` gains
       `getPrimaryControllerGrip(): THREE.Object3D | null` (mirrors `getPrimaryControllerRay()`'s
       hand-resolution logic, returning the actual grip `Group` instead of a derived ray) — the
       fold box parents directly onto that grip, at a small local offset so it doesn't clip into
       the controller model. Parenting means zero per-frame position code is needed for "follows
       the hand," same precedent as the controller/grip parenting itself.
     - **No XR session (flatscreen/gamepad/keyboard)**: parent to the main camera
       (`DataManager.get<THREE.Camera>(DataKey.MainCamera)`, same lazy-resolve idiom
       `SceneClickGameBoxRaycast`/the movement-fix addendum already use) at a fixed near-camera
       local offset — the "held in front of you" flatscreen equivalent of a hand.
  4. Runs a short **summon** animation: position/scale lerp from wherever the raycast hit the
     shelf (`SceneGameBoxHit.point`, already available on the raycast side — worth threading
     `point` through `GameSelectedEvent` if not already carried there, since today it only carries
     `appid`) to the resolved anchor, over a fixed duration, no physics.
  5. Once summoned, runs the **open** animation: `setOpenAmount` lerped `0 → 1` over a fixed
     duration.
- Per-frame driving: `RenderLoopRegistry.register('GameBoxFoldCoordinator', ...)` — self-registered,
  not threaded through `WebXRCoordinator`/`SceneManager` (this isn't camera-related; the class
  owning the animation state subscribes to the tick it needs directly, per this project's
  owner-managed-subscriptions rule).
- `onCancelPressed()` (only while a box is summoned): reverse — close (`1 → 0`), then un-summon
  (lerp back toward the shelf point and shrink/fade), then unparent/hide the pre-warmed model
  (kept alive, not disposed — it's reused for the next selection) and unregister from the render
  loop until the next selection. The model's geometry/materials are only actually disposed in the
  coordinator's own `dispose()` (app/scene teardown), same cleanup discipline
  `XRControllerManager.pruneDuplicateChildren` established this session, just scoped to
  coordinator lifetime instead of per-close.
- **Const gate**: `client/src/scene/game-box-fold/GameBoxFoldConfig.ts` exports
  `export const USE_FOLD_OPEN_GAME_BOX_INTERACTION = true`. Whichever bootstrap path wires up
  `GameLibraryBinderUI`'s scene-selection listener today also decides, based on this flag, whether
  to construct `GameBoxFoldCoordinator` instead of letting `GameLibraryBinderUI.onGameSelected`
  handle the event — **not** a flag `GameLibraryBinderUI` itself needs to import (its in-binder
  browse-and-preview path, see Non-goals, is untouched either way). Flipping the flag to `false`
  reverts shelf-selection to the old flat overlay with a one-line change, satisfying "keep the old
  details screen around... gated behind a const."

### 3. Content reuse — don't refetch artwork

The center panel's front face should be the *same* texture already resolved for the shelf instance
(already fetched/decoded/cached by the artwork pipeline — `LodArtworkOrchestrator`/
`ArtworkPrefetchCoordinator`). The exact retrieval mechanism (direct texture handle vs.
re-resolving through the existing cache by appid) is an implementation detail for whoever picks
this up — flagged here so it isn't accidentally reimplemented as a second fetch path
(survey-before-extend).

## Non-goals (explicitly deferred)

- **Detaching/hiding the real shelf instance.** The summoned box is a visually independent object
  — the shelf slot keeps showing its instanced box exactly as before. Making the shelf slot go
  temporarily empty/dim while its box is "in hand" would need new per-instance state in the
  GPU-instancing layer — real work, not needed for the core interaction to read correctly (a
  nostalgic store aisle where you pick up a box and it's still on the shelf is an acceptable
  simplification, not a bug).
- **4th face / two-stage flip.** Geometry is structured so it's additive later (see §1) but not
  implemented now.
- **Final face content/design.** Placeholder canvas text panels only; "what goes on each of the 3
  faces" is an explicit follow-up design pass per the user's own framing.
- **`GameLibraryBinderUI`'s in-binder browse-and-preview click path.** Manually clicking a game slot
  while the 2D binder is open is a separate, still-useful desktop-only workflow — untouched by this
  plan, not gated by the same const.
- **Launch/play affordance on the opened box.** Not scoped here; whatever "Play" currently does (if
  anything) stays wherever it lives today.
- **VR Cancel/dismiss binding.** No VR button currently maps to `CancelPressed`. Desktop/gamepad
  dismiss works from day one; a VR dismiss mapping is a small follow-up (likely alongside
  `xr-menu-button-mapping-unverified`-style hardware verification), not a blocker to shipping this
  in VR — grabbing a *different* box just replaces the current one either way.
- **Physics/grab-release semantics.** No physics; the box is a pure visual object parented to a
  fixed anchor.

## Open questions

- Exact panel proportions/open angle (fully flat `π` vs. a slight fan for readability) — visual
  design, not a technical blocker.
- Whether the summon animation should visually originate from the actual raycast hit point (more
  "real") or just fade/scale in at the hand (simpler, cheaper) — either satisfies "swaps in" per
  the user's framing; pick whichever prototypes better.

## Tasks

1. `GameBoxFoldModel.ts` — box geometry, hinge groups, `setOpenAmount()`, placeholder textures.
2. `GameBoxFoldConfig.ts` — the const gate.
3. `GameBoxFoldCoordinator.ts` — pre-warmed model construction, selection handling, anchor
   resolution, summon/open/close animation (`RenderLoopRegistry` registration); `dispose()` is the
   only path that actually frees the model's geometry/materials.
4. `XRControllerManager.ts` — add `getPrimaryControllerGrip()`.
5. `InteractionEvents.ts` — add `point` to `GameSelectedEvent` if not threading it another way.
6. Bootstrap wiring — gate which listener (`GameLibraryBinderUI` vs. `GameBoxFoldCoordinator`)
   handles scene-driven `GameEventTypes.Selected`, per `USE_FOLD_OPEN_GAME_BOX_INTERACTION`.
7. Unit tests (vitest, mirroring this session's `XRControllerManager`/`BindingResolver`
   conventions):
   - `GameBoxFoldModel`: `setOpenAmount(0)`/`setOpenAmount(1)` produce the expected hinge
     rotations; `setContent()` called twice reuses the same texture objects (no new
     `THREE.Texture` allocated on the second call); disposal frees geometry/materials.
   - `GameBoxFoldCoordinator`: constructing it builds exactly one `GameBoxFoldModel`; selecting
     while flatscreen/no XR session parents the pre-warmed model to camera; selecting during an
     active XR session parents it to the resolved grip; selecting a second game while one is open
     re-textures and re-anchors the *same* model instance (not a new one); `CancelPressed` while
     nothing is summoned is a no-op; only `dispose()` frees the model and unregisters from
     `RenderLoopRegistry`.
8. Update `docs/features/game-detail-screen.md` (status/acceptance criteria) and `docs/bugs.md`'s
   "Game detail overlay doesn't render in the VR view" entry once implemented.

## Verification

- `yarn tsc` after each phase.
- `yarn test` full suite for regressions.
- Manual: desktop click summons+opens the box in front of the camera and dismisses on Escape; VR
  trigger-grab summons+opens the box at the grabbing controller's hand and follows it; grabbing a
  second box while one is open re-textures the same box cleanly with no perceptible delay; repeated
  grab cycles show flat `renderer.info.memory` (pre-warming means zero growth, not just "no leaks"
  — a stronger bar than the usual dispose-on-close check).

## Related

- [Game Detail Screen](../features/game-detail-screen.md) — the feature this plan is scoped under.
- [VR Support](../features/vr-support.md) / [`vr-support-plan.md`](vr-support-plan.md) — sub-scope
  1's controller-ray selection is this plan's only upstream dependency, already shipped.
- [VR Spatial Settings Menu](vr-spatial-settings-menu-plan.md) — parallel VR UX work from the same
  2026-08-10 session, not sequenced against this plan.
- `docs/bugs.md` → "Game detail overlay doesn't render in the VR view" — the bug this plan fixes.

## Addendum (2026-08-11): implemented — two design changes from this plan's original text

Tasks 1-8 implemented on `feature/game-box-fold-open`. `yarn tsc` clean, full suite 1618/1618
(13 new tests). Two deviations from the design above, both simplifications discovered while
building:

- **Summon animation is a local-space scale tween, not a world-to-hand position lerp.** The
  original design (§2.4) had the box lerp in world space from the raycast hit point
  (`SceneGameBoxHit.point`) to the resolved anchor. In practice that means lerping toward a
  *moving* target (the camera/grip anchor moves every frame too), which is real added complexity
  for a "swap in" effect the user explicitly described as *not* being about the box physically
  traveling from the shelf ("I imagine this is something that 'swaps in' to the hand, as opposed
  to being part of the game on the shelf"). Implemented instead: the model parents onto the anchor
  immediately, at a fixed local offset, and animates `scale` from a small starting value to 1 over
  `SUMMON_DURATION_MS` (200ms) - simpler, cheaper, and a closer match to "swap in." The `point`
  field added to `GameSelectedEvent` is unused by the coordinator for now; left on the event as
  real, already-available data in case a future pass wants it back.
- **Capability-based handler selection, not bootstrap-level conditional construction.** §2's design
  had the bootstrap layer decide which of `GameLibraryBinderUI`/`GameBoxFoldCoordinator` handles
  `GameEventTypes.Selected`. While implementing, found `EventManager` already has exactly this
  mechanism built in and documented in this project's own architecture rules
  ("Capability-based handler selection" in root `CLAUDE.md`): `registerEventHandler(..., {
  isDefault: true })` vs. `{ isOverride: true }` - a default handler is automatically removed the
  moment an override handler registers for the same event. `GameLibraryBinderUI`'s existing
  `onGameSelected` registration became `{ isDefault: true }` (one-line change, no flag import
  needed - exactly as this plan intended); `GameBoxFoldCoordinator` registers `{ isOverride: true }`
  unconditionally, and `USE_FOLD_OPEN_GAME_BOX_INTERACTION` instead gates whether
  `SteamBrickAndMortarApp` constructs `GameBoxFoldCoordinator` at all. Same net behavior as
  originally planned, just routed through the codebase's existing mechanism instead of a new
  bootstrap-level branch.

**Not yet verified**: dev server wasn't running this session (per `client/CLAUDE.md`, not started
proactively) - manual desktop-click and real-headset verification (both called for in this plan's
Verification section) are still outstanding.

Files touched: `InteractionEvents.ts` (`GameSelectedEvent.point`), `SceneClickGameBoxRaycast.ts`
(threads `point`), `XRControllerManager.ts` (`getPrimaryControllerGrip()`), new
`scene/game-box-fold/{GameBoxFoldModel,GameBoxFoldCoordinator,GameBoxFoldConfig}.ts`,
`GameLibraryBinderUI.ts` (`isDefault: true`), `SteamBrickAndMortarApp.ts` (construction + dispose).
New tests: `test/unit/scene/game-box-fold/{GameBoxFoldModel,GameBoxFoldCoordinator}.test.ts`.

## Addendum (2026-08-11): first real-app pass - four fixes

Real (desktop) testing surfaced four issues, all fixed on the same branch:

- **Cover art didn't load for some games (Proteus, appid 219680)**: `GameBoxFoldCoordinator` was
  loading artwork via `THREE.TextureLoader` (a plain `<img>` element under the hood) directly
  against the Steam CDN URL - subject to normal browser CORS enforcement, which the CDN doesn't
  satisfy for canvas/WebGL texture use (confirmed via console: `library_600x900.jpg` blocked by
  CORS policy). The shelf's own instanced boxes don't hit this because they go through
  `GameArtworkProvider`'s pixel-based pipeline instead (fetch/decode happens off the DOM-image
  path, returns raw `Uint8ClampedArray` pixels, no tainted-canvas moment). Switched
  `applyCoverTexture()` to call `GameArtworkProvider.getArtwork(...).getPixelsAtSize(...)` and
  build a `THREE.DataTexture` from the result - same pipeline the shelf already uses successfully,
  with the added benefit of hitting that pipeline's own disk/session caches instead of a second
  network round-trip for art the shelf already fetched.
- **Box appeared bottom-right instead of centered**: `CAMERA_LOCAL_OFFSET` had nonzero X/Y: changed
  to `(0, 0, -0.6)` - centered in view.
- **Hinge mechanism didn't read as a real box opening** ("unfolds from the front and the back"):
  the original design had two wing panels sitting *beside* the center panel even when closed (no
  Z-stacking, narrower than the base, all three coplanar) - closer to three boxes side-by-side than
  one box opening. Redesigned per explicit direction: three same-width panels stacked directly on
  top of each other when closed (base, furthest from viewer; second flap; front cover, closest/
  outermost - what you see as "the box"), front cover hinged on its **left** edge and second flap
  hinged on its **right** edge, opening sequentially (front cover swings fully open first, then the
  second flap) rather than simultaneously. Ends at the same three-coplanar-panels-in-a-row layout
  as before; only the closed-state stacking and hinge assignment changed.
- **Spawn still facing the window** - found and fixed for real this time. The prior round's
  `CAMERA_SPAWN_YAW_RADIANS` fix in `SceneManager.setupCamera()` was chasing the wrong file - it
  had no visible effect because `RoomManager.buildRoom()` unconditionally overwrites the rig's
  rotation later anyway, once real shelf bounds are known, via `cameraRig.lookAt(0, 1.6, targetZ)`.
  The real bug was IN that call: `THREE.Object3D.lookAt()` special-cases `isCamera`/`isLight`
  objects to orient the object TOWARD the target; for any other object type - `cameraRig` is a
  plain `THREE.Group`, not a `Camera` - it builds the matrix with eye/target swapped, orienting the
  object AWAY from the target instead (confirmed by reading
  `node_modules/three/src/core/Object3D.js`'s `lookAt()` directly, not assumed). Since the target
  is always the store's shelves, this silently spawned the player facing away from them - toward
  the glass storefront - every time. Reverted the `CAMERA_SPAWN_YAW_RADIANS` approach entirely
  (`SceneManager`/`CameraInputApplier`/their tests) and replaced `RoomManager`'s `.lookAt()` call
  with an explicit yaw computation (`Math.atan2`) that doesn't hit the isCamera/isLight branch
  asymmetry. New regression test: `RoomManager-camera-facing.test.ts`.
- **Cover art rendered upside down** after the CORS fix above swapped in `THREE.DataTexture` - see
  the next addendum for the fully-corrected story (this round's fix, `flipY = false`, was itself
  wrong; the real fix landed in the round after).

## Addendum (2026-08-11): flipY correction, and replaced hand-rolled animation with THREE.AnimationMixer

Two more rounds of live-testing feedback:

**Cover art was still upside down** after the previous round's `flipY = false` fix - because that
fix was based on a false premise. A `Grep` for `flipY` in `DataTexture.js` returned "no matches,"
so the fix assumed `DataTexture` inherits the base `Texture` class's `flipY = true` default (like
most textures) and copied `THREE.DataArrayTexture`'s `flipY = false` override instead, reasoning
that was the "correct" convention for this `GameArtworkProvider` pixel source. Reading
`node_modules/three/src/textures/DataTexture.js` directly (not grepping it) showed the grep result
was simply wrong: `DataTexture`'s own constructor unconditionally sets `this.flipY = false` - so
the earlier fix was a no-op against that default, and this round's first attempt (removing the
line entirely, assuming the default was `true`) left it at the same wrong `false` value the whole
time. `texture-processing.worker.ts`'s `getImageData()` produces standard top-down pixel data, same
as any decoded photo - correct display on a normally-UV-mapped mesh needs `flipY = true`, the same
reason the *base* `Texture` class defaults to it. `DataTexture` overrides that default because its
more common use case is non-photographic raw/procedural data where the distinction doesn't apply
the same way - not applicable here. Fix: explicitly set `texture.flipY = true`, overriding
`DataTexture`'s own default back to the photo-correct behavior. (`DataArrayTexture`'s own
`flipY = false` is real and unrelated to this - it's a `WebGL2` array-texture upload detail that
doesn't transfer to a plain 2D `DataTexture` at all; that reasoning happened to be *directionally*
right by accident in an earlier draft of this note, but the actual root cause was always the
`DataTexture` grep miss above, not a `DataArrayTexture` technical constraint.) Lesson: this session
had several `Grep` calls silently return "no matches" against content later confirmed present via
`Read` - `lookAt(` in `Object3D.js` was the other one (see the previous addendum). Prefer `Read`
over `Grep` when a negative result would materially change a conclusion.

**"A lot of the game box folding looks hand-rolled"** - fair: `GameBoxFoldCoordinator` had a
hand-rolled `phase`/`progress` state machine (`'idle' | 'summoning' | 'opening' | 'closing' |
'unsummoning'`) manually lerping scale and calling `GameBoxFoldModel.setOpenAmount(t)` every frame.
Replaced with `THREE.AnimationMixer`/`AnimationClip`/`KeyframeTrack` - already part of three.js, no
new dependency. `GameBoxFoldModel` now owns one `AnimationClip` (summon-scale, then front-cover
rotation, then second-flap rotation, as three keyframe tracks) and exposes `playOpen()`/
`playClose()`/`update(deltaSeconds)`/`onFullyClosed(callback)`; `playClose()` is just the same clip
played with `timeScale = -1` (a standard three.js pattern for reversible open/close animations - no
separate close logic needed). `GameBoxFoldCoordinator` no longer tracks animation phase/progress at
all - it only calls `playOpen()`/`playClose()` at the right moments and forwards `update()` each
frame. Net: coordinator is markedly smaller, model owns its own animation state (better
encapsulation - it already owned the geometry the animation drives), and the mechanism is now
"three.js's own animation system" rather than something hand-rolled.

## Addendum (2026-08-11): close-then-reopen on every selection; real left/right hinge fix; isDefault moved into the retiring code

Three more fixes from the same live-testing thread:

- **Selecting a different game while one was open just swapped content with no animation at all.**
  `handleGameSelected` used to re-texture/re-anchor the still-open model in place regardless of
  whether something was already summoned - `playOpen()` was only ever called once per model
  lifetime in practice, since the model started fully open already. Added `pendingSelection`:
  selecting while `currentAppid !== null` now queues the new appid/game and calls `playClose()`
  instead of re-texturing immediately; the existing `onFullyClosed` callback (already wired for
  the plain-dismiss case) checks for a pending selection first and, if present, calls a new
  `summon()` (the selection logic factored out of `handleGameSelected`) instead of hiding/
  detaching. `handleCancelPressed` clears any queued `pendingSelection` too, so a Cancel that
  arrives mid-switch stays closed rather than reopening with whatever was queued.
- **The hinges were still visibly wrong** ("fold open to the right, and then from the back")
  despite the previous round's stacked-layers redesign, because that redesign had a real sign
  error: `leftHinge`'s/`rightHinge`'s X positions were derived in `GameBoxFoldModel`'s own local
  frame without accounting for `GameBoxFoldCoordinator`'s `MODEL_FACING_ROTATION_Y` (`PI`) rotation
  on the *whole* model, which negates local X. The earlier UV/texture-orientation analysis in this
  same file correctly carried that outer rotation through; the hinge-position analysis never did.
  Net effect: "leftHinge" (the front cover) was actually landing on the viewer's *right* once open,
  and vice versa. Fixed by swapping the `hingeX`/`meshLocalX` arguments between the two
  `buildFlap()` calls (front cover now built at local `+X` so it lands at viewer-left after the
  outer rotation; second flap the mirror). New regression test in `GameBoxFoldModel.test.ts`
  composes the model's open state with the same rotation the coordinator applies and asserts the
  actual viewer-relative left/right, rather than only checking the model's own local frame -
  that's specifically the check that was missing before.
- **`isDefault: true` moved into `GameLibraryBinderUI` conditionally**, gated on
  `USE_FOLD_OPEN_GAME_BOX_INTERACTION`, instead of being unconditional. Per explicit direction: the
  new-mechanism vocabulary (`isDefault`/override handler selection) shouldn't leak into the
  retiring code path when the flag is off - with the flag off, `GameLibraryBinderUI` now registers
  exactly as it did before this feature existed, no trace of the new mechanism's concepts.

Files touched: `GameBoxFoldCoordinator.ts` (`pendingSelection`, `summon()`), `GameBoxFoldModel.ts`
(hinge swap + comment), `GameLibraryBinderUI.ts` (conditional `isDefault`), both fold-open test
files.

## Addendum (2026-08-12): close 2x speed; conditional registration as if/else; comment cleanup

- **`if (USE_FOLD_OPEN_GAME_BOX_INTERACTION) { registerEventHandler(...) } else { registerEventHandler(...) }`**
  in `GameLibraryBinderUI.init()`, replacing the previous ternary-in-options-argument form. Same
  behavior, plainer to read.
- **`playClose()` now runs at `CLOSE_SPEED_MULTIPLIER` (2x)** - closing reads better snappier than
  the reveal. Still the same clip played backward (`timeScale = -CLOSE_SPEED_MULTIPLIER`), no
  separate close logic.
- **Simplified `GameBoxFoldModel`'s hinge construction.** `buildFlap()`'s `meshLocalX` parameter was
  always exactly `-hingeX` (the panel is centered on the group's origin when closed, the mirror
  image of its own pivot) - dropped it and compute that internally instead of passing it at each
  call site. Replaced the two inline "why local +X means viewer-left" comments (duplicated at each
  `buildFlap()` call after the previous round's hinge-swap fix) with two named constants,
  `FRONT_COVER_HINGE_X`/`SECOND_FLAP_HINGE_X`, carrying that explanation once. Also trimmed the
  `flipY` comment in `GameBoxFoldCoordinator.applyCoverTexture` down to the durable fact (DataTexture
  defaults `flipY` to `false`, this pixel data needs `true`) instead of narrating the two earlier
  wrong attempts - that history is in this doc's addenda above, not useful as an ongoing source
  comment.

Files touched: `GameLibraryBinderUI.ts`, `GameBoxFoldModel.ts`, `GameBoxFoldCoordinator.ts` (comment
only).

## Addendum (2026-08-12): face content design pass - extracting BinderGameDetailPanel's valuable sections

New branch `feature/game-box-detail-content` off the now-merged `act2/default`. Addresses
Follow-up (3) below. Went through `BinderGameDetailPanel`/`detail-panel.html` section by section and
judged what's worth carrying over onto the fold-open box's two content faces (front cover +
second flap - the base's own face already carries the cover art):

- **Kept, now on the front cover**: game name, Steam rating (`formatRating()` - **extracted** out
  of `BinderGameDetailPanel` into `client/src/scene/categorization/RatingFormat.ts` so both surfaces
  share one implementation instead of duplicating it, per this project's no-duplicate-logic rule).
- **Kept, now on the second flap**: total playtime, "last 2 weeks" recent playtime (only shown when
  nonzero, same as the old panel's conditional block), genres, and top SteamSpy community tags
  (`getTopSteamSpyTags`, the same fallback `GroupResolver` already uses for tag-mode grouping) -
  combined into one deduped, capped (`MAX_TAGS_SHOWN = 6`) list rather than two separate sections,
  since a flap face has room for one legible list, not two.
- **Left out (debug-only, not real user content)**: the raw JSON cache-entry dump, the "Spotlight"
  debug button (`GameSpotlight`), and the bare App ID stat - these were dev-verification tools, not
  information a player looks up.
- **Left out (interaction, not content - deferred)**: the "Play"/"Store Page" buttons. The old panel
  could do this because it was a real DOM overlay with clickable anchors; the fold-open box's faces
  are canvas-drawn textures on 3D geometry with no click-target wiring yet. Making the box
  interactive is the same "gravy"/"point of the hit" question already flagged as deferred earlier in
  this doc's history, not re-opened here.
- **`GameBoxFoldModel`**: replaced the single generic `drawContentPanel(ctx, text)` with two
  purpose-built layouts, `drawTitlePanel()` (name + rating, word-wrapped) and `drawStatsPanel()`
  (playtime block + wrapped tag line), plus a shared `wrapLines()` greedy word-wrap helper - the
  previous version only ever received one or two pre-joined lines and never needed to wrap.
- **`GameBoxFoldContent`** grew from `{ name, genre?, playtimeHours? }` to
  `{ name, rating?, playtimeHours?, recentPlaytimeHours?, tags? }` - `genre` (singular) is gone,
  folded into the caller-built `tags` list alongside community tags.
- **`GameBoxFoldCoordinator.summon()`** now builds the full content object from `SteamGameData`
  directly (`buildTags()` does the genre+community-tag merge/dedupe/cap) instead of the placeholder
  single-genre/playtime-only object from the previous round.

Not yet done: live visual verification. This addendum is code + unit-test verified only
(`yarn tsc` clean, full suite green) - see the "Live-verify" follow-up, since the user separately
flagged that the hinge direction "still opens exactly as it has been" despite the merged sign-error
fix, which needs an actual dev-server check, not another code-only pass.

Files touched: `client/src/scene/categorization/RatingFormat.ts` (new),
`client/src/ui/binder/BinderGameDetailPanel.ts` (import swap only), `GameBoxFoldModel.ts`,
`GameBoxFoldCoordinator.ts`, both fold-open test files.

## Addendum (2026-08-12, same branch): three-panel redesign - identity/store/debug, ahead of interaction

Before the previous addendum's content had even been visually confirmed, the user asked for a much
bigger reshuffle: "we can fit a ton more onto these game spaces," store-page-style content (header
art, description) in the center, the JSON debug dump moved onto the right flap and made scrollable,
a working Play button under the header, tags AND categories, user collections, and later
sections for DLC/achievements/friends-who-own. Given the size, three explicit clarifying questions
were asked before building anything (see chat) and answered:

- **Content now, interaction (Play button, scrollable JSON) as an immediate follow-up** - nothing
  on the box is click/scroll-hittable yet, so a working button or real scrolling needs a new
  raycasting/hit-testing subsystem against the held box's own faces, which is its own chunk of work.
- **Missing data (screenshots/videos/DLC/achievements) gets placeholder "coming soon" rows for now**
  - none of these are fetched anywhere in the pipeline today (confirmed by reading
    `SteamGameMetadata`); wiring them up is separate follow-up work, not blocking this pass.
- **The "disk" idea gets a scoped first pass now**, per explicit direction: "try drawing the disk in
  the middle flap, top - just the top half of the disk emerging from its sleeve - header image
  across that." Scoped to the center panel's own illustration, not a geometry change to the box.

Resulting per-panel redesign (all three canvases bumped 256px -> `PANEL_CANVAS_SIZE = 512` - "we can
fit a ton more"):

- **Front cover -> identity panel** (`drawIdentityPanel()`): name, rating, playtime
  (total + recent), then three labeled chip-line sections via a shared `drawLabeledChipLines()`
  helper - TAGS (genres + community tags, as before), FEATURES (Steam's own `categories` - distinct
  from tags per explicit request), YOUR COLLECTIONS (`user_collections`, the desktop user's own
  Steam library collections - this **is** "which user categories we know it to be a part of").
- **Base/center -> store panel** (`redrawStorePanel()`): header art presented as a disc emerging
  from a sleeve (circular canvas clip, top half only, `ctx.arc(cx, cy, r, PI, 2*PI)`, header image
  `drawImage()`'d in with "cover" scaling), a reserved-but-outlined (not filled, so it doesn't read
  as already working) "▶ PLAY (soon)" zone under it, then description/metacritic text, then
  coming-soon rows for Screenshots/Videos/DLC/Achievements. Friends-who-own stayed fully out per the
  user's own "later" framing - not even a placeholder row for it yet.
- **Second flap -> debug panel** (`drawDebugPanel()`): the raw cache-entry JSON dump, reversing the
  previous addendum's "leave it out, it's debug-only" call per explicit request - static/top-aligned
  only for now (line-wrapped via a new `wrapMonospaceLines()` char-cut helper, since JSON doesn't
  reliably wrap on spaces the way prose does), truncated with a "scrolling coming soon" note when it
  overflows.
- **Header art fetch changed from `library` to `header` format**, and the whole `THREE.DataTexture`/
  `flipY` mechanism for it is gone: `GameBoxFoldCoordinator.applyHeaderImage()` now hands
  `GameBoxFoldModel.setHeaderImage()` a plain `{pixels, width, height}` bundle, which the model
  rasterizes into a scratch canvas via `ctx.createImageData()`/`putImageData()` (not `new
  ImageData(...)` - that global constructor isn't guaranteed to exist in every test environment,
  e.g. jsdom) and reads with `drawImage()` for the disc. Canvas `ImageData` is inherently top-down,
  same row order as the pixel source, so this removes the flipY failure class entirely rather than
  fixing it again.
- **`coverTextureCache: Map<string, THREE.DataTexture>`** (which needed per-entry `.dispose()`)
  became **`headerImageCache: Map<string, GameBoxFoldHeaderImage>`** (plain pixel bundles - nothing
  to dispose, `dispose()` just clears the map).

Same as the previous addendum: code + unit-test verified only, not yet visually confirmed.

Files touched: `GameBoxFoldModel.ts` (large rewrite), `GameBoxFoldCoordinator.ts`
(`applyHeaderImage()` replacing `applyCoverTexture()`, richer `summon()` content), both fold-open
test files.

## Addendum (2026-08-12, same branch): raycast interaction, second layout pass, data-sourcing research

Three more pieces from the same session, landed together:

- **Data-sourcing research, dispatched to a background agent** (constrained: research + a doc,
  no implementation) to answer Follow-up (5) below using this project's established desktop-Rust
  local-file-read pattern (`desktop/tauri-app/src/steam/` - `librarycache.rs`/`screenshots.rs`/
  `appinfo.rs`), not the Steam Web API. Findings written up in
  [`game-box-store-data-research.md`](game-box-store-data-research.md): **DLC and achievements are
  both feasible from local Steam client files** (achievements via a plain JSON cache,
  `appcache/librarycache/<appid>.json` - not VDF at all; DLC via one more field read in
  `appinfo.rs`'s existing `extended` block decode) - **screenshots and videos are not**, they
  genuinely need the Store API (`appdetails.screenshots[]`/`.movies[]`), confirmed against this
  repo's own prior research on that endpoint. Recommended build order: achievements, then DLC;
  screenshots/videos treated as a separate, deliberate networked-dependency decision, not scoped
  here.
- **Raycast interaction** (Follow-up (4), pulled forward into this same pass per explicit request):
  `GameBoxFoldCoordinator` now raycasts against the held box's own three content meshes -
  `GameBoxFoldModel.getInteractiveMeshes()` exposes them, `isContentFaceHit()` keeps the
  per-mesh "which of its 6 faces is the content one" knowledge internal to the model rather than
  exporting `FACE_INDEX`. A new `SceneCanvasWheelEvent`/`InputEventTypes.SceneCanvasWheel`
  (mirroring the existing `SceneCanvasClickEvent`) was added, emitted by `SystemUICoordinator`
  alongside its existing mousedown/mousemove/mouseup/contextmenu wiring on the renderer canvas -
  the class that already owns that DOM listener setup, not a new one. Clicking the Play button
  (hit-tested via `GameBoxFoldModel.isPointInPlayButton()`, tracking the button's last-drawn
  canvas rect) navigates to `steam://run/<appid>`, the same OS-protocol-handler mechanism
  `BinderGameDetailPanel`'s plain `<a href>` used - untested inside the Tauri desktop webview
  specifically (no shell plugin installed in this project; not a regression, the old link was
  never verified there either). Scrolling over the debug panel calls
  `GameBoxFoldModel.scrollDebugPanel()`, which now tracks a line offset and re-wraps/re-slices the
  JSON from `GameBoxFoldCoordinator.summon()`'s existing `debugJson` content - clamped to
  `[0, debugMaxScrollLine]`, reset to 0 on every new selection. UV->canvas-space conversion
  (`canvasX = uv.x * size`, `canvasY = (1 - uv.y) * size`) was re-derived directly from
  `BoxGeometry`'s own UV-generation source (same rigor as this session's earlier hinge/hinge-fix
  math, after two rounds of sign-error bugs from skipping that step) - confirmed face-independent,
  unlike the per-face winding direction, so no `-Z`-specific correction was needed here.
- **Second layout pass**, per explicit new direction:
  - Title moved to the store/center panel, top, above the disc (previously only on the identity
    panel, which now shows no title at all - the store panel is the primary "identity" surface).
  - Play button now shares one row with a condensed playtime/last-played summary instead of
    standing alone.
  - TAGS/FEATURES/YOUR COLLECTIONS moved from the identity panel to the store panel (via the
    already-shared `drawLabeledChipLines()`); Screenshots/Videos coming-soon rows moved the
    opposite direction, from the store panel to the identity panel (via a newly-extracted
    `drawComingSoonRows()`, shared with the store panel's remaining DLC/Achievements rows).
  - **Feature icons - tried, then reverted.** Steam's own category API data (`{id, description}`)
    has no icon field (confirmed against this repo's `SteamCategory` type), so a small curated
    `CategoryIcons.ts` lookup (description text -> emoji) was added, then removed again per
    explicit direction the same session: "get rid of CategoryIcons until we have some icons for
    them." Categories render as plain text again. Left as a Follow-up (nice-to-have, not expected
    to get picked up) rather than a deleted idea, in case a real icon source shows up later.

Files touched: `client/src/types/InteractionEvents.ts` (new `SceneCanvasWheelEvent`),
`client/src/ui/coordinators/SystemUICoordinator.ts` (wheel listener), `GameBoxFoldModel.ts`
(interactive-mesh accessors, play-button rect, debug scroll, layout reshuffle),
`GameBoxFoldCoordinator.ts` (`handleBoxClick`/`handleBoxWheel`/`raycastAgainstBox`), `docs/plans/
game-box-store-data-research.md` (new, background-agent output), plus fold-open/
SystemUICoordinator test files.

## Follow-ups (explicitly deferred to a later pass, not this branch)

Recorded per the user's own framing (2026-08-11, updated 2026-08-12 x3) so they aren't lost before
the next pick-up:

1. **Closing the held box.** Trivial for controllers (repeat trigger press toggles), but keyboard/
   mouse has no equivalent gesture yet - needs a real dismiss input, not just VR-side reasoning.
2. **Walking away should close what's open.** Currently the box stays summoned regardless of player
   movement; leaving the shelf area (or the game box's general vicinity) should auto-dismiss it.
3. ~~Face content design pass.~~ Done across the three 2026-08-12 addenda above - not yet visually
   confirmed by the user.
4. ~~Interaction: working Play button + scrollable JSON debug panel.~~ Done in this addendum - not
   yet visually confirmed by the user (in particular, Play's `steam://` launch inside the Tauri
   desktop webview specifically).
5. **Missing data: screenshots, videos, DLC, achievements.** See
   [`game-box-store-data-research.md`](game-box-store-data-research.md) - achievements and DLC are
   feasible from local Steam client files (recommended build order: achievements first, DLC
   second); screenshots/videos need the Store API, scope separately. Currently stubbed as
   "coming soon" rows.
6. **Friends who own/have played this game.** Explicitly "later" per the user - not even a
   placeholder row exists for it yet, unlike (5).
7. **Remove the old flat-overlay implementation and the `USE_FOLD_OPEN_GAME_BOX_INTERACTION` flag.**
   Per explicit direction (2026-08-12): do this "as soon as we've confirmed transfer of its
   meaningful contents" - i.e. once the user visually confirms the fold-open faces carry what
   matters from `BinderGameDetailPanel`, delete `GameLibraryBinderUI`'s
   `GameEventTypes.Selected` handling (`onGameSelected`/`openGameDetail`/`selectGame`/
   `renderDetailPanel`/`BinderGameDetailPanel`) and the flag itself, and make
   `GameBoxFoldCoordinator`'s registration unconditional.
8. **Feature category icons.** Nice-to-have, probably won't get picked up - see the addendum above.
   Needs an actual icon source (Steam's category API data has none) before it's worth re-adding.
9. ~~Whether these panels should be hand-drawn canvas at all, vs. real HTML/CSS projected onto the
   surface via `CSS3DRenderer`.~~ **Resolved (2026-08-13) via
   [`css3d-panel-projection-spike.md`](css3d-panel-projection-spike.md): stay with canvas-drawn +
   raycast hover-simulation for this box.** Confirmed by reading `CSS3DRenderer.js` directly (not
   assumed): CSS3D content is a plain absolutely-positioned DOM layer with a CSS `matrix3d`
   transform, never submitted through `WebGLRenderingContext`/`XRWebGLLayer` - structurally
   invisible in an actual WebXR session, the same root cause that made the original flat
   `BinderGameDetailPanel` invisible in VR in the first place (see this doc's Goal section). CSS3D
   stays a legitimate tool for genuinely flatscreen-only surfaces (the settings menu itself, per
   the spike) - just not this box, which has to work identically on both platforms.
10. **Manual hover-simulation for the box's own faces**, now the recommended path per the spike
    above (raycasting to detect "pointer is over this button-shaped region," reusing
    `GameBoxFoldCoordinator.raycastAgainstBox()`'s existing infrastructure) - not built yet, no
    interactive element currently needs it beyond the Play button, which already has working click
    handling without hover feedback.
