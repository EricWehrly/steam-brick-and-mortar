# Procedural Materials Pipeline (Cross-Project)

**Status:** Proposed — tool selected, pipeline design ready for validation
**Scope:** ALL games/projects, not just this one. This doc defines the general approach; the
project-specific adoption plan is [`procedural-textures-project-plan.md`](procedural-textures-project-plan.md).
**Feature:** `docs/features/procedural-texture-quality.md`
**Open questions:** [`procedural-materials-open-questions.md`](procedural-materials-open-questions.md)

---

## Decision: Material Maker as the authoring tool

[Material Maker](https://github.com/RodZill4/material-maker) (RodZill4) — node-based procedural
PBR material authoring, built on Godot 4. Local clone: `F:\FilePrograms\Dropbox\Projects\material-maker`.

### Why (facts verified against the local clone, not marketing)

| Requirement | Verdict | Evidence |
|---|---|---|
| License safety | ✅ MIT | `LICENSE.md` — no rug-pull possible; we can fork forever |
| CLI / batch export | ✅ Built in | `parse_args.gd` + `material_maker/doc/command_line.rst`: `material_maker --export-material --target <engine> -o <dir> [--output-file <template>] <files.ptex>` — wildcards accepted |
| Web-friendly output | ✅ Direct | `GLTF/Plane` export target emits `_albedo.png`, `_orm.png` (packed occlusion/roughness/metallic — the glTF convention three.js `MeshStandardMaterial` natively expects), `_normal.png`, `_emission.png`, plus a `.gltf` (`addons/material_maker/nodes/material.mmg`) |
| Extensible | ✅ Data-driven | Nodes are `.mmg` JSON files with embedded GLSL; export targets are JSON templates inside `.mmg` — adding a custom "three.js" export target is JSON editing, no engine code |
| Parameterizable | ✅ | Material graphs expose named parameters; project files (`.ptex`) are JSON — scriptable: stamp parameter values, export N variants from one graph |
| Community library | ✅ | materialmaker.org; the CLI can even export directly from it: `--export-material website:<id>` or `website:<idA>-<idB>` ranges (`parse_args.gd`) |
| Seamless tiling | ✅ | Core design property of the node library (tileable-by-construction generators) |
| Actively maintained | ✅ (v1.6 era) | `CHANGELOG.md` shows ongoing contributor activity |

### Known warts (from source inspection)

- **`--size` CLI flag is parsed but never used** — export resolution is hardcoded to 2048 in
  `parse_args.gd` (marked `#TODO: fix this` upstream). Mitigations: set resolution on the
  material node inside each `.ptex`, patch our clone (trivial — one variable), and/or send the
  fix upstream as a first-contribution PR.
- **Headless caveat (unverified):** export renders via the GPU. Godot's `--headless` mode
  disables rendering, so CLI export almost certainly needs a GPU/display context. Fine on dev
  machines; a constraint for CI. Verify in Phase 0; see open questions.
- Export targets are engine-flavored (Blender/Godot/Unity/Unreal/GLTF). For three.js we consume
  the `GLTF/Plane` PNGs directly at first, and add a custom export target when we want different
  packing or naming.

### Locked decisions (2026-07-03, from the open-questions review)

- **Run mode, now:** official 1.6 release binary —
  `F:\FilePrograms\Dropbox\Projects\material-maker\release\material_maker_1_6_windows\material_maker.exe`
  (ships with `library/`, `examples/`, `export/` presets, and offline `doc/`).
- **Run mode, target state:** a **dockerized Material Maker service** built from our clone/fork
  — same philosophy as our Blender CLI usage: scriptable, repeatable across clones, no
  manually-managed system dependencies. Adopt when we start making edits/customizations. Known
  risk to verify first: export renders on the GPU, so GPU access inside the container must be
  proven before depending on it. No publishing obligations — image builds from a declared
  source repo (currently the local clone).
- **Bake scripts are encapsulating wrappers:** they verify their dependencies (binary present,
  version expected) and are clear and usable for both humans and LLMs. No bare incantations in
  docs — the script is the interface.
- **Library location:** in-repo `materials/` top-level dir until a second project consumes it.
- **Baked outputs are committed**; Material Maker is a dev-time-only dependency.
- **Every material exports two tiers:** `quality` (as good as we can muster, KBs be damned) and
  `performance` (aggressive compromises, mostly resolution/compression). Budgets iterate from
  measurements, not up-front guesses. Tier resolution is stamped into the `.ptex` size
  parameter by the bake script (which also sidesteps the `--size` bug).

### What we are explicitly NOT doing

- **Not building our own generator.** The hand-rolled canvas/worker texture code in this project
  proved the concept and is being retired. Authoring quality materials is a solved problem;
  our value-add is the pipeline and runtime usage.
- **Not porting Material Maker to the web.** Runtime needs are met by consuming its baked output
  plus our own thin shader layer (below).
- **Not adopting anything with commercial license risk** (Substance, etc.).

---

## Pipeline architecture

```
[Author]  Material Maker GUI — look-dev, node graphs, exposed parameters
   │           .ptex sources (JSON, committed to git)
   ▼
[Bake]    CLI batch export (scripted): material_maker --export-material
   │           per-material PBR sets: albedo / ORM / normal / (height, emission)
   │           variant stamping: script rewrites .ptex parameters → N looks per graph
   ▼
[Package] Post-process per consuming project:
   │           resize tiers, KTX2/BasisU compression for web (toktx), naming manifest
   ▼
[Consume] Engine-side:
              • load baked maps (three.js: TextureLoader / KTX2Loader)
              • runtime shader layer: tiling repeat, anti-repetition, blending, detail maps
```

### Layer responsibilities

1. **Authoring (Material Maker, human-in-the-loop):** the look of a material — graph structure,
   noise choices, color ramps. Each material exposes a small set of named parameters
   (base color, wear, scale, seed…) so one graph serves many themes/projects.
2. **Bake scripts (per shared library):** deterministic, re-runnable CLI export. Input: `.ptex`
   + a variants manifest (JSON: parameter overrides per variant + tier definitions —
   quality/performance resolutions). Output: organized texture sets, one per variant × tier.
   This is where "tweakable per project" happens without touching the graph.
3. **Packaging (per project):** projects have different delivery constraints (web wants KTX2 +
   small tiles; a desktop game may want raw 4K PNG). Packaging is project-owned; baking is
   library-owned.
4. **Runtime (per engine, thin):** what genuinely must happen at runtime — tiling repeat,
   anti-repetition (hex-tiling / stochastic sampling for large surfaces), splat/height-based
   blending between materials, detail normals, triplanar where UVs are poor. These are
   established shader techniques consuming baked maps; they are not texture *generation*.

### Repository layout for the shared library

Start as a directory in this repo (fastest iteration while there's a single consumer); promote
to a standalone repo the moment a second project consumes it. Proposed structure (wherever it
lives):

```
materials/
├── src/            # .ptex sources, one dir per material family (wood/, brick/, carpet/…)
├── variants/       # per-material variant manifests (parameter overrides)
├── scripts/        # bake + variant-stamping + packaging scripts
├── baked/          # committed export output (see open questions re: committing binaries)
└── README.md       # how to author, bake, add a material
```

### The generic starter set (cross-project)

First-wave materials chosen for reuse across projects, not just this store:
painted drywall, wood (planks / paneling / veneer), carpet (commercial low-pile),
popcorn ceiling + acoustic ceiling tile, brick, concrete, asphalt, grass, brushed/galvanized
metal, generic plastic, fabric. Many have community-library starting points on
materialmaker.org — import, restyle, expose parameters, save as ours.

### Runtime layer principles (engine-side)

- **Baked-first:** default is baked tileable maps + repeat. Shader sophistication is added only
  where repetition or blending is actually visible (large floors/walls/ceilings).
- **WebGL2-compatible GLSL** for the current project (three.js `WebGLRenderer`; TSL/WebGPU node
  materials are not assumed). Techniques: hex-tiling / histogram-preserving stochastic sampling
  (Deliot–Heitz-style) for anti-repetition; splat or height-based blends at material seams;
  detail normal maps for close-up VR inspection.
- **Quality-tiered:** every runtime shader feature must have a cheap fallback (plain repeat) so
  the graceful-degradation story holds. Baked textures themselves are effectively free at
  runtime; shaders are the thing that costs.
- **Runtime tint/hue control:** author baked albedo near-neutral where feasible and provide an
  HSV-shift/tint hook in the material shader, so hues can change at runtime (theme switches,
  variant recoloring) without rebaking — a standard game technique, and our first answer to
  "runtime procedural" before any GLSL-extraction ambitions.
- **License hygiene for shader code:** prefer MIT sources (e.g., stackgl `glsl-noise`); check
  terms carefully before vendoring anything (some popular libs, e.g. lygia, have
  non-standard licenses). Verify at implementation time.

### True-runtime procedural (scheduled research spike, not v1)

Material Maker nodes are GLSL under the hood, but there is no first-class "export material as
portable GLSL" path for non-Godot targets. A timeboxed viability spike **is scheduled** (owner
call, 2026-07 — slotted alongside Phase 3 of the project plan): assess extracting GLSL from MM
graphs vs hand-porting 2–3 key materials to WebGL2 shaders, for fully-procedural surfaces with
zero texture memory (liminal-mode endless shell is the motivating case). Deliverable is a
written viability verdict, not an implementation. Distinct from runtime tinting (above), which
is cheap and already planned.

---

## Execution guidance: model & subagent demarcations

Where it's sensible to hand work down-tier as this plan executes:

| Work | Tier | Rationale |
|---|---|---|
| This plan; pipeline-shape decisions; resolving open questions with the user | **Fable** (done here) | Judgment-heavy, cross-project consequences |
| Phase 0/1 of the project plan: first end-to-end material (bake → load → apply → verify), reshaping `SharedMaterialManager`, patching MM CLI (`--size`), designing the bake/variant scripts | **Opus** | Real design latitude, but the direction is set |
| Repeating the established template across remaining materials; deleting legacy painter/worker code + test updates; bake-script iteration; doc upkeep | **Sonnet** | Mechanical once the first material lands and the pattern is proven |
| Bulk `.ptex` variant stamping and bake-output QA (checking exported sets are complete/tileable) | **Sonnet / scripts** | Deterministic, verifiable |

Subagent opportunities:
- **Explore agent** before the `SharedMaterialManager` refactor: map every `MaterialType`
  consumer and material-application call site so the swap plan is complete before edits start.
- **General-purpose agent** for the headless-export verification spike (run MM CLI on Windows,
  document exact invocation + gotchas) — self-contained, verifiable output.
- **Code review** (`/code-review`) before merging each phase.
- Web research agents only for gaps not answerable from local sources (lesson learned: the MM
  clone answered every tooling question the web was about to be asked).

## Alternatives considered

A web survey of the OSS landscape is being folded in as it completes; provisional positions,
each falsifiable:

- **Blender headless baking** (runner-up): we already drive Blender CLI in this repo; shader-node
  materials can be baked to PBR maps by script. Strong fallback and complementary (Blender
  consumes MM exports for asset texturing). Weaker as the *authoring* environment: material
  node-graph ergonomics, tileability guarantees, and a reusable parameter/export model all have
  to be hand-built — which is the "build our own" trap again, one layer up.
- **TextureLab** (njbrown): closest OSS analog to Substance Designer's UX, but effectively
  dormant; fails the actively-maintained bar.
- **ArmorPaint / ArmorLab**: painting/AI-capture oriented (per-asset texturing), not procedural
  material authoring; pay-for-binaries model.
- **Materialize**: photo→PBR map conversion, not procedural authoring. Possibly useful as a
  side utility.
- **Code-first noise libs (FastNoise2 etc.)**: a foundation, not a tool — same trap.
- **Substance 3D Designer**: the commercial reference point; excluded on license/rent-seeking
  grounds (Adobe subscription).
