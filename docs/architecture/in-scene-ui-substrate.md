# In-Scene UI Substrate

**Decision (2026-09-02): `@pmndrs/uikit` is the single UI system for UI that lives in the 3D scene.**
Hand-rolled canvas-2D-drawn-onto-a-mesh is retired as a general approach; it survives only as a
narrow escape hatch for freeform art (see below).

This doc is the durable home for that decision. The per-surface migration work lives in the plans:
[`vr-uikit-menu-migration-plan.md`](../plans/vr-uikit-menu-migration-plan.md) for the settings menu,
[`game-box-open-interaction-plan.md`](../plans/game-box-open-interaction-plan.md) for the game box.

## The three substrates we've actually shipped

| Substrate | Where | Status |
|---|---|---|
| DOM/CSS overlays | pause menu, binder, `BinderGameDetailPanel` | Flatscreen-only. **Structurally invisible in an immersive WebXR session** — a DOM layer is never submitted through `XRWebGLLayer`. Same root cause killed the `CSS3DRenderer` and `HTMLMesh` projection attempts (see [`css3d-panel-projection-spike.md`](../plans/css3d-panel-projection-spike.md)). |
| Canvas 2D → `CanvasTexture` on a mesh face | game-box fold panels | Worked in VR, but content/style/layout were one imperative draw call and "buttons" were remembered pixel rects hit-tested through raycast UV → canvas coords. **Replaced** (2026-09-02). |
| `@pmndrs/uikit` | VR settings menu, now the game box | **The one we're keeping.** |

## What uikit is

`@pmndrs/uikit` (+ `@pmndrs/uikit-default` for themed components, `@pmndrs/pointer-events` for
input) is a flexbox layout engine that renders as real WebGL geometry inside the Three.js scene —
so it renders identically on flatscreen and in an immersive session, unlike anything DOM-based.
Panels are `Container`/`Text`/`Image` nodes with yoga-style flex properties; `pointer-events` gives
genuine hover, click, and scroll from a controller ray or a mouse.

## Why it won

- **A real layout engine.** No more `y += size * 0.07` arithmetic and hand-written word-wrap. Layout
  is declared, not computed by hand at every draw site.
- **Real interaction.** Hover/click/scroll are the library's job, not a raycast-UV-to-pixel-rect
  translation we maintain per button.
- **One system, not two.** The alternative was maintaining a canvas renderer for the box and a
  uikit renderer for the menu — a second, differently-shaped mechanism for the same job, which root
  `CLAUDE.md` names as a design smell. Converging removes that split before it hardens.
- **It's already load-bearing.** The VR settings menu is built on it and verified in headset; the
  game box is joining an established path, not opening a new one.

## What uikit can't do

Real constraints, so nobody is surprised later:

- **Flat rounded-rect panels only.** No curved surfaces, no irregular masks, no decals, no
  wrapping around a prop's geometry.
- **msdf text.** Glyphs come from a font atlas — no emoji, and unusual punctuation (em-dash and
  friends) is not guaranteed. The VR menu already strips unsupported glyphs before they reach a
  `Text` node; anything new should do the same rather than assume a glyph renders. This is the one
  broad, cross-cutting cost of the direction: the DOM menus lean on roughly 25 distinct emoji and
  symbol glyphs as panel/tab icons, and each one becomes an image asset or a tofu box when its panel
  ports. [`ui-normalization-plan.md`](../plans/ui-normalization-plan.md)'s deferred
  "broader icon consistency pass" is where
  that lands; don't add new emoji-as-icon usage to surfaces headed for uikit in the meantime.
- **Not an arbitrary 2D drawing surface.** Containers, text, and images. No paths, no arcs, no
  gradients-as-art, no per-pixel drawing.
- **It generates its own geometry.** uikit does not paint onto an existing mesh's UVs — you parent
  a uikit tree into the scene graph, you don't texture a face with it. Anything that genuinely
  needs to *be* a face of an existing mesh is not a uikit problem.
- **No video or shader-driven surfaces.** A `VideoTexture` on a scene mesh (e.g. the in-scene TV in
  [Friend Stream Projection](../features/friend-stream-projection.md)) stays a scene-mesh concern;
  uikit is not in that path and doesn't block it.

## Scope: this is a decision about panels, not about scene art

"Standardize on uikit" means *panel UI* — menus, settings, the game box's content faces. It does
**not** mean "nothing in the scene may be drawn any other way." A doc sweep (2026-09-02) turned up
real, committed intent that stays on its own renderer and is explicitly out of scope here:

- **Signs** — the `ISignRenderer` family (`canvas` / `neon-tube` / `block-letter`),
  [Neon Sign Stroke Skeleton](../features/neon-sign-stroke-skeleton.md)'s per-letter `TubeGeometry`,
  Act 3's double-sided sign faces and shader-driven swatch colors, and
  [UI Standardization](../features/ui-standardization.md)'s "2D signage → 3D cube elements" story.
  uikit panels are flat and effectively single-faced; none of that is a uikit job.
  [`liminal-shelf-signs-plan.md`](../plans/liminal-shelf-signs-plan.md) is a specific reason not to
  drift signs toward uikit: signs are placed and removed on every section-boundary crossing as the
  corridor recycles, and standing up/tearing down a uikit root on a recycle tick is materially
  heavier than swapping a canvas texture.
- **Set dressing and wall art** — die-cut standees and cutouts
  ([Scene Clutter & Props](../features/scene-clutter-and-props.md),
  [Fabricated Set Dressing](../features/fabricated-set-dressing.md)) need irregular alpha
  silhouettes; [Wall Art & Framed Posters](../features/wall-art-framed-posters.md) fakes glass with
  material roughness on the image plane. uikit has neither.
- **Video surfaces** — [Friend Stream Projection](../features/friend-stream-projection.md)'s
  `getDisplayMedia` → `VideoTexture` TV, and the game box's deferred screenshots/**videos** rows.
  Screenshots are fine as uikit images; video is not.

If it's a prop, a sign, or art, it keeps its own renderer. If it's a panel someone reads or clicks,
it's uikit.

## The canvas escape hatch

Canvas-on-a-texture remains legitimate for **genuinely non-rectangular or freeform art**: a shape
you'd draw rather than lay out, with no rows, no text flow and no hit targets.

Worth knowing that it's needed less often than it looks. The disc was expected to be the one real
instance — the store panel presents header art as a semicircle emerging from a sleeve, drawn on
canvas as an `ctx.arc(PI, 2*PI)` clip. In uikit it's a container half as tall as it is wide with its
two top corners rounded by half its width and `overflow: 'hidden'` clipping the image inside: the
same semicircle, no drawing. uikit's rounded corners cover more "non-rectangular" cases than the
flexbox framing suggests, so check before assuming a shape needs canvas.

The store panel does still keep one canvas, but as a *pixel carrier*, not a drawing surface: header
art arrives from `GameArtworkProvider` as raw pixels, and `putImageData` into a canvas is the
cheapest way to hand uikit's `Image` a texture. Nothing is drawn on it.

Rule of thumb: if it has rows, labels, or anything clickable, it's uikit. If it's genuinely a drawn
shape, canvas is fine — as an image *inside* a uikit tree where possible.

## We don't want to go back

Reaching for hand-rolled canvas UI again should be a conscious, justified exception with a stated
reason — not the default because it's the shape the file already has. The cost of the canvas
approach wasn't the drawing; it was that every new element re-derived its own layout and its own
hit-test, so the surface got harder to change with each addition
([`game-box-canvas-ui-hit-testing`](../tech-debt.md#id-game-box-canvas-ui-hit-testing) is the
record of that). If a new surface seems to need canvas, first check whether it's actually the
freeform-art case above; if it is, keep the canvas part to the art and let uikit own everything
around it.

## Related

- [`vr-uikit-menu-migration-plan.md`](../plans/vr-uikit-menu-migration-plan.md) — the settings-menu
  migration, and the `SettingsSchema` dual-renderer layer that keeps one content definition across
  the DOM and uikit surfaces.
- [`game-box-open-interaction-plan.md`](../plans/game-box-open-interaction-plan.md) — the game box,
  whose three canvas faces are being replaced with uikit panels parented to the existing hinge
  groups.
- [`game-box-canvas-ui-hit-testing`](../tech-debt.md#id-game-box-canvas-ui-hit-testing) — the debt
  this decision resolves.
- [`css3d-panel-projection-spike.md`](../plans/css3d-panel-projection-spike.md) — why DOM
  projection (CSS3D / `HTMLMesh`) was abandoned.
- [UI Standardization](../features/ui-standardization.md) — the DOM-side normalization thread,
  paused in favor of this direction.
- [Design Philosophy](design-philosophy.md) — the UX principles this substrate has to serve.
