# Feature: Input System

**Act**: 2
**Status**: Not Started
**Priority**: High

## Goal

Implement a unified input abstraction layer supporting mouse/keyboard, gamepad, and VR controllers with seamless switching between modes.

## Context

The project currently handles mouse/keyboard controls directly without a centralized input abstraction. Act 2's desktop-first stance means mouse/keyboard and gamepad need to be solid before VR input is fully fleshed out. The input system also needs to support mappable controls, camera roll configuration, and movement acceleration — all of which are easier to build once the abstraction exists.

## Acceptance Criteria

- All navigation and interaction accessible via mouse/keyboard without mouse dependency
- Gamepad controller support (navigation, game selection, menu activation)
- VR controller detection and basic WebXR integration (can be a spike/compatibility check in Act 2)
- Input method detection and seamless switching between modes
- Configurable input mappings for all input types
- Camera roll toggle (Q/E) with configurable speed and acceleration
- Movement speed and acceleration configurable per direction
- Camera reset (hotkey + menu button) with smooth transition

## Stories / Tasks

- **7.1.1** Universal input system design — research patterns across mouse/keyboard, gamepad, WebXR; design abstraction layer; plan fallback for input switching
- **7.1.2** Implementation — enhance mouse/keyboard, add gamepad support, VR controller detection, seamless mode switching
- **7.2** Mappable input configuration — remapping UI, accessibility options, persist preferences
- **7.3** Camera and movement controls — roll toggle, acceleration system, camera/position reset

## Notes / Open Questions

- VR is an "impressor" feature in Act 2 — impressive when available, not mandatory.
- Focus management (Tab/Shift+Tab, visual indicators, screen reader compat) for pause menu and Steam UI panels is part of this feature scope (Story 5.3).
