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

## Where we actually are (updated 2026-08-20, all live-verified unless noted)

Built and working:

- `VRSettingsPanelCoordinator` — owns a real uikit tree in the scene, activates/deactivates on the
  same `UIEventTypes.MenuOpen`/`MenuClose` the DOM pause menu emits. Anchor mode is currently
  `world-lock` (temporary, live trial - see "world-lock trial" below; `camera-attached` was the
  2026-08-19 A/B winner). Per-frame `update()` drives uikit layout, flatscreen mouse forwarding, and
  controller-pointer reconciliation.
- `VRControllerPointer` — one `@pmndrs/pointer-events` ray pointer per connected controller, with a
  laser beam + hit marker, always-on (not trigger-gated - that behavior is reserved for a future
  real-world game-box raycast instead), native `selectstart`/`selectend` for down/up.
- `VRSettingsMenuShell` — the tab column + content-swap area (Story 4, done). Four tabs today:
  `display-advanced` (✅ ported), `vr-category-reference` (world-lock trial, not a real DOM panel),
  `debug` (✅ ported), `vr-more-settings` (placeholder covering the five still-unported panels).
- VR `OpenMenu` (xr-standard button 4) confirmed against real hardware; VR `Cancel` bound to grip.

Not built:

- Five of the eight DOM panels (`CacheManagementPanel`, `ControlsPanel`, `ApplicationPanel`,
  `GameSettingsPanel`, `GraphicsSettingsPanel`) - see "Full menu/panel inventory" below.
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
two places, in two shapes. Doing that to the remaining seven pause-menu panels (eight total, one
already ported — see "Full menu/panel inventory" below) is roughly 2,500 lines of duplicated
*intent* that will silently drift the first time someone tweaks a slider range on one side.

This is precisely the "second, differently-shaped mechanism for the same job" that root `CLAUDE.md`
calls a design smell, so continuing to hand-port is not a neutral default.

Three options:

| | Approach | Cost | Drift risk |
|---|---|---|---|
| A | Hand-port each panel to uikit (continue Phase 1's shape) | ~2,500 lines, 7 panels | High — permanent, two sources forever |
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

## Full menu/panel inventory (surveyed 2026-08-20)

Every distinct in-app menu/panel, so nothing gets forgotten while this migration is underway. Not
all of it is in scope for this plan — see the tier notes.

**Tier 1 — pause-menu panels (`PauseMenuManager.registerDefaultPanels`) — the actual migration
targets, tab order below.** All 8 confirmed live via code survey (no others exist):

| Panel | File | Weight | VR status |
|---|---|---|---|
| `DisplayAdvancedPanel` | `panels/DisplayAdvancedPanel.ts` | Small, schema-driven | ✅ Ported (`display-advanced`) |
| `DebugPanel` | `panels/DebugPanel.ts` | Substantial (454 lines) | ✅ Ported (`debug`, 2026-08-20) — `VRDebugPanel.ts`. Read-only stats only: console capture/clear and JSON export left out entirely (no VR equivalent worth faking), no auto-refresh interval (`VRMenuTabContent` has no teardown hook yet - see that class's doc comment) |
| `CacheManagementPanel` | `panels/CacheManagementPanel.ts` | Substantial (482 lines) | Next up — see pivot below |
| `CameraSettingsPanel` | `panels/CameraSettingsPanel.ts` | Moderate (307 lines) | Planned, settings-shaped |
| `ApplicationPanel` | `panels/ApplicationPanel.ts` | Moderate (161 lines) | Planned, settings-shaped |
| `GameSettingsPanel` | `panels/GameSettingsPanel.ts` | Substantial (437 lines) | Planned, settings-shaped |
| `GraphicsSettingsPanel` | `panels/GraphicsSettingsPanel.ts` | Largest (676 lines) | Planned, settings-shaped, highest escape-hatch risk |
| `ControlsPanel` | `panels/ControlsPanel.ts` | Substantial (392 lines) | Planned, action-shaped (rebind-capture UI) |

**Tier 2 — standalone panels, not part of the pause menu, tracked but not scheduled.** Per direct
request ("we're also going to need to incorporate essentially all of the menus... they're not all
necessarily important, most are almost explicitly unimportant") — listed so they aren't lost, no
tab order implied yet:

| Panel | File | What it is |
|---|---|---|
| `LightingControlsPanel` | `client/src/ui/LightingControlsPanel.ts` | The "lighting panel" — master/per-group/per-light brightness sliders |
| `CategoryReferencePanel` | `client/src/ui/CategoryReferencePanel.ts` | Dev/design quick-reference for game categories/sort dimensions (hotkey `G`) — **pulled out of Tier 2, see the `world-lock` trial section below**: ported as a `category-reference` VR tab specifically to pilot `world-lock` anchoring |
| `LayoutControlPanel` | `client/src/ui/LayoutControlPanel.ts` | Layout/Group/Sort control bar |
| `GameLibraryListPanel` | `client/src/ui/GameLibraryListPanel.ts` | Searchable/filterable full-library list view |
| `ScenePropsPanel` | `client/src/ui/ScenePropsPanel.ts` | User prop-folder picker |

**Tier 3 — explicitly not this migration's concern:**

- `GameLibraryBinderUI` / `BinderGameDetailPanel` — separate scope, unchanged from the original plan.
- The game-box-fold panels (`client/src/scene/game-box-fold/`) — already VR-native (canvas-texture
  faces, not DOM/uikit), nothing to migrate.
- `PerformanceMonitorUI`, `CompassRose` — debug HUD overlays, not menus; a VR equivalent (if ever
  wanted) is a world-anchored HUD question, not a menu tab.
- `SteamUIPanel`, `ProgressDisplay`, `WebXRUIPanel`, `StartupProgressUI` — pre-session/loading-flow
  UI, not applicable inside an in-game VR menu.
- ~~`CacheManagementUI`~~ — unused dead code superseded by the pause menu's `CacheManagementPanel`;
  deleted 2026-08-20 rather than left marked deprecated (no external callers existed, so there was
  nothing a deprecation period would have protected).

## Tab order & scope pivot (decided 2026-08-20)

Reverses this plan's original Non-goals (below): `DebugPanel` and `CacheManagementPanel` move from
"DOM-only, out of VR scope" to **first** in the migration order, ahead of the settings-shaped
panels Story 5 originally started with. Rationale (direct request): the settings panels are the
high-value screens — we don't want to ship those half-finished. The debug/cache panels are lower
stakes (genuinely "almost explicitly unimportant"), which makes them the right place to pilot
whether a **"to be implemented" placeholder pattern** reads as acceptable in VR at all, before
deciding how much of that pattern the higher-value panels should lean on.

`VRPlaceholderPanel` (`client/src/scene/uikit/panels/VRPlaceholderPanel.ts`) already exists as a
whole-tab-stub component (used for "More Settings" today) — the open question this pivot is
piloting is finer-grained than that: a real tab with some sections rendered live and others marked
"to be implemented" inline, not just an entire tab replaced by one message.

Revised order:

1. **`DebugPanel`** ✅ done 2026-08-20 — first real tab built after `display-advanced`. Read-only
   stats/counts rendered from the same `DebugStatsProvider` the DOM panel uses (unmodified - see
   `VRDebugPanel.ts`'s doc comment for how `PerformanceMonitorUI` reaches it), confirming a
   data-shaped (not settings-shaped) panel can go through the same "one data source, one VR
   renderer" approach without needing an actual `SettingsSchema`-style descriptor.
2. **`CacheManagementPanel`** — pilots the inline "to be implemented" placeholder pattern
   specifically, on whichever parts don't trivially port (clear-cache actions, cached-user list
   management) while the stats/readouts render for real.
3. **`CameraSettingsPanel`, `ApplicationPanel`, `GameSettingsPanel`, `GraphicsSettingsPanel`** —
   unchanged from the original Story 5 order (settings-shaped, simplest first).
4. **`ControlsPanel`** — last; rebind-capture UI is the least schema-shaped thing in the whole set,
   likely the heaviest user of the placeholder pattern once 1–2 above show how that reads.

Tier 2 (standalone) panels are explicitly not sequenced yet — revisit once the Tier 1 order above
is further along.

### `world-lock` trial via `CategoryReferencePanel` (2026-08-20)

Clarified: the "sample a world-fixed menu" ask and the "bury `CategoryReferencePanel` somewhere in
the world" idea from the previous session were the same idea, not two separate ones — try
`world-lock` anchoring specifically by porting `CategoryReferencePanel`'s content (not a settings
panel) into a uikit tab. Judged small enough to build directly rather than write a separate plan
for: the content is 28 static rows (19 Steam genres + 4 meta-categories + 5 sort dimensions, each
just a label + status) across three sections, a good fit for the `Container`/`Text` primitives and
the `overflow: 'scroll'` content area already built for the tab shell (see the sizing pivot in this
session's commits) — no new anchoring or layout mechanism needed, unlike a genuinely *permanent*
in-world fixture would require. Implemented as a new `category-reference` tab; **not** a permanent
scene object yet — this trial reuses the existing menu open/close lifecycle with `world-lock`
substituted for the anchor mode, which is enough to judge "does world-locked content read well when
you walk around it" without building the separate always-present-object mechanism first. If the
trial reads well, "make it actually permanent, not gated behind menu-open" becomes its own follow-up
rather than a prerequisite.

### Future ideas (not scheduled, logged so they aren't lost)

- **Tab-navigation "knobs"** — a control row at the top of the VR menu shell for jumping between
  top-level menu/sub-menu groups directly, instead of only the tab column. Raised alongside this
  pivot; no design yet. (Also logged in `act4-encore-someday-maybe.md`'s VR/Interaction section.)
- **Migrating individual Tier 1 panels via low-context subagents** — once the pattern from panels
  1–2 above is proven out, later panel ports (3 onward) are a good fit to fan out to subagents
  rather than sequence one after another in the main thread, since each port is a bounded,
  well-specified unit of work against an established pattern. Revisit once panels 1–2 land.
- **Making the `CategoryReferencePanel` world-lock trial a genuinely permanent scene fixture** —
  not gated behind opening a menu at all, more like a placed prop than a summoned panel. Only worth
  doing if the trial above reads well; needs its own placement mechanism (fixed world coordinate,
  no open/close), which doesn't exist yet.

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

### Story 5 — Migrate the remaining panels

One commit per panel. Order revised 2026-08-20 (see "Tab order & scope pivot" above) — debug/cache
now lead, piloting the inline "to be implemented" placeholder pattern on low-stakes panels before
the settings-shaped ones:

1. `DebugPanel` ✅ done 2026-08-20 — mostly read-only stats; first test of the pattern on a
   non-settings-shaped panel.
2. `CacheManagementPanel` — pilots inline per-section "to be implemented" placeholders specifically.
3. `CameraSettingsPanel` (sliders + reset — closest in shape to what Story 3 proves)
4. `ApplicationPanel` (toggles + buttons — exercises `createToggleRow`)
5. `GameSettingsPanel` (toggles + selects + inputs — exercises `createSelectRow`; text input in VR
   is an open problem, see Non-goals)
6. `GraphicsSettingsPanel` (largest; expect real escape-hatch pressure — presets, reload badges)
7. `ControlsPanel` (rebind-capture UI — least schema-shaped, likely heaviest placeholder use)

Each: schema entry (or placeholder-annotated equivalent for 1/2/7) → both renderers → DOM panel
rewritten to the schema → VR panel appears in the shell → tests → in-headset check.

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

- ~~`CacheManagementPanel`, `DebugPanel`, `ControlsPanel` in VR. Documented as DOM-only for now.~~
  **Reversed 2026-08-20** — see "Tab order & scope pivot" above; these now lead the migration
  order specifically to pilot the "to be implemented" placeholder pattern on low-stakes panels.
- Tier 2/3 standalone panels from the "Full menu/panel inventory" above (`LightingControlsPanel`,
  `CategoryReferencePanel`, `LayoutControlPanel`, `GameLibraryListPanel`, `ScenePropsPanel`, and
  everything in Tier 3) — tracked, not scheduled.
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
- [`ui-normalization-plan.md`](ui-normalization-plan.md) — **paused 2026-08-20** in favor of this
  plan's dual-renderer `SettingsSchema` approach; see that doc and
  [`ui-standardization.md`](../features/ui-standardization.md) for the reasoning. Its Phase A/B
  output (`tokens.css`, the `UIComponent` hierarchy) isn't discarded — `SettingsSchemaDomRenderer`
  still reuses it for the DOM half of each schema-driven panel.
