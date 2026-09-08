# Plan: VR Button Hints

## Status

**Back burner.** This doc captures the design so it's ready to pick up, but implementation is
deliberately deferred - see "Sequencing" below. Sub-scope of [VR Support](../features/vr-support.md)'s
sub-scope 2 (spatial UI), sibling to
[`docs/plans/vr-spatial-settings-menu-plan.md`](vr-spatial-settings-menu-plan.md).

## Goal

Render in-VR labels near a controller showing what its buttons currently do (e.g. "Drop" near the
grip while holding a game box), so the player doesn't have to memorize bindings. Scoped narrower
than "hint every bound action all the time" - see "First target" below.

## Background

Originated from a background research spike (this session) surveying how VR apps typically show
button hints and how this would fit the codebase. Findings that shape this plan:

- Controller-attached text (parented to the grip, following `VRControllerPointer.ts`'s precedent
  of attaching real geometry to a connected controller and self-healing every frame) beats a fixed
  HUD or a context panel for this - hints should sit where the hand already is, glanceable in
  periphery, not something the player has to raycast at.
- Two real gaps this surfaced, both addressed below: no verb mapping for hint text, and no way for
  anything outside `GameBoxFoldCoordinator` to know a box is currently held.

## Design

### 1. Verb mapping is separate from binding labels

Confirmed in review: `InputProfile.ts`'s binding `label` field ("Trigger", "Grip / Squeeze") and
`InputActions.ts`'s action name ("Interact", "Cancel") are both *correct for what they're for* -
binding resolution and settings-menu display - and *wrong for a hint*, which needs a verb specific
to what's actually happening right now ("Grab", "Drop"), not the generic action name behind it.

Don't bolt this onto either existing table (they're about binding resolution/generic display, not
moment-to-motion hint copy). Add a small, separate lookup owned by the hint renderer itself -
something like:

```ts
// action id + context -> display verb, not a property of the binding itself
function hintVerbFor(action: InputAction, context: HintContext): string | null
```

Exact shape TBD when this is picked back up - keep it minimal (just the actions that actually get
hints, not a mapping for every `InputAction`).

### 2. First target: hints only while something is held

Not "always show every bound action" (real clutter risk with 4+ VR bindings per hand). First
concrete case, per direct request: **while a game box is currently summoned, show a hint near the
grip reading "Drop"** (the button that's otherwise unbound to any visible hint today - see the
grip/squeeze `Cancel` binding just added). Whether trigger also gets a hint while nothing's held
("Grab" appearing when hovering a box) is a natural follow-on but not the pilot case.

### 3. Grabbed/dropped signal: event-driven, not polled

Confirmed in review: this should be an event `GameBoxFoldCoordinator` emits, not a getter/state
some other class reaches in and reads directly (that'd be a cross-class dependency this project's
event-driven rules don't allow). Two firing points, matching the class's existing internal verbs:

- **Grabbed** - fire where `summon()` currently starts (`model.playOpen()`), so the hint appears as
  soon as the open animation starts, not after it finishes.
- **Dropped** - fire where `handleCancelPressed()`/the pending-close path currently calls
  `model.playClose()`, so the hint disappears the moment the player *initiates* the drop, not after
  the close animation finishes playing out (waiting for animation completion would read as
  laggy/unresponsive for a hint specifically, even though the box itself is still mid-animation).

**Open question raised in review, worth deciding when this is picked up**: how much data should
the payload carry? `GameBoxFoldCoordinator` already has `appid` in hand at both firing points for
free (same as `GameSelectedEvent` already carries it), so the default/simplest option is a normal
readonly-payload event pair with `appid` included, same shape as every other event in this file -
consumers that only care *whether* something is held (the hint renderer) just ignore the field.
The alternative (a deliberately anonymous "something is held: true/false" signal with no appid) is
only worth building if a real consumer actually needs to not know *what's* held - no such consumer
exists yet, so start with the simple option and only split if that changes.

Proposed event types (naming TBD, matching `GameEventTypes`' existing style):
```ts
GameEventTypes.BoxGrabbed  // { appid: string }
GameEventTypes.BoxDropped  // no payload needed
```

### 4. Rendering shape (from the research spike, unchanged)

New `VRButtonHintCoordinator`/`VRButtonHintRenderer` in `client/src/scene/uikit/`, one hint (or
small set) per connected controller's **grip** (not targetRaySpace - grip tracks the physical hand/
button location, targetRaySpace is the aim ray). uikit `Text`, self-healing every frame against
`getControllerRaySpaces()`-style connected-controller state, exactly like
`VRSettingsPanelCoordinator.syncControllerPointers()`/`VRControllerPointer` already do. Update text
content only on the grabbed/dropped event firing, not every frame - only position/orientation needs
per-frame work (and that's free if parented directly to the grip, same as `VRControllerPointer`'s
beam).

Suppress while any menu is open (`MenuOpen`/`MenuClose`), mirroring
`SystemUICoordinator.handleInteractPressed`'s existing no-op-during-menu guard - a hint competing
with the settings panel for attention is the same class of problem that guard already solves.

## Non-goals (for the first pass)

- Hints for every bound VR action simultaneously (Interact when hovering, Sprint, Move, Look,
  OpenMenu, etc.) - only the held/drop case above.
- A flatscreen equivalent - open question, not decided; `VRControllerPointer` is VR-only precedent.
- Solving the `xr-menu-button-mapping-unverified` tech debt (button 4 for `OpenMenu`) - being
  verified separately now that the VR settings panel actually opens in-headset; a hint claiming
  "Menu Button: Settings" shouldn't ship until that mapping is confirmed correct on real hardware.

## Sequencing

Explicitly back-burnered per direct request - this doc exists so the design isn't lost, not as a
green light to start building. Before implementation: confirm the verb-mapping shape (design #1)
and the event payload shape (design #3) are still right, then implement per "Rendering shape"
above.
