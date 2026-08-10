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
