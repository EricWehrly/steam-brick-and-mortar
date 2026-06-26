# Visual Quality — Renderer Techniques

What is implemented, what is next, and what is deferred.  
Architecture: `render-pipeline-manager-plan.md` (EffectComposer refactor).  
IBL + tone mapping rationale: `renderer-visual-baseline-plan.md`.  
Shadow policy code: `src/lighting/ShadowPolicy.ts`.

---

## Implemented

| Technique | What it does |
|---|---|
| **AgX tone mapping** | Maps scene luminance to display output without clipping highlights to flat white. Ceiling fixtures and neon signs roll off rather than blowing out. |
| **IBL (RoomEnvironment + PMREM)** | Gives PBR materials a reflection environment. Roughness, metalness, and fresnel have something to interact with. Generated once at startup; free per frame. Static probe — does not reflect actual scene content. |
| **Directional shadow angle** | Main shadow light offset ~18° from overhead. Shadows project outward from objects where the player can see them. |
| **SSAO** | Screen-space ambient occlusion. Darkens contact zones, crevices, and shelf corners. Toggleable via `ssaoEnabled` in Graphics settings. Compensates partially for missing ceiling fixture shadows. |

---

## Next — scene quality baseline

These close the biggest remaining gaps and should land before any atmosphere work.

**1. Exposure control** (small)  
`toneMappingExposure` and `scene.environmentIntensity` are hardcoded. Adding both as live
sliders in GraphicsSettingsPanel lets us balance the scene without editing constants. The
TODO is already in `SceneManager.ts`. This is the immediate next code change.

**2. Brightness-to-black** (small)  
The master brightness slider scales `THREE.Light.intensity` but not `scene.environmentIntensity`
(IBL) or emissive material intensity on ceiling fixture meshes. Dragging to zero leaves residual
ambient light. Fix: `LightingControlsPanel.setMasterBrightness()` also scales those.
See `render-pipeline-manager-plan.md` for full diagnosis.

**3. Dynamic CubeCamera probe** (medium)  
Replaces the static `RoomEnvironment` IBL with a probe rendered from the actual scene. Specular
highlights on glossy surfaces then reflect real shelves, neon signs, and game boxes rather than
a generic indoor approximation. Rendered once after scene setup; free per frame.

**4. Shadow resolution / CSM** (medium, if needed)  
At quality=2 (1024px over ~20m), directional shadow texels are ~20mm — fine for large contact
shadows but coarse on box spine edges. Cascaded Shadow Maps split the frustum so nearby
geometry gets more resolution without increasing total map size. Defer until exposure and probe
are in place, then evaluate whether shadow sharpness still reads as the gap.

---

## Later — atmosphere and finish

These are real improvements but depend on the baseline above being stable first.

**Bloom**  
Models light scatter in camera optics. Makes emissive surfaces (neon signs, entrance spot)
read as genuinely bright rather than just a brighter color. Natural fit for the neon sign
feature when that lands. Not needed for general scene legibility.

**FXAA / SMAA**  
Fast anti-aliasing pass. Sub-millisecond. Polish step — add it once the scene reads correctly
and edge quality becomes the bottleneck.

**Color LUT**  
3D lookup table applied to the final frame — cinematic color grade for atmosphere modes
(warm retail, late-night, etc.). **Comes last.** A LUT locks in the visual character of a
scene that is already correctly balanced. Tuning lights while a LUT is active means every
lighting change fights the grade; removing it later destroys the visual. Establish neutral
correct balance first, then apply LUT as an optional finishing layer.

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
