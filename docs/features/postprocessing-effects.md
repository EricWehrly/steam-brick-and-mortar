# Feature: Post-Processing Effects

**Act**: 2 (core quality), 3 (atmosphere and user options)  
**Status**: In Progress — core pipeline implemented; effect library being expanded  
**Library**: pmndrs/postprocessing v6+

## Goal

A layered post-processing stack that improves visual quality automatically (SSAO, AA, tone mapping), adds scene atmosphere through effect-driven passes (bloom, vignette, god rays), and exposes an opt-in "Effects" section in graphics settings where users choose stylistic overlays (grain, glitch, scanlines).

Most users will be on flatscreen. VR is the primary long-term goal but should not gate progress on effects that work and read well in desktop mode. VR and flatscreen share some effects but diverge meaningfully — the XR render path bypasses EffectComposer entirely; any VR-specific effects require separate handling.

## Current Pipeline

Pass order: `RenderPass → N8AOPostPass → EffectPass(ToneMapping AGX) → EffectPass(SMAA)`

`renderer.toneMapping = NoToneMapping` — geometry renders linear HDR into the composer's HalfFloat buffer. `ToneMappingEffect(AGX)` applies the tone curve as the final LDR conversion step. `renderer.toneMappingExposure` remains active because `AgXToneMapping()` in the effect shader reads the Three.js uniform directly.

XR path: `renderer.toneMapping = AgXToneMapping` on `sessionstart`, reset on `sessionend`. Composer is bypassed; `renderer.render()` applies tone mapping directly in the headset output.

## Effects Inventory

### Always-On (pipeline baseline)

| Effect | Status | Notes |
|---|---|---|
| **ToneMappingEffect (AGX)** | ✅ Implemented | Final tone curve. `renderer.toneMappingExposure` still active. |
| **N8AOPostPass** | ✅ Implemented | Replaces SSAOEffect. HBAO-style AO from `n8ao` package. Quality/on-off both driven by `ssaoQuality` (0=Off..5), a `GraphicsSettingsPanel` slider ordered by *measured GPU cost*, not sample count alone — `halfRes` matters more than `aoSamples`. See `RenderPipelineManager.SSAO_QUALITY_LEVELS` and `docs/plans/framerate-regression-investigation-plan.md`'s 2026-07-29 findings (N8AO's real GPU cost was ~84% of the frame budget at the old default). `gammaCorrection = false` (ToneMappingEffect handles HDR→display). `aoRadius 1.5`, `intensity 2.5` — needs visual tuning for scene scale. |
| **SMAAEffect (HIGH preset)** | ✅ Implemented | Runs after tone mapping in LDR space. Preset follows `smaaPreset` setting. |

### Quality / Scene Effects (desktop, can be toggled)

| Effect | Status | Notes |
|---|---|---|
| **SelectiveBloomEffect** | 🔮 Future | Bloom only on tagged objects (neon signs, emissive fixtures). Implement with the neon sign feature — not global bloom. `luminanceThreshold: 1.0` means only HDR surfaces bloom, which is correct with the current pipeline. |
| **VignetteEffect** | 🔮 Future | Subtle darkening toward screen edges. Atmosphere + VR comfort. Expose as optional setting. Try in XR specifically — vignette is a standard VR comfort technique for locomotion. |
| **LUT3DEffect** | 🔮 Future | Color grading for atmosphere modes. This is the primary implementation path for the "tone presets" feature (Corporate / Cheery / Dim / Dank) in `lighting-and-atmosphere.md`. **Comes last** — add after lighting balance is finalized. A LUT bakes in the look; tuning lights under an active LUT means fighting the grade. |
| **GodRaysEffect** | 🔮 Future | Light shaft from ceiling fixtures. Likely a better replacement for the current spotlight setup once LUTs land. Implement after LUTs — the lighting balance will be more stable by then. |
| **OutlineEffect** | 🔮 Future | Object outlines. Implement as part of the interactable-objects feature — specifically for game box hover/selection state. Should be part of that implementation, not a standalone pass. See `docs/features/interactable-objects.md`. |

### User Opt-In ("Effects" panel in graphics settings)

These belong in a dedicated "Effects" section, collapsed or separated from quality settings. They are stylistic overlays — not scene improvements — and should default to off.

| Effect | Notes |
|---|---|
| **NoiseEffect** | Film grain. Low intensity. Fits the retro Blockbuster aesthetic on flatscreen. |
| **GlitchEffect** | Artistic glitch. Opt-in only. |
| **ScanlineEffect** | CRT scanline overlay. Same opt-in category as glitch and grain. |
| **ChromaticAberrationEffect** | Lens chromatic aberration. Flatscreen only — causes VR discomfort. |
| **HueSaturationEffect** | User-adjustable hue/saturation if someone wants to push the color tone. |
| **BrightnessContrastEffect** | Accessibility option; most users should not need this if base lighting is calibrated. |

### Skip / Not Applicable

| Effect | Reason |
|---|---|
| **DepthOfFieldEffect / BokehEffect** | Fights eye focusing in VR; wrong for retail browsing on flatscreen too. |
| **TiltShiftEffect / LensDistortionEffect** | Camera lens simulation. Wrong genre. |
| **FXAAEffect** | Lower quality than SMAA. Use SMAA. |

## Flatscreen vs VR Split

The pipeline runs through EffectComposer for flatscreen. XR bypasses it entirely via `renderer.render()` after a `sessionstart` event fires `renderer.toneMapping = AgXToneMapping`.

This means all EffectPass effects (SSAO, SMAA, future bloom/vignette) are flatscreen-only by default. Adding post-processing to XR requires either:
- Feeding the XR render through a post-process render target (complex; Three.js XR support for this is limited)
- Shader-side effects baked into materials

Vignette is worth attempting in XR — it has a comfort use case. Try it when VR implementation begins.

## Settings Architecture

Graphics settings panel should eventually have:
- **Quality** section: existing toggles (SSAO, shadows, etc.)
- **Effects** section (collapsed by default): opt-in stylistic overlays from the table above

Effects section does not exist yet. Wire it up when the first opt-in effect (likely NoiseEffect) is ready to ship.

## Companion Packages and Techniques

Things commonly paired with pmndrs/postprocessing that are **not** in the library itself:

| Package / Technique | What it does | Relevance |
|---|---|---|
| **`n8ao`** (npm) | N8Ambient Occlusion — HBAO-style with spiral sampling. Significantly better quality than SSAOEffect at similar cost. Works as an EffectComposer pass via `needsDepthTexture`. | ✅ **Implemented** — replaced SSAOEffect. Parameters need visual tuning. |
| **Screen Space Reflections (SSR)** | Reflections of scene content in glossy surfaces. `three/examples/jsm/postprocessing/SSRPass.js` exists but is not compatible with the pmndrs EffectComposer without glue. Custom integration is complex. | High: a polished retail floor reflecting overhead lights is very atmospheric. Deferred — complex to wire. |
| **Temporal AA (TAA)** | Accumulates sub-pixel samples across frames. Better than SMAA on static camera, but ghosts on motion. Not in this version of postprocessing. | Low for VR (reprojection issues). Worth trying on desktop if shimmer on fine geometry becomes visible. |
| **`three-mesh-bvh`** | BVH acceleration for raycasting. Not a postprocessing concern, but commonly used alongside for interaction. | Relevant when we implement interactable objects. |

**For this scene specifically**: SSR on the floor and N8AO as an SSAO upgrade are the two highest-impact things not yet in the pipeline. Both deferred — SSR is complex and N8AO is a quality pass better done alongside the SSAO tuning pass.

## Sequencing

1. ✅ SSAO, AgX, SMAA — done
2. SelectiveBloom — when neon signs are implemented
3. LUT3D — when tone presets are the focus (see `lighting-and-atmosphere.md`)
4. God rays — after LUT (lighting balance should be stable)
5. Outline — with interactable objects implementation
6. Vignette — when VR support is being built out
7. User opt-in effects (noise/glitch/scanlines) — low effort, whenever the Effects panel is wired up

---

*A1 T1*
