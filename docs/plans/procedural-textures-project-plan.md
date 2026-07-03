# Procedural Textures — Project Adoption Plan

**Status:** Proposed
**Feature:** `docs/features/procedural-texture-quality.md`
**Parent plan:** [`procedural-materials-pipeline-plan.md`](procedural-materials-pipeline-plan.md) — tool choice + cross-project pipeline
**Supersedes:** the runtime canvas/worker generation approach documented in [`enhanced-textures.md`](enhanced-textures.md)

---

## What changes

Today, store surface textures are generated at runtime by hand-rolled noise painters running in
a Web Worker (`client/src/utils/textures/painters/*`, orchestrated by `SharedMaterialManager`
via `ProceduralTextureWorker`). That system is being retired: the output quality has a hard
ceiling and improving it means reimplementing a material-authoring tool badly.

Replacement: materials are authored in Material Maker, batch-exported as seamless tileable PBR
texture sets at build time, shipped as compressed static assets, and applied through the same
`SharedMaterialManager` seam (`upsertMaterial` already supports late texture pop-in without
mesh rebuilds — that mechanism survives).

**Disposition of existing textures:** all current generated textures are discardable, including
the popcorn ceiling (roughly acceptable, but re-authoring it in Material Maker loses nothing).
The current "wood paneling" walls were never the right call anyway — see inventory below.

## Texture inventory

### The store we're evoking (family-video-rental-that-shall-not-be-named)

**Look references (use these during authoring):** photos in `reference/` — primary:
`reference/Blockbuster-Video-Inside-Blockbuster-438-3792985155.jpg`, with a structured scene
description in `reference/blockbuster-inside.json`. Key observations from the primary photo:
walls are **mustard yellow with visible sponge/mottle tonal variation** (not flat paint);
ceiling is **white popcorn** under fluorescent strips; carpet is **plain dark gray**; fixtures
are **pale wood slatwall** with black shelving. Brand palette (signage/lettering only, NOT
wall accents): blue `#0E3FA9` (Pantone 293 C), yellow `#FFA903` (Pantone 137 C) — note the
wall paint reads more desaturated/mustard than the logo yellow; tune in look-dev, don't
copy the brand hex onto walls.

| Surface | Wanted look | Current state | Material Maker notes |
|---|---|---|---|
| **Walls (default)** | **Mustard-yellow painted drywall** with sponge/mottle tonal variation (per reference photo — not flat paint), subtle orange-peel roller texture in the normal map, parameterized wear/scuffing near floor height. Brand-blue does NOT appear on walls (signage/lettering only) | Currently (terrible) wood planks — wrong look entirely | Fine-scale noise → normal for orange-peel; mid-frequency mottle in albedo (the thing that keeps flat yellow from reading "draining"); color + wear + mottle intensity exposed as parameters |
| **Walls (variant)** | Good-looking **wood paneling** — reserved for the Cozy Basement variant AND as the fallback wall treatment if tuned drywall still reads flat/draining. No accent walls in the default store | The thing the current walls were failing to be | Community library has wood/plank starting points; needs groove profile in normal+AO, vertical grain, 70s-paneling color ramp |
| **Ceiling** | **Popcorn ceiling — confirmed default** (matches reference photo); **acoustic drop-tile** authored later as a variant | Popcorn version exists, only texture arguably worth keeping — still replace | Popcorn: voronoi/worley blob scatter → height → normal. Drop-tile: tile fissure noise + grid lines with AO in the gaps |
| **Floor** | **Commercial low-pile carpet — a few selectable types**: match for the current red diamond, 90s confetti scatter, plain dark gray (reference photo). Ship whichever is easiest first; all parameterized palette. Per-store variation → runtime tint or N variants (Phase 4) | Deep-red diamond-pattern carpet, worker-generated | Fiber micro-noise for roughness/normal; scatter pattern as a parameterized overlay; keep tile small (repetition handled at runtime — see below) |
| **Shelving** | **MDF/laminate veneer** with brand-blue accent components | Worker-generated veneer, generic | Laminate = near-flat normal, tight roughness variation; blue accent as parameter for brand consistency |
| **Entrance mat** | Rubber/nylon walk-off mat | Exists as prop | Trivial: dark fiber noise + border |

### Near-future props & variants (author in the same first wave where cheap)

From [fabricated set dressing](../features/fabricated-set-dressing.md) and
[room variants](../features/room-variants.md): counter laminate, brushed + galvanized metal
(wire racks, register, T-bar), plastic (cooler housing), glass (cooler doors — mostly a
shader/material property, minimal texture), cardboard (standees), concrete/sidewalk + brick
(entrance exterior, if/when visible).

### Generic cross-project set

Grass, brick, concrete, asphalt, additional wood types, fabric — authored under the shared
library per the parent plan, not blocked on this project needing them.

## Phases

### Phase 0 — Tooling validation (small, gating)
Release binary is already downloaded:
`F:\FilePrograms\Dropbox\Projects\material-maker\release\material_maker_1_6_windows\material_maker.exe`.
- Verify the GUI opens and a community-library material imports; check the site's material
  licensing terms while there (open question 8).
- **Verify CLI export end-to-end**: `material_maker.exe --export-material --target <target> -o <dir> <file.ptex>`
  with a bundled example material; document behavior when no window/display is available.
- Confirm resolution control via the material node's size parameter in `.ptex` JSON (the
  `--size` flag is a no-op — decided: node-level parameter now, upstream PR opportunistically).
- Build the **bake wrapper script** in `materials/scripts/`: verifies dependencies (binary
  present/version), takes material + variant + tier (quality/performance), clear usage text —
  usable by humans and LLMs alike. The script is the interface; no bare incantations.
- Define the two export tiers in the variants manifest (starting points: quality ≈ 2K,
  performance ≈ 512–1K) — decided in open questions 4/5.
- Decide asset home + loading path (`client/public/textures/…` vs bundled import). Baked
  output IS committed (decided, open question 2).

### Phase 1 — First material end-to-end (painted drywall walls)
The highest-value swap (wrong look → right look) and it exercises every pipeline stage.
- Author/adapt drywall `.ptex` with exposed params (paint color, wear, orange-peel intensity).
- Bake → package (PNG first; KTX2 compression can land in this phase or 2) → load via
  three.js → apply through `SharedMaterialManager.upsertMaterial(MaterialType.WallWood → new WallPaint type)`.
- Add the loading seam: a baked-texture material path in `SharedMaterialManager` parallel to
  the worker path (worker path stays until Phase 2 completes).
- Validate under all lighting presets + postprocessing (the feature doc's acceptance criteria:
  no surface reads as procedurally generated).
- Tests: material creation path, event emissions, fallback when texture fetch fails.

### Phase 2 — Replace remaining materials, retire the worker painters
- Carpet, ceiling, MDF veneer, wood paneling (as variant asset, even if the variant system
  isn't built yet).
- Delete `client/src/utils/textures/painters/*`, generators, and the procedural worker path
  once nothing consumes them; update/remove their tests. (`ProceduralTextureWorker` and the
  `ManagedWorker` infra stay if other worker uses remain — check the Worker Infrastructure
  feature's pending carpet item before deleting shared code.)
- Ship both tiers (quality + performance) per material, wired to the existing graphics
  quality settings; KTX2/BasisU compression + mipmaps at least for the performance tier.
- Measure GPU memory + download/load-time per tier (ties into `gpu-memory-investigation` and
  first-load-experience budgets) — budgets iterate from these numbers.

### Phase 3 — Runtime quality layer (shader work; quality-tiered)
- Anti-repetition sampling (hex-tiling or stochastic/histogram-preserving) for the big
  repeat-visible surfaces: carpet first, then ceiling/walls. WebGL2 GLSL via
  `onBeforeCompile`/ShaderMaterial — no TSL/WebGPU assumptions.
- Detail normal for close-up VR inspection where needed.
- **Runtime tint/HSV hue-shift hook** in the material path — recolor walls/carpet at runtime
  (themes, variants) without rebaking. Cheap; not gated to high quality tiers.
- Each feature gated by graphics quality tier with plain-repeat fallback (graceful degradation
  is a hard requirement — this is the layer with a frame cost, unlike the textures themselves).
- **Research spike (timeboxed, scheduled per owner):** MM-graph → WebGL2 GLSL extraction
  viability, for fully-procedural surfaces with zero texture memory (liminal endless-shell
  synergy). Deliverable: written viability verdict + recommended path (extract vs hand-port vs
  don't), not an implementation.

### Phase 4 — Theming & variants
- Variant manifests: rebake parameterized looks (basement paneling, alternate carpet palettes)
  for Room Variants.
- Revisit per-user carpet seed idea from `enhanced-textures.md`: with baked textures this
  becomes either N pre-baked variants or shader-side hue/scale variation — decide then.
- Blend/transition support where variants meet (splat/height blend), if a real seam exists in
  the scene by that point.

## Execution guidance: models & subagents

- **Phase 0:** Opus (or Sonnet with the checklist above — it's mostly verification). The one
  judgment call (asset home + commit policy) can be pre-decided via the open-questions doc.
- **Phase 1:** Opus — first-of-kind integration with design latitude in the
  `SharedMaterialManager` seam. Precede with an **Explore agent** pass mapping all
  `MaterialType` consumers and texture-application call sites.
- **Phase 2:** Sonnet — repeat the Phase 1 template per material; deletion + test updates are
  mechanical. `/code-review` before the retirement commit.
- **Phase 3:** Opus for the first anti-repetition shader (correctness + perf tiering), Sonnet
  to extend it to other surfaces.
- **Phase 4:** Sonnet, following the variant-manifest pattern from the shared library.
- Authoring itself (node-graph look-dev in the Material Maker GUI) is human work with
  fast visual feedback — agents assist with `.ptex` JSON parameter surgery and batch exports,
  not aesthetics.

## Acceptance criteria (inherited + new)

- Feature-doc criteria hold: no surface visibly reads as generated; wall/ceiling/floor/shelf
  read as real materials at VR standing height.
- Walls read as painted drywall (default store), not wood.
- All legacy painter/worker texture code deleted; no orphaned tests.
- Texture asset budget: compressed download size and GPU memory measured and recorded
  (numbers TBD in Phase 0 — see open questions).
- Quality tiers: runtime shader features degrade to plain repeat with no visual breakage.
