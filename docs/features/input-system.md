# Feature: Input System

**Act**: 2 (Gate 1)
**Status**: In Progress — **substantially more built than this doc previously described** (rewritten
2026-07-22 from a direct code survey; see "Current state" below for the corrected picture)
**Priority**: High

## Goal

A unified input abstraction layer that cleanly supports mouse/keyboard today, adds gamepad support
as the intermediate step (overlaps heavily with VR controller inputs), and then extends to VR
controllers for Gate 2 — with remappable inputs as a stretch goal.

## Current state (2026-07-22 code survey — read this before starting)

The abstraction and gamepad support already exist. The real remaining work is narrower than
"build gamepad support" — it's fixing a live focus/pause bug, finishing two half-wired camera
controls, and the VR routing itself.

- **`InputManager`** (`client/src/input/InputManager.ts`) — composition-based coordinator, not a
  monolith: wraps `InputStateTracker`, `InputEventAdapter`, `InputProfileService`,
  `InputActionResolver`, `CameraInputApplier` (`:29-33`). Handles keyboard+mouse (WASD/arrows,
  Space/C, mouse-drag look), sprint (Shift), and gamepad already. `startListening()`/
  `stopListening()` exist (`:56-79`) and toggle document-level listeners.
- **Binding abstraction already exists**, just not under the `IInputSource` name this doc used to
  invent: `InputProfile.ts` defines an `InputBinding` union (keyboard-button, mouse-button,
  mouse-axis, gamepad-button, gamepad-axis, touch-gesture, xr-component) and
  `BUILTIN_INPUT_PROFILES` for `MouseKeyboard`, `GamepadStandard`, `Touch`, and `VR`
  (`InputProfile.ts:146-245`). `InputActionResolver.ts` + `BindingResolver.ts` resolve any binding
  type into a normalized action value. **Do not build a parallel `IInputSource`
  class hierarchy** — extend this existing shape instead (per the project's "survey before you
  extend" rule).
- **Gamepad support is done, not planned**: `DeviceDetector.ts` polls `navigator.getGamepads()`
  (`:71-101`) and listens for `gamepadconnected`/`gamepaddisconnected`; `InputActionResolver.ts:35-38`
  also polls per frame. `InputProfile.ts:203-221` has stick/look/button bindings for a standard
  gamepad. **Device iteration already covers all four device kinds, not just gamepad** — mouse/keyboard
  (always present), gamepad (connect/disconnect + poll), touch (first `touchstart`), and VR (via
  `setXRSession()`, driven by `WebXRCoordinator`'s session start/end, reading real `XRSession.inputSources`).
  Added 2026-07-23: `DeviceDetector.emitDevicesChanged()` — the single place all four paths funnel
  through — now logs the current device list (`Logger.info`) every time it changes, including once at
  `start()`. Same `console` under the hood for both the web build (browser devtools) and the desktop
  build (webview devtools), so no separate desktop-side log plumbing was needed. A read-only device
  list in the Controls settings panel (distinct from the existing profile-select dropdown, which
  collapses multiple devices of the same kind into one entry) was considered but deferred — evaluate
  after reviewing real logs from a machine with keyboard + gamepad + VR controllers connected.
- **Remap-capture in `ControlsPanel.ts` is NOT gamepad-only — this doc previously understated it
  (corrected 2026-07-22)**: `startCapture()` (`:174-208`) branches on device kind and wires up
  `handleCaptureKeyDown` (keyboard), `handleCaptureMouseDown`/`handleCaptureMouseMove` (mouse
  button + mouse axis, including axis direction), and `pollGamepadCapture` (gamepad stick/button) —
  all four capture paths already exist and write through the same `profileService.setActionBinding()`.
  Bindings are stored via `InputProfileStore.ts`, which reads/writes through `AppSettings` — i.e.
  already persisted, not in-memory-only. **Stretch goal #8 ("remappable inputs") is functionally
  done**, not "gamepad only, keyboard/mouse remaining" as previously stated.
- **VR profile bindings are defined but not consumed** — `InputProfile.ts:233-244` has a `VR`
  profile, but nothing routes actual WebXR controller events through `InputActionResolver` yet.
  `WebXRCoordinator.ts:100` has an explicit guard comment: "we should ABSOLUTELY NOT update the
  camera in VR this way (from keybinds rather than headset data)," and mouse-drag look is
  deliberately disabled there (`:103`) — VR input routing is a real, not-yet-started Gate 2 task,
  not a small wiring gap.
- **`WebXRCoordinator`** (`client/src/webxr/WebXRCoordinator.ts`) owns more than XR session
  lifecycle: it constructs `InputManager` itself (`:32,50-55`) and drives camera
  movement/rotation every frame via `RenderLoopRegistry` (`:72,78-80,98-105`). It also exposes its
  own `pauseInput()`/`resumeInput()` (`:110-119`) — this is the "wider input surface" a since-deleted
  tech-debt entry used to reference (that entry no longer exists in `docs/tech-debt.md`; this doc's
  old citation to it was dead — removed).

### A live bug, not just missing polish

~~`InputEventAdapter.ts:16-20` and `InputStateTracker.ts:40-48` attach keydown/keyup listeners at
`document` level with no focus/target check — typing anywhere leaks into `keysPressed`. The only
existing mitigation anywhere is `GameLibraryBinderUI.ts:421`'s `e.stopPropagation()` on one search
input.~~ **Fixed**: `InputStateTracker.handleKeyDown` (`InputStateTracker.ts`) now bails out early
when `event.target` is a text-editable element (input/textarea/contenteditable), via a new shared
`DOMUtils.isEditableElement()` check — see task 2 below for the reproducible case this closes
(`SteamUIPanel`'s Steam-ID field had zero protection before this) and why no suppressor stack turned
out to be needed.

~~Worse: `PauseMenuManager.pauseInput()`/`resumeInput()` fire `callbacks.onPauseInput?.()`/
`onResumeInput?.()`, but `SystemUICoordinator.ts:68` constructed `PauseMenuManager` with empty
callbacks, so opening the pause menu did not actually suspend camera movement.~~ **Fixed**:
`SystemUICoordinator` now wires those callbacks to emit `InputEventTypes.Pause`/`Resume` (the same
event `GameLibraryBinderUI` already emits for its own open/close), which the existing
`WebXREventHandler` listener routes to `WebXRCoordinator.pauseInput()`/`resumeInput()`. Verified via
unit test (`test/unit/ui/system-ui-coordinator-input-pause.test.ts`) and in the running app (console
now logs `Input paused: menu` / `Input resumed: menu` on menu open/close).

### Dead/half-wired camera controls

- `RollLeft`/`RollRight` actions are defined (`InputActions.ts:10-11,52-53`) and bound to Q/E
  (`InputProfile.ts:191-196`), but `CameraInputApplier.ts` — the only place input gets applied to
  the camera — never reads them (`:15-38` only applies translate X/Y/Z and yaw). The binding is
  live but has zero effect.
- `InputStateTracker.getProgressiveSpeed()` (acceleration ramp, `:59-72`) exists but has **zero
  callers** anywhere in the codebase.
- No camera-reset hotkey/action exists at all (confirmed via full-codebase search).
- ~~**Found 2026-07-22: mouse-driven axis look was dead end-to-end, not just unapplied.**
  `InputAction.LookVertical` was already a fully-defined axis action with gamepad/VR bindings and
  remap-capture support, but `InputActionResolver` hardcoded `mouseDeltaX: 0, mouseDeltaY: 0`, so
  the generic `mouse-axis` binding always resolved to `0` for real mouse movement. Horizontal look
  only worked through a second, parallel path bypassing the binding system entirely, with no Y
  equivalent at all.~~ **Fixed 2026-07-23** (task 4) — see task 4 below and
  `docs/plans/mouse-look-and-pointer-lock-plan.md` for the full fix, including a units-mismatch bug
  found and fixed along the way in the cross-device axis merge.

## Acceptance Criteria

**Gate 1 (before sharing):**
- All navigation and menu interaction accessible via keyboard/mouse without focus bleed into the scene
- Gamepad controller navigation works for basic movement and game selection — **partially true, corrected 2026-07-23**: movement and look axes are real and now covered by tests (task 8). Game selection is not — `InputAction.Interact` (and `OpenMenu`/`ToggleUI`/`ToggleFullscreen`) resolve correctly through the binding pipeline for every device including gamepad, but nothing anywhere consumes them; selection is mouse-click raycasting only, menu-open is a hardcoded `Escape` listener. See [`gamepad-button-actions-unconsumed`](../tech-debt.md#id-gamepad-button-actions-unconsumed).
- Input method detection and seamless switching between keyboard and gamepad
- Camera roll toggle, movement acceleration, configurable speeds — bindings/state exist, application doesn't; wire or remove

**Gate 2 (Act 2 complete):**
- VR controller input routed through the same abstraction layer as gamepad (via the already-defined `VR` `InputProfile`)
- Raycast-based interaction for game boxes and UI via VR controller
- All core interactions (navigate, select, open detail panel, open menu) work in headset

**Stretch:**
- Remappable inputs — user can reassign any action to any input; persisted in settings. **Already functionally done** for gamepad, keyboard, and mouse button/axis capture in `ControlsPanel.ts`, persisted via `AppSettings` (corrected 2026-07-22, see task 10).

## Stories / Tasks (priority order)

1. ✅ **Fix the pause-menu input-leak bug** — wire real `onPauseInput`/`onResumeInput` callbacks into `SystemUICoordinator.ts`'s `PauseMenuManager` construction so opening the pause menu actually calls `WebXRCoordinator.pauseInput()`/`resumeInput()`. Done by emitting the existing `InputEventTypes.Pause`/`Resume` events (already consumed by `WebXREventHandler`) rather than a direct cross-coordinator call.
2. ✅ **Focus management** — done via `event.target`, not a suppressor stack. `InputStateTracker.handleKeyDown` now checks whether the event's originating element (`event.target`, always the actually-focused element for a `document`-level bubble-phase listener) is text-editable, and bails before touching `keysPressed`/`inputState` if so. This turned out to make the doc's "stack vs boolean" question moot: suppression is derived per-event from live DOM focus, not tracked as toggled state, so there's nothing to stack. `keyup` is deliberately left unguarded (always processed) so a key already down when focus shifts into a field doesn't get stuck on. Added `DOMUtils.isEditableElement()` and reused it to replace `PauseMenuManager`'s duplicate `isInputFocused()` check (was `contentEditable === 'true'`, kept that exact form — jsdom doesn't implement the inherited `isContentEditable` getter, and it matches working precedent). Confirmed `SteamUIPanel.ts:173`'s Steam-ID input had **no** protection before this (unlike the Binder's search input, which already had a local `stopPropagation()`) — typing a profile URL there was live-reproducible camera drift. Left `GameLibraryBinderUI.ts:421`'s existing `stopPropagation()` in place rather than removing it as "superseded": it's also serving a second job (blocking the binder's own document-level ArrowLeft/ArrowRight spread-navigation while the user moves the text cursor inside the search box), so removing it would have reintroduced that conflict.
3. ✅ **Wire `RollLeft`/`RollRight`, ship unbound by default** — `CameraInputApplier.updateRotation` now applies `RollLeft`/`RollRight` to `camera.rotation.z` (a named `ROLL_RADIANS_PER_FRAME` constant, not a magic number). Removed the default `KeyQ`/`KeyE` entries from `BUILTIN_INPUT_PROFILES[MouseKeyboard]` (`InputProfile.ts`) so Roll ships bindable-but-unassigned, per 2026-07-22 discussion — cheap specifically because remap-capture already handles keyboard binding generically, no new remap UI work needed. Also fixed a stale HUD hint (`index.html`'s `#controls-help`) that hardcoded "Q/E - Roll camera" and was now wrong; flagged (not fixed, out of scope) a fully orphaned legacy template at `client/src/ui/pause/templates/controls-panel.html` that duplicates the same stale claim but isn't imported anywhere. Verified: unit tests for both the rotation math and the unbound-by-default profile state, plus live in the running app — Controls panel shows "Roll Left: Unbound" out of the box, and rebinding Roll Left to a new key via the existing capture UI actually rolls the camera with no console errors.
4. ✅ **Vertical look** — done 2026-07-23 per `docs/plans/mouse-look-and-pointer-lock-plan.md`. Retired the dead mouse-axis path entirely rather than extending it: `InputStateTracker` now tracks a real Y delta under a generalized "mouse-look active" gate (right-click held or pointer-locked), `InputActionResolver`/`InputManager` feed real deltas through instead of hardcoding `0`, and `CameraInputApplier` applies clamped pitch (`±89°`) from `LookVertical` uniformly for mouse and gamepad. Ships bound to `mouse-axis y` by default, paired with `LookHorizontal`. Found and fixed a units-mismatch bug along the way in the cross-device axis merge (mouse's unbounded raw pixels vs. gamepad's `-1..1` range) — see the plan doc for the fix (a `sensitivity` field on `GamepadAxisBinding`, applied after its dead-zone clamp) and the one known, accepted limitation it doesn't solve (mouse still wins the merge over gamepad on frames where both move simultaneously). Also fixed a stale `ControlsPanel` note that still listed vertical look as unwired for controllers.
5. ✅ **Mouse capture (pointer lock) by default** — done 2026-07-23 per `docs/plans/mouse-look-and-pointer-lock-plan.md`. New `AppSettings.inputMouseLockEnabled` (default `true`) with a checkbox in `ControlsPanel`'s Input Devices section. The actual `requestPointerLock()`/`document.exitPointerLock()` calls live in `SystemUICoordinator` (not `PauseMenuManager` as originally sketched — `SystemUICoordinator` already holds the renderer canvas and already had the task-1 callback-to-event wiring pattern to extend), triggered from `PauseMenuManager`'s previously-unwired `onMenuOpen`/`onMenuClose` callbacks — the same "callback exists, nothing wires it" bug shape as task 1. Gated on `!isXRSessionActive` (tracked via `WebXREventTypes.SessionStart`/`SessionEnd`, event-driven, no direct cross-class call). Menu-open releases the lock unconditionally (needed for a gamepad-bound `OpenMenu` press, which never touches Escape); menu-close re-requests it if enabled. Rejections are caught and swallowed — non-fatal. Decided not to add a `pointerlockchange` listener for this version: task 4's `isMouseLookActive()` already reads live lock state every `mousemove`, so the core mechanic self-corrects with no cached state to go stale; there's no UI element yet that would need one. Verified via 5 unit tests covering all gating branches; live verification partial — confirmed the checkbox and settings wiring, but this session's browser sandbox disallows the `pointer-lock` Permissions-Policy feature entirely, so actual cursor capture couldn't be visually confirmed (environment limitation, not a code issue).
6. ✅ **Wire or remove `getProgressiveSpeed()`** — decided 2026-07-23: neither, for now. Confirmed zero callers (`CameraInputApplier.updateMovement()` applies `options.speed` directly per axis, no ramp anywhere). Left in place rather than deleted — kept as a plausible alternate movement scheme to revisit later, tagged `// TD: progressive-speed-movement-unwired` and tracked in `docs/tech-debt.md` rather than silently left undocumented.
7. ✅ **Camera reset hotkey** — added `InputAction.ResetCamera` (button). Per 2026-07-23 discussion: rotation-only, not position — resets `camera.rotation` to identity in `CameraInputApplier.updateRotation` (alongside Roll, which it also undoes) and leaves `camera.position`/movement untouched entirely. Ships **unbound by default**, same precedent as Roll: since it only affects rotation like Roll does, it gets the same "bindable, no default" treatment rather than claiming a key. Verified via unit tests (rotation reset, no-op when not pressed, movement unaffected even when held simultaneously) and confirmed the profile has no default binding; live-tested by binding it to a key through the existing capture UI and holding it with no console errors.
8. ✅ **Test the existing gamepad path** — added coverage for what's actually real: gamepad-driven camera translation (movement axes) and the gamepad Interact button resolving correctly through the full `InputManager` → `InputActionResolver` pipeline (`test/unit/input/input-manager-multi-device.test.ts`), on top of already-existing `BindingResolver`/`DeviceDetector` coverage for gamepad axis/button resolution and connect/disconnect. **Found along the way, not assumed**: "game selection" in the Gate 1 acceptance criteria does not work via gamepad — see the corrected acceptance-criteria bullet above and [`gamepad-button-actions-unconsumed`](../tech-debt.md#id-gamepad-button-actions-unconsumed). Didn't wire it as part of this task since it needs a real design decision (how does "point and select" work without a mouse cursor), not a test-coverage fix.
9. **VR controller routing** (Gate 2) — route real WebXR controller events through `InputActionResolver` using the already-defined `VR` `InputProfile`; replace `WebXRCoordinator`'s keybind-driven camera update for XR sessions per its own guard comment. This is the "VR Controllers" sub-scope of [VR Support](vr-support.md), deliberately sequenced before headset locomotion/comfort work (2026-07-23 decision) — device *detection* for VR controllers already works today (see task 4/8 area above), this task is the remaining *input-routing* half. **Blocked**: needs a plan doc per this project's planning rules before implementation starts — VR Support has no plan doc yet (see `vr-support.md`).
10. ✅ **Remappable inputs (stretch) — functionally done, not started as previously stated.** `ControlsPanel.ts` already supports capture for gamepad, keyboard, and mouse button/axis bindings (see corrected "Current state" above), persisted through `AppSettings` via `InputProfileStore.ts`. Revisit only if a gap turns up in practice (e.g. while testing task 8).

## Notes / Open Questions

- The previous version of this doc cited a `docs/tech-debt.md` "Centralized Input Management
  System" entry and an `IInputSource` design that don't exist in the codebase — both removed in
  this rewrite. If either gets (re)designed, add it back deliberately rather than assuming it was
  already decided.
- The gamepad → VR controller progression means gamepad infrastructure directly accelerates VR
  input — confirmed true, `InputActionResolver`'s binding-agnostic resolution is exactly the
  reason.
- `WebXRCoordinator` owning camera-movement/rotation *and* `InputManager` construction is worth a
  second look once VR routing (task 9) actually lands — splitting XR-session-lifecycle concerns
  from input-application concerns may become clearer with a second real caller (VR) to compare
  against, rather than speculating now with only one.
- **Does `GameLibraryBinderUI.ts:421`'s `stopPropagation()` conflict with rebindable arrow keys?**
  (Raised 2026-07-22.) No — it's orthogonal to the input-binding system. Task 2's `event.target`
  guard in `InputStateTracker.handleKeyDown` already blocks *any* key typed into *any* text field
  from reaching a bound action, arrow keys included, independent of this `stopPropagation()`. And
  opening the Binder already fully stops `InputManager` (task 1's fix), so no bound action fires
  while it's open regardless of focus. The `stopPropagation()` only shields the Binder's own
  hardcoded, non-rebindable `document`-level Escape/ArrowLeft/ArrowRight spread-navigation shortcut
  (`GameLibraryBinderUI.ts:150`) from firing while the user is just moving the text cursor inside
  the search box — a different, older mechanism than `InputActionResolver`/`InputProfile` entirely.
