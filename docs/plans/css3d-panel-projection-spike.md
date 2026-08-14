# Spike: CSS3D Panel Projection

**Status**: Complete (spike) — 2026-08-12/13. Follow-on (2026-08-13): a real, tested
`SettingsPanelProjector` (`client/src/scene/css3d/SettingsPanelProjector.ts`) now projects the
actual pause menu onto a plane, wired into `SystemUICoordinator`. See "Follow-on" below.
**Type**: Feasibility spike, not a build plan. Throwaway prototype code lives at
`client/src/debug/Css3dPanelSpike.ts`, gated behind `?css3dSpike=1`
(`UrlUtils.isCss3dPanelSpikeEnabled()`), self-executing on `GameEventTypes.Start` the same way
`GameFinder`/`GameArtworkInspector` do. Not wired into the app's real boot path, not tested, not
production-quality — left in place for inspection only.

## Question

The fold-open game box (`GameBoxFoldModel` + `GameBoxFoldCoordinator`, see
[`game-box-open-interaction-plan.md`](./game-box-open-interaction-plan.md)) draws all its face
content with `CanvasRenderingContext2D` onto `THREE.CanvasTexture`s. That approach has zero
hover/mouseover feedback — canvas pixels don't know what's under the cursor. Could
`THREE.CSS3DRenderer` — which projects real HTML/CSS elements into 3D space via CSS `matrix3d`
transforms — give hover-for-free instead? This spike projects the app's **existing, real**
settings/pause menu (`PauseMenuManager` + its panels) onto a plane in front of the camera, as a
concrete stand-in test subject, and reports what actually happens.

## The VR-compatibility verdict (read this first)

**Confirmed by reading `client/node_modules/three/examples/jsm/renderers/CSS3DRenderer.js`
directly: CSS3D content will not appear in an actual WebXR immersive session, for the exact same
structural reason the original flat `BinderGameDetailPanel` overlay didn't** (see
[`game-detail-screen.md`](../features/game-detail-screen.md)'s Context section — that's the
diagnosis that led to building the fold-open box in the first place).

The source is unambiguous about the mechanism. `CSS3DRenderer`'s own class doc says outright:
"It's not possible to use the material system of three.js. It's also not possible to use
geometries... `CSS3DRenderer` is just focused on ordinary DOM elements." Concretely,
`renderObject()` (the per-object step inside `CSS3DRenderer.render()`) does exactly this for every
`CSS3DObject`:

```js
style = getObjectCSSMatrix( object.matrixWorld );
element.style.transform = style;                    // a CSS matrix3d string
if ( element.parentNode !== cameraElement ) {
    cameraElement.appendChild( element );            // a plain DOM <div>, not a WebGL surface
}
```

`cameraElement` is a `<div>` (`transformStyle: preserve-3d`) nested inside another plain `<div>`
(`viewElement`), nested inside the renderer's own root `<div>` (`domElement`) — the standard
"dual renderer overlay" technique appends that whole div stack to `document.body`, positioned
absolutely on top of the WebGL `<canvas>`. Nothing in that chain touches a `WebGLRenderingContext`,
a framebuffer, or `XRWebGLLayer`.

Compare that to how this app actually submits frames to the headset —
`SceneManager.startRenderLoop()`:

```ts
if ( this.renderer.xr.isPresenting ) {
    this.renderer.render( this.scene, this.camera )   // the ONLY path submitted to the XR compositor
} else {
    this.renderPipelineManager.render()
}
```

`CSS3DRenderer.render()` is a second, independent render call that mutates a DOM element's CSS —
it has no relationship to `renderer.xr.isPresenting` or the XR frame loop at all, in either
direction. Once a headset takes over the display (`XRWebGLLayer`'s own framebuffer is what the
compositor actually shows), regular page DOM — including a CSS3D layer positioned on top of the
2D canvas — has no representation in that view. It's not a bug or a missing flag; it's the
mechanism itself: CSS3D is a browser-compositing trick for a flat 2D page, and WebXR immersive
mode replaces "the page" with headset-rendered stereo framebuffers that don't include page DOM at
all.

**Verdict: confirmed, not merely assumed.** Same failure mode as the original flat panel, same
root cause, no workaround exists within this technique — this is not a "harder to get right"
problem, it's a "structurally impossible" one.

## What worked

- **Positioning/scale is exactly the pattern `GameBoxFoldCoordinator` already uses.** Parenting a
  `CSS3DObject` directly to the same `THREE.Camera` the WebGL scene uses
  (`camera.add(cssPanel)`, local offset `(0, 0, -0.6)` — the same `CAMERA_LOCAL_OFFSET` constant
  the fold-open box anchors to) produces a correct `matrix3d` transform derived from the live
  camera pose, no extra bookkeeping required. Confirmed by direct inspection: driving
  `cssRenderer.render(scene, camera)` produced a panel `getBoundingClientRect()` centered
  correctly in front of the camera at the expected apparent size.
- **Reusing the live DOM node (not a clone) keeps all production behavior.** The spike projects
  the actual `#pause-menu-overlay` element PauseMenuManager already built — not a
  `cloneNode()` copy. `cloneNode()` would carry the CSS but **not** the JS event listeners
  `PauseMenuPanel.attachEvents()`/`PauseMenuManager.setupEventHandlers()` bind via
  `addEventListener` (clone doesn't copy listeners), which would make hover-only testing possible
  but click/tab-switching dead. Concretely verified instead: after `CSS3DRenderer` reparented the
  live node into its own DOM layer, calling the real close button
  (`document.getElementById('pause-menu-close').click()`) correctly ran `PauseMenuManager`'s real
  `close()` handler and flipped the overlay to `display: none` — the projected panel is
  functionally identical to the normal 2D one, not a dead visual copy.
- **The click-through/occlusion mechanism is exactly the standard three.js technique, and it's in
  place correctly.** `CSS3DObject`'s constructor forces `element.style.pointerEvents = 'auto'` on
  the wrapped element; the spike sets the renderer's own container `pointerEvents = 'none'`. That
  split is what lets clicks land on the panel where it visually is, while passing through
  everywhere else on the CSS3D layer to whatever's under it in the WebGL scene. Verified present
  and correctly configured by direct style inspection (`cssRendererPointerEvents: 'none'`,
  `overlayPointerEvents: 'auto'`).

## What was janky

- **Viewport-relative CSS breaks under projection.** The real pause menu template is built with
  `100vw`/`100vh` (`.pause-menu-overlay`) and `min(90vw, 800px)` (`.pause-menu`) — reasonable for
  a component that's always covered the actual browser viewport, but those units don't respect
  CSS3D's transform-faked "3D viewport." Projected unmodified, the panel tries to size itself
  against the real window and only gets scaled afterward — illegible and wildly wrong scale in
  practice. The spike works around this with hand-written fixed-pixel inline style overrides
  (`900px` × `650px`) applied right before projecting. Any serious use of this technique on
  existing UI needs a "does this assume it owns the real viewport" pass first — most current UI
  (pause menu, binder panels) makes that assumption throughout.
- **Hover verification was inconclusive, and I want to be honest about why rather than overclaim
  either way.** Hovering the reparented `.pause-menu-tab` (via a real dispatched pointer hover,
  not a synthetic-event fake) set the browser's genuine `:hover` pseudo-class flag —
  `element.matches(':hover')` reported `true` — but the `.pause-menu-tab:hover { background:
  #333 }` rule visibly did not apply (`getComputedStyle(...).backgroundColor` stayed
  `transparent`). A control test on an *unprojected* button (`#settings-button`, hovered the same
  way) picked up its own `:hover` style correctly (`rgba(0,0,0,0.9)` as expected), which points at
  something CSS3D-specific rather than a broken test. But this test session's browser tab was
  running backgrounded/uncomposited (`document.hidden === true` — the preview pane wasn't visibly
  displayed), which also fully stalled the app's own `requestAnimationFrame`-driven render loop —
  I had to call `CSS3DRenderer.render()` manually via devtools just to get the transform to apply
  at all. That's an unusual rendering context in its own right, and I can't rule it out as a
  confound. **This needs a re-check with the preview pane actually visible/composited before it's
  treated as a confirmed CSS3D limitation** — flagging it here as a real, concrete observation,
  not a settled conclusion.
- **Couldn't capture an actual screenshot this pass, for the same pane-visibility reason** — "does
  it look sharp, any DPI/blur artifacts" is unverified firsthand. Worth a quick manual look
  (`http://localhost:5183/?css3dSpike=1` is left running against this worktree) once someone has
  the pane open.

## Recommendation

**Don't retrofit CSS3D onto the fold-open game box.** The VR incompatibility here isn't a rough
edge to smooth over later — it's the exact wall that killed the original flat overlay, and the
fold-open box's whole reason to exist is being *one* interaction that works identically on both
platforms (`game-detail-screen.md`'s acceptance criteria literally says "Works identically in VR
... and on desktop ... one implementation, not two"). Bolting CSS3D onto it means either accepting
the box behaves differently per-platform again — a regression on a criterion that was just fixed —
or building two parallel implementations, which reintroduces the exact duplication this feature
was built to eliminate. And the payoff would be thin: the box's faces aren't full of hoverable
controls today — the only interactive element is the Play button, which already works via
`GameBoxFoldCoordinator.raycastAgainstBox()` + `isPointInPlayButton()`, no CSS needed.

**Where CSS3D does look genuinely worth it: UI that was always going to be flatscreen-only.** The
settings/pause menu itself is the best example — it's real interactive form controls (sliders,
dropdowns, checkboxes across `GraphicsSettingsPanel`, `DisplayAdvancedPanel`, etc.), and those are
exactly the widgets that are painful to hand-roll as canvas-drawn hit regions. If this project ever
wants an in-scene "settings kiosk" prop, or a spatial desktop-only debug surface, CSS3D is a
legitimate, low-effort tool for that — separately from (not instead of) whatever VR settings
solution `vr-spatial-settings-menu-plan.md` ends up being.

**For anything that has to work in VR** (the fold-open box, or any future spatial game-info
surface), manual hover-simulation — raycasting against the box's own meshes to detect "pointer is
over this button-shaped region," the same raycast infrastructure `GameBoxFoldCoordinator` already
has for click and scroll — is the approach with an actual path to working on both platforms through
one code path. It's more manual work per interactive element than free CSS `:hover`, but it doesn't
have a hard platform ceiling the way CSS3D does.

Net take: a capability-based split is reasonable, but not "CSS3D for flatscreen, canvas for VR" on
the *same* interaction. Rather: CSS3D for surfaces that were always flatscreen-only (settings-style
menus); canvas-drawn + raycast hover-simulation for anything that needs to also work in VR (the
game box, and its likely descendants).

**Future idea — in-world flatscreen-only props.** Beyond the settings menu itself, the same
"always flatscreen-only" category covers any prop that's meant to be looked at, not worn: an
in-world computer/terminal, an arcade cabinet, a kiosk sign. None of those need to render inside
an actual immersive headset frame the way the game box does, so CSS3D's VR ceiling is a non-issue
for them. Not scoped or scheduled — just worth remembering as a candidate reuse of
`SettingsPanelProjector`'s pattern (or a generalized version of it) if one of these props gets
picked up later.

## Follow-on: SettingsPanelProjector (2026-08-13)

Turned the spike's positioning/reuse-live-DOM-node/click-through findings into a real, tested
class: `client/src/scene/css3d/SettingsPanelProjector.ts`, owned and lifecycle-managed by
`SystemUICoordinator` (which already owned `PauseMenuManager` and already tracked XR session
state). It projects the real `#pause-menu-overlay` node onto a plane in front of the camera,
using the same `CAMERA_LOCAL_OFFSET`-style local offset and fixed-pixel-size override the spike
worked out.

**Activation is intentionally gated on `WebXREventTypes.SessionStart`/`SessionEnd`** — the actual
XR session lifecycle, not just "WebXR is available." Per the verdict above, this means the
projection will *not* actually be visible inside a real immersive headset frame; gating it there
anyway keeps it out of the way during normal flatscreen browsing (where the plain DOM overlay
already works fine) while still giving it a real, first-class trigger to build against rather than
a permanently-manual one. A `?forceSettingsPanelProjection=1` URL override
(`UrlUtils.isSettingsPanelProjectionForced()`) forces activation regardless of session state
specifically so it can be previewed on a normal flatscreen browser, which is the only place it can
currently be seen.

- `client/src/debug/Css3dPanelSpike.ts` — the spike itself. Self-executing on
  `GameEventTypes.Start`, gated behind `?css3dSpike=1`.
- `client/src/utils/UrlUtils.ts` — added `isCss3dPanelSpikeEnabled()`, same pattern as the other
  URL-gated debug flags in that file.
- `client/src/main.ts` — one added side-effect import line, same pattern as `GameFinder`/
  `GameArtworkInspector`.

Try it: start the dev server and open `http://localhost:<port>/?css3dSpike=1` — the real pause
menu opens automatically, projected onto a plane in front of the camera at the fold-open box's
usual distance.
