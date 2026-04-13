# Feature: Input System

**Act**: 2 (Gate 1 — keyboard/mouse solid; Gate 2 — VR controllers)
**Status**: Not Started (current controls are ad-hoc mouse/keyboard, no abstraction layer)
**Priority**: High

## Goal

A unified input abstraction layer that cleanly supports mouse/keyboard today, adds gamepad support as the intermediate step (overlaps heavily with VR controller inputs), and then extends to VR controllers for Gate 2 — with remappable inputs as a stretch goal.

## Context

The project currently has no centralized input abstraction. Mouse/keyboard controls are wired ad hoc, and typing in input fields triggers camera movement (active tech debt). The path through Act 2 is sequenced deliberately:

1. **Mouse/keyboard + focus management** — fix the existing ad-hoc controls, add proper UI focus handling so typing doesn't move the camera
2. **Gamepad support** — standard gamepad API; triggers, buttons, and axes map naturally onto both navigation and what VR controllers will need
3. **VR controller input** — route WebXR controller events through the same abstraction as gamepad; this is the Gate 2 deliverable
4. **Remappable inputs** — stretch goal; gives the input layer a clean shape to refactor toward and is probably achievable once the abstraction exists

## Acceptance Criteria

**Gate 1 (before sharing):**
- All navigation and menu interaction accessible via keyboard/mouse without focus bleed into the scene
- Gamepad controller navigation works for basic movement and game selection
- Input method detection and seamless switching between keyboard and gamepad
- Camera roll toggle, movement acceleration, configurable speeds

**Gate 2 (Act 2 complete):**
- VR controller input routed through the same abstraction layer as gamepad
- Raycast-based interaction for game boxes and UI via VR controller
- All core interactions (navigate, select, open detail panel, open menu) work in headset

**Stretch:**
- Remappable inputs — user can reassign any action to any input; persisted in settings

## Stories / Tasks

- **`InputManager`** — centralized input coordinator; `disableSceneControls()` / `enableSceneControls()`; input context stack so UI panels suppress scene controls
- **Focus management** — `onFocus`/`onBlur` hooks for all UI panels (Binder, Steam UI, Pause Menu); WASD/mouse disabled when UI has focus
- **Gamepad support** — standard Gamepad API polling; map axes/buttons to actions; support for navigation, selection, menu
- **Input abstraction layer** — `IInputSource` interface; `KeyboardMouseInputSource`, `GamepadInputSource`, `XRControllerInputSource`; action mapping table
- **VR controller routing** — WebXR controller events mapped through abstraction layer; depends on VR Support feature
- **Camera/movement controls** — roll toggle (Q/E), configurable speed/acceleration, camera reset hotkey + menu button
- **Keyboard accessibility** — Tab/Shift+Tab through all menus, Enter/Space activation, Escape to dismiss; number keys for tab switching
- **Remappable inputs** (stretch) — remapping UI, persist to settings

## Notes / Open Questions

- `WebXRCoordinator` currently owns a wider input/control surface than XR session concerns; tech debt entry exists to review and potentially split into a dedicated `InputManager` — that review is a prerequisite or parallel task here
- The gamepad → VR controller progression means gamepad infrastructure directly accelerates VR input; do not skip it
- Remappable inputs is a stretch goal but gives the abstraction a clean target shape — designing toward it even if not implementing it is worthwhile
- See tech-debt.md: "Centralized Input Management System" for the existing detailed task breakdown
