# Visual Quality — Renderer Techniques

What is implemented, what is next, and what is deferred.  
IBL + tone mapping rationale: `renderer-visual-baseline-plan.md`.  
Post-processing effects roadmap: `docs/features/postprocessing-effects.md`.  
Shadow policy code: `src/lighting/ShadowPolicy.ts`.

---

## Implemented

| Technique | What it does |
|---|---|
| **HDR postprocessing pipeline** | `renderer.toneMapping = NoToneMapping`; `EffectComposer` (pmndrs/postprocessing, HalfFloat buffers) owns the full output path. |
| **AgX tone mapping** | `ToneMappingEffect(AGX)` as final-to-LDR step. Highlights roll off; `toneMappingExposure` uniform still active. |
| **IBL (RoomEnvironment + PMREM)** | Static probe; roughness/metalness/fresnel have something to reflect. Generated once at startup. |
| **Directional shadow angle** | Main shadow light ~18° from overhead. Shadows project where the player sees them. |
| **N8AO** | `N8AOPostPass` replaces SSAOEffect. HBAO-style AO; quality follows `qualityLevel`. Toggleable via `ssaoEnabled`. `gammaCorrection = false` (HDR pipeline). |
| **SMAA** | `SMAAEffect` as the final pass, after tone mapping. Preset follows `smaaPreset` setting. |

---

## Next — scene quality baseline

**1. Dynamic CubeCamera probe** (medium)  
Replaces the static `RoomEnvironment` IBL with a probe rendered from the actual scene. Specular
highlights on glossy surfaces then reflect real shelves, neon signs, and game boxes rather than
a generic indoor approximation. Rendered once after scene setup; free per frame.

**2. Shadow resolution / CSM** (medium, if needed)  
At quality=2 (1024px over ~20m), directional shadow texels are ~20mm — fine for large contact
shadows but coarse on box spine edges. Cascaded Shadow Maps split the frustum so nearby
geometry gets more resolution without increasing total map size. Evaluate after dynamic probe.

---

## Later — atmosphere and finish

**SelectiveBloom**  
Bloom on specific objects only (neon signs, emissive fixtures). Implement alongside the neon
sign feature. See `docs/features/postprocessing-effects.md` for full effects roadmap.

**Color LUT**  
3D lookup table — cinematic color grade for atmosphere modes (warm retail, late-night, etc.).
**Comes last.** A LUT locks in the visual character of a correctly-balanced scene. Establish
neutral balance first, then apply LUT as a finishing layer. LUTs are the primary vehicle for
the "tone preset" feature (see `lighting-and-atmosphere.md`).

**Screen Space Reflections (SSR)**  
Floor reflections of overhead lights and shelves would be highly atmospheric for a retail store
scene. Not in pmndrs/postprocessing natively — requires either custom integration with
`three/examples/jsm/postprocessing/SSRPass.js` or a separate implementation. Deferred: complex
to wire correctly alongside the existing EffectComposer pipeline.

**N8AO parameter tuning**  
Initial parameters (`aoRadius: 1.5`, `intensity: 2.5`) were set conservatively for scene scale.
Tune once the scene is visually stable — increase intensity for deeper crevice shadows, adjust
radius to match box/shelf scale.

---

## Known gaps

**RectAreaLight cannot cast shadows.** Ceiling fixtures use `RectAreaLight` for soft
area-light appearance; Three.js does not support shadows from area lights. Shadow contribution
from ceiling downlights is absent. SSAO compensates at contact zones; the large soft penumbra
a real fluorescent tube would cast is not present. Noted tech debt.

Pairing each fixture with a SpotLight was tried and removed — fixture count too high, light
budget cost unjustified.

---

## Architecture note

All store geometry is generated procedurally at runtime in WebGL (`PropRenderer`,
`InstancedShelfRenderer`). The `/blender` pipeline is legacy. Baked lightmap techniques
requiring Blender-authored UV2 channels are out of scope.

---

*A1 P1 T1*
