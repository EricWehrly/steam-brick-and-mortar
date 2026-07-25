# Plan: Route Interact / OpenMenu / ToggleFullscreen Through the Input Stack

## Goal

Close [`gamepad-button-actions-unconsumed`](../tech-debt.md#id-gamepad-button-actions-unconsumed):
`InputAction.Interact`, `OpenMenu`, and `ToggleFullscreen` are bound in every device profile
(`InputProfile.ts`) but never read anywhere via `InputActionResolver.isActionPressed()` — the real
behavior today is two parallel, device-specific mechanisms (mouse-click raycast for selection, a
hardcoded `Escape` keydown listener for menu toggle) that gamepad never reaches. Route all three
through `InputActionResolver` for every device that already binds them (keyboard/mouse, gamepad),
so there's one path per action instead of one-path-per-device.

`ToggleUI` is being removed from the codebase entirely, not routed — see "Decisions" below.

## Decisions made before this plan was written (2026-07-24, user Q&A)

1. **Gamepad `Interact`** — screen-center raycast + a visible reticle shown while gamepad is the
   active input device. Not deferred; not silent (no reticle).
2. **`ToggleUI`** — remove the action, its bindings, and its definition from the codebase entirely.
   No feature is designed for it. Record as a nice-to-have stretch idea in
   `docs/features/input-system.md`'s Stretch section rather than a full feature doc — there's no
   natural existing home for "hide UI chrome" and inventing one would be scope creep on this plan.
3. **`ToggleFullscreen`** — build now, targeting the whole document via the Fullscreen API.

## Current state (confirmed via code survey, 2026-07-24)

- **Interact**: `SystemUICoordinator` attaches `mousedown`/`mousemove`/`mouseup` directly to the
  renderer canvas (`SystemUICoordinator.ts:102-105`), computes NDC coordinates on a non-dragged
  mouseup, and emits `InputEventTypes.SceneCanvasClick` (`:336-342`). `SceneClickGameBoxRaycast`
  listens for exactly that event (`SceneClickGameBoxRaycast.ts:65-68`), builds a `THREE.Raycaster`
  from the click's NDC position, and resolves hits through `GameFinder` into `GameEventTypes.Selected`.
  None of this touches `InputActionResolver` — it would work identically if `InputAction.Interact`
  didn't exist. No screen-center/reticle raycast concept exists anywhere yet.
- **OpenMenu**: `PauseMenuManager.setupKeyboardHandling()` (`PauseMenuManager.ts:532-539`) is a
  **document-level** `keydown` listener checking `event.key === 'Escape'` directly and calling
  `this.toggle()` — independent of `InputActionResolver`, which already has an `Escape` keyboard
  binding for `OpenMenu` (`InputProfile.ts:186-188`) that nothing reads. A comment at
  `SystemUICoordinator.ts:261-264` already flags that gamepad's `OpenMenu` binding "doesn't touch
  Escape at all" and currently does nothing.
- **ToggleFullscreen**: zero consumers anywhere — entirely dead, no fullscreen feature exists.
- **ToggleUI**: zero consumers anywhere — entirely dead, no UI-hide feature exists.
- **Touch and VR bindings for all of these resolve to a hardcoded `0`** in
  `BindingResolver.resolveBindingValue()` (`:100-103`, `touch-gesture`/`xr-component` cases) —
  gesture/XR-component resolution was never implemented at all. This is pre-existing, separately
  tracked scope (touch = Step 11 of the original input-manager plan, VR = [Input System](../features/input-system.md)
  task 9, gated on `vr-support-plan.md`), not something this plan regresses or needs to fix.

## New finding while scoping this: pause doesn't actually stop gamepad-driven camera movement

Tracing what `WebXRCoordinator.pauseInput()`/`resumeInput()` actually do, to figure out how
`OpenMenu` can be read while the pause menu is open (needed to detect the close-press):

- `WebXRCoordinator` registers its `updateCamera` callback with `RenderLoopRegistry` exactly once,
  in `setupWebXR()` (`WebXRCoordinator.ts:72`), and **never unregisters or gates it on pause state**.
  It runs every frame regardless of whether the menu is open.
- `pauseInput()`/`resumeInput()` call `InputManager.stopListening()`/`startListening()`
  (`WebXRCoordinator.ts:111,118`), which stop/start `InputEventAdapter`'s DOM listeners (so
  keyboard/mouse state tracking freezes, not clears) and `DeviceDetector`'s connect/disconnect
  listeners — but nothing gates `InputActionResolver.updateFrame()` itself, and gamepad axis/button
  reads happen via a direct `navigator.getGamepads()` poll inside `updateFrame()`
  (`InputActionResolver.ts:41-43`), completely independent of any listener state.
- Net effect: **holding a gamepad stick (or having a keyboard key held at the instant the menu
  opens) keeps moving/rotating the camera while the pause menu is open.** No existing test catches
  this — the existing `stopListening()` tests only assert it doesn't throw or that some other
  behavior changed, never that movement is actually suppressed afterward.
- This is a real, separate bug from what task 1 fixed (task 1 fixed the *event wiring* — pause/resume
  events weren't firing at all — plus a text-field keyboard-focus-bleed case). It's specifically
  about the render loop never gating on pause state, most visible for continuously-polled gamepad
  input since that never depended on DOM listeners in the first place.

This directly blocks a clean `OpenMenu` implementation: closing the menu via a gamepad or keyboard
press needs `InputActionResolver` to keep resolving every frame *while paused*, but movement/rotation
still needs to stop while paused. The current design conflates "is input being tracked" with "is
input being applied to the camera" — fixing that conflation is the one piece of this plan that
changes existing behavior rather than just adding new consumers, and is worth flagging as its own
review point rather than folding it in silently.

## Proposed direction

### 1. Split "tracked" from "applied" in `InputManager` (fixes the pause gap above)

- `InputManager` gains an `isPaused` flag. `WebXRCoordinator.pauseInput()`/`resumeInput()` call new
  `InputManager.pause()`/`resume()` methods that just toggle it, instead of calling
  `stopListening()`/`startListening()` (which remain for real setup/teardown — `dispose()` still
  needs a hard stop that actually removes DOM listeners).
- `InputManager.updateCameraMovement()`/`updateCameraRotation()` skip applying to the camera when
  `isPaused` is true, but `updateFrame()` keeps running unconditionally either way (already true
  today) — so action resolution, including gamepad polling and (once DOM listeners stay attached
  through a pause, see next bullet) keyboard, stays live for `OpenMenu` edge-detection.
- Secondary benefit: today, a key held down at the moment `stopListening()` fires stays stuck
  "pressed" in `InputStateTracker` until a keyup fires that will now never arrive (listener removed)
  — closes that latent stuck-key bug too, as a side effect of no longer tearing down listeners on
  every pause/resume cycle.

### 2. New primitive: edge detection on `InputActionResolver`

Add `wasActionJustPressed(actionId): boolean` — compares this frame's resolved button map to the
previous frame's (a new small internal `previousButtons` map, updated at the end of
`updateFrame()`). `OpenMenu`/`Interact`/`ToggleFullscreen` need "trigger once per press," unlike
`Sprint`/`RollLeft`/`RollRight`, which are correctly level-triggered today (apply every frame
they're held).

### 3. New class: dispatches resolved global actions into system effects

A new small class (naming TBD, e.g. `GlobalActionDispatcher`) registers one `RenderLoopRegistry`
callback and, each frame, reads `InputManager.getActiveInstance()?.actionResolver` for the three
actions:

- **OpenMenu** (edge-triggered): emits a new `InputEventTypes.OpenMenuPressed` event.
  `SystemUICoordinator` subscribes and calls `this.pauseMenuManager.toggle()` — same shape as its
  existing `handleMenuOpen`/`handleMenuClose` subscriptions, no new direct cross-class call.
  `PauseMenuManager.setupKeyboardHandling()`'s hardcoded `Escape` listener is removed entirely —
  `Escape` reaches the same path as every other device now, since it's already a keyboard binding
  for `OpenMenu`.
- **Interact** (edge-triggered, gamepad/VR only — skip when the active profile is mouse/keyboard,
  since that path already fires the real click-based selection and would otherwise double-fire):
  emits the existing `InputEventTypes.SceneCanvasClick` with `{ ndcX: 0, ndcY: 0, button: 0 }`.
  `SceneClickGameBoxRaycast` needs zero changes — it already only cares about the event shape, not
  the emitter.
- **ToggleFullscreen** (edge-triggered): calls `document.documentElement.requestFullscreen()` /
  `document.exitFullscreen()` directly based on `document.fullscreenElement`, no event needed (no
  other class needs to react to fullscreen state, at least not yet).
- Also owns the reticle: a small centered crosshair DOM element, shown while
  `InputProfileService.getActiveProfileId()` is `GamepadStandard` (or `VR`, though VR routing itself
  is still gated separately), hidden otherwise — subscribes to the existing `InputEventTypes.ProfileChanged`
  event directly (owner-managed subscription, not routed through `SystemUICoordinator`).

### 4. Remove `ToggleUI`

Delete `InputAction.ToggleUI` from `InputActions.ts` (`INPUT_ACTION_DEFINITIONS` entry too), its
bindings from `InputProfile.ts` (`MouseKeyboard`'s `Tab`, `GamepadStandard`'s button 8). Confirm no
other references (remap UI already iterates `INPUT_ACTION_DEFINITIONS` generically, so no separate
cleanup expected there). Add one line to `docs/features/input-system.md`'s Stretch section noting
it was removed 2026-07-24 and recording the idea (toggle visibility of docked UI buttons) as a
nice-to-have, not a scheduled task.

## Non-goals

- VR controller (`xr-component`) resolution for any of these actions — still `0` always, still
  task 9, still gated on `vr-support-plan.md`.
- Touch (`touch-gesture`) resolution — still `0` always, pre-existing separately tracked gap, not
  touched here.
- A "hide UI" implementation for the removed `ToggleUI` idea — recorded as a stretch note only.
- Any change to how `Sprint`/`RollLeft`/`RollRight`/movement/look are resolved — those are already
  correctly level-triggered and unaffected by the edge-detection addition.

## Files affected

- `client/src/input/InputActionResolver.ts` — add `wasActionJustPressed()`.
- `client/src/input/InputManager.ts` — add `pause()`/`resume()`, gate camera application on
  `isPaused`, keep `startListening()`/`stopListening()` for real setup/teardown only.
- `client/src/webxr/WebXRCoordinator.ts` — `pauseInput()`/`resumeInput()` call the new
  `pause()`/`resume()` instead of `stopListening()`/`startListening()`.
- `client/src/ui/pause/PauseMenuManager.ts` — remove `setupKeyboardHandling()`'s hardcoded `Escape`
  listener.
- `client/src/ui/coordinators/SystemUICoordinator.ts` — subscribe to the new
  `InputEventTypes.OpenMenuPressed` event, call `pauseMenuManager.toggle()`.
- New file for the dispatcher class (exact name/location TBD at implementation time, likely
  `client/src/input/` alongside its siblings).
- `client/src/types/InteractionEvents.ts` — add `InputEventTypes.OpenMenuPressed` (+ `EventTypeMap.ts`
  entry).
- `client/src/input/InputActions.ts`, `client/src/input/InputProfile.ts` — remove `ToggleUI`.
- `docs/features/input-system.md`, `docs/tech-debt.md` — mark the debt entry resolved, record the
  `ToggleUI` stretch note.
- Test files: `client/test/unit/webxr/input-manager.test.ts` has several `stopListening()`
  assertions that need reviewing — some may currently pass only because `stopListening()` used to
  freeze state, not because anything actually gated on it; those need to become explicit
  `pause()`/`isPaused`-based assertions instead of being left accidentally-still-passing.

## Related documents

- `docs/tech-debt.md#id-gamepad-button-actions-unconsumed` — the debt entry this plan closes.
- `docs/features/input-system.md` — task 9 (VR controller routing) remains separately gated; this
  plan doesn't touch it.
- `docs/features/vr-support.md` — VR controller work depends on the same `InputActionResolver`
  layer this plan extends, but is out of scope here.

## Open questions

- Exact name/location for the new dispatcher class — proposing `GlobalActionDispatcher` in
  `client/src/input/`, open to a better name at implementation time.
- Whether the reticle should also show for VR (currently proposed: yes, `GamepadStandard` or `VR`
  active profile) even though VR routing itself isn't live yet — harmless to include now since the
  profile-changed event already exists and VR won't become the active profile until task 9 lands
  anyway.

## Status

🔮 Not started — plan drafted 2026-07-24, awaiting sign-off before implementation begins.

---
**Signature**: P1
