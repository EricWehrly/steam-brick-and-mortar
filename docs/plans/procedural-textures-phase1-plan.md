# Procedural Textures — Phase 1 Build Plan: Wall Materials

**Parent:** [`procedural-textures-project-plan.md`](procedural-textures-project-plan.md) (Phase 1)
**Pipeline/tooling:** [`procedural-materials-pipeline-plan.md`](procedural-materials-pipeline-plan.md) · bake harness `materials/scripts/mm-bake.ps1` · library `materials/README.md`
**Status:** In progress. **WS1 (procedural drywall) landed 2026-07-07** — `wall-drywall.ts`
painter (mottled-mustard albedo + subtle orange-peel normal) registered as a worker type,
wired into `SharedMaterialManager` as `MaterialType.WallPaint`, and set as the default wall
material in `RoomManager` (replacing `WallWood`, which is retained for the paneling variant).
Owner has not yet visually judged the look in-app. WS2 (Material Maker authoring), WS3
(sourced), and WS4 (recolor + selector UI) not started.

---

## Framing (revised 2026-07-06 per owner direction)

The wall feedback is the whole point, so Phase 1 is **wall materials** — and rather than commit
to a single production technique up front, we **produce drywall multiple ways and compare in the
scene**, because it isn't obvious which route reads best:

- **Procedural (runtime worker).** The existing popcorn *ceiling* actually looks good, and walls
  can be drawn with the same technique. The bet: an improved procedural drywall — the ceiling's
  seamless octave-noise bump/normal approach, retuned (fine orange-peel + a low-frequency
  **mottle** so it doesn't read as a flat uniform box) — may be good enough and costs zero
  download.
- **Material Maker (baked).** Author a drywall `.ptex`, bake tileable PBR, load as static assets.
  The richer authoring may beat hand-tuned noise.
- **Sourced (optional third).** A CC0/CC-BY drywall/plaster texture as a comparison point.

We build the comparison harness (a live in-scene **wall-material selector**), judge them
side-by-side, and keep whichever win(s) — possibly more than one, as selectable options.

Two things are **pulled forward** into Phase 1 because they're core to the wall goal, not polish:

1. **Recolor / hue-shift + in-scene color picker** — "any color drywall." A runtime tint that
   works on *any* base (procedural or baked), so it's approach-agnostic and unifies the options.
2. **Expanded wall set as fast-follow** — wood paneling (MM, a few recipes) and **brick** (MM;
   thematic — the store is literally "brick and mortar"). These reuse the rail + recolor once
   drywall proves it out; sequenced after, not gating.

**Scope discipline:** still no KTX2 (PNG first; Phase 2), still no retiring the worker painters
(Phase 2). The recolor mechanism pulled forward here *is* the Phase 3 runtime-tint item —
delivering it now on walls is deliberate, not scope creep.

## The integration seam (verified in code)

- Walls consume `this.materialManager.getMaterial(MaterialType.WallWood)` in
  `RoomManager.ensureWalls` ([client/src/scene/RoomManager.ts:306](../../client/src/scene/RoomManager.ts)).
  Back/left/right share one `MeshStandardMaterial`; front is glass.
- `SharedMaterialManager.generateTexturesAsync()`
  ([client/src/utils/SharedMaterialManager.ts:103](../../client/src/utils/SharedMaterialManager.ts))
  runs per-material prewarm helpers in a `Promise.all`, each ending in `upsertMaterial(type, mat)`
  (line 272), which mutates the pooled instance in place so late results pop into live meshes
  without a rebuild. **Both the procedural and baked drywall land through this same seam** — the
  only difference is the source (worker vs `TextureLoader.loadTexture(url)`).
- Procedural technique to adapt: `client/src/utils/textures/painters/ceiling-popcorn.ts` (seamless
  octave-noise diffuse + matching normal), registered as a worker type in `ProceduralTextureWorker`.
- Static assets follow `client/src/assets/runtimeAssetUrls.ts` + `TextureLoader.loadTexture(url)`
  (already generic — caches, RepeatWrapping, anisotropy, `repeat`).

## Workstreams

### WS1 — Procedural drywall (adapt the ceiling technique) — agent-authorable

New painters `wall-drywall.ts` (`paintWallDrywall` + `paintWallDrywallNormal`), modeled on
`ceiling-popcorn.ts`:
- **Albedo:** mustard base + a **low-frequency octave "mottle"** term for tonal variation (the
  make-or-break detail that keeps flat paint from reading dead) + very subtle warmth from the
  micro-bumps. Keep the base color a parameter (recolor handles the rest — WS4).
- **Normal:** fine, shallow **orange-peel** (higher noise density, low strength) — subtler than
  popcorn.
- Register `wall_drywall` / `wall_drywall_normal` worker types (mirror `ceiling_popcorn`
  registration). Add a `prewarmWallPaint` procedural branch that generates these and upserts.
- This is code the agent writes; **the owner judges the look** and we iterate parameters.

### WS2 — Material Maker drywall (baked) — collaborative authoring

- Author `materials/src/drywall/drywall.ptex` (mottled mustard, orange-peel normal, exposed
  params). Authoring loop: owner guides the look; agent does `.ptex` JSON/node surgery + bakes +
  we look; iterate. Reference `reference/Blockbuster-Video-Inside-Blockbuster-438-3792985155.jpg`.
- Bake both tiers (default `GLTF/Plane` target → `_albedo`/`_orm`/`_normal` PNGs):
  ```powershell
  ./materials/scripts/mm-bake.ps1 -InputFile materials/src/drywall/drywall.ptex -OutDir materials/baked/drywall/quality     -Size 2048
  ./materials/scripts/mm-bake.ps1 -InputFile materials/src/drywall/drywall.ptex -OutDir materials/baked/drywall/performance -Size 768
  ```
- **The baked-load seam in `SharedMaterialManager`** (the core new plumbing, shared by all baked
  wall materials): a baked prewarm that `await`s `TextureLoader.loadTexture` for albedo/normal/orm,
  builds a `MeshStandardMaterial` (`roughnessMap`/`metalnessMap`/`aoMap` = the one ORM texture),
  and upserts. **Extend `upsertMaterial`** to transfer `roughnessMap`/`metalnessMap`/`aoMap` (it
  currently only carries `map`+`normalMap`) — regression-test the worker materials, which leave
  those null.

### WS3 — Sourced drywall (optional third comparison point)

If a close CC0/CC-BY plaster/drywall PBR set is easy to grab, wire it through the same baked seam
as a third selectable option. Skip if WS1/WS2 already give a clear winner — don't over-invest.

### WS4 — Recolor / hue-shift + in-scene control (pulled forward)

- **Runtime tint** on the wall material's albedo, base-agnostic (works on procedural *or* baked).
  Inject an HSV hue/saturation/value shift via `material.onBeforeCompile` (a small fragment chunk
  after `map` sampling) — a plain `material.color` multiply darkens rather than recolors, so a
  real hue shift needs the shader hook. This *is* the Phase 3 runtime-tint item, delivered here.
- **In-scene control** in the settings/pause UI: a **wall-material selector** (drywall-procedural
  / drywall-MM / [sourced] / paneling / brick) **+ a color picker** driving the tint. This control
  is simultaneously (a) the comparison harness for this phase, (b) a shippable feature, and (c) a
  building block for Room Variants. Follow `UIComponentUtils` patterns (`client/CLAUDE.md`).

### WS5 — Wire, validate, fall back

- `MaterialType`: keep `WallWood` (becomes paneling), add `WallPaint` (drywall) and `WallBrick`.
  Walls render the *selected* wall material; default `WallPaint`. Sync/cold fallback for `WallPaint`
  = flat **mustard** (`~0xC9A54A`, tune) — not magenta, not wood-brown.
- `RoomManager.ensureWalls`: drive the shared wall material from the selector (default `WallPaint`).
- Validate under **every lighting preset** + postprocessing (feature-doc bar: no surface reads as
  obviously generated / flat box). Confirm the fallback→textured pop-in, and graceful flat-mustard
  fallback if assets 404.

## Comparison & decision

The WS4 selector + color picker is the decision tool: switch drywall-procedural ↔ drywall-MM
↔ [sourced] live, under real lighting, recolored. Decision criteria: (1) doesn't read as a flat
uniform box, (2) recolors cleanly, (3) cost (procedural = zero download; baked = a few hundred KB).
Outcome may be "keep both as options," which the selector already supports.

## Fast-follow — additional wall materials (after drywall rail + recolor prove out)

- **Wood paneling (MM):** the hope is it comes out far better than the retired worker planks. Try
  a few recipes (groove profile in normal+AO, vertical grain, 70s ramp). Lands as `WallWood` via
  the WS2 baked seam. Selectable + recolorable.
- **Brick (MM) — thematic:** the store is "brick and mortar"; we want real brick walls despite the
  Blockbuster starting aesthetic. The bundled `improved_brick.ptex` (already baked deterministically
  in Phase 0, has albedo+normal+occlusion — real depth) is a ready candidate to adapt; owner is
  inclined to keep it if the normal-mapped depth reads well. Lands as `WallBrick`.

## Design context & deferred items (capture, don't build here)

- **Partial wall occlusion mitigates wall perfection.** Walls will be substantially covered by
  screenshot/game posters and shelving (separate efforts — [Scene Clutter & Props](../features/scene-clutter-and-props.md),
  [Fabricated Set Dressing](../features/fabricated-set-dressing.md)). We should still make the
  wall material good, but "reads fine as a backdrop behind ~50% coverage" is the real bar, not
  "flawless full-wall hero surface." Informs how hard to push each technique.
- **User-supplied wall murals** — deferred, captured in
  [`docs/features/user-supplied-wall-media.md`](../features/user-supplied-wall-media.md). Lets users
  drop in their own images as wall murals/posters; reuses the file-loading infra from the in-flight
  [User Prop Folder](../features/user-prop-folder.md) effort. Not Phase 1 work — mapped for later.

## Implementer gotchas (internal — not owner concerns)

- **Recolor makes base color low-stakes**, but color space still set correctly in code: albedo =
  `SRGBColorSpace`; normal + ORM = linear/`NoColorSpace`. (Owner does not need to verify this.)
- **ORM `aoMap` UV channel:** three.js `aoMap` defaults to UV channel 1; `PlaneGeometry` has only
  `uv` (channel 0). Set `aoMap.channel = 0`, or omit `aoMap` (drywall AO is near-flat — cheapest).
- **ORM is one shared texture** across `roughnessMap`/`metalnessMap`/`aoMap`; don't double-dispose
  it in `upsertMaterial`.
- **Normal-Y convention:** verify the surface doesn't read inverted under raking light; flip
  `normalScale.y` if so.

## Model / subagent demarcation

- **WS1 (procedural), WS2 seam, WS4 (recolor+UI), WS5:** Opus — first-of-kind integration; the
  `upsertMaterial` extension, the `onBeforeCompile` tint hook, and the selector wiring have real
  design latitude.
- **WS2/WS3 authoring & baking, fast-follow paneling/brick:** collaborative (owner judges look) →
  mechanical wiring is Sonnet-suited once the rail exists.
- Optional **Explore-agent** pass before WS5: confirm the `WallWood`→selector change doesn't
  disturb `InstancedShelfRenderer`'s separate material usage.
- `/code-review` before the Phase 1 commit. `yarn tsc` + `yarn test` green.

## Acceptance criteria

1. Drywall produced **at least two ways** (procedural-worker + MM-baked), both landing through the
   `SharedMaterialManager`/`upsertMaterial` seam and selectable live in-scene.
2. Default store walls read as convincing **mottled mustard drywall** — not wood, not a flat box —
   under all lighting presets + postprocessing.
3. **Recolor works:** the in-scene color picker retints walls to arbitrary hues at runtime,
   base-agnostic; wall-material selector switches technique live.
4. Baked path loads and pops into live meshes; graceful flat-mustard fallback on asset failure.
5. `MaterialType.WallWood` retained (paneling); worker materials unaffected by the `upsertMaterial`
   extension.
6. `yarn tsc` + `yarn test` green; tests cover the baked path, the extended `upsertMaterial`, the
   procedural painter, and the wall wiring/selector.
7. **Fast-follow tracked** (not required for Phase 1 sign-off): paneling + brick recipes via MM.

## Risks / watch-items

- **The look is the risk, not the plumbing** — but running it multiple ways *is* the mitigation:
  if procedural drywall reads flat, MM (or sourced) is already in hand, and vice versa.
- **`upsertMaterial` extension** touches a method shared by all pooled materials — regression-test
  the worker materials, not just `WallPaint`.
- **Recolor via `onBeforeCompile`** is shader-injection — keep it a minimal, well-commented chunk;
  it must degrade gracefully (no tint = base texture unchanged) and not fight postprocessing.
- Tiling can show on large walls; drywall's uniformity + partial occlusion + recolor hide most of
  it. Anti-repetition (seam obfuscation) is Phase 3 if it still shows.
