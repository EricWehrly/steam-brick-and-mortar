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

1. ✅ **Task 4 — vertical look, retiring Path A** — done 2026-07-23. Implemented exactly as
   proposed, plus one thing this plan didn't call out: a units-mismatch problem in the
   cross-device axis merge. `InputActionResolver.updateFrame`'s merge picks whichever connected
   profile produced the bigger raw magnitude for a given axis (`Math.abs(value) > Math.abs(existing)`)
   — fine when both sides are already normalized (e.g. two `-1..1` gamepad axes), but mouse's raw
   pixel deltas are unbounded while gamepad's normalized `-1..1` axis was getting a `* 2` multiplier
   applied *after* merge in the old `CameraInputApplier` (to compensate for feeling weak next to
   raw pixels). Once mouse started flowing through the same merge, that post-hoc `* 2` would have
   applied to whichever device happened to win that frame, not specifically gamepad. Fix: moved the
   `* 2` to where it belongs — a new optional `sensitivity` field on `GamepadAxisBinding` (mirroring
   `MouseAxisBinding`'s existing field), applied in `resolveGamepadAxisValue` *after* its own
   dead-zone clamp (applying it before would just get clamped back to 1, silently no-op-ing the
   multiplier). `CameraInputApplier` now applies `options.mouseSensitivity` uniformly to whatever
   the merged axis value is, regardless of source — reproduces the exact old feel for both devices,
   bit-for-bit, without a per-source special case. Known accepted limitation, not solved: mouse's
   raw pixel magnitude will typically still win the cross-device merge over gamepad's bounded
   `±1 * sensitivity` range whenever both produce simultaneous nonzero input on the same frame —
   a pre-existing "biggest magnitude wins" heuristic, not something this task introduced, and out
   of scope to fully arbitrate here.
   - `InputStateTracker`: added Y accumulator; generalized the button-gate to `isMouseLookActive()`
     (right-click held **or** `Boolean(document.pointerLockElement)` — jsdom doesn't implement
     Pointer Lock and returns `undefined` rather than `null` when unlocked, so a truthy check is
     required, not `!== null`, matching the same jsdom gap found during task 2's `contentEditable`
     work)
   - `InputManager`/`InputActionResolver`: real deltas now flow through; `explicitDeltaX` param
     removed entirely (only caller never passed one)
   - `CameraInputApplier`: drop `deltaX` param, unify yaw onto `getAxisValue(LookHorizontal)`, add
     clamped pitch (`±89°`) from `LookVertical`
   - `InputProfile.ts`: added default `LookVertical: mouse-axis y`, confirmed via the open question
     below being resolved as "bind by default"
   - Rewrote the 5 test call sites across `test/unit/webxr/input-manager.test.ts` and
     `test/unit/input/input-manager-multi-device.test.ts` that drove `updateCameraRotation` via the
     removed explicit-delta param — they now dispatch real `mousedown(button:2)`/`mousemove` events
     and call `updateFrame()`, exercising the actual accumulation path for the first time (it was
     never covered before; every prior test bypassed it via the explicit param)
   - Added dedicated coverage: `camera-input-applier-look.test.ts` (yaw/pitch/clamping),
     `input-state-tracker-mouse-look.test.ts` (gate generalization), plus binding-resolver cases for
     the vertical mouse axis and the new gamepad `sensitivity` field
   - Fixed a stale `ControlsPanel` "Fast-follow" note that listed vertical look as not-wired for
     controller — it's wired now (`CameraInputApplier` reads `LookVertical` regardless of source,
     and gamepad's binding already existed, just was never read before this change)
   - Verified live: mapping table shows "Look Vertical: Mouse Y"; held a real right-click drag
     across ~60 render-loop frames including a deliberate extreme-value stress test at the pitch
     clamp boundary, no console errors
2. ✅ **Task 5 — pointer lock by default** — done 2026-07-23, with two deliberate departures from
   the plan above:
   - **Setting name**: `inputMouseLockEnabled`, not `mouseLockEnabled` — matches this codebase's
     existing `input*` naming convention for every other input setting (`inputSpeed`,
     `inputMouseSensitivity`, etc.), not a functional change.
   - **Owner of the request/release calls: `SystemUICoordinator`, not `PauseMenuManager`.**
     `PauseMenuManager` doesn't have (and per "zero cross-class dependencies" shouldn't get) a
     direct reference to the renderer canvas or XR session state. `SystemUICoordinator` already
     holds `rendererDomElement` (used for scene-click raycasting) and already owns the
     `onPauseInput`/`onResumeInput` callback-to-event wiring from task 1 — extending that same
     wiring with `onMenuOpen`/`onMenuClose` callbacks (which `PauseMenuManager` already exposed but
     nothing wired, exactly like task 1's bug) keeps this in the class that actually has what it
     needs, and emits the same already-defined `UIEventTypes.MenuOpen`/`MenuClose` events
     `WebXREventHandler` already listens for (though this class doesn't need to consume them itself
     — see below). XR session state is tracked via a local `isXRSessionActive` boolean updated by
     listening to `WebXREventTypes.SessionStart`/`SessionEnd` — event-driven, no direct call into
     `WebXRCoordinator`/`WebXRManager`.
   - `AppSettings.inputMouseLockEnabled` (default `true`), `ControlsPanel` checkbox in the Input
     Devices section (same `UIComponentUtils.setupToggle` pattern as the existing "Active" toggle).
   - `SystemUICoordinator.handlePauseMenuClosed` requests pointer lock on `rendererDomElement` when
     the setting is on and no XR session is active; `handlePauseMenuOpened` unconditionally calls
     `document.exitPointerLock()` — needed even though Escape already triggers the browser's own
     auto-unlock, because a gamepad-bound `OpenMenu` button press doesn't touch Escape at all and
     would otherwise open the menu with the cursor still captured and unusable.
   - `requestPointerLock()` rejections (transient-activation cooldown, unfocused document, denied
     permissions policy) are caught and swallowed — non-fatal, the cursor just stays free.
   - **Open question #2, resolved as "not needed for this version":** no dedicated
     `pointerlockchange` listener was added. The core mouse-look gate
     (`InputStateTracker.isMouseLookActive()`, from task 4) already reads
     `document.pointerLockElement` live on every `mousemove`, so it self-corrects immediately if
     lock is lost through a path we don't control (tab blur, fullscreen exit) — no cached state to
     go stale for the *mechanic* to keep working correctly. There's also no UI element yet (e.g. a
     lock-status indicator) that would need to react to an external unlock. Revisit if either
     changes.
   - Verified via 5 new unit tests covering all four gating branches (enabled/disabled, XR
     active/inactive, open releases/close requests). Live verification is partial: confirmed the
     checkbox renders and reflects the default-on setting, and that closing the menu via a real
     (trusted) Escape keypress produces zero console errors — but this session's sandboxed browser
     pane disallows the `pointer-lock` Permissions-Policy feature entirely
     (`document.featurePolicy.allowsFeature('pointer-lock')` → `false`, confirmed directly), so
     actual OS-level cursor capture could not be visually verified from this tool. That's an
     environment restriction of the testing sandbox, not a code defect — the graceful-rejection
     path being silent and error-free is itself the expected, correct behavior for a
     policy-disallowed context.

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
| `client/src/core/AppSettings.ts` | Add `inputMouseLockEnabled` boolean setting |
| `client/src/ui/pause/panels/ControlsPanel.ts` | Add mouse-lock checkbox in Input Devices section |
| `client/src/ui/coordinators/SystemUICoordinator.ts` | Wire `onMenuOpen`/`onMenuClose` callbacks (request/release pointer lock, track XR session state) — not `PauseMenuManager`, see task 5 write-up above for why |
| `client/src/webxr/WebXRCoordinator.ts` | No change — confirmed `isSessionActive()` already exists for task 9 to use later |
| `test/unit/webxr/input-manager.test.ts` | Update tests built around the removed `explicitDeltaX` param |

## Related documents
- `docs/features/input-system.md` — tasks 4, 5, 9 (this plan's parent feature doc)
- `docs/plans/consolidated-input-manager.md` — original input-system architecture; follow-up note
  #5 already flagged "vertical look policy... not fully applied in camera runtime" as a known gap

## Open questions
1. ✅ Resolved (2026-07-23, "proceed"): `LookVertical` ships bound to `mouse-axis y` by default,
   as proposed.
2. ✅ Resolved (2026-07-23): no `pointerlockchange` listener for this version — see task 5's
   write-up above. Revisit if a lock-status UI indicator gets built, or if silent
   `requestPointerLock()` rejections turn out to be a real support issue in practice.

---
**Status**: ✅ Done — both tasks 4 and 5 implemented
**Priority**: N/A — plan complete
**Blocked by**: None
**Blocks**: Nothing further

---
P1
