# Plan: Route Interact / OpenMenu Through the Input Stack

## Goal

Close [`gamepad-button-actions-unconsumed`](../tech-debt.md#id-gamepad-button-actions-unconsumed):
`InputAction.Interact` and `OpenMenu` are bound in every device profile (`InputProfile.ts`) but
never read anywhere via `InputActionResolver` — the real behavior today is two parallel,
device-specific mechanisms (mouse-click raycast for selection, a hardcoded `Escape` keydown
listener for menu toggle) that gamepad never reaches. `InputActionResolver` should be the one
place that decides which action a raw press means, for every device, and tell each interested
class directly - not hand back a generic tag for consumers to re-decode.

`ToggleUI` and `ToggleFullscreen` are being removed from the codebase entirely, not routed - see
"Decisions" below.

## Decisions

**2026-07-24, initial Q&A:**
1. **Gamepad `Interact`** — simulates a click at the reticle position (screen center). Not
   deferred, not silent (a reticle shows while a non-pointer device is connected).
2. **`ToggleUI`** — remove the action, its bindings, and its definition entirely. No feature is
   designed for it. Recorded as a nice-to-have stretch idea in `docs/features/input-system.md`'s
   Stretch section - no natural existing home for "hide UI chrome," and inventing one would be
   scope creep on this plan.

**2026-07-24, after implementation review (see "Revision history" at the bottom):**
3. **`ToggleFullscreen`** — removed entirely, not built. **F11 already triggers the browser's own
   native fullscreen** in every major browser, independent of any in-page JavaScript - building a
   custom in-app "F" toggle would just duplicate a shortcut users already have. Same treatment as
   `ToggleUI`: action, bindings, and any consumer wiring deleted rather than shipped.
4. **No generic `ActionPressed` envelope.** `InputActionResolver` emits a *specific* event per
   action (`OpenMenuPressed`, `InteractPressed`) instead of one generic event carrying an
   `actionId` field for consumers to switch on. The resolver's whole job is deciding which action a
   raw press means - handing back an unresolved tag would just move that decision back onto every
   consumer.
5. **Interact stays a plain "fake click," not a named aim-source abstraction.** The first pass
   over-explained NDC `(0,0)` as "the camera-forward ray" and floated a future `AimSource`
   interface for VR. Simpler framing: gamepad/keyboard Interact simulates a mouse click at the
   reticle position. If VR controller routing (task 9) needs a real ray-based aim concept later,
   design it then, against its actual controller-pose API - not speculatively now.

## Current state (confirmed via code survey, 2026-07-24)

- **Interact**: `SystemUICoordinator` attaches `mousedown`/`mousemove`/`mouseup` directly to the
  renderer canvas (`SystemUICoordinator.ts:102-105`), computes NDC coordinates on a non-dragged
  mouseup, and emits `InputEventTypes.SceneCanvasClick` (`:336-342`). `SceneClickGameBoxRaycast`
  listens for exactly that event (`SceneClickGameBoxRaycast.ts:65-68`), builds a `THREE.Raycaster`
  from the click's NDC position, and resolves hits through `GameFinder` into `GameEventTypes.Selected`.
  None of this touches `InputActionResolver` — it would work identically if `InputAction.Interact`
  didn't exist.
- **OpenMenu**: `PauseMenuManager.setupKeyboardHandling()` (`PauseMenuManager.ts:532-539`) is a
  **document-level** `keydown` listener checking `event.key === 'Escape'` directly and calling
  `this.toggle()` — independent of `InputActionResolver`, which already has an `Escape` keyboard
  binding for `OpenMenu` (`InputProfile.ts:186-188`) that nothing reads. A comment at
  `SystemUICoordinator.ts:261-264` already flags that gamepad's `OpenMenu` binding "doesn't touch
  Escape at all" and currently does nothing.
- **ToggleFullscreen**: zero consumers anywhere — entirely dead, no fullscreen feature exists (and
  per decision #3, none will be built - F11 already covers it).
- **ToggleUI**: zero consumers anywhere — entirely dead, no UI-hide feature exists.
- **Touch and VR bindings for all of these resolve to a hardcoded `0`** in
  `BindingResolver.resolveBindingValue()` (`touch-gesture`/`xr-component` cases) — gesture/
  XR-component resolution was never implemented at all. This is pre-existing, separately tracked
  scope (touch = Step 11 of the original input-manager plan, VR = [Input System](../features/input-system.md)
  task 9, gated on `vr-support-plan.md`), not something this plan regresses or needs to fix.

## New finding while scoping this: pause doesn't actually stop gamepad-driven camera movement

Tracing what `WebXRCoordinator.pauseInput()`/`resumeInput()` actually do, to figure out how
`OpenMenu` can be read while the pause menu is open (needed to detect the close-press):

- `WebXRCoordinator` registers its `updateCamera` callback with `RenderLoopRegistry` exactly once,
  in `setupWebXR()`, and **never unregisters or gates it on pause state**. It runs every frame
  regardless of whether the menu is open.
- `pauseInput()`/`resumeInput()` called `InputManager.stopListening()`/`startListening()`, which
  stop/start `InputEventAdapter`'s DOM listeners (so keyboard/mouse state tracking freezes, not
  clears) and `DeviceDetector`'s connect/disconnect listeners — but nothing gated
  `InputActionResolver.updateFrame()` itself, and gamepad axis/button reads happen via a direct
  `navigator.getGamepads()` poll inside `updateFrame()`, completely independent of any listener
  state.
- Net effect: **holding a gamepad stick (or having a keyboard key held at the instant the menu
  opens) kept moving/rotating the camera while the pause menu is open.** No existing test caught
  this — the existing `stopListening()` tests only assert it doesn't throw or that some other
  behavior changed, never that movement is actually suppressed afterward.
- This is a real, separate bug from what task 1 fixed (task 1 fixed the *event wiring* — pause/resume
  events weren't firing at all — plus a text-field keyboard-focus-bleed case). It's specifically
  about the render loop never gating on pause state, most visible for continuously-polled gamepad
  input since that never depended on DOM listeners in the first place.

This directly blocks a clean `OpenMenu` implementation: closing the menu via a gamepad or keyboard
press needs gamepad polling to keep running *while paused*, but movement/rotation application still
needs to stop while paused. The current design conflated "is input being tracked" with "is input
being applied to the camera" — fixing that conflation is the one piece of this plan that changes
existing behavior rather than just adding new consumers.

## Proposed direction (final, after two review passes - see "Revision history")

### 1. Split "tracked" from "applied" in `InputManager` (fixes the pause gap above)

- `InputManager` gains an `isPaused` flag. `WebXRCoordinator.pauseInput()`/`resumeInput()` call new
  `InputManager.pause()`/`resume()` methods that just toggle it, instead of calling
  `stopListening()`/`startListening()` (which remain for real setup/teardown — `dispose()` still
  needs a hard stop that actually removes DOM listeners).
- `InputManager.updateCameraMovement()`/`updateCameraRotation()` skip applying to the camera when
  `isPaused` is true, but `updateFrame()` keeps running unconditionally either way (already true
  today) — so gamepad polling (needed for `OpenMenu` via a controller) stays live during pause.
  Keyboard doesn't even depend on this - see #2.
- Secondary benefit: today, a key held down at the moment `stopListening()` fires stays stuck
  "pressed" in `InputStateTracker` until a keyup fires that will now never arrive (listener removed)
  — closes that latent stuck-key bug too, as a side effect of no longer tearing down listeners on
  every pause/resume cycle.

### 2. Keyboard fires directly from the real `keydown` event - no polling, no diffing

`OpenMenu`/`Interact` need "trigger once per press" semantics, not `Sprint`/`RollLeft`/`RollRight`'s
correct "apply every frame it's held." Keyboard already has a real, unambiguous press edge -
`keydown` - so there's no reason to poll or diff frame-to-frame state for it at all:
`InputStateTracker.handleKeyDown()` calls a new `onRawKeyDown(code)` callback whenever
`!event.repeat` (the browser's own OS-auto-repeat flag - no separate "was this already down"
bookkeeping needed). `InputManager` wires this to `InputActionResolver.handleRawKeyPress()`.

**Mouse has no equivalent callback at all.** A real mouse click already has its own independent
dispatch (`SystemUICoordinator`'s `mousedown`/`mousemove`/`mouseup` → `SceneCanvasClick`), entirely
separate from the binding/action system - it doesn't check `InputAction.Interact` today and
doesn't need to. Routing mouse-button-0 through this mechanism too would just create a second path
to the same click, needing de-duplication logic downstream. Simpler: don't route mouse through
here at all. `Interact`'s `mouse-button: 0` binding stays in `InputProfile.ts` (so the Controls
panel still shows/lets you rebind "Left Click"), it just isn't the thing that triggers a dispatch -
the pre-existing click pipeline is.

Gamepad has no press event at all - the Gamepad API only exposes a continuously-sampled `.pressed`
boolean, so *something* has to poll and diff. That lives in `DeviceDetector.pollGamepads()` (which
already polls every frame for connect/disconnect), tracking each gamepad's previous per-button
state and emitting a new `InputEventTypes.GamepadButtonPressed({ gamepadIndex, buttonIndex })` on a
false→true transition - a raw signal, no binding knowledge, matching `DeviceDetector`'s existing
role (owns device/gamepad state, knows nothing about actions/profiles). `InputManager` subscribes
to this and calls `InputActionResolver.handleGamepadButtonPress()`.

Net effect: `InputActionResolver.updateFrame()` is purely about continuous axis/button state
(movement, look, Sprint, Roll) - no edge-detection bookkeeping inside it at all. The discrete "was
this pressed" question is answered once, at the moment it's actually known, by whichever raw
signal detected it (keydown or a gamepad poll diff).

### 3. `InputActionResolver` resolves the raw signal all the way to a specific event

`handleRawKeyPress()`/`handleGamepadButtonPress()` look up which button-type actions in the
connected+enabled profiles have a matching binding (via a new `BindingResolver.findButtonActionsBoundTo()`
helper), then - for each matched action that has a mapped specific event - emit that event
directly: `InputAction.OpenMenu` → `InputEventTypes.OpenMenuPressed`; `InputAction.Interact` →
`InputEventTypes.InteractPressed`. Both are empty-payload events; there's nothing left for a
consumer to inspect. `Sprint`/`RollLeft`/`RollRight`/`ResetCamera` have no entry in that mapping at
all, since those are correctly read continuously via `isActionPressed()` instead - nothing to emit
for them here.

### 4. No dispatcher class - each event goes to whichever class already owns that concern

- **`PauseMenuManager`** subscribes to `OpenMenuPressed` and calls its own `toggle()` — it already
  owns open/close/toggle, so there's no reason to relay through an intermediary. Replaces the old
  hardcoded `Escape`-only `keydown` listener entirely.
- **`SystemUICoordinator`** subscribes to `InteractPressed` and simulates a click at the reticle
  position by emitting the existing `InputEventTypes.SceneCanvasClick` with `{ ndcX: 0, ndcY: 0 }`
  - it already owns the real mouse mousedown/mousemove/mouseup→`SceneCanvasClick` dispatch, so this
  is one more branch in the same class rather than a second class needing its own copy of "how to
  trigger a selection." `SceneClickGameBoxRaycast` needs zero changes. It also owns the gamepad/VR
  aiming reticle (a small centered crosshair DOM element), shown while a non-pointer device is
  connected (`InputEventTypes.DevicesChanged`) and the pause menu is closed (its own already-existing
  `MenuOpen`/`MenuClose` handling) - `SystemUICoordinator` already tracks XR-session/pointer-lock
  state alongside the pause menu, so this is the same category of thing it already does.

`InputActionResolver` also caches its connected-profile-id `Set` (refreshed only on
`DevicesChanged`, not rebuilt from `DeviceDetector.getAvailableDevices()` on every `updateFrame()`
call).

### 5. Remove `ToggleUI` and `ToggleFullscreen`

Delete both from `InputActions.ts` (`INPUT_ACTION_DEFINITIONS` entries) and their bindings from
`InputProfile.ts` (`ToggleUI`: `MouseKeyboard`'s `Tab`, `GamepadStandard`'s button 8;
`ToggleFullscreen`: `MouseKeyboard`'s `KeyF`). Confirm no other references (remap UI already
iterates `INPUT_ACTION_DEFINITIONS` generically, so no separate cleanup expected there). Both get
one line each in `docs/features/input-system.md`'s Stretch section recording why they were
removed rather than built.

## Non-goals

- VR controller (`xr-component`) resolution for any of these actions — still `0` always, still
  task 9, still gated on `vr-support-plan.md`. Its aim-source design (if any) happens there, not
  speculatively here (see decision #5).
- Touch (`touch-gesture`) resolution — still `0` always, pre-existing separately tracked gap, not
  touched here.
- A "hide UI" implementation for the removed `ToggleUI` idea, or an in-app fullscreen toggle for
  the removed `ToggleFullscreen` idea — both recorded as stretch/rejected notes only.
- Any change to how `Sprint`/`RollLeft`/`RollRight`/movement/look are resolved — those are already
  correctly level-triggered and unaffected by this work.

## Files affected

- `client/src/input/InputContracts.ts` — `InputCallbacks` gains `onRawKeyDown`.
- `client/src/input/InputStateTracker.ts` — calls it from real `handleKeyDown`, guarded on
  `!event.repeat`.
- `client/src/input/BindingResolver.ts` — new `findButtonActionsBoundTo(profile, matcher)`.
- `client/src/input/InputActionResolver.ts` — `updateFrame()` is pure continuous-state resolution
  (no edge-detection bookkeeping); new `handleRawKeyPress()` / `handleGamepadButtonPress()`, each
  resolving to specific events (`OpenMenuPressed`/`InteractPressed`) via an internal action→event
  map; caches connected-profile-ids (refreshed on `DevicesChanged`); new `dispose()`.
- `client/src/input/DeviceDetector.ts` — tracks each gamepad's previous per-button state and emits
  `InputEventTypes.GamepadButtonPressed` on a false→true transition; fixed a `pollGamepads()`
  connect-detection gap (see "Revision history"); `DevicesChanged` now emitted before button-press
  events within the same poll, so a same-poll first-connect-and-press resolves correctly against
  the now-current connected-profile set.
- `client/src/input/InputManager.ts` — wires the raw keydown callback and the
  `GamepadButtonPressed` subscription to `InputActionResolver`; `pause()`/`resume()` gate camera
  application on `isPaused` while `updateFrame()` (gamepad polling) keeps running unconditionally;
  keeps `startListening()`/`stopListening()` for real setup/teardown only; `dispose()` also calls
  `actionResolver.dispose()` and deregisters the `GamepadButtonPressed` subscription.
- `client/src/webxr/WebXRCoordinator.ts` — `pauseInput()`/`resumeInput()` call the new
  `pause()`/`resume()` instead of `stopListening()`/`startListening()`.
- `client/src/ui/pause/PauseMenuManager.ts` — removed the hardcoded `Escape` `keydown` listener;
  subscribes to `OpenMenuPressed` and calls `toggle()`.
- `client/src/ui/coordinators/SystemUICoordinator.ts` — subscribes to `InteractPressed` (emits
  center-screen `SceneCanvasClick`) and `DevicesChanged` (reticle visibility, alongside its
  existing `MenuOpen`/`MenuClose` handling).
- `client/src/types/InteractionEvents.ts` — `OpenMenuPressedEvent`, `InteractPressedEvent` (both
  empty-payload), `GamepadButtonPressedEvent` (+ `EventTypeMap.ts` entries).
- `client/src/input/InputActions.ts`, `client/src/input/InputProfile.ts` — remove `ToggleUI` and
  `ToggleFullscreen`.
- `docs/features/input-system.md`, `docs/tech-debt.md` — mark the debt entry resolved, record the
  `ToggleUI`/`ToggleFullscreen` stretch/rejected notes.
- No `GlobalActionDispatcher` file - deleted after the first rejected pass; no generic
  `ActionPressed`/`device` field either - deleted after the second review pass.
- Test files: `input-state-tracker-raw-press.test.ts`, `binding-resolver.test.ts` (new
  `findButtonActionsBoundTo` cases), `input-action-resolver-raw-press.test.ts`,
  `device-detector.test.ts` (new gamepad-button-press cases), `input-manager-pause.test.ts`,
  `pause-menu-action-pressed.test.ts`, `system-ui-coordinator-action-pressed.test.ts`. Existing
  `stopListening()`-based tests in `client/test/unit/webxr/input-manager.test.ts` needed no
  changes — that method's behavior is unchanged; only `WebXRCoordinator` was rewired to call
  `pause()`/`resume()` instead for the menu-open/close case.

## Related documents

- `docs/tech-debt.md#id-gamepad-button-actions-unconsumed` — the debt entry this plan closes.
- `docs/features/input-system.md` — task 9 (VR controller routing) remains separately gated; this
  plan doesn't touch it.
- `docs/features/vr-support.md` — VR controller work depends on the same `InputActionResolver`
  layer this plan extends, but is out of scope here.

## Revision history

**Rejected first pass**: added a `wasActionJustPressed()` query to `InputActionResolver` (comparing
this-frame vs. last-frame merged button state) and a new `GlobalActionDispatcher` class that polled
it every frame via its own `RenderLoopRegistry` registration, then relayed to `OpenMenuPressed`/
`SceneCanvasClick`/fullscreen. Rejected on review:
1. **No reason to poll keyboard/mouse at all** - they already have real press events.
2. **The dispatcher class had no cohesion** - four unrelated jobs bolted into one class instead of
   living with the classes that already own each concern.
3. **The aim question was dodged, not solved** - "fake a mouse click at screen center" needed
   naming, not hand-waving.

**Rejected second pass**: fixed all three of the above, but still routed mouse through a generic
`InputActionResolver`-emitted `ActionPressed({ actionId, device })` event, requiring
`SystemUICoordinator`/`PauseMenuManager` to `switch`/check `actionId` (and `device`, to avoid
double-firing on real mouse clicks) themselves. Rejected on review: **the resolver's whole job is
resolving which action fired - handing back a generic tag for consumers to re-decode moves that
work back out of the class built to do it.** Fixed by emitting specific events
(`OpenMenuPressed`/`InteractPressed`) directly, and by not routing mouse through this mechanism at
all (its click pipeline was always independent of bindings, so there was nothing to de-duplicate
in the first place once the generic event was gone). Also removed `ToggleFullscreen` as unnecessary
scope - F11 already provides it at the browser level.

**Bugs found and fixed along the way** (survived both revisions): `previousActionButtons` was
being captured one frame later than intended in the first pass's edge-detection logic (moot once
that mechanism was removed, but real while it existed); `DeviceDetector.pollGamepads()` only
flagged a device-list change on gamepad *disconnect*, never *connect* via polling - harmless under
the old "rebuild every frame regardless" design, but a real bug once the connected-profile-id cache
started depending on `DevicesChanged` firing reliably. Both are covered by regression tests.

## Status

✅ Done — implemented 2026-07-24, revised twice the same day after design reviews (see "Revision
history"). `Interact`/`OpenMenu` now route through `InputActionResolver` for keyboard and gamepad
(mouse keeps its pre-existing independent dispatch), via real DOM events for keyboard and a
`DeviceDetector`-polled diff for gamepad, with no dispatcher class and no generic event envelope -
`InputActionResolver` resolves all the way to a specific, self-explanatory event per action.
`ToggleUI` and `ToggleFullscreen` removed rather than built. Full test suite green.

---
**Signature**: P1
