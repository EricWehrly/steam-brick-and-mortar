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
  gamepad. `ControlsPanel.ts` even has a live gamepad-capture remap UI already
  (`pollGamepadCapture`, `:310`) — remappable inputs (the doc's "stretch goal") is partially built
  for gamepad specifically.
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

### Two dead/half-wired camera controls

- `RollLeft`/`RollRight` actions are defined (`InputActions.ts:10-11,52-53`) and bound to Q/E
  (`InputProfile.ts:191-196`), but `CameraInputApplier.ts` — the only place input gets applied to
  the camera — never reads them (`:15-38` only applies translate X/Y/Z and yaw). The binding is
  live but has zero effect.
- `InputStateTracker.getProgressiveSpeed()` (acceleration ramp, `:59-72`) exists but has **zero
  callers** anywhere in the codebase.
- No camera-reset hotkey/action exists at all (confirmed via full-codebase search).

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
- Remappable inputs — user can reassign any action to any input; persisted in settings. Gamepad remap capture already exists in `ControlsPanel.ts`; extending to keyboard/mouse bindings is the remaining work, not starting from zero.

## Stories / Tasks (priority order)

1. ✅ **Fix the pause-menu input-leak bug** — wire real `onPauseInput`/`onResumeInput` callbacks into `SystemUICoordinator.ts`'s `PauseMenuManager` construction so opening the pause menu actually calls `WebXRCoordinator.pauseInput()`/`resumeInput()`. Done by emitting the existing `InputEventTypes.Pause`/`Resume` events (already consumed by `WebXREventHandler`) rather than a direct cross-coordinator call.
2. ✅ **Focus management** — done via `event.target`, not a suppressor stack. `InputStateTracker.handleKeyDown` now checks whether the event's originating element (`event.target`, always the actually-focused element for a `document`-level bubble-phase listener) is text-editable, and bails before touching `keysPressed`/`inputState` if so. This turned out to make the doc's "stack vs boolean" question moot: suppression is derived per-event from live DOM focus, not tracked as toggled state, so there's nothing to stack. `keyup` is deliberately left unguarded (always processed) so a key already down when focus shifts into a field doesn't get stuck on. Added `DOMUtils.isEditableElement()` and reused it to replace `PauseMenuManager`'s duplicate `isInputFocused()` check (was `contentEditable === 'true'`, kept that exact form — jsdom doesn't implement the inherited `isContentEditable` getter, and it matches working precedent). Confirmed `SteamUIPanel.ts:173`'s Steam-ID input had **no** protection before this (unlike the Binder's search input, which already had a local `stopPropagation()`) — typing a profile URL there was live-reproducible camera drift. Left `GameLibraryBinderUI.ts:421`'s existing `stopPropagation()` in place rather than removing it as "superseded": it's also serving a second job (blocking the binder's own document-level ArrowLeft/ArrowRight spread-navigation while the user moves the text cursor inside the search box), so removing it would have reintroduced that conflict.
3. **Wire or remove `RollLeft`/`RollRight`** — `CameraInputApplier.ts` needs to apply the already-bound Q/E roll actions, or the dead binding should be removed. Small either way; don't leave it half-wired.
4. **Wire or remove `getProgressiveSpeed()`** — same call: either give `CameraInputApplier` a caller for the existing acceleration-ramp logic, or delete the dead code.
5. **Camera reset hotkey** — doesn't exist yet; add an action + binding + `CameraInputApplier` handling.
6. **Test the existing gamepad path** — acceptance criteria already claim this works; add coverage rather than (re)implementing it.
7. **VR controller routing** (Gate 2) — route real WebXR controller events through `InputActionResolver` using the already-defined `VR` `InputProfile`; replace `WebXRCoordinator`'s keybind-driven camera update for XR sessions per its own guard comment. Depends on VR Support feature.
8. **Remappable inputs** (stretch) — extend `ControlsPanel.ts`'s existing gamepad-capture remap UI to keyboard/mouse bindings; persist to settings.

## Notes / Open Questions

- The previous version of this doc cited a `docs/tech-debt.md` "Centralized Input Management
  System" entry and an `IInputSource` design that don't exist in the codebase — both removed in
  this rewrite. If either gets (re)designed, add it back deliberately rather than assuming it was
  already decided.
- The gamepad → VR controller progression means gamepad infrastructure directly accelerates VR
  input — confirmed true, `InputActionResolver`'s binding-agnostic resolution is exactly the
  reason.
- `WebXRCoordinator` owning camera-movement/rotation *and* `InputManager` construction is worth a
  second look once VR routing (task 7) actually lands — splitting XR-session-lifecycle concerns
  from input-application concerns may become clearer with a second real caller (VR) to compare
  against, rather than speculating now with only one.
