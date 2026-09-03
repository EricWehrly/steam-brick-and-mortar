# Feature: VR Support

**Act**: 2 (Gate 2 — required for Act 2 completion)
**Status**: In Progress — sub-scope 1 (VR Controllers) has a plan doc and implementation underway (see [`docs/plans/vr-support-plan.md`](../plans/vr-support-plan.md)); sub-scope 2 (VR Headset) not started
**Priority**: High

## Goal

The full store experience works in a VR headset via WebXR — navigation, browsing, and UI interaction all functional in headset. This is the "impressor" that defines Act 2 done.

## Sequencing: Controllers before headset (decided 2026-07-23)

This feature splits into two sub-scopes, deliberately sequenced:

1. **VR Controllers** — route real WebXR controller input through the same `InputActionResolver`
   abstraction gamepad already uses, via the already-defined `VR` `InputProfile`
   (`InputProfile.ts:232-242`). Tracked as [Input System](input-system.md) task 9. Device
   *detection* for VR controllers already works today — `DeviceDetector.setXRSession()` reads real
   `XRSession.inputSources` and logs them the same way gamepad/keyboard do (see input-system.md's
   2026-07-23 device-logging note) — what's missing is *routing*, not detection.
2. **VR Headset** — locomotion, comfort pass, spatial UI, hardware testing. Not started, not
   scoped yet. Confirmed gap (2026-08-10, real-headset testing): none of the app's menus (settings,
   pause, etc.) render or are reachable in VR at all today - they're flat-DOM UI with no in-scene
   representation. Direction (2026-08-10): project the settings menu into the VR scene as a spatial
   panel rather than building a separate VR-native menu system from scratch - now has a plan doc,
   [`docs/plans/vr-spatial-settings-menu-plan.md`](../plans/vr-spatial-settings-menu-plan.md).

Controllers first because the input abstraction (gamepad → VR controller) is the piece already
mostly proven out by this project's gamepad work, and because it's independently useful/testable
(a developer can plug in a controller and exercise the routing path) without needing a headset
in hand for every iteration. Headset work depends on controller routing existing first regardless
(can't interact with anything in headset without controller input flowing somewhere), so this
isn't a change to the dependency order, just an explicit statement of which half comes first.

**Neither sub-scope starts implementation without a plan doc first.** Sub-scope 1 (VR Controllers)
now has one: [`docs/plans/vr-support-plan.md`](../plans/vr-support-plan.md) (written 2026-08-10,
implementation in progress). Sub-scope 2 (VR Headset) still has no plan doc — this project's
planning rules require a plan + sign-off before code starts there too.

## Context

The project was designed WebXR-first from the beginning (see `docs/architecture/webxr-architecture.md`), and the `WebXRCoordinator` and `WebXREventHandler` infrastructure exists. Act 2's desktop-first stance was intentional — get the experience solid on flat screens, stabilize infrastructure, start sharing with friends — then land VR as the Act 2 capstone.

VR is sequenced late in Act 2 deliberately: after Gate 1 infrastructure is stable and after initial friend feedback on the desktop experience has been incorporated. It's a required deliverable, not a stretch goal.

## Acceptance Criteria

- WebXR session initializes correctly on supported hardware (Quest, PCVR)
- Player can navigate the store via VR locomotion (teleport or smooth locomotion TBD)
- Game boxes are selectable/interactable via VR controller input
- UI panels are accessible and usable from inside VR (spatial or overlay approach TBD)
- Comfortable default experience with appropriate scale, speed, and IPD handling
- Graceful fallback to flat screen if WebXR session fails or hardware is absent

## Stories / Tasks

**Sub-scope 1 — VR Controllers (first):**
- **Controller input** — wire VR controller events into the input abstraction; tracked as [Input System](input-system.md) task 9. Raycast-based interaction for game boxes and UI is part of this, since selection needs to work from a controller before it needs to work from a headset-relative cursor at all.
- **Audit existing WebXR infrastructure** — review `WebXRCoordinator`, `WebXREventHandler`, `WebXRUICoordinator`; identify gaps vs. current state of the codebase. Do this first — it's the input for the plan doc, not a parallel task.

**Sub-scope 2 — VR Headset (after controllers):**
- **VR locomotion** — decide teleport vs. smooth movement; implement and tune; configurable for comfort
- **Spatial UI** — determine approach for UI panels in VR (world-space vs. HUD overlay); implement
- **Comfort pass** — scale, movement speed, snap turn options; VR comfort best practices
- **Hardware testing** — validate on at least one standalone headset (Quest) and one PCVR setup

## Notes / Open Questions

- Locomotion model is TBD — teleport is safer for comfort/accessibility, smooth movement is more immersive. Consider offering both.
- UI in VR is a design question: world-space panels feel more immersive but are harder to read; HUD overlays are easier but feel flat. May need a prototype to decide.
- The input abstraction from the Input System feature already exists (gamepad proved it out) — VR controller events route through the same `InputActionResolver`/`InputProfile` layer as mouse/keyboard and gamepad, not a new mechanism. See input-system.md's "survey before you extend" note.
- VR controller interaction and raycasting connects to the raycast drag suppression work already in the subagent threads.
- See `docs/architecture/webxr-architecture.md` for the foundational design decisions.
- **Next step is scoping, not code**: write `docs/plans/vr-support-plan.md` covering at least sub-scope 1 (VR Controllers) — the WebXR infrastructure audit above should feed directly into it. Get sign-off before writing any implementation code, per this project's planning rules.
- **Before resuming sub-scope 2 (spatial UI/settings menu) work**: read `docs/tech-debt.md`'s
  `vr-uikit-menu-sync-recheck` entry first. A sibling branch (`feature/vr-uikit-menu-migration`)
  already has real uikit-based VR pointer/cursor work in progress there, diverging independently
  from controller-aim correction and text-sanitizing code that also exists on
  `feature/game-box-uikit-panels` - real drift, not just cosmetic difference, and neither branch's
  pointer/cursor behavior has been re-verified in a real headset since.
