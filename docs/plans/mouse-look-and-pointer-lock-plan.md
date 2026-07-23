# Mouse Look & Pointer Lock Plan

## Goal
Land vertical look (`docs/features/input-system.md` task 4) and mouse-capture-by-default (task 5)
together, because building either on today's mouse-look code would mean redoing it a third time
once VR camera routing (task 9) lands.

## Why now
Evaluating tasks 4 and 5 together (2026-07-23 discussion) surfaced that the current mouse-look
code isn't "missing an axis" — it's two parallel, disconnected implementations, one of them
already dead. Extending either task in place would add a third mechanism on top. Fix the
underlying pipeline once, then both tasks (and task 9's VR handoff) build on the same path.

## Current state (evidence)

Two competing mouse-look paths exist today:

- **Path A (live, bypasses the binding system).** `InputStateTracker.handleMouseMove` accumulates
  `pendingMouseDeltaX` only while the right mouse button is held (`mouseButtonsPressed.has(2)`) —
  no Y delta tracked at all. `InputManager.updateCameraRotation(camera, explicitDeltaX?)` drains
  it via `consumeMouseDeltaX()` and hands it to `CameraInputApplier.updateRotation` as an explicit
  `deltaX` param, applied straight to `camera.rotation.y`. This is the *only* thing that currently
  makes mouse-look work, and it's completely outside `InputProfile`/`InputActionResolver`.
- **Path B (dead for mouse).** The `MouseKeyboard` profile's own `LookHorizontal: mouse-axis x`
  binding (`InputProfile.ts:175-177`), meant to resolve generically through
  `InputActionResolver`/`BindingResolver` — the same mechanism gamepad sticks and VR thumbsticks
  already use correctly. But `InputActionResolver.updateFrame()` hardcodes
  `mouseDeltaX: 0, mouseDeltaY: 0` (`InputActionResolver.ts:55-56`) when building the raw state it
  resolves against, so `BindingResolver`'s `mouse-axis` case (`BindingResolver.ts:80-85`) always
  evaluates to `0` for real mouse movement.

Consequence found in passing, independent of tasks 4/5: rebinding "Look Horizontal" via the
Controls panel today does **nothing** — Path A ignores bindings entirely and hardcodes
right-click + mouse-X. Fixing Path B fixes this too, not just vertical look.

## Proposed direction

**Retire Path A, make Path B real, don't add a third path.**

1. `InputStateTracker` gets a real `pendingMouseDeltaY` accumulator (mirroring the existing X one)
   and a `consumeMouseDeltaY()`. Generalize the accumulation gate from the hardcoded
   `mouseButtonsPressed.has(2)` check to "mouse-look is active" — true while right-click is held
   (fallback/pre-lock mode) **or** `document.pointerLockElement` is set (task 5's mode). Both X and
   Y accumulate under the same gate.
2. `InputManager.updateFrame()` passes real `consumeMouseDeltaX()`/`consumeMouseDeltaY()` into
   `InputActionResolver.updateFrame()`, replacing the hardcoded `0, 0`. This is the only change
   needed to make `LookHorizontal`'s existing `mouse-axis` binding — and remapping it — actually
   work.
3. `CameraInputApplier.updateRotation` drops the special-cased `deltaX` param entirely and reads
   yaw purely from `actionResolver.getAxisValue(InputAction.LookHorizontal)` (mouse and gamepad
   both resolve through the same call now — the `gamepadLook` special case goes away too). Add
   pitch: `actionResolver.getAxisValue(InputAction.LookVertical)` applied to `camera.rotation.x`,
   clamped to roughly ±89° so the camera can't flip past vertical.
4. `InputManager.updateCameraRotation(camera)` drops the `explicitDeltaX` param — nothing calls it
   with an explicit value once Path A is gone.
5. Default binding: add `LookVertical: mouse-axis y` to `BUILTIN_INPUT_PROFILES[MouseKeyboard]`,
   paired with the existing `LookHorizontal: mouse-axis x`. Unlike Roll/Reset (utility actions that
   ship unbound), look is a core always-on interaction — bind it by default. Flagging this as a
   recommendation to confirm before implementing, not a unilateral decision.

### VR gating, decided now instead of retrofitted at task 9
`WebXRCoordinator.updateCameraMovement` currently calls the desktop movement/rotation path
unconditionally every frame, even during an active XR session — already a known, commented gap
("we should ABSOLUTELY NOT update the camera in VR this way") slated for task 9.
`WebXRManager.isSessionActive()` already exists to query this. Gate all *new* mouse-look/pointer-lock
code (accumulation, lock acquisition, lock-state UI) behind `!isSessionActive()` from the start, so
task 9 only has to stop calling the desktop path during a session — it won't need to untangle a
second mouse-look mechanism that was built assuming desktop-only.

### Pointer lock UX and the settings toggle
Pointer Lock requires a user gesture to acquire and cannot be silently re-engaged after Escape
releases it (mandatory browser behavior, not scriptable around). Proposed flow:

- New `AppSettings` boolean `mouseLockEnabled` (default `true` — this task's stated goal is
  mouse capture on by default), following the existing boolean-setting pattern already used
  throughout `AppSettings.ts`.
- Checkbox in `ControlsPanel`'s "Input Devices" section, next to the existing "Active" toggle,
  via `UIComponentUtils.setupToggle` (same pattern already used there).
- The checkbox does **not** call `requestPointerLock()` directly — the pause menu is open and
  visible while it's checked, and the cursor needs to stay free to use the menu. Instead, the
  actual `requestPointerLock()`/`exitPointerLock()` calls happen inside `PauseMenuManager`'s
  existing `open()`/`close()` methods (already real user gestures — the ✕ click or Escape
  keypress that closes the menu), gated on `mouseLockEnabled && !webxrManager.isSessionActive()`.
  This reuses the exact open/close machinery tasks 1–3 already built rather than inventing new UX.
- Listen for the `pointerlockchange` event (not just react to our own Escape/close handling) to
  keep internal "is captured" state in sync, since the browser can drop lock through paths that
  don't go through our menu at all (tab blur, fullscreen exit).

## Incremental rollout

Maps directly onto `docs/features/input-system.md` tasks 4 and 5:

1. **Task 4 — vertical look, retiring Path A**
   - `InputStateTracker`: add Y accumulator, generalize the button-gate to "mouse-look active"
   - `InputManager`/`InputActionResolver`: wire real deltas through, remove hardcoded `0, 0`
   - `CameraInputApplier`: drop `deltaX` param, add clamped pitch from `LookVertical`
   - `InputProfile.ts`: add default `LookVertical: mouse-axis y`
   - Update/rewrite tests that assumed the old `explicitDeltaX` signature
     (`test/unit/webxr/input-manager.test.ts` and any `CameraInputApplier.updateRotation` callers)
2. **Task 5 — pointer lock by default**
   - `AppSettings`: add `mouseLockEnabled` (default `true`)
   - `ControlsPanel`: add the checkbox
   - `PauseMenuManager`: request/exit lock in `open()`/`close()`, gated on the setting and
     `!isSessionActive()`
   - New small listener (likely in `InputEventAdapter` or a dedicated class) for
     `pointerlockchange` to keep UI state honest

## Non-goals
- VR controller routing itself (task 9) — this plan only makes sure task 4/5 code doesn't need to
  be revisited when task 9 lands, it doesn't implement the VR side
- Touch look/navigation — out of scope per `consolidated-input-manager.md`'s existing deferral
- A generalized "input context stack" (scene vs. UI focus) — tracked separately as a follow-up in
  `consolidated-input-manager.md`; not needed for this specific fix
- Re-litigating Roll/Reset's unbound-by-default precedent — this plan only concerns Look and lock

## Files affected
| File | Change |
|---|---|
| `client/src/input/InputStateTracker.ts` | Add Y delta accumulator + consumer; generalize accumulation gate |
| `client/src/input/InputManager.ts` | Feed real deltas to `InputActionResolver.updateFrame`; drop `explicitDeltaX` param |
| `client/src/input/InputActionResolver.ts` | Accept real `mouseDeltaX`/`mouseDeltaY` instead of hardcoding `0` |
| `client/src/input/CameraInputApplier.ts` | Drop `deltaX` param + `gamepadLook` special case; add clamped pitch application |
| `client/src/input/InputProfile.ts` | Add default `LookVertical: mouse-axis y` binding |
| `client/src/core/AppSettings.ts` | Add `mouseLockEnabled` boolean setting |
| `client/src/ui/pause/panels/ControlsPanel.ts` | Add mouse-lock checkbox in Input Devices section |
| `client/src/ui/pause/PauseMenuManager.ts` | Request/release pointer lock in `open()`/`close()` |
| `client/src/webxr/WebXRCoordinator.ts` | No change yet — confirmed `isSessionActive()` already exists for task 9 to use later |
| `test/unit/webxr/input-manager.test.ts` | Update tests built around the removed `explicitDeltaX` param |

## Related documents
- `docs/features/input-system.md` — tasks 4, 5, 9 (this plan's parent feature doc)
- `docs/plans/consolidated-input-manager.md` — original input-system architecture; follow-up note
  #5 already flagged "vertical look policy... not fully applied in camera runtime" as a known gap

## Open questions
1. Should `LookVertical` ship with a default binding (`mouse-axis y`, proposed above) or unbound
   like Roll/Reset? Leaning bound-by-default since look is core, not a utility action — needs
   confirmation before implementation.
2. Where should the `pointerlockchange` listener live — folded into `InputEventAdapter` (already
   owns the mouse/keyboard DOM listener lifecycle) or a small new dedicated class? Leaning toward
   `InputEventAdapter` to avoid a class whose only job is one event listener, but worth checking
   against "survey before you extend" once the shape of the state it needs to track is clearer.

---
**Status**: 📋 Plan — not yet implemented
**Priority**: High (blocks tasks 4, 5 in `docs/features/input-system.md`)
**Blocked by**: None
**Blocks**: `docs/features/input-system.md` tasks 4 and 5

---
P1
