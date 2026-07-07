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
| **Walls (default)** | **Mustard-yellow painted drywall** with sponge/mottle tonal variation (per reference photo — not flat paint), subtle orange-peel roller normal, **recolorable at runtime** (any-color drywall + in-scene color picker). Brand-blue does NOT appear on walls (signage/lettering only) | Currently (terrible) wood planks — wrong look entirely | **Produced multiple ways and compared** (Phase 1): (a) procedural worker — retune the good popcorn-ceiling technique (fine orange-peel + low-freq mottle); (b) Material Maker baked; (c) optional sourced. Recolor via runtime HSV tint works on any base |
| **Walls (paneling variant)** | Good-looking **wood paneling** — Cozy Basement variant AND fallback if drywall reads flat. No accent walls in the default store | The thing the current walls were failing to be | Hoped to come out far better via **Material Maker** than the retired worker planks — try a few recipes: groove profile in normal+AO, vertical grain, 70s ramp |
| **Walls (brick)** | **Brick walls** — thematically wanted (the store is literally "brick and mortar") despite the Blockbuster starting aesthetic. Selectable wall option | None | Material Maker; the bundled `improved_brick` (baked in Phase 0, has albedo+normal+occlusion depth) is a ready candidate to adapt if the normal-mapped depth reads well |
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

> **Status 2026-07-06: COMPLETE.** Every checklist item below is resolved. Bake wrapper built
> and defaults corrected (`materials/scripts/mm-bake.ps1` — defaults to the fork + Godot
> 4.6-stable automatically; the known-broken release binary now requires an explicit
> `-UseReleaseBinary` opt-in so it can never be hit by accident). Release-binary CLI export is
> permanently unusable (crash) — baking runs MM from source on our fork, branch
> `fix/cli-export-buffer-race`. Three races found and fixed (device creation, buffer
> render-queue drain, and the actual root cause — a deferred texture-readback race in
> `MMTexture`); verified deterministic across 9+ consecutive runs on two different materials,
> re-confirmed independently after the fact. Full writeup:
> [`materials/mm-cli-export-patch-context.md`](../../materials/mm-cli-export-patch-context.md);
> library usage notes: [`materials/README.md`](../../materials/README.md). Fork branch is not
> pushed/PR'd yet (deliberate — no urgency). **Phase 1 can start.**

- ~~Verify the GUI opens and a community-library material imports~~ — GUI confirmed working
  (prior session's user-data dir shows a real GUI run). Community-library licensing checked:
  materials are predominantly **CC0/CC-BY**, free including commercial use, sole restriction is
  not monetizing the library itself (open question 8, resolved — see `materials/README.md`).
- ~~Verify CLI export end-to-end~~ — done via the patch investigation; see above.
- ~~Confirm resolution control~~ — done: `-Size` on `mm-bake.ps1` stamps the `.ptex` material
  node's size parameter directly (open questions 4/5, 7).
- ~~Build the bake wrapper script~~ — done: `materials/scripts/mm-bake.ps1`. Per-material +
  per-tier batch/variant scripting is NOT yet built — that's Phase 1+ scope, not Phase 0's.
- ~~Define the two export tiers~~ — done: `materials/variants/tiers.json` (`quality` = 2048px,
  `performance` = 768px, starting points per open questions 4/5 — iterate from measured
  numbers in Phase 2).
- ~~Decide asset home + loading path~~ — decided: bake output canonically lives in
  `materials/baked/` (library-owned, committed); this project serves from
  `client/public/textures/materials/<material>/<tier>/<map>.<ext>`, following the existing
  static-asset convention (`client/src/assets/runtimeAssetUrls.ts` + `SkyboxManager.ts`'s
  `new URL(path, import.meta.url).href` pattern), loaded via the already-generic
  `TextureLoader.loadTexture(url)` — no loader code changes needed. The copy/package step from
  `materials/baked/` into the client's public dir is Phase 1 work (not built yet).

### Phase 1 — Wall materials (drywall multi-approach, recolorable)
**Build plan: [`procedural-textures-phase1-plan.md`](procedural-textures-phase1-plan.md)** — full
work breakdown, verified seam, comparison harness, recolor design, gotchas, acceptance criteria.

Walls are the feedback target, so Phase 1 focuses there — and **produces drywall multiple ways
and compares in-scene** rather than betting on one technique:
- **Procedural** (retune the good popcorn-ceiling worker technique for drywall) + **Material
  Maker baked** + optional **sourced** — all landing through the same
  `SharedMaterialManager`/`upsertMaterial` seam, selectable live via an in-scene wall-material selector.
- **Recolor pulled forward** (was Phase 3): runtime HSV tint + in-scene color picker = "any-color
  drywall," base-agnostic. Doubles as part of the comparison control.
- **Baked-load plumbing** (`SharedMaterialManager` baked path + `upsertMaterial` ORM-map
  extension) — reused by all baked wall materials; worker path stays until Phase 2.
- Validate under all lighting presets + postprocessing; graceful fallback; tests.
- **Fast-follow (tracked, not gating):** wood **paneling** and **brick** via Material Maker.

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
- ~~**Runtime tint/HSV hue-shift hook**~~ — **pulled forward into Phase 1** (delivered on walls
  with an in-scene color picker; the same `onBeforeCompile` mechanism extends to carpet/other
  surfaces as they adopt it). Recolor at runtime (themes, variants) without rebaking; cheap.
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
