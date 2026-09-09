# Spike: WebXR Hand Tracking Feasibility

**Status**: Concluded — 2026-08-20 research-only spike. No production code was written or modified;
this is a source-reading and spec-reading exercise, not a prototype. Findings below are grounded in
Three.js's own shipped example source (fetched directly from `mrdoob/three.js` on GitHub, network
access confirmed working this session), the WebXR Hand Input spec, and MDN's compat data — not
recalled from memory. Where a claim couldn't be sourced, it's flagged as unverified rather than
guessed.

**Type**: Feasibility spike, not a build plan. Its job is to inform whether a real plan doc
(`docs/plans/hand-tracking-plan.md` or similar) is worth writing next — it does not scope one.

## Question

This project supports VR **controllers** only (`client/src/webxr/XRControllerManager.ts`,
`WebXRCoordinator.ts`) — no WebXR hand-tracking (finger/skeletal tracking with no physical
controller). `DeviceDetector.ts:127`'s doc comment already anticipates the gap ("Empty when...no
controller has a gamepad (e.g. hand tracking with no physical controller)") without acting on it.
Three.js ships a working hand-tracking example
(`webxr_vr_handinput_pointerclick`). Is adding real hand tracking tractable, and if so, what would
a first slice look like — given this project's existing controller-input architecture
(`XRControllerRaySource`, the `BindingResolver`/`InputActionResolver` pipeline, `DeviceDetector`)?

## 1. What Three.js actually provides

Read directly from `mrdoob/three.js` (master branch, GitHub raw):
`examples/webxr_vr_handinput_pointerclick.html`,
`examples/jsm/webxr/XRHandModelFactory.js`, `examples/jsm/webxr/OculusHandPointerModel.js`,
`src/renderers/webxr/WebXRController.js`.

**Session request.** The example requests hand-tracking the same way this project already requests
`local-floor` — as a session feature string, passed straight to `VRButton.createButton`:

```js
const sessionInit = { requiredFeatures: [ 'hand-tracking' ] };
document.body.appendChild( VRButton.createButton( renderer, sessionInit ) );
```

**Hand setup.** Two parallel spatial accessors exist alongside the controller ones this project
already uses (`renderer.xr.getController(i)` / `getControllerGrip(i)`):
`renderer.xr.getHand(i)`, index-based (0/1) the same unreliable way `getController(i)` is — the
example wires up both a visual hand model and a separate interaction/pointer model per hand:

```js
const hand1 = renderer.xr.getHand( 0 );
hand1.add( new OculusHandModel( hand1 ) );
const handPointer1 = new OculusHandPointerModel( hand1, controller1 );
hand1.add( handPointer1 );
scene.add( hand1 );
```

**`XRHandModelFactory`** (`examples/jsm/webxr/XRHandModelFactory.js`) supports three rendering
profiles — `'spheres'` (default), `'boxes'`, and `'mesh'` — routed to either
`XRHandPrimitiveModel` or `XRHandMeshModel`, attached via a `'connected'` event listener on the
hand object. Notably the file has a live `@todo Detect profile if not provided` — profile
selection is not automatic today, the caller picks. Actual per-joint API calls
(`XRHand.get(jointName)`, joint radius/pose) live inside those two model classes, not the factory
itself, and weren't independently re-fetched.

**Pinch/click gesture detection** — this is the concrete, minimal implementation the example
actually ships, in `OculusHandPointerModel.js`'s `_updatePointer()`:

```js
const indexTip = this.hand.joints['index-finger-tip'];
const thumbTip = this.hand.joints['thumb-tip'];
const distance = indexTip.position.distanceTo(thumbTip.position);
this.pinched = distance <= PINCH_THRESHOLD;   // PINCH_THRESHOLD = 0.02 (meters)
```

`isPinched()` just returns that cached boolean. The pointer's cursor position is the midpoint of
the two tips (`indexTip.position.clone().add(thumbTip.position).multiplyScalar(0.5)`), with a
graduated visual response between `PINCH_MIN` (0.01) and `PINCH_MAX` (0.05). Raycasting against
scene objects uses `hp.intersectObject(object, false)` / `hp.setCursor(distance)` — i.e. Three's
own example already treats "pinch" as a drop-in stand-in for "trigger held," architecturally
identical in shape to how this project reads `gamepad.buttons[0].value`
(`XRControllerManager.getTriggerValue()`).

**Underlying joint routing, in Three's core (not the examples layer).**
`src/renderers/webxr/WebXRController.js`'s `connect()` only branches on `inputSource.hand`:

```js
if ( inputSource && inputSource.hand ) {
    const hand = this._hand;
    for ( const inputjoint of inputSource.hand.values() ) {
        this._getHandJoint( hand, inputjoint );
    }
}
```

and its `update()` prefers hand joint poses when a hand space exists, falling back to grip/ray
space otherwise — i.e. **Three's own internals already treat hand and grip/controller as
alternatives per input source**, not something it populates simultaneously. (The file also notes,
as an aside about a different runtime quirk: some runtimes — Vive Cosmos on the Vive OpenXR
runtime — only expose a grip space with ray space equal to it; not hand-related, but it shows
Three's controller code already branches per-runtime for reasons unrelated to hands.)

## 2. Device/browser support reality check

Fetched directly from `mdn/browser-compat-data`'s `api/XRHand.json` (not recalled from memory):

| Browser | Support |
|---|---|
| Chrome (desktop) | `131`+ |
| "Oculus" (Meta Quest Browser) | `15.1`+ |
| Edge | `93`–`111`, **Hololens 2 only**, later **removed** after 111 |
| Firefox | not supported (`version_added: false`) |
| Safari | not supported (`version_added: false`) |
| Chrome/Firefox/Samsung Internet/WebView Android, Safari iOS | "mirror" (follow their desktop/base entry) |

Practical read for this project: the only headset/browser combination with durable, current
support is **Quest Browser on Meta Quest hardware** (Quest 2/3/Pro). Edge's Hololens 2 support
existed only briefly (93–111) and was withdrawn. Firefox and Safari don't support the API at all.
This project's own comments (`WebXRManager.ts`) already describe testing against a **PICO 4 via
PICO Connect/SteamVR** — that path is a controller-only device for the foreseeable future; nothing
found here suggests SteamVR/PICO hand-tracking support through this API.

**Fallback behavior when unsupported** — checked against MDN's `XRSystem.requestSession()` page
and the WebXR Hand Input spec directly (`immersive-web.github.io/webxr-hand-input`):

- If `'hand-tracking'` is requested in **`requiredFeatures`** and the runtime doesn't support it,
  `requestSession()`'s promise **rejects with `NotSupportedError`** — the whole session fails to
  start, not just the hand feature. This is the exact same mechanism this project already has
  first-hand experience with for `'local-floor'` (`WebXRManager.ts`'s own comment: "requiredFeatures:
  ['local-floor'] ... regardless of whether the runtime actually supports floor tracking").
- If requested in **`optionalFeatures`**, an unsupported runtime just omits it silently — session
  creation still succeeds, and per the spec's own wording ("The user agent MAY gate support for
  hand based XRInputSources based upon this feature descriptor"), `XRInputSource.hand` is simply
  `null`/absent on that runtime. This is the only viable choice for a project that must keep
  working on controller-only devices — requesting it as required would hard-break every
  controller-only headset this project already supports.

## 3. Coexistence with this project's existing controller-input architecture

Read `client/src/webxr/XRControllerManager.ts`, `WebXRCoordinator.ts`, and
`client/src/input/DeviceDetector.ts`, `BindingResolver.ts`, `InputActionResolver.ts` in full.
Grepped for `XRHand`/hand-tracking references first — the only hit is `DeviceDetector.ts:127`'s
doc comment, confirming there's no existing hand-tracking code path to build on or conflict with.

**Replacement or addition? Concretely: mutually exclusive per input source, but it can change
live, mid-session.** Per the WebXR Hand Input spec and Three's own `WebXRController.js` routing
(hand branch vs. grip-fallback branch, never both), a given hand's `XRInputSource` is *either*
gamepad-shaped (physical controller held) *or* hand-shaped (bare hand tracked) at any moment — not
a static per-session choice made once at `requestSession()` time. On Quest, picking up Touch
controllers and setting them back down actually flips which shape that hand's input source has,
live. That means `'inputsourceschange'` — which `DeviceDetector.attachXRSessionListeners()`
already listens to — is exactly the right event to key new detection off, but what changes on that
event is no longer just "which controllers are connected," it's "is this hand gamepad-shaped or
hand-shaped right now."

**Existing abstractions and where hand-tracking would plug in or bypass them:**

- **`XRControllerRaySource`** (`XRControllerManager.ts`) — the interface `GameBoxFoldCoordinator`,
  `VRSettingsPanelCoordinator`, and `SceneClickGameBoxRaycast` consume (confirmed via grep — all
  three reference `RaySource`/`raySource`). Its "primary controller" resolution
  (`resolvePrimaryControllerIndex()`) reads `inputSource.gamepad?.buttons[0]` directly — a
  hand-tracking input source has no `.gamepad` at all, so this returns nothing for a bare hand.
  This is the concrete plug point: it would need a parallel "primary hand" resolution rule keyed
  on pinch state instead of trigger value — structurally the same role Three's own
  `OculusHandPointerModel.isPinched()` already plays as a stand-in for "trigger held."
- **`DeviceDetector.getXRGamepads()`/`pollXRGamepads()`** — explicitly `if (inputSource.gamepad)`
  only; a hand-tracking input source is silently skipped today. This is exactly the gap
  `DeviceDetector.ts:127`'s comment already names without resolving.
- **`BindingResolver`/`InputActionResolver` pipeline** — entirely Gamepad-API-shaped
  (`GamepadButtonBinding`, `GamepadAxisBinding`, `XRGamepadState = {handedness, gamepad}` in
  `BindingResolver.ts`). There's no binding kind for "pinch" or general hand pose today. Two
  realistic options: (a) add a genuinely new binding kind end-to-end (`HandPinchBinding` in
  `InputProfile.ts` + new resolution logic in `BindingResolver.resolve()`), or (b) synthesize a
  pinch as a fake Gamepad-button-shaped press (`indexTip.distanceTo(thumbTip) <= threshold` →
  a synthetic `Gamepad.buttons[0].pressed`) that flows through `BindingResolver.resolve()`
  essentially unmodified. (b) is very likely lower-friction for a first slice — it reuses
  `GamepadButtonPressedEvent`/`InputActionResolver` end-to-end with zero new binding-kind
  plumbing, at the cost of being a bit of a fiction (pretending a pinch is a "gamepad button").
- **Is there a real `XRInputSource.hand` to key off, parallel to `.gamepad`? Yes** — confirmed
  directly against the WebXR Hand Input spec and MDN's `XRHand` page: `XRInputSource.hand` returns
  an `XRHand` (a Map-like of 25 named joints → `XRJointSpace`, e.g. `hand.get('index-finger-tip')`)
  when a hand-tracking source is active, and is absent otherwise — structurally parallel to how
  `.gamepad` is read today (`DeviceDetector.getXRGamepads()`'s `if (inputSource.gamepad)` becomes a
  sibling `if (inputSource.hand)` branch in the same `inputsourceschange`-driven poll loop
  `DeviceDetector` already owns). The *shape* is different enough that it can't reuse Gamepad-API
  code directly — no `.buttons`/`.axes` array, it's per-joint 6DOF poses — but the *detection
  pattern* (branch on a property's presence on the same live `XRInputSource`) transfers cleanly.

## 4. Recommendation

**Full skeletal hand rendering + general hand-pose input is "bigger than it looks."** It pulls in
a rendering/asset concern (loading `@webxr-input-profiles`-style hand meshes via
`XRHandModelFactory`'s `'mesh'` profile) that's orthogonal to input handling, and this project
already has an open, unresolved question about `@webxr-input-profiles` CDN reachability on its
Tauri/WebView2 target (`XRControllerManager.ts`'s own comment on its controller-model-loading
race). Don't start there.

**A narrow first slice — pinch-to-click replacing the trigger for menu/game-box interaction — is
"surprisingly tractable."** It's a close structural match to code this project already has and
code Three.js already ships as a working example:

1. In `DeviceDetector`, add an `if (inputSource.hand)` branch alongside the existing
   `if (inputSource.gamepad)` one in the `inputSource` scan, computing
   `indexTip.position.distanceTo(thumbTip.position) <= PINCH_THRESHOLD` per hand (Three's example
   uses `0.02`m — a real, sourced starting constant, not a guess).
2. Synthesize that boolean into the same `XRGamepadState`-shaped data the rest of the pipeline
   already consumes, so `BindingResolver`/`InputActionResolver`/`GamepadButtonPressedEvent` need
   zero new binding-kind plumbing — this is the (b) option from Section 3.
3. Extend `XRControllerManager`'s primary-hand resolution (or a sibling class, to avoid mixing two
   very different pose sources in one class) to fall back to pinch state when no gamepad-shaped
   controller is connected.

This validates the actually-uncertain part — does a real headset cleanly flip between
controller-shaped and hand-shaped input sources mid-session the way the spec describes, and does
this project's `'inputsourceschange'` handling react correctly — before spending effort on
skeletal rendering or a general-purpose hand-binding system. Because `'hand-tracking'` can only
sanely be requested as `optionalFeatures` (required would hard-break every controller-only device
this project already supports), this is low-risk to attempt: it adds a capability without touching
existing controller behavior at all.

**What this spike did not, and could not, validate:** no real Quest hardware was exercised this
pass — every finding above comes from reading Three.js's shipped source and the spec/MDN docs, not
from an on-device test. A real first-slice attempt should budget for an actual Quest Browser
session to confirm the `'inputsourceschange'` flip-between-controller-and-hand behavior described
in Section 3 holds in practice, before committing to a full plan doc.
