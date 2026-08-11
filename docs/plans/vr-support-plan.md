# Plan: VR Support — Sub-scope 1 (VR Controllers)

## Goal

Close [Input System](../features/input-system.md) task 9 and the "VR Controllers" sub-scope of
[VR Support](../features/vr-support.md): route real WebXR motion-controller trigger/thumbstick
input through the existing `InputActionResolver`/`BindingResolver` abstraction (the same one
gamepad already proved out), and get controller-ray-based selection of game boxes working —
replacing, for VR, the screen-center "reticle" simulated click gamepad/keyboard use today.

**Explicitly out of scope, deferred to a later plan**: hover/continuous-highlight on a grabbable
game box, a grab-state toggle, and any physics. The design below doesn't foreclose them (see
"Non-goals" at the bottom) but doesn't build them either.

## Current state (confirmed via code survey, 2026-08-10)

- **Detection already works, routing doesn't.** `DeviceDetector.setXRSession()` reads real
  `XRSession.inputSources` and logs/lists a VR device the same way gamepad does. But
  `BindingResolver.resolveBindingValue`'s `case 'xr-component'` is a literal `return 0` — every VR
  binding (`InputProfile.ts`'s `VR` profile: `Interact`→trigger, `OpenMenu`→menu,
  `LookHorizontal`/`LookVertical`→thumbstick x/y) has always resolved to zero. This is the entire
  blocking gap task 9 refers to.
- **No controller pose, model, or ray exists anywhere.** Confirmed via full-tree search: zero uses
  of `renderer.xr.getController(`/`getControllerGrip(`, `XRControllerModelFactory`, or any
  `.gamepad`/`.targetRaySpace` read off an `XRInputSource`. `@webxr-input-profiles/motion-controllers`
  is an unused devDependency.
- **No render-loop XRFrame access, and none is needed.** `SceneManager.startRenderLoop()`'s
  `renderer.setAnimationLoop()` callback discards three.js's `(time, frame)` args, and
  `RenderLoopRegistry`'s callback contract has no room for one. This turns out not to matter:
  three.js's `renderer.xr.getController(i)`/`getControllerGrip(i)` already return `THREE.Group`s
  whose transforms three.js keeps live internally during `renderer.render()` — no manual
  `XRFrame.getPose()` plumbing required, and TypeScript's built-in DOM lib already fully types
  `XRInputSource` (`.gamepad`, `.handedness`, `.targetRaySpace`, `.gripSpace`), so
  `client/src/webxr.d.ts` doesn't need touching for any of this.
- **No hover/highlight mechanic exists anywhere in the codebase** (confirmed via broad grep) —
  `SceneClickGameBoxRaycast.highlightHit()`'s name is misleading, it only emits the selection
  event. Confirms hover/highlight is genuinely new work, correctly deferred.
- **`SceneClickGameBoxRaycast`'s ray construction is already a clean, small, isolated seam** —
  a few lines (`pointer.set(...)`; `raycaster.setFromCamera(...)`) before
  `intersectObjects`/`resolveGameBoxIntersection`/`highlightHit` run unchanged. Good reuse target.
- **`SystemUICoordinator.handleInteractPressed`** already unconditionally emits `SceneCanvasClick`
  with hardcoded center-screen NDC for every non-mouse `InteractPressed` (keyboard Enter, gamepad
  A, and — once xr-component routing exists — VR trigger alike). Confirmed no changes needed here;
  see Design §4.

## Design

Three existing patterns are reused rather than invented:
1. Three.js's own `getController()`/`getControllerGrip()` pose tracking (no manual frame plumbing).
2. This project's camera-rig-parenting precedent (`SceneManager.cameraRig`) — controllers parent
   under the same rig, for the same reason (three.js's XR pose composition only decomposes
   correctly relative to a parent whose `matrixWorld` reflects rig-driven locomotion).
3. This project's `DataManager`/`DataKey` lazy-resolve pattern, already used by
   `SceneClickGameBoxRaycast` for scene/camera — reused as-is for controller-ray lookup.

### 1. XR gamepad button/axis state → `RawInputState` → `BindingResolver`

No new input-side class — extend the three files that already own this pipeline (survey-before-extend):

- **`DeviceDetector.ts`**: add `getXRGamepads()`/`pollXRGamepads()`, reading live off the
  already-stored `this.xrSession.inputSources` (each real `XRInputSource.gamepad` is a standard
  `Gamepad`-shaped object). `pollXRGamepads()` mirrors `pollGamepads()`: press-edge detection keyed
  by `handedness` (not array index — index-to-hand mapping isn't guaranteed stable across
  sessions), emits a new `XRGamepadButtonPressedEvent` on press, returns the live array so
  `InputActionResolver` doesn't re-read the same state twice.
- **`InteractionEvents.ts`**: add `XRGamepadButtonPressedEvent`/`InputEventTypes.XRGamepadButtonPressed`,
  mirroring `GamepadButtonPressedEvent` exactly.
- **`BindingResolver.ts`**: add `xrGamepads?: ReadonlyArray<{handedness, gamepad}>` to
  `RawInputState` (optional, defaults to `[]` — existing hand-built `RawInputState` test fixtures
  don't need touching). Add an `xr-standard`-mapping lookup table (trigger→button 0, squeeze→button
  1, thumbstick click→button 3, thumbstick-x/y→axes 2/3) and `resolveXRComponentValue()`: loops
  `xrGamepads`, skips non-matching `handedness` when a binding pins one, otherwise keeps the
  strongest match — same "loop all sources, take strongest" shape
  `resolveGamepadAxisValue`/`resolveGamepadButtonValue` already use, so either-hand matching falls
  out for free. `resolveBindingValue`'s `xr-component` stub becomes this one call.
- **`InputActionResolver.ts`**: `updateFrame()` calls `deviceDetector.pollXRGamepads()` alongside
  the existing `pollGamepads()` call, includes it in the per-profile `RawInputState`. Add
  `handleXRGamepadButtonPress()`, mirroring `handleGamepadButtonPress()`.
- **`InputManager.ts`**: registers a handler for `XRGamepadButtonPressed`, forwarding to the
  resolver — mirrors the existing gamepad registration.

**Decision**: leave all four existing VR bindings (`Interact`, `OpenMenu`, `LookHorizontal`,
`LookVertical`) without `handedness` — either-hand match. The binding type and resolver already
support pinning a hand later; a future grab action will likely want it, nothing here does.

**Known gap, tracked not solved here**: `OpenMenu`'s `'menu'` componentPath has no standardized
`xr-standard` button index (the system/Oculus button is typically OS-reserved on Quest). Ship a
best-effort mapping (button index 4) with a doc caveat; file a `docs/tech-debt.md` entry.
In-headset pause-menu access realistically belongs to sub-scope 2 (spatial UI) anyway.

### 2. `XRControllerManager` — pose, parenting, visual model

New file `client/src/webxr/XRControllerManager.ts`, owned/constructed by `WebXRCoordinator`
(mirrors its existing ownership of `WebXRManager`/`InputManager`):

```ts
export interface XRControllerRaySource {
    getPrimaryControllerRay(): { origin: THREE.Vector3; direction: THREE.Vector3 } | null
}

export class XRControllerManager implements XRControllerRaySource {
    constructor(config: { cameraRig: THREE.Object3D })
    setup(renderer: THREE.WebGLRenderer): void
    setSession(session: XRSession | null): void
    getPrimaryControllerRay(): { origin: THREE.Vector3; direction: THREE.Vector3 } | null
    dispose(): void
}
```

- `setup(renderer)`: for controller indices 0/1, `getController(i)`/`getControllerGrip(i)`, add
  both **as children of the injected `cameraRig`** — never the bare scene root, following
  `SceneManager.cameraRig`'s own precedent exactly. Attach `connected`/`disconnected` listeners on
  each index to learn real handedness (three.js does **not** guarantee index 0 is the left hand).
- `setSession(session)`: called from `WebXRCoordinator.handleSessionStart`/`handleSessionEnd`
  alongside the existing `inputManager.setXRSession(...)` call.
- `getPrimaryControllerRay()`: prefers whichever hand's trigger is currently held (read live off
  `XRInputSource.gamepad.buttons[0].pressed` — valid because `EventManager.emit` is synchronous, so
  the trigger is still down when the raycast handler runs in the same tick), falls back
  right-then-left-then-null. Reads the matching controller `Group`'s live world transform — same
  accepted one-frame lag already documented for `camera.getWorldPosition()` in `SceneManager`'s
  `cameraRig` doc comment, not a new problem.
- Publishes itself once via `DataManager.getInstance().set(DataKey.XRControllerRaySource, this, {
  domain: DataDomain.Scene })` at the end of `setup()` — same mechanism `SceneManager` uses to
  publish `MainScene`/`MainCamera`/`MainCameraRig`.
- Also wires `XRControllerModelFactory` (bundled with three.js under
  `three/examples/jsm/webxr/XRControllerModelFactory.js`, distinct from the unused
  `@webxr-input-profiles/motion-controllers` devDependency it uses internally) onto the grip
  `Group`s. Zero visual controller representation exists today; this is cheap and gives real
  in-headset feedback of where the ray originates — pulled forward even though it's visual polish,
  distinct from the deferred hover-highlight/grab-state work.

`DataTypes.ts`: add `XRControllerRaySource = 'webxr.controllerRaySource'` to `DataKey`, domain
`DataDomain.Scene` (same domain as `MainCameraRig`).

`WebXRCoordinator.ts`: construct `XRControllerManager` in the constructor; call `.setup(renderer)`
in `setupWebXR()`; call `.setSession(...)` in `handleSessionStart()`/`handleSessionEnd()`; call
`.dispose()` in `dispose()`.

### 3. Controller-ray raycasting — reuse `SceneClickGameBoxRaycast`, don't duplicate it

- `SystemUICoordinator.handleInteractPressed` needs **zero changes** — it already emits
  `SceneCanvasClick` with center-screen NDC for every non-mouse `InteractPressed`. Gamepad/mouse
  reticle behavior stays untouched by construction; the branch below only activates when a
  controller ray is actually available.
- `SceneClickGameBoxRaycast.handleSceneCanvasClick` gains a small branch, using the exact
  `resolvedScene`/`resolvedCamera` lazy-resolve idiom it already uses:
  ```ts
  const raySource = this.resolvedRaySource ??= dm.get<XRControllerRaySource>(DataKey.XRControllerRaySource) ?? null
  const controllerRay = raySource?.getPrimaryControllerRay() ?? null
  if (controllerRay) {
      this.raycaster.ray.origin.copy(controllerRay.origin)
      this.raycaster.ray.direction.copy(controllerRay.direction)
  } else {
      this.pointer.set(ndcX, ndcY)
      this.raycaster.setFromCamera(this.pointer, camera)
  }
  ```
- `resolveGameBoxIntersection`, `highlightHit`, `intersectObjects`, and the `GameEventTypes.Selected`
  emission are **completely untouched**. The existing `enableDebugLine` visualization automatically
  also draws the controller ray once this lands, for free (it already just reads
  `raycaster.ray.origin`/`.direction`).

## Non-goals (design doesn't foreclose them)

- **Hover/continuous-highlight**: `XRControllerRaySource.getPrimaryControllerRay()` plus
  `resolveGameBoxIntersection` (would need promoting from `private`) are already what a later
  per-frame hover pass needs.
- **Grab-state toggle**: will likely want a real per-hand press/release pair (not just this plan's
  raycast-time "trigger held right now" heuristic). `XRControllerManager`'s controller/grip
  `Group`s are already the right attachment point for a held object.
- **Physics**: fully out of scope.
- **Sub-scope 2** (locomotion, comfort, spatial UI): untouched.

## Tasks

1. `DeviceDetector.ts` — `getXRGamepads()`/`pollXRGamepads()` + `InteractionEvents.ts`'s new event
2. `BindingResolver.ts` — `xrGamepads` on `RawInputState`, `resolveXRComponentValue()`
3. `InputActionResolver.ts` + `InputManager.ts` — wire polling + button-press routing
4. `XRControllerManager.ts` — new class (pose, parenting, model)
5. `WebXRCoordinator.ts` — own/wire `XRControllerManager`
6. `SceneClickGameBoxRaycast.ts` — controller-ray branch
7. Unit tests for all of the above (see plan file's verification section / this session's commits)
8. Update `docs/features/vr-support.md` and `input-system.md` task 9 status once merged

## Related

- [Input System](../features/input-system.md) — task 9
- [VR Support](../features/vr-support.md) — sub-scope 1
- [Interactable Objects](../features/interactable-objects.md) — the `PropInteracted` raycast
  pattern this deliberately does NOT touch (game boxes have their own resolved path already);
  worth revisiting together once VR controller raycasting and the interactable-props gap are both
  real

## Addendum (2026-08-10): left-thumbstick movement + sprint toggle + camera-relative movement fix

Real-headset testing (button indices verified: trigger=0, squeeze=1, thumbstick-click=3) surfaced
a real, pre-existing movement bug this plan's own controller-routing work made acute: since
`WebXRCoordinator` skips rotation application entirely during an XR session (the headset owns view
rotation), the camera rig's rotation freezes at whatever it was when the session started.
`CameraInputApplier.updateMovement()` moved the rig along its own **local** axes
(`camera.translateZ(...)`), so "forward" meant "the rig's frozen starting orientation," not
"wherever the headset is actually looking." Fixed by deriving movement direction from the real
camera's live world orientation instead (resolved via `DataManager`, same lazy-resolve idiom
`SceneClickGameBoxRaycast` already uses), projected onto the horizontal plane so pitch never tilts
movement. Confirmed with the user to apply this universally (all devices), not just VR - outside
XR the rig's rotation already tracked view direction, so this is a no-op there except it also
fixes a real desktop quirk (looking up/down used to tilt movement into the air/ground).

Also wired, following real VR convention (left stick = move, right stick = turn/comfort, not built
yet - sub-scope 2):
- Left thumbstick → `MoveForward`/`MoveBack`/`MoveLeft`/`MoveRight` (`handedness: 'left'` pinned -
  the first real use of `XRBinding.handedness`, which existed but nothing used until now)
- Left thumbstick-click → new `InputAction.SprintToggle`, the first toggle-style action (reuses
  the existing `SPECIFIC_PRESS_EVENTS` discrete-press pipeline from the controller-routing work,
  composes with hold-based `Sprint` in `InputManager.isSprintActive()`)
- Right thumbstick re-pinned to `LookHorizontal`/`LookVertical` (`handedness: 'right'`) so it no
  longer overlaps with left-stick movement, even though Look stays a no-op in-session by design
- `XRBinding` gained `direction?: AxisDirection`; `BindingResolver.resolveXRComponentValue` gained
  a dead zone (mirrors `resolveGamepadAxisValue`'s, prevents thumbstick drift creep)

Files touched: `CameraInputApplier.ts`, `InputProfile.ts`, `BindingResolver.ts`, `InputActions.ts`,
`InteractionEvents.ts`, `InputActionResolver.ts`, `InputManager.ts`. New tests:
`camera-input-applier-movement.test.ts`, plus extensions to `binding-resolver-xr.test.ts` and a new
`input-manager-sprint-toggle.test.ts`.

## Addendum (2026-08-10): overlapping controller models + diagnostic log cleanup

Real-headset testing confirmed movement, sprint, and trigger-based game-box grabbing all work.
Two follow-ups from that session:

- **Overlapping controller models**: user reported two controller models rendering superimposed
  (an Oculus Touch model plus a plainer one, "labeled WebXR"). Root cause: three.js's
  `XRControllerModelFactory` has no guard in its own `connected` handler against a model already
  being loaded - it just adds another GLTF as a child. Some runtimes (PICO Connect's Oculus-Touch
  emulation is the suspect here, per the user's own earlier note about it relabeling their
  controllers) fire a second `connected` event with updated profile info without a `disconnected`
  in between, stacking a second model. Fixed defensively in `XRControllerManager`'s own `connected`
  handler: track the `XRControllerModel` returned per grip and call `.clear()` on it synchronously
  on every connect - always well before the (always-async) profile fetch resolves and adds its
  model, so it can never race the model we want to keep.
- **Diagnostic logging cleanup**: the per-press `info()`-level XR gamepad shape/button logs added
  earlier this session to empirically verify real button indices (now confirmed: trigger=0,
  squeeze=1, thumbstick-click=3) downgraded to `debug()`, consistent with the project's standard
  `setLogLevel`-gated workflow - that verification is done, so permanent unconditional per-press
  logging is now just noise.

Files touched: `XRControllerManager.ts` (+ new test), `DeviceDetector.ts`.

## Addendum (2026-08-10): collapsed the XR input path into the plain gamepad-button/axis path

User review pushback, correctly: the original design (task 1 above) gave XR controllers their own
parallel mechanism - an `xr-component` binding type, a `componentPath`-to-index lookup table
(`XR_STANDARD_COMPONENT_MAP`), a separate resolve function (`resolveXRComponentValue`), a separate
press-match method (`matchesXRButtonPress`), a separate event type (`XRGamepadButtonPressedEvent`),
and separate handler wiring in `InputActionResolver`/`InputManager` - all parallel to the
`GamepadStandard` profile's existing `gamepad-button`/`gamepad-axis` bindings. On reread: the named-
component indirection bought nothing real, since `GamepadStandard`'s bindings already use raw
indices directly and xr-standard is (like the standard gamepad mapping) a single universal W3C
index scheme - there was never more than one indexing scheme to abstract over. The one genuine
difference is that `XRInputSource.gamepad` carries no handedness of its own (that lives on the
`XRInputSource`, not the `Gamepad`), so there was nowhere for "which hand" to live on a plain
`GamepadButtonBinding`/`GamepadAxisBinding` - until now.

**Collapsed design**: `GamepadButtonBinding`/`GamepadAxisBinding` gained an optional `handedness?:
GamepadBindingHandedness` (`XRHandedness | 'any'`). The field's mere *presence* (even `'any'`)
decides the binding's source, not just a filter within one shared list: absent -> reads
`navigator.getGamepads()` only, never an XR controller; present -> reads connected XR controllers'
gamepad-shaped input only, filtered to the matching hand (`'any'` = whichever hand is active),
never a plain gamepad. This is what keeps a `GamepadStandard` binding from ever accidentally firing
off an XR controller's button at the same index, and vice versa, now that both share one binding
type (`BindingResolver.selectGamepadSources`/`matchesGamepadButtonPress` implement the split; see
their doc comments). `GamepadButtonPressedEvent` similarly gained optional `gamepadIndex`/
`handedness` fields (mutually exclusive in practice) replacing the separate `XRGamepadButtonPressedEvent`.

Deleted entirely: `xr-component` binding type, `XRBinding`, `XR_STANDARD_COMPONENT_MAP`,
`resolveXRComponentValue`, `XR_AXIS_DEAD_ZONE` (gamepad-axis bindings already default to the same
0.15 dead zone), `matchesXRButtonPress`, `XRGamepadButtonPressedEvent`, `InputEventTypes.
XRGamepadButtonPressed`, and the separate `handleXRGamepadButtonPress`/`handleXRGamepadButtonPressed`
methods (folded into `handleGamepadButtonPress`, now taking an optional `handedness` param). VR
profile bindings now use the same raw xr-standard indices confirmed against real hardware directly
(trigger=0, thumbstick-click=3, thumbstick-x/y=axes 2/3, menu=4 still unverified - see
`docs/tech-debt.md`'s `xr-menu-button-mapping-unverified`), same style as `GamepadStandard`'s.
`DeviceDetector.pollGamepads()`/`pollXRGamepads()` stay separate (they read from genuinely
different browser APIs - `navigator.getGamepads()` vs `xrSession.inputSources` - and track
press-edge state under different natural keys), but both now emit the same `GamepadButtonPressed`
event.

Files touched: `InputProfile.ts`, `BindingResolver.ts`, `InteractionEvents.ts`, `DeviceDetector.ts`,
`InputActionResolver.ts`, `InputManager.ts`, `InputBindingUtils.ts` (duplicate-binding-warning
signature needed `handedness` added too, or a left-stick and right-stick binding on the same axis
index would have falsely flagged as a duplicate). Tests rewritten in `binding-resolver-xr.test.ts`
(added explicit cross-contamination regression tests for the handedness-presence split),
`input-action-resolver-xr-press.test.ts`, `device-detector-xr-gamepads.test.ts`.

## Addendum (2026-08-10): controller-model duplication wasn't actually fixed - real fix + animation diagnostics

Real-headset re-test after the earlier "clear on connect" fix (previous addendum) still showed
overlapping models - but only on the hand that was connected *before* the app/session started
(left, in the user's test); the hand connected *after* (right) rendered clean. That asymmetry
pinpointed the real bug: three.js's `XRControllerModelFactory` 'connected' handler has *zero*
guard against firing twice before its own async profile fetch resolves (confirmed by reading its
source directly) - a controller already present at session start gets its `connected` dispatched
twice back-to-back, both fetches complete later, both add their GLTF unconditionally. A controller
connecting mid-session only ever fires once. The earlier "clear the model synchronously on
connect" fix was therefore too early in exactly the failure case that mattered: nothing has loaded
yet at connect time when both connects fire before either fetch resolves, so there was nothing to
clear.

**Real fix**: stopped trying to time a fix around connect events at all. `XRControllerManager.
update()` now runs every render-loop frame (wired from `WebXRCoordinator.updateCamera`) and prunes
each controller model down to at most one child, keeping the most-recently-added one and disposing
the pruned child's geometry/materials. This makes "at most one visible model" a continuously
self-healing invariant instead of a one-shot guess about event ordering - correct regardless of how
the two connects' async loads interleave, because whichever fetch chain resolves *last* is
unconditionally the one both its `motionController` assignment and its `add()` call belong to (same
synchronous `.then()` continuation), so "keep the last-added child" always matches the current
`motionController` too.

**Animation diagnostics**: user also asked whether controller button/thumbstick animations are
wired up at all. Confirmed by reading three.js's source: `XRControllerModel.updateMatrixWorld` is
overridden to automatically drive every visual response (trigger squeeze, thumbstick tilt, etc.)
from `motionController.components` every frame, purely from the loaded GLTF's node names - no
application code needed, and none was missing. It silently no-ops per-component when the loaded
asset lacks an expected node (this is exactly what the earlier "Could not find
xr_standard_squeeze_pressed_min in the model" console warnings were reporting - a real gap in that
specific fallback asset, not an integration bug). Added a one-time-per-connect log
(`logMotionControllerOnceReady`) that reports, per component, how many of its visual-response nodes
actually resolved - e.g. `trigger(1/1), squeeze(0/1)` - so this can be confirmed/diagnosed from real
hardware logs directly instead of guessing from the warning noise. Also plausible this explains part
of the "doesn't seem to animate" impression: if the SECOND (duplicate, since-pruned) load happened
to resolve to the incomplete fallback asset while the real Oculus asset underneath animated
correctly, the two overlapping models could have made it hard to tell which one was doing what.

Files touched: `XRControllerManager.ts`, `WebXRCoordinator.ts` (+ updated
`XRControllerManager.test.ts`, `WebXRCoordinator.test.ts` mock).

## Next up (not this branch)

1. **Game-box "open" interaction redesign.** The box comes off the shelf into the player's hand and
   opens like a physical PC-game box, unfolding both left and right side panels (3 renderable
   faces, extensible to 4 via a two-stage flap open). Currently the opened-game overlay only renders
   in the flatscreen view, not in VR - this becomes the fix for that, and the intended replacement
   for the existing details-screen interaction. Explicit requirements: distinct content per face
   (design TBD after the technical build), same new mechanism replaces flatscreen too, and the
   *old* details screen stays in the codebase gated behind a const until the new mechanism is
   functionally equivalent. Needs its own plan doc before implementation (per this project's VR
   architectural-change rule) - not started.
2. **VR menus / spatial settings panel.** None of the app's menus work in VR at all today - see
   `docs/features/vr-support.md`'s sub-scope 2 note. Current intent is to try projecting the
   existing settings menu into the VR scene rather than building a separate VR-native menu system.
   Discuss scope/approach when this is picked up - not planned yet.
