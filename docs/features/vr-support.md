# Feature: VR Support

**Act**: 2 (Gate 2 — required for Act 2 completion)
**Status**: In Progress — sub-scope 1 (VR Controllers) landed (see [`docs/plans/vr-support-plan.md`](../plans/vr-support-plan.md)); sub-scope 2 (VR Headset) underway on `feature/vr-uikit-menu-migration` (see [`vr-uikit-menu-migration-plan.md`](../plans/vr-uikit-menu-migration-plan.md)) — settings-menu tab shell, controller-ray pointer, and two ported tabs (`display-advanced`, `debug`) are live; five panels remain (2026-09-05: branch rebuilt onto `act2/default` post [PR #161](https://github.com/EricWehrly/steam-brick-and-mortar/pull/161)/[#162](https://github.com/EricWehrly/steam-brick-and-mortar/pull/162), `yarn tsc`/`yarn test` clean, 1771/1771)
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
   [`docs/plans/vr-spatial-settings-menu-plan.md`](../plans/vr-spatial-settings-menu-plan.md) -
   **now superseded**: DOM projection was spiked and abandoned (it never reaches an immersive
   session's render surface). The replacement direction is real `@pmndrs/uikit` scene geometry, and
   a VR settings panel with per-controller ray interaction is built on it today (see
   `VRSettingsPanelCoordinator`/`VRControllerPointer`) - a tab shell exists, activated by the same
   `MenuOpen`/`MenuClose` events the DOM pause menu emits, with two of eight pause-menu panels
   ported (`display-advanced`, `debug`) plus a `category-reference` tab piloting `world-lock`
   anchoring (see that plan's "Full menu/panel inventory" and "world-lock trial" sections). Five
   panels remain. Migrating them is planned in
   [`docs/plans/vr-uikit-menu-migration-plan.md`](../plans/vr-uikit-menu-migration-plan.md).
   Sibling scope: in-VR button hints, planned but back-burnered -
   [`docs/plans/vr-button-hints-plan.md`](../plans/vr-button-hints-plan.md).

Controllers first because the input abstraction (gamepad → VR controller) is the piece already
mostly proven out by this project's gamepad work, and because it's independently useful/testable
(a developer can plug in a controller and exercise the routing path) without needing a headset
in hand for every iteration. Headset work depends on controller routing existing first regardless
(can't interact with anything in headset without controller input flowing somewhere), so this
isn't a change to the dependency order, just an explicit statement of which half comes first.

**Neither sub-scope starts implementation without a plan doc first.** Sub-scope 1 (VR Controllers)
has one: [`docs/plans/vr-support-plan.md`](../plans/vr-support-plan.md) (written 2026-08-10,
implementation landed). Sub-scope 2 (VR Headset) has one too:
[`docs/plans/vr-uikit-menu-migration-plan.md`](../plans/vr-uikit-menu-migration-plan.md) (written
2026-08-19, implementation underway on `feature/vr-uikit-menu-migration`).

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
- **`vr-uikit-menu-sync-recheck` reconciled (2026-09-05)**: `feature/vr-uikit-menu-migration` was
  rebuilt onto `act2/default` after PR #161/#162 landed the game box's own uikit migration.
  `ControllerAimCorrection.ts`'s shared pitch constant, the renamed `XRControllerSource`/
  `XRControllerState` shape, and `UikitTextSanitizer.ts`'s HTML-entity-decoding superset all merged
  forward correctly (see `docs/tech-debt.md`'s entry for the full before/after). Still open per that
  entry's "Done when" #1: **none of this has been re-verified in a real headset yet** - screen/
  reasoning-only so far.
- **Four workstreams now advancing together (2026-09-05)**: the game box's uikit panels (stable,
  merged - see [Game Detail Screen](game-detail-screen.md)), this settings-menu migration, a new
  standalone-in-world-UI thread (below), and [uikit Component System](uikit-component-system.md),
  which is no longer strictly gated on this sub-scope landing first - see that doc's own sequencing
  note for the updated direction.
- **New in-world UI thread**: the `category-reference` VR tab (see the migration plan's "world-lock
  trial" section) already pilots a `world-lock`-anchored, scrollable uikit surface, distinct from
  the settings menu's `camera-attached` panel - a live "fixed in world vs. attached to viewpoint"
  comparison. Direction: get one such standalone in-world panel confirmed scrollable (already true
  for `category-reference`) and eventually tabbable the same way the settings shell is, as a second
  real data point for whatever the uikit Component System designs against.
