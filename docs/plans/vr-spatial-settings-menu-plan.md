# Plan: VR Spatial Settings Menu

## Goal

Give VR sessions a way to reach the app's menus (pause/settings, currently 100% flat-DOM) at all —
confirmed 2026-08-10 (real-headset testing) that none of them render or are reachable in-headset
today. Closes sub-scope 2's "Spatial UI" story in [VR Support](../features/vr-support.md).

## Current state (confirmed via code survey, 2026-08-10)

- Every menu in the app — `PauseMenuPanel` and its panel subclasses (graphics settings, cache
  management, etc.), `GameLibraryBinderUI`'s binder, `BinderGameDetailPanel` — renders as plain
  DOM/CSS into fixed UI slots (`ui-slot-center`, `pause-menu-content`, etc.). None of it is scene
  geometry; a WebXR session's headset-only render surface never sees it.
- `InputEventTypes.OpenMenu`/`InteractPressed`/`CancelPressed` already route through the shared
  `InputActionResolver` (proven out by the VR-controllers work — see
  [`vr-support-plan.md`](vr-support-plan.md)), so the *input* side (a VR trigger/button press
  reaching the right handler) is not the gap — only the *visual* side is.
- **Not yet surveyed** for this plan, deliberately — this is a direction-setting plan, not a full
  design, per the user's own framing ("the implementing agent can pass through that when they're
  going to look at the settings menu projection"): exactly which menus need spatial treatment
  first, how `PauseMenuPanel`'s render()-to-innerHTML lifecycle interacts with whatever projection
  technique is chosen, and where the resulting panel should be anchored (world-fixed vs.
  hand-fixed vs. head-locked). First task below is to do that survey.

## Direction (confirmed with user, 2026-08-10)

Project the *existing* DOM menu system into the VR scene rather than building a second, VR-native
menu system from scratch — avoids maintaining two UIs for the same settings. Reference: three.js's
own `webxr_vr_sandbox` example
(https://threejs.org/examples/?q=webxr#webxr_vr_sandbox), which demonstrates exactly this:
`HTMLMesh` (`three/examples/jsm/interactive/HTMLMesh.js`) renders a live DOM element to a canvas
texture on a plane, and `InteractiveGroup` (`three/examples/jsm/interactive/InteractiveGroup.js`)
routes XR controller raycasts back into synthetic pointer events on that DOM element — together
giving a real, interactive, in-scene copy of an existing HTML UI without a second implementation.

**The real open risk isn't the three.js version — it's whether these two modules' construction
requirements are compatible with this project's actual DOM UI.** `HTMLMesh` typically wants a
concrete, already-laid-out DOM element to snapshot (behavior with elements styled via external
CSS, `:has()` selectors, custom fonts, or elements not currently attached/visible is the kind of
thing that needs hands-on verification, not assumption) — this project's panels
(`PauseMenuPanel` and subclasses) render by replacing `innerHTML` wholesale and lean on CSS for
most of their look (see `client/src/styles/pause-menu/*.css`). Whether that combination "just
works" with `HTMLMesh`, needs restructuring, or needs a different projection technique entirely is
exactly what the first task below is for.

This is meant to be tried **in tandem** with the
[game-box fold-open interaction](game-box-open-interaction-plan.md) work, not strictly sequenced
before/after it — the two touch different, mostly non-overlapping parts of the codebase
(input/UI projection vs. scene/game-box rendering).

## Design (sketch — intentionally not fully specified)

1. **Confirm `HTMLMesh`/`InteractiveGroup` availability** in the pinned three.js version, and
   prototype rendering one existing DOM panel — smallest one first (e.g. `CacheManagementPanel`,
   not the full pause menu) — onto a plane in the scene during an active XR session.
2. **Anchor strategy** (open question, needs a decision before broad rollout): head-locked (always
   in view, like a HUD) vs. hand-locked (attached to the off-hand controller/grip — precedent
   already exists via `XRControllerManager`'s grip `Group`s, the same attachment point the
   game-box fold-open plan uses) vs. world-fixed (summoned in front of the player at open time,
   like the fold-open box). Prototype more than one if the first choice reads badly in headset.
3. **Route raycasting through the existing controller-ray infrastructure**
   (`XRControllerManager`/`XRControllerRaySource`) rather than a second, parallel raycast setup, if
   `InteractiveGroup`'s own raycasting doesn't already compose cleanly with it — survey before
   extending here specifically; this project has already hit (and fixed) exactly this kind of
   duplicate-mechanism trap once this session (the XR-gamepad-binding collapse in
   `vr-support-plan.md`'s addenda).
4. **Decide which menus ship first.** Likely candidates, rough priority order: pause/settings (the
   concrete gap that motivated this) first, the game library binder second and lower priority —
   the fold-open interaction may end up being the primary VR game-browsing path instead (see the
   game-box plan's Related section), worth revisiting once that lands.

## Non-goals (explicitly deferred)

- A VR-native (non-DOM-projected) menu system — only pursue if DOM-projection proves visually or
  technically unworkable.
- Locomotion/comfort options (snap-turn, teleport) — separate sub-scope 2 story, own plan when
  picked up.
- Deciding the final anchor strategy now — prototype-driven, not desk-decided.

## Tasks

1. ~~Spike: get one small DOM panel (e.g. `CacheManagementPanel`) actually projected and
   interactive in a live XR session via `HTMLMesh`/`InteractiveGroup`.~~ **Done 2026-08-11** (run as
   a background agent, per the user's preference for isolated feasibility spikes — see spike code
   at `client/src/webxr/spikes/SpatialMenuSpike.ts` on branch `worktree-agent-ae09cad888482f942`,
   not merged, not wired into any bootstrap). Verdict: **feasible, with two concrete integration
   gaps** to design around in task 2+:
   - `HTMLMesh`/`InteractiveGroup` import cleanly at this project's pinned three.js version.
     `HTMLMesh` is a hand-rolled DOM-to-canvas walker (not `html2canvas`) that reads
     `window.getComputedStyle()`, so this project's external CSS (`styles/pause-menu/*.css`) does
     apply — but it only understands background-color, border, and per-text-node font/color; no
     box-shadow, gradients, background-image, opacity, transform, or pseudo-elements. Auto-updates
     via a `MutationObserver` on the source element, so `PauseMenuPanel`'s `innerHTML`-replacement
     re-renders trigger a redraw with no manual hook needed.
   - **Layout gap**: `HTMLMesh` sizes its canvas off `getBoundingClientRect()`, which is zero-area
     for a `display:none` panel. `PauseMenuPanel.show()/hide()` toggles `display`, so the projected
     copy needs to stay laid out (e.g. moved offscreen) independent of the flat-screen instance's
     own visibility state.
   - **Events gap (the bigger one)**: `HTMLMesh`/`InteractiveGroup` only relay
     `mousedown/mousemove/mouseup/click` as synthetic events. Plain buttons work. But
     `CacheManagementPanel`'s checkboxes/select/number-input (wired via
     `setupToggles`/`setupSelect`/`setupInput`, listening for `change`/`input`) would **not** be
     operable via a projected raycast as-is — synthetic `click` doesn't flip checkbox state or fire
     `change`. Needs either a fix upstream in how those controls are wired, or a different
     interaction path for non-button controls.
   - `InteractiveGroup` uses its own internal raycaster reacting to the controller's native
     `move/select/selectstart/selectend` events — doesn't touch `XRControllerManager`/
     `XRControllerRaySource` at all, but no duplication risk: it operates on the same
     `XRTargetRaySpace` objects `XRControllerManager` already owns, just registered with both
     systems. No shared "primary controller" priority logic like
     `XRControllerManager.getPrimaryControllerRay()` — fires per-controller independently.
2. Pick and implement an anchor strategy for the first shipped menu (pause/settings).
3. Wire the projected panel's raycasting to the existing `XRControllerManager` infrastructure
   rather than a parallel raycast path.
4. Extend to additional menus per the priority list above, one at a time, each independently
   testable in headset.
5. Update `docs/features/vr-support.md` sub-scope 2 status as each menu lands.

## Verification

- `yarn tsc` after each phase.
- Manual, real-headset: the projected panel is legible, interactable via controller ray + trigger,
  and doesn't visually break when the underlying DOM panel re-renders (`PauseMenuPanel.render()`
  replaces innerHTML wholesale today — confirm the projection technique's texture updates pick
  that up, or find the right per-frame refresh hook if not automatic).

## Related

- [VR Support](../features/vr-support.md) — sub-scope 2.
- [`vr-support-plan.md`](vr-support-plan.md) — sub-scope 1 (controller input/raycasting), the
  dependency this plan builds on.
- [Game Box Fold-Open Interaction](game-box-open-interaction-plan.md) — parallel VR UX work, not
  sequenced against this plan.
