# Plan: VR uikit Menu Migration

**Identifier**: `vr-uikit-menu-migration`
**Parent feature**: [VR Support](../features/vr-support.md) — sub-scope 2 (VR Headset → Spatial UI)
**Status**: Planned, not started (written 2026-08-19)
**Supersedes**: [`vr-spatial-settings-menu-plan.md`](vr-spatial-settings-menu-plan.md) — that plan's
whole design was DOM projection (`HTMLMesh`/`InteractiveGroup`), which was tried and abandoned; see
"Why the old plan doesn't apply" below.

## Goal

Make the app's settings menu genuinely usable in an immersive WebXR session, from the same
`OpenMenu` press that opens it on flatscreen — no dev flag, no second thing to remember to turn on.
When this is done, `?forceVRSettingsPanel=1` is deleted, the VR panel shows real settings (not just
the one Advanced tab), and the dead CSS3D projector is removed.

## Where we actually are (2026-08-19, all live-verified)

Built and working:

- `VRSettingsPanelCoordinator` — owns a real uikit tree in the scene, activates/deactivates on the
  same `UIEventTypes.MenuOpen`/`MenuClose` the DOM pause menu emits, anchored to the primary
  controller grip (falling back to camera-local). Per-frame `update()` drives uikit layout,
  flatscreen mouse forwarding, and controller-pointer reconciliation.
- `VRControllerPointer` — one `@pmndrs/pointer-events` ray pointer per connected controller, with a
  laser beam + hit marker, gated on analog trigger depression, native `selectstart`/`selectend` for
  down/up, and a `-15°` pitch correction on the reported target-ray direction.
- `VRDisplayAdvancedPanel` + `UIKitRowHelpers.createSliderRow` — exactly **one** ported panel
  (Display → Advanced, 6 sliders + a reset button), drawing on top of scene content via
  `depthTest: false` + a high `renderOrder`.
- VR `OpenMenu` (xr-standard button 4) confirmed against real hardware; VR `Cancel` bound to grip.

Not built:

- Any tab shell in VR. There is no way to reach a second panel.
- Eight of the nine DOM panels.
- Any suppression/coordination of the DOM pause menu while in a session (both "open" at once today,
  which is harmless only because the DOM one is invisible in-headset).
- Removal of `?forceVRSettingsPanel=1` and of the dead `SettingsPanelProjector` (CSS3D), which is
  still constructed in `SystemUICoordinator`.

### Why the old plan doesn't apply

`vr-spatial-settings-menu-plan.md` proposed projecting the *existing DOM* into the scene via
three.js's `HTMLMesh` + `InteractiveGroup`, explicitly to avoid maintaining two UIs. That was
spiked ([`css3d-panel-projection-spike.md`](css3d-panel-projection-spike.md)) and abandoned: DOM
projection never reaches an immersive session's render surface at all. The uikit direction that
replaced it is correct, but it **reintroduces exactly the problem the old plan was trying to
avoid** — a second UI implementation of the same settings. That is the central design problem this
plan has to answer, not an afterthought.

## The central decision: how do we not maintain two menus?

`VRDisplayAdvancedPanel` today is a hand-written duplicate of `DisplayAdvancedPanel`. Both encode
the same six controls' labels, ranges, steps, formatters, defaults, and target `Setting` keys, in
two places, in two shapes. Nine panels of that is roughly 2,500 lines of duplicated *intent* that
will silently drift the first time someone tweaks a slider range on one side.

This is precisely the "second, differently-shaped mechanism for the same job" that root `CLAUDE.md`
calls a design smell, so continuing to hand-port is not a neutral default.

Three options:

| | Approach | Cost | Drift risk |
|---|---|---|---|
| A | Hand-port each panel to uikit (continue Phase 1's shape) | ~2,500 lines, 8 panels | High — permanent, two sources forever |
| B | Full descriptor refactor: define every panel declaratively, DOM and uikit both render from it | Large up-front; touches all 9 DOM panels including table/action-heavy ones | Eliminated |
| C | **Descriptor layer for the settings-shaped panels only; the action/table-heavy panels stay DOM-only and out of VR scope for now** | Moderate | Eliminated where it matters |

**Recommendation: C.** Rationale: the panels split cleanly into two families, and only one of them
is descriptor-shaped.

- **Settings-shaped** (a list of labelled controls bound to `AppSettings` keys, plus a reset):
  `DisplayAdvancedPanel`, `GraphicsSettingsPanel`, `CameraSettingsPanel`, `GameSettingsPanel`,
  `ApplicationPanel`. These are ~90% `RangeControl`/toggle/select rows.
- **Action/data-shaped** (async operations, live-updating stats, tables, key-binding editors):
  `CacheManagementPanel`, `DebugPanel`, `ControlsPanel`. A settings descriptor cannot express these
  without becoming a general-purpose UI framework, and none of them is load-bearing for a headset
  session.

So: build the descriptor for the settings family, migrate both renderers onto it, and explicitly
declare the other three out of VR scope (documented as such, not silently skipped).

> **User decision point.** If you'd rather ship VR coverage of all nine panels sooner and accept
> the duplication, say so and this becomes option A with a much shorter plan. C is the
> recommendation because the drift cost is permanent and the panels are still small enough to
> unify cheaply *now*.

### What the descriptor looks like

Today there is **no** single place that knows a setting's presentation metadata. `AppSettings`
holds keys, types, and persisted values only — every min/max/step/label/formatter/default lives
inline in the DOM panel's `render()` (see `DisplayAdvancedPanel.ts:43-113`) and is re-typed in the
uikit panel. That gap is the leverage point.

Proposed: a new `client/src/ui/settings/SettingsSchema.ts` (name TBD) holding readonly descriptors:

```ts
type SettingControl =
    | { readonly kind: 'range'; readonly setting: SettingKey; readonly label: string
        readonly description?: string; readonly min: number; readonly max: number
        readonly step: number; readonly defaultValue: number
        readonly formatDisplay?: (v: number) => string
        readonly trackLabels?: readonly [string, string] }
    | { readonly kind: 'toggle'; readonly setting: SettingKey; readonly label: string; ... }
    | { readonly kind: 'select'; readonly setting: SettingKey; readonly label: string
        readonly options: readonly { readonly value: string; readonly label: string }[]; ... }

interface SettingsPanelSchema {
    readonly id: string          // matches the existing DOM panel id, e.g. 'display-advanced'
    readonly title: string
    readonly icon: string
    readonly controls: readonly SettingControl[]
}
```

Two renderers consume it, and neither owns the content:

- `SettingsSchemaDomRenderer` — emits the same HTML the panels emit today (reusing `RangeControl`
  and friends), so CSS, `data-requires-reload`, and change-tracking keep working unchanged.
- `SettingsSchemaUIKitRenderer` — emits the uikit tree, generalizing `UIKitRowHelpers`
  (`createSliderRow` already exists; add `createToggleRow` / `createSelectRow` on top of
  `uikit-default`'s `Checkbox`/`Switch` and a menubar/toggle-group-based select).

Reset-to-defaults becomes generic: walk `controls`, write each `defaultValue`. Both current reset
implementations are hand-enumerated lists that must be kept in sync with the control list — that
class of bug disappears.

**Per-control escape hatch is required, not optional.** `GraphicsSettingsPanel` (612 lines) has
preset buttons, cross-control interactions, and reload-required badges that will not all reduce to
descriptors. The schema covers the rows; a panel keeps the freedom to render extra bespoke DOM
around them. If a given panel turns out to be >30% bespoke, leave it DOM-only and say so rather
than contorting the schema.

## Anchoring, shell, and interaction (decided 2026-08-19)

1. **Anchor: camera-attached wins the live A/B (resolved 2026-08-19).** `VRPanelAnchorMode`
   (`'camera-attached' | 'world-lock' | 'grip-attached'`) is a constructor parameter defaulting to
   a module constant (`DEFAULT_ANCHOR_MODE`) — same DI shape as `forceEnabled`, so switching modes
   is still a one-line edit if a future panel wants a different anchor. Confirmed live in headset:
   the menu should move with the player's head like a HUD (`camera-attached`, now default), not
   stay pinned in world space (`world-lock` — you could just walk away from it) or follow the
   primary controller (`grip-attached` — swings while you point at it with the same hand). All
   three modes are kept implemented, not deleted, for future reuse. `world-lock` still computes
   position + yaw-only orientation from the camera once, at open, and adds the panel directly to
   the scene rather than parenting it.
2. **Tab shell: keep the DOM menu's existing tab/subtab structure**, not the flat single-column
   redesign originally proposed. Port `PauseMenuTabGroup`'s shape as-is for Story 4; use the extra
   vertical room VR affords for taller content areas instead of restructuring navigation. Get a
   first look at how the ported structure actually reads in-headset before deciding whether it
   needs simplifying.
3. **Active-panel ownership: `UIEventTypes.MenuPanelChanged`.** Confirmed direction — this project
   is converging on **one** menu implementation (uikit), with the DOM menu being phased out over
   the course of this plan rather than kept as a permanent parallel surface. Build the event now so
   both surfaces can stay in sync while both exist; expect the DOM side of that sync to eventually
   become the removed side, not the permanent one.
4. **Panel size / readability: maximize within the existing feature set.** No feature cuts to buy
   legibility — widen/resize/retune font sizes as needed when Story 3/4 land real content, tune
   from there based on live feedback rather than guessing exact numbers up front.
5. **Text entry: assume a physical keyboard is connected** (revisit if we can detect otherwise).
   VR text controls render as a normal text field with a blinking caret and respond to real
   keyboard events — no on-screen/virtual VR keyboard. Simpler than the originally-flagged
   "VR keyboard is its own feature" non-goal; downgrades `GameSettingsPanel`'s text inputs from
   "read-only in VR" back to fully functional for Story 5.

## Stories

Ordered so each lands independently and is testable in headset on its own.

### Story 1 — Land the current working tree, clear the decks

Commit the pending beam-pitch / z-order / tech-debt / doc changes. Then remove the dead CSS3D path:
delete `SettingsPanelProjector`, its `SystemUICoordinator` wiring, its
`UrlUtils.isSettingsPanelProjectionForced()`, its tests, and mark
`css3d-panel-projection-spike.md` as concluded. Keeps the working space honest before building on
it. No behavior change.

### Story 2 — Confirm the design decisions above ✅ done 2026-08-19

See "Anchoring, shell, and interaction (decided 2026-08-19)" above. Anchor-mode switch is
implemented as part of this story (small enough to build alongside the decision, not deferred to
Story 3).

### Story 3 — Introduce the settings schema, prove it on the panel we already have

- Write `SettingsSchema.ts` types + the `display-advanced` schema (all six controls, defaults
  moved off `DisplayAdvancedPanel.DEFAULTS`).
- Write both renderers. Generalize `UIKitRowHelpers` only as far as `display-advanced` needs.
- Rewrite `DisplayAdvancedPanel` and `VRDisplayAdvancedPanel` to render from the schema. Both
  should shrink substantially; if the DOM one doesn't, the schema isn't carrying enough.
- Unit tests: schema-driven rendering produces the expected control set for both renderers;
  generic reset writes every `defaultValue`.
- **Acceptance: no visible change on either surface.** This story is pure de-duplication.

### Story 4 — VR tab shell

Build the panel-switching shell per Story 2's decisions, with `display-advanced` as its only
occupant plus a placeholder. Wire the active-panel event both directions. Anchor per decision.
Acceptance: in headset, open the menu, switch between two panels, close, reopen — lands on the same
panel the DOM menu is showing.

### Story 5 — Migrate the remaining settings-shaped panels

One commit per panel, in this order (simplest first, so the schema's gaps surface cheaply):

1. `CameraSettingsPanel` (sliders + reset — closest in shape to what Story 3 proves)
2. `ApplicationPanel` (toggles + buttons — exercises `createToggleRow`)
3. `GameSettingsPanel` (toggles + selects + inputs — exercises `createSelectRow`; text input in VR
   is an open problem, see Non-goals)
4. `GraphicsSettingsPanel` (largest; expect real escape-hatch pressure — presets, reload badges)

Each: schema entry → both renderers → DOM panel rewritten to the schema → VR panel appears in the
shell → tests → in-headset check.

### Story 6 — Remove the toggle, define the DOM menu's VR behavior

- **Partially landed 2026-08-19**: the force flag no longer suppresses a real `MenuClose` (it used
  to, which made the panel look unresponsive to the Settings button once live-tested in headset -
  it now only pre-activates at `init()` as a flatscreen-preview convenience). Deleting the flag
  entirely is still this story's remaining work.
- Delete `?forceVRSettingsPanel=1` and `UrlUtils.isVRSettingsPanelForced()`; activation is purely
  `MenuOpen`/`MenuClose`.
- Decide and implement what the DOM pause menu does during an immersive session. Simply leaving it
  open is defensible (it's invisible in-headset and it owns input-pause state), but it should be a
  stated decision with a comment, not the current accepted-simplification note.
- Update `docs/features/vr-support.md` sub-scope 2 status.

## Non-goals (explicitly out of scope; revisit later)

- `CacheManagementPanel`, `DebugPanel`, `ControlsPanel` in VR. Documented as DOM-only for now.
- **A virtual/on-screen VR keyboard.** Text entry itself is in scope (see decision 5 above — assume
  a physical keyboard, real caret, real keyboard events) but building an in-scene keyboard for
  controller-only input is not; revisit if we confirm headset users regularly lack a keyboard.
- The binder / game-detail UI (`GameLibraryBinderUI`, `BinderGameDetailPanel`) — separate scope.
- VR button hints — [`vr-button-hints-plan.md`](vr-button-hints-plan.md), back-burnered.
- A full visual design pass on the VR menu. Function first.

## Verification

- `yarn tsc` and `yarn test` after every story (project rule: unit tests before every commit).
- Every story that changes what's on screen gets an in-headset check, and the commit message /
  report says explicitly whether it was flatscreen-only or headset-verified — no overclaiming.
- Story 3 specifically: verify the *flatscreen* menu is byte-for-byte behaviorally unchanged
  (sliders, reload badges, change-tracking dots, reset) — the schema refactor touching the DOM
  menu is the highest-regression-risk step in this plan.

## Related

- [VR Support](../features/vr-support.md) — parent feature, sub-scope 2.
- [`vr-spatial-settings-menu-plan.md`](vr-spatial-settings-menu-plan.md) — superseded predecessor.
- [`css3d-panel-projection-spike.md`](css3d-panel-projection-spike.md) — why DOM projection was
  abandoned.
- [`vr-support-plan.md`](vr-support-plan.md) — sub-scope 1, the controller input this builds on.
- [`vr-button-hints-plan.md`](vr-button-hints-plan.md) — sibling VR scope, back-burnered.
- [`ui-normalization-plan.md`](ui-normalization-plan.md) — overlapping concern; the settings schema
  should be checked against it before Story 3 so the two don't invent competing abstractions.
