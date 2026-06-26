# Renderer Visual Baseline Plan (Tone Mapping + Environment Lighting)

## Status
**Implemented** — AgX tone mapping, PMREM environment (RoomEnvironment), and SSAO landed in `SceneManager.ts` on this branch. Exposure and environment intensity are hardcoded (see TODO comments); sliders are a follow-up.

## The core finding
The recent visual-quality work has tuned *second-order* material levers — artwork
roughness/metalness, fresnel edge lift, per-instance roughness variation, shadow contact
bias — and built a showcase scene to compare them. Those are good, but they are being
judged against a renderer baseline that is missing its two *first-order* levers:

1. **Tone mapping is off.** `SceneManager` configures the `WebGLRenderer` (size, pixel
   ratio, `outputColorSpace = SRGBColorSpace`, `xr.enabled`) but never sets
   `renderer.toneMapping` or `renderer.toneMappingExposure`. Three.js (r0.183) defaults to
   `THREE.NoToneMapping`, which clips any luminance above 1.0 to flat white with no rolloff.
   Note: the shading plan's remark that the lit-artwork material "keeps tone mapping from
   the standard pipeline" refers to the *shader chunk* — that chunk is a no-op while the
   renderer operator is `NoToneMapping`. No tone mapping is actually being applied.
   - Touch point: `client/src/scene/SceneManager.ts` (renderer setup, ~line 74–108).

2. **No environment map.** `scene.environment` is never assigned (only referenced in a
   debug estimator comment). Every scene material is `MeshStandardMaterial` (PBR), but with
   no image-based lighting there is nothing for roughness/metalness/fresnel to reflect — the
   gloss work is being evaluated against a black reflection environment. The shading plan
   already flagged this ("gloss looks wrong when there is nothing meaningful to reflect").

Both are **global frame state**, not per-object. They cannot be A/B'd in a side-by-side
showcase grid — they affect the whole frame at once. The right comparison surface for them
is a live settings toggle (the existing Graphics panel), not the 3-box showcase.

## Why sequence this first
Tuning roughness/fresnel/shadow-contact now and again after tone mapping + IBL land means
re-tuning everything, because the baseline they are judged against changes. Lock the global
baseline, re-validate the existing material defaults against it once, *then* use the showcase
for the per-material deltas it is actually good at.

## Scope

### Part 1 — Tone mapping + exposure (smallest, highest impact)
- `SceneManager`: set `renderer.toneMapping` (default `THREE.ACESFilmicToneMapping`;
  `THREE.AgXToneMapping` is worth trialing on r183) and `renderer.toneMappingExposure`.
- `AppSettings`: add `toneMappingOperator` (string enum) and `toneMappingExposure` (number,
  e.g. 0.5–2.0, default 1.0) alongside the existing graphics keys.
- `GraphicsSettingsPanel`: operator select + exposure slider. On change, update the renderer
  and trigger a material recompile (operator changes require `material.needsUpdate`; reuse the
  existing `forceShadowStateRefresh`-style traversal pattern). Exposure changes are free (no
  recompile).
- Touch points: `client/src/scene/SceneManager.ts`, `client/src/core/AppSettings.ts`,
  `client/src/ui/pause/panels/GraphicsSettingsPanel.ts`.

### Part 2 — Environment lighting (IBL)
- Generate a PMREM environment once at startup and assign `scene.environment`. Cheapest path
  with no asset pipeline: `RoomEnvironment` (`three/examples/jsm/environments/RoomEnvironment.js`)
  + `THREE.PMREMGenerator`. Generate once, assign, then dispose the generator.
- Optionally expose `scene.environmentIntensity` (available in r183) as a slider so the IBL
  contribution can be balanced against the existing hand-authored lights.
- Keep it cheap: one-time generation, no per-frame work, no regeneration on room resize.
- Touch points: `client/src/scene/SceneManager.ts` or the `LightingRenderer` upgrade path,
  `client/src/core/AppSettings.ts`, `client/src/ui/pause/panels/GraphicsSettingsPanel.ts`.

## Acceptance criteria
- Bright ceiling fixtures / light artwork no longer hard-clip to flat white; highlights roll
  off.
- Artwork gloss + fresnel read as coated print stock under camera movement — reflections track
  the camera and lights instead of sitting dead.
- Exposure slider rebalances overall brightness without editing light intensities in code.
- One-time PMREM cost at startup only; no measurable per-frame regression; no new startup
  hitch beyond generation.
- Existing artwork/shelf material defaults re-checked against the new baseline (a single pass).

## Risks / notes
- Operator change forces a one-time material recompile — apply at config time and batch
  `needsUpdate`, don't thrash it per slider tick.
- IBL adds specular everywhere — shelf/wood/carpet roughness may need a quick re-check so props
  don't read wet.
- Lights are authored in physical units (r183 has no legacy-lights path). Tone mapping changes
  apparent brightness, so expect to rebalance ambient/directional **once** via the panel, not by
  re-editing `LightingRenderer` constants.
- VR: tone mapping applies in-headset too — verify comfort (no overbright) when VR work lands.

## Relationship to the showcase scene
This plan is the **global baseline**; the showcase is **per-material micro-tuning**. They are
complementary, not competing. Land this first so the showcase comparisons are measured against
a baseline worth shipping. See `showcase-scene-comparison-plan.md`.

---
*Planning: A1 · P1 · O2*
