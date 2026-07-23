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
  gamepad.
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
- **New finding (2026-07-22): mouse-driven axis look is dead end-to-end, not just unapplied.**
  `InputAction.LookVertical` is already a fully-defined axis action (`InputActions.ts:9,51`) with
  gamepad and VR bindings (`InputProfile.ts:214,242`) and remap-capture support (`ControlsPanel.ts`
  already prompts for +/- direction specifically for `LookHorizontal`/`LookVertical`,
  `:384-397`) — but `InputActionResolver.ts:55-56` hardcodes `mouseDeltaX: 0, mouseDeltaY: 0` when
  building the `RawInputState` it hands to `BindingResolver`, so the generic `mouse-axis` binding
  type (`BindingResolver.ts:80-85`) always resolves to `0` for real mouse movement — dead for both
  `LookHorizontal` and `LookVertical`. Horizontal look only works today through a **second, parallel**
  path: `InputStateTracker`'s `pendingMouseDeltaX` accumulator, which only accumulates while the
  right mouse button is held (`:35-37`), consumed via `InputManager.updateCameraRotation`'s explicit
  `deltaX` param — entirely bypassing the action-binding system. There is no equivalent accumulator
  for Y at all. Binding vertical look to mouse movement, or moving to always-on captured-cursor look,
  both need this fixed first — see queued items below, not a simple "add one more axis" change.

## Acceptance Criteria

**Gate 1 (before sharing):**
- All navigation and menu interaction accessible via keyboard/mouse without focus bleed into the scene
- Gamepad controller navigation works for basic movement and game selection — **already true**, verify with a test rather than building it
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
4. 🔮 **Vertical look (queued, not yet started)** — bind mouse-Y movement to `InputAction.LookVertical` in `CameraInputApplier.updateRotation`, with pitch clamping so the camera can't flip past vertical. Blocked on the dead mouse-axis path documented above: `InputStateTracker` needs a real per-frame Y delta (it currently tracks no Y delta at all, and its only X-delta accumulator is gated on right-mouse-button-held), and `InputActionResolver` needs to actually populate `mouseDeltaX`/`mouseDeltaY` instead of hardcoding `0`. Do this together with task 5 — they share the same plumbing fix.
5. 🔮 **Mouse capture (pointer lock) by default (queued, not yet started)** — replace the current right-click-drag-to-look model with always-on captured-cursor FPS-style look. Needs: (a) the same real mouse-delta plumbing as task 4, no longer gated on a mouse button; (b) a lock/unlock UX — Pointer Lock requires a user gesture to acquire, and the browser's own pointer-unlock key is Escape, which this feature already uses for the Pause Menu (tasks 1–2) and `OpenMenu`'s default binding (`InputProfile.ts:183`). **Resolved 2026-07-23**: the intended model — pointer lock exits on Escape (browser default, not scriptable/overridable — this is a mandatory UA safeguard, `preventDefault()` on the keydown cannot stop it), and the *same* Escape keydown still reaches page-level listeners (the browser doesn't consume it), so the existing Escape → `OpenMenu` path (already shipped) opens the Pause Menu on that same press without any new coordination code. Confirmed correct: while locked, the cursor is captured and there's no visible pointer to click a UI button with anyway, so Escape is the only realistic path to the menu while captured — nothing to reconcile, don't build a handshake between "unlock" and "open menu," they're already independent and compatible. One real remaining piece: also listen for the `pointerlockchange` event (not just Escape) to keep internal "is captured" UI state in sync, since the browser can drop pointer lock through other paths too (tab blur, fullscreen change) that don't go through our Escape handler at all.
6. **Wire or remove `getProgressiveSpeed()`** — same call: either give `CameraInputApplier` a caller for the existing acceleration-ramp logic, or delete the dead code.
7. ✅ **Camera reset hotkey** — added `InputAction.ResetCamera` (button). Per 2026-07-23 discussion: rotation-only, not position — resets `camera.rotation` to identity in `CameraInputApplier.updateRotation` (alongside Roll, which it also undoes) and leaves `camera.position`/movement untouched entirely. Ships **unbound by default**, same precedent as Roll: since it only affects rotation like Roll does, it gets the same "bindable, no default" treatment rather than claiming a key. Verified via unit tests (rotation reset, no-op when not pressed, movement unaffected even when held simultaneously) and confirmed the profile has no default binding; live-tested by binding it to a key through the existing capture UI and holding it with no console errors.
8. **Test the existing gamepad path** — acceptance criteria already claim this works; add coverage rather than (re)implementing it.
9. **VR controller routing** (Gate 2) — route real WebXR controller events through `InputActionResolver` using the already-defined `VR` `InputProfile`; replace `WebXRCoordinator`'s keybind-driven camera update for XR sessions per its own guard comment. Depends on VR Support feature.
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
