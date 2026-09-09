# Plan: uikit Component System

**Feature**: [uikit-component-system](../features/uikit-component-system.md)
**Status**: Settings-menu half implemented; game-box half not started

Written once the extracted pieces grew past "a handful of small shared functions" into a real token
system, which is the trigger the feature doc set for needing a plan at all.

## The problem this solves

The DOM menus separated concerns for free: layout and copy in an HTML template, appearance in CSS,
behavior in TypeScript. The first uikit panels collapsed all three into one imperative class per
panel, plus style constants scattered across whichever file happened to build a given node. Direct
review feedback (2026-09-09) on PR #168:

> I would prefer these more driven by templates or something. Figuring out how to edit these menus
> through these files is not at all intuitive.

and:

> The old DOM based menus benefited from the fact that their nature separated form (HTML/template)
> from style (CSS) from function. These do not, so we have to try to build them in a way that can.

Concretely, before this pass: two different ways to define a VR panel (schema-driven vs.
hand-built); panel identity declared in three places, already drifted, one of them dead; style
values spread across four files with no single place to look.

## The shape

Three homes, one concern each. Editing a menu means opening exactly one of them.

| Concern | Lives in | Analogue |
|---|---|---|
| **Form / content** — identity, copy, controls | `client/src/ui/settings/schemas/<Name>Schema.ts` | the HTML template |
| **Style** — type scale, spacing, color | `client/src/scene/uikit/VRMenuStyleSheet.ts` | the CSS file |
| **Function** — composition, wiring, lifecycle | `SettingsSchemaUIKitRenderer.ts`, `VRSettingsMenuShell.ts` | the TS file |

### Form: a schema *is* the panel

There is no per-panel class on the VR side. `SettingsPanelSchema` carries identity (`id`, `title`,
`icon`, optional `group`), whether the panel offers a reset, and its sections; a section carries
ordered `content` — controls and `note` copy interleaved. Both surfaces render the same schema, so
the DOM and VR versions of a panel cannot drift.

Adding a tab = writing a schema file and listing it in `VRMenuTabRegistry`. Nothing else.

### Style: uikit's own StyleSheet, not a bespoke token object

`@pmndrs/uikit` ships a CSS-like cascade the project wasn't using:

- **`StyleSheet`** — a mutable `Record<string, InProperties>` of named styles. Components take class
  names as their **second constructor argument** (`new Container(props, [MENU_CLASS.panelRoot])`),
  and expose `classList.add/remove/replace/toggle`.
- **Inherited properties** — `pixelSize`, `color`, `fontSize`, `depthTest`, `renderOrder` and others
  cascade to descendants automatically (`dist/properties/inheritance.js`). Non-inheriting properties
  (`gap`, `padding`, `backgroundColor`, …) can still be cascaded with the `'*'` star key.
- **Layer precedence** — a node's own `base` layer outranks anything inherited. This is why a child
  that sets its own `pixelSize` silently opts out of a root-driven rescale, and why only roots set
  it now.

`MENU_CLASS` exports the names rather than using bare strings, so a typo is a compile error and
importing a name is what guarantees the registration module has run.

### Function

`buildSettingsPanel(schema, appSettings)` turns any schema into geometry and returns a `reset()`.
The shell owns tab switching and the one genuinely dynamic style value (`pixelSize`, which tracks
the user's font-scale setting and therefore can't live in a static stylesheet — see
`VRMenuPixelSize.ts`).

## What this unlocked

- **UI Font Scale applies live.** Previously believed impossible ("setProperties on pixelSize didn't
  visibly relayout"); that was a misdiagnosis. uikit properties are reactive signals throughout — the
  blocker was per-panel `pixelSize` overriding the inherited value. Verified in-browser at 0.8x,
  1.0x and 1.6x on an already-open menu.
- **Per-control descriptions render in VR.** The schema always carried them; the uikit renderer
  simply never read them.

## Remaining

1. **Game-box panels** (`GameBoxFoldDimensions.ts`, `GameBoxPanelStyle.ts`, `GameBoxPanelParts.ts`,
   and the three `GameBox*Panel` classes) still build imperatively with their own constants. They
   are the feature doc's other half and its acceptance criteria are not met until they adopt this
   stylesheet. Deliberately not touched in the same pass (direct request: settings menu now, game
   box later) to keep the diff reviewable.
2. **`setTheme()` from `@pmndrs/uikit-default`.** Its `Button`/`Slider` variants read a theme of
   signals, so pointing that theme at `COLOR_TOKENS` would make the pre-styled controls match the
   app palette live. Skipped here because it is global — it would restyle the game box's controls
   too, which belongs with item 1.
3. **Control kinds beyond `range`.** `toggle`/`select` land as the remaining DOM panels port
   (migration plan's Story 5); each is a renderer case plus a schema variant, in both renderers.
4. **Rows don't observe external setting changes.** A row's displayed value resyncs on `reset()` and
   on its own drag, not when something else writes the same setting. Fine today; revisit if two
   surfaces are ever open at once.
5. **DOM tab groups still declared separately.** `schema.group` records which group a panel belongs
   to, but `PauseMenuManager.registerDefaultPanels()` still calls `registerTabGroup` by hand. Wiring
   the DOM side to read groups off schemas would finish removing the duplication.
