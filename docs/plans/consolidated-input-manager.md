# Consolidated Input Manager — Design Plan

**Branch**: `feature/consolidated-input-manager`  
**Status**: In Progress  
**Phase**: Act 2 — Ready for Friends  

---

## Overview

Replace the current keyboard/mouse-only `InputManager` with a fully consolidated system that:

- Abstracts all input sources behind **named logical actions** ("MoveForward", "Interact", etc.)
- Detects connected devices at runtime and exposes them in a UI dropdown
- Supports **per-profile mappings** for Mouse+KB, Standard Gamepad, Touch, and VR
- Persists user remappings to `localStorage` via the existing `AppSettings` pattern
- Powers a live, interactive **Input tab** in the pause menu (currently display-only)

---

## Current State

| What exists | Where |
|---|---|
| Keyboard + mouse movement/look | `client/src/webxr/InputManager.ts` |
| Static controls reference panel | `client/src/ui/pause/panels/ControlsPanel.ts` + `controls-panel.html` |
| Settings persistence | `client/src/core/AppSettings.ts` (localStorage) |
| Event bus | `client/src/core/EventManager.ts` |
| `EventSource.Gamepad` enum value (unused) | `client/src/core/EventManager.ts` |
| SceneCanvasClick (raycast click) | `client/src/scene/interaction/SceneClickGameBoxRaycast.ts` |

**Gaps**: no gamepad polling, no touch input, no VR controller routing, no rebinding UI, no device detection.

---

## Proposed Architecture

### 1. Logical Actions (Action Map)

All input is expressed through named actions, not raw key codes:

```
Navigation:   MoveForward | MoveBack | MoveLeft | MoveRight | MoveUp | MoveDown
Camera:       LookHorizontal | LookVertical | RollLeft | RollRight
Interaction:  Interact | OpenMenu | ToggleFullscreen | ToggleUI
```

Each action has a **type**: `Axis` (continuous float, e.g. joystick) or `Button` (boolean/pressed).

### 2. Input Profiles

A **profile** is a named set of bindings for a specific device class. Four built-in profiles:

| Profile ID | Devices |
|---|---|
| `mouse-keyboard` | Keyboard + Mouse |
| `gamepad-standard` | Standard gamepad (Gamepad API `standard` mapping) |
| `touch` | Touchscreen (pointer events / DeviceMotion) |
| `vr` | VR motion controllers (WebXR `XRInputSource`) |

Profiles are stored as serializable JSON objects, so users can export/import in the future.

### 3. Device Detector

A lightweight class that:

- Polls `navigator.getGamepads()` on each animation frame (only when a gamepad has connected)
- Listens for `gamepadconnected` / `gamepaddisconnected` events
- Listens for `touchstart` to mark touch as available
- Checks `navigator.xr` and active `XRSession` to detect VR controllers
- Emits `InputEventTypes.DevicesChanged` when the available-device list changes

### 4. InputManager (consolidated)

`client/src/input/InputManager.ts` (new location — moves out of `/webxr/`)

Responsibilities:
- Owns device detector, profile store, binding resolver
- On each frame, converts raw device state → action values
- Emits `InputEventTypes.ActionChanged` for discrete actions (button press/release)
- Exposes `getAxisValue(action)` / `isActionPressed(action)` for polled consumers (e.g. camera update loop)
- Replaces the existing `InputManager` in `WebXRCoordinator` without breaking its interface

### 5. Binding Resolver

Given the active profile and raw device state, resolves each action to a value. Supports:
- Multiple bindings per action (e.g. WASD **and** arrow keys both map to movement)
- Modifiers (Shift+key)
- Axis inversion flag
- Dead zone for gamepad axes

### 6. Persistence

Input profiles are stored under a new `AppSettings` category:

```typescript
Setting.InputProfile: 'inputProfile'          // active profile id
Setting.InputBindings: 'inputBindings'         // JSON blob of all user overrides
```

User overrides are a sparse diff on top of the default profile — only changed bindings are stored.

### 7. ControlsPanel (updated)

The `Input` tab becomes interactive:

```
┌─────────────────────────────────────────┐
│ Active Profile: [Mouse + Keyboard    ▼] │  ← device dropdown
├─────────────────────────────────────────┤
│ Action          Binding         [Edit]  │
│ Move Forward    W / ↑                   │
│ Move Back       S / ↓                   │
│ Interact        Left Click / Enter      │
│ Open Menu       Escape                  │
│ ...                                     │
├─────────────────────────────────────────┤
│ [Reset to Defaults]  [Export]  [Import] │  ← stretch goals
└─────────────────────────────────────────┘
```

The dropdown lists detected devices; selecting one switches the active profile. Clicking **Edit** on a row enters a "press a key/button" capture mode.

---

## File Plan

```
client/src/input/
  InputManager.ts           ← consolidated manager (replaces webxr/InputManager.ts)
  InputActions.ts           ← action name constants + types
  InputProfile.ts           ← profile type + built-in defaults
  DeviceDetector.ts         ← gamepad/touch/VR device enumeration
  BindingResolver.ts        ← raw state → action value translation
  InputProfileStore.ts      ← load/save profiles to AppSettings
```

`client/src/ui/pause/panels/ControlsPanel.ts` — upgraded with device dropdown + binding table  
`client/src/types/InteractionEvents.ts` — add `InputEventTypes.DevicesChanged`, `InputEventTypes.ActionChanged`

---

## Integration Points

| System | Change |
|---|---|
| `WebXRCoordinator` | Replace `new InputManager(...)` with new consolidated manager; adapt callback interface |
| `AppSettings` | Add `InputProfile` and `InputBindings` setting keys + defaults |
| `EventManager` | Add two new `InputEventTypes` |
| `SceneClickGameBoxRaycast` | No change; still responds to `InputEventTypes.SceneCanvasClick` |
| Camera update loop (in `WebXRCoordinator`) | Switch from direct key-state reads to `inputManager.getAxisValue()` |

---

## Implementation Sequence

1. **Scaffolding** — create `/input/` folder, `InputActions.ts`, `InputProfile.ts` with defaults
2. **DeviceDetector** — gamepad connect/disconnect events + frame polling scaffold
3. **BindingResolver** — keyboard/mouse binding logic extracted from existing `InputManager`
4. **Consolidated InputManager** — wires detector + resolver, exposes action API
5. **AppSettings integration** — new setting keys, load/save bindings
6. **WebXRCoordinator migration** — swap old InputManager for new one
7. **ControlsPanel device dropdown** — detect connected devices, render dropdown, switch profile on change
8. **ControlsPanel binding table** — render current bindings per profile
9. **Gamepad support** — implement gamepad axis/button → action mapping
10. **Rebind UI** — "press to capture" flow for remapping a single action
11. **Touch support** — on-screen virtual controls or gesture mapping
12. **VR controller routing** — map XRInputSource buttons/axes to actions

Steps 1–7 form the first shippable story (device dropdown + read-only binding table).  
Steps 8–10 are the second story (gamepad + rebinding).  
Steps 11–12 are stretch goals / Act 3.

---

## Decisions Applied (May 2026)

- VR controller labeling uses raw `XRInputSource.profiles[0]` strings for now (no lookup table yet).
- Multiple gamepads share one standard profile and can drive movement concurrently.
- VR and gamepad are both allowed to be active when available.
- Touch support currently focuses on DOM/UI compatibility and lightweight input detection; advanced touch navigation deferred.
- Device profile state is independent and persisted per device/profile.
- Legacy `webxr/InputManager.ts` is removed; consolidated manager is now in `client/src/input/InputManager.ts`.
- Scene/UI input context layering is required and tracked as a follow-up architecture item.
- Right-stick camera look remains axis-based.

---

## Progress Snapshot

- [x] Step 1 scaffolding (`client/src/input/*` created)
- [x] Step 2 device detector for keyboard/mouse, gamepad, touch, VR session input sources
- [x] Step 3 binding resolver with keyboard/mouse/gamepad support
- [x] Step 4 consolidated input manager integrated
- [x] Step 5 AppSettings persistence keys for active profile + binding overrides + device enablement map
- [x] Step 6 WebXRCoordinator migration to consolidated manager
- [x] Step 7 Input tab device dropdown (top of panel)
- [x] Step 8 Input mapping table (live from selected profile)
- [x] Step 9 baseline gamepad movement/look support in runtime manager
- [x] Step 10 baseline remap flow (keyboard/mouse capture + per-action persist + reset active profile)
- [x] Multi-active profile runtime aggregation (enabled devices contribute simultaneously)
- [x] Device active toggles in Input panel (checkbox-based, supports multiple active devices)
- [x] Character baseline speed reduced and sprint multiplier added (default Left Shift, 1.5x)
- [x] Analog axis diagnostics dropdown added for connected gamepads
- [ ] Step 11 touch navigation model
- [ ] Step 12 VR controller runtime routing

Verification completed in code:
- TypeScript compile (`yarn tsc --noEmit`) passes.
- Input-focused unit suites pass:
  - `test/unit/input/binding-resolver.test.ts`
  - `test/unit/input/device-detector.test.ts`
  - `test/unit/webxr/input-manager.test.ts`

Human verification pending:
- Manual Input tab UX pass (device dropdown + remap interactions).
- Real hardware checks for gamepad/VR/touch behavior.
- Confirm right-stick look quality/sensitivity on physical controller hardware.

---

## Follow-up Notes (Deferred / Backlog)

1. **Input Context Stack**
   Add context-aware routing (`scene` vs `ui` + focus target within context) so Look/Interact bindings are explicit per context.

2. **In-World Interaction Readiness**
   Plan highlight/selection affordances for game boxes and future world controls (switches/buttons).

3. **Device Capability Analytics (Act 3 target)**
   Add telemetry around detected input capabilities and active profile usage to guide Act 4 prioritization.

4. **Controller Output Probe (after controller input validation)**
   Add a short experimental test path for haptics/lights/sound signaling on supported gamepads.

5. **Runtime wiring gaps (fast-follow before finalizing input work)**
   - Controller/touch/VR Interact handoff into scene interaction
   - Controller-driven menu navigation and pause/open-menu handoff
   - Toggle UI/fullscreen action routing through consolidated input layer
   - Vertical look policy (currently defined in mappings, not fully applied in camera runtime)

---

## Open Questions

1. **VR controller identity**: WebXR `XRInputSource` exposes a `profiles` array (strings like `"oculus-touch-v3"`) but no human-readable name on all browsers. How do we display a friendly name in the dropdown?  
   *Option A*: Hardcode a lookup table for common profiles.  
   *Option B*: Display raw profile string, document limitation.
Go with B.
Broadly, keep in mind that the input manager is part of ramp-up to VR. We're not ready to start testing VR hardware yet. We're opening the door to it.

2. **Multiple gamepads**: Gamepad API supports up to 4 controllers. Do we support per-controller profiles, or treat all standard gamepads as one profile?  
   *Likely*: One `gamepad-standard` profile, player-1 controller wins.
Whatever is the easiest to implement in code. If each connected controller manuevers the character the same, that's probably the lowest-friction user experience. by the way, _After_ we get controllers working, I'd like to perform a quick test to see if we can trigger any lights, sounds, or vibration in supporting devices.

3. **VR + gamepad simultaneously**: In a VR session you may have motion controllers AND a gamepad. Should `vr` profile subsume gamepad, or can both be active?  
   *Likely*: VR profile has priority; gamepad can supplement unmapped actions.
Ideally just let both be active as they normally would be.

4. **Touch virtual joystick**: Do we want an on-screen thumbstick overlay for mobile, or purely gesture-based navigation?  
   *Suggest*: Defer to Act 3; flag as stretch goal for now.
We want to support touch for UI events (should be doable since it's DOM) and _maybe_ have very limited touch support, but we're highly unlikely to encounter it. Take what's easy and defer the rest to late act 4. 

This actually brings up a good point. We should insert analytics towards the end of act 3. It will be very helpful to know what device capabilities are users have.

5. **Profile switching UX**: If the user has remapped bindings in `mouse-keyboard` and then switches to `gamepad-standard`, should switching back restore their remaps?  
   *Yes* — user overrides are stored per profile independently.
Basically. Devices should be managed independently. Including whether they're enabled or not. Mapping profiles should work the same for each device.

6. **Existing `InputManager` in `/webxr/`**: Delete + replace, or keep as a deprecated wrapper?  
   *Preference*: Replace entirely; no wrapper cruft. Tests on old class → migrate to new.

7. **`SceneCanvasClick` still uses raw mouse event** (emitted by `SystemUICoordinator`). Should this be routed through the new action system?  
   *Probably not yet* — it's a UI click, not a navigational action. Revisit when touch/VR interaction is in scope.

Yes, it should be presented in the UI. The scene canvas click is currently supporting two actions:
"Look around" and "interact". 
We're going to need to support remappable controller and/or mouse+keyboard controls for both.
Part of what that means is we'll need a "context" in input. 
Context for whether we're dealing with the "scene" layer or the "ui" layer,
and context within each for what is "active" to navigate through
We're also going to need to plan out dedicated buttons for menu navigation.

The "context" in the scene is going to indicate what the player is going to interact with
We'll probably want a "highlight" shader for our gameboxes, and we may want to be able to interact later with buttons and switches within the world.
We should introduce this new functionality after setting up the existing functionality within reason.

8. **Axis vs button for gamepad look**: Should right-stick look be an Axis action or two paired button actions?  
   *Axis* — necessary for analog sensitivity; camera update loop already handles continuous look.

Yeah, axis.

---

## What We Are NOT Doing (scope guard)

- Native OS input APIs, HID, or raw device access
- Multiplayer input routing
- Macro recording or scripting
- Mobile accelerometer/gyro navigation (gesture-only touch is stretch)
Actually, if this isn't difficult to implement, let's throw it in. Otherwise, yeah, act 4.
- A full input SDK abstraction layer — keep it project-specific and simple

---

## Acceptance Criteria (first story, steps 1–7)

- [ ] Device dropdown in Input tab shows currently connected devices (KB+Mouse always present; gamepad appears when connected)
- [ ] Selecting a device in dropdown switches active profile
- [ ] Binding table renders the current profile's mappings (read-only)
- [ ] All existing keyboard/mouse movement still works identically
- [ ] User's selected profile persists across page reloads
- [ ] No regressions in existing unit tests; new unit tests for DeviceDetector + BindingResolver
