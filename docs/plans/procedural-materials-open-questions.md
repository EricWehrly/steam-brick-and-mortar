# Procedural Materials — Open Questions

Companion to [`procedural-materials-pipeline-plan.md`](procedural-materials-pipeline-plan.md)
and [`procedural-textures-project-plan.md`](procedural-textures-project-plan.md). Ordered
roughly by how much the answer changes what we build. Each has a working recommendation so
implementation isn't blocked — confirm or override.

**Status 2026-07-03: answered.** `A.` lines are the owner's decisions; `R.` lines are agent
responses to inline questions. Decisions are folded into both plan docs; this doc stays as the
decision record.

## Decisions that shape the build

1. **Where does the shared material library live?**
   In-repo directory vs standalone repo from day one. The stated goal is ALL projects, which
   argues for a standalone repo; a single consumer argues for in-repo iteration speed.
   *Recommendation: start as a top-level `materials/` dir in this repo; promote to its own repo
   when a second project consumes it (the layout in the parent plan is designed to lift out
   cleanly).*
   A. Yes, this is a good plan.

2. **Commit baked outputs, or bake-on-demand?**
   Committing baked PNG/KTX2 means consumers never need Material Maker installed and builds are
   reproducible; it also means binaries in git (this repo lives in Dropbox, and Git LFS is a
   possible middle ground). Bake-on-demand keeps the repo clean but adds a toolchain dependency
   to every environment.
   *Recommendation: commit baked outputs, keep them small (≤2K, compressed), treat MM as a
   dev-time-only dependency — same philosophy as committing generated Blender assets.*
   A. Yes, but from a binary standpoint, I think we'd be in the best position with MM as a docker service. As you said, the same way we're using blender. Scriptable and repeatable across clones.
   (We don't need to worry about publishing the service or anything ... we should probably just fork MM if we need to make any changes to it, and indicate the source repo we're expecting to build the docker image, which for now is our local clone at any rate.)

3. **Run Material Maker from the official release binary or our clone?**
   Release binary is zero-setup. The clone is needed for patches (e.g., the ignored `--size`
   flag) and custom nodes/export targets, but building it requires the Godot editor.
   *Recommendation: release binary for authoring + baking; keep the clone for reading source
   and preparing upstream patches. Only build from source when we actually need a patched
   behavior the node-level workaround can't cover.*
   A. Start with what's easiest (release binary .. I downloaded to `"F:\FilePrograms\Dropbox\Projects\material-maker\release\material_maker_1_6_windows"`) but I want to use a docker service if we start making edits or customizations.

4. **Download budget: how much texture weight is acceptable?**
   The old system's raison d'être was zero texture download. A full store set at 1K–2K KTX2 is
   plausibly ~5–20 MB. Interacts with first-load experience and any offline-enablement plans.
   *Recommendation: set a budget in Phase 0 (suggest: ≤10 MB compressed for the default store
   set), lazy-load non-default variants.*
   A. For our first pass, I'd like to generate side-by-side "quality" and "performance" variants for each texture.
   The former look as good as we can muster, KBs be damned. The latter make all reasonable comprimises toward performance, which is probably mostly being aggressive about size.
   We'll iterate from there.

5. **Resolution targets per surface.**
   VR close-inspection surfaces (shelves, walls at lean-in distance) vs far surfaces (ceiling).
   2K everywhere is the lazy answer; GPU memory is already under investigation in this project.
   *Recommendation: 1K default, 2K only where close inspection proves it's needed, decided
   per-surface during Phase 1/2 review in-headset/in-scene.*
   A. I think the above answers, but stop me if that assumption is bad.
   R. Confirmed — the Q4 tier split subsumes this question. Resolution becomes a per-tier
   property (quality ≈ 2K, performance ≈ 512–1K as starting points), tuned per-surface during
   in-scene review rather than decided up front.

## Design questions inside the chosen tool

6. **Custom three.js export target now, or consume `GLTF/Plane` output as-is?**
   The built-in target already emits albedo/ORM/normal/emission PNGs in glTF convention.
   A custom target could control naming, channel packing, and skip the `.gltf` file.
   *Recommendation: consume `GLTF/Plane` in Phases 0–2; write a custom target only when a
   concrete packing/naming need appears.*
   A. Agreed.

7. **How do we handle the `--size` flag bug?**
   Node-level size parameter in each `.ptex`, local patch, or upstream PR (good-citizen move,
   also validates our ability to modify the tool).
   *Recommendation: node-level parameter now; open an upstream PR opportunistically.*
   A. Stop me if I'm wrong here: This is just saying we can't set a global size and need to do so for each node described in the generator? 
   I can see why that'd be acceptable now, and I would agree with the recommendation.
   R. Close, but coarser than that: it's one size setting per *material file* (the output
   Material node's size parameter), not per node inside the graph. And since `.ptex` is JSON,
   our bake script stamps that value programmatically before export — so we regain a
   global/per-tier size switch in our own tooling despite the broken CLI flag. This is also
   exactly how the Q4 quality/performance tiers get their different resolutions.

8. **Community-library licensing.**
   materialmaker.org materials are individually authored; before importing one as a starting
   point for *our* library, confirm the site's material licensing terms (believed permissive,
   **unverified**).
   *Action: check once during Phase 0, record the answer in the library README.*
   Comment: Please also provide like ... do we just author our own if we can't use those? What does this change for us?
   R. Yes — the fallback is authoring from scratch with the built-in node library, which ships
   with the app under MIT (the `library/`, `examples/`, and node definitions are part of the
   repo we cloned). Capability is never at risk; community materials only save authoring hours
   on the first wave. If the terms turn out unfriendly we lose a shortcut, not a feature — and
   unfriendly-licensed materials can still serve as *visual reference* while we build our own
   graphs.

9. **Headless/CI baking.**
   Does CLI export work without a display on Windows (and eventually Linux CI)? Godot headless
   mode disables GPU rendering, which export presumably needs (**unverified**).
   *Recommendation: don't design for CI baking at all — bake on a dev machine, commit outputs
   (see Q2). Verify the no-display behavior in Phase 0 just so the constraint is documented.*
   A. Oh, this also affects Q3. Good to know. Let's assume we need headed godot (which should be installed, but there's a version question)
   I don't really like dependencies we'll need to manually manage on system rather than in a container sandbox, but going without is an acceptable comprimise if this is otherwise the best tool for the job.
   Expect to run headless on a dev machine, but we should use encapsulating scripts that verify our dependencies and are clear and usable for human users and LLMs.
   We don't need to spend time tinkering with this now, but it's still a nice to have down the line.
   R. Captured in the pipeline plan: dependency-verifying wrapper scripts now (human- and
   LLM-usable); dockerized MM service (built from our clone/fork, same philosophy as Blender)
   as the target state once we start customizing — with GPU-inside-the-container flagged as
   the risk to verify before depending on it.

## Project-look questions (user taste, cheap to answer)

comment: we have a reference photo at `reference\Blockbuster-Video-Inside-Blockbuster-438-3792985155.jpg`
a branding guide indicates the following colors for Blockbuster:
Hex code 	#0E3FA9 	
RGB values 	(14, 63, 169) 	
CMYK values 	(92, 63, 0, 34)* 	
Pantone® 	293 C* 	

Yellow
Hex code 	#FFA903 	
RGB values 	(255, 169, 3) 	
CMYK values 	(0, 34, 99, 0)* 	
Pantone® 	137 C*

10. **Wall palette.** "Yellowish painted drywall" — pick the actual hue/saturation (pale
    butter-yellow vs saturated gold), and whether the brand-blue appears as a painted band,
    soffit geometry, or not at all on walls.
    A. the brand-blue was often on lettering and signage but not accented on the walls
11. **Ceiling default.** Popcorn (current) vs acoustic drop-tile grid (more period-retail
    accurate). Both get authored eventually; which ships as the default store?
    A. popcorn
12. **Carpet identity.** Palette + pattern for the default store (90s confetti scatter vs the
    current diamond geometry), and whether "every store visit has a unique carpet seed" is
    still a desired feature post-bake (it changes implementation: N variants vs shader-side
    variation).
    A. Ship with what's easiest. Provide a few different carpet types the store can have. Match the current. 90s confetti. Reasonable options that will 'evoke the nostalgia' as intended...
13. **Wood paneling destination.** Paneling was demoted from default walls — is it reserved for
    the Cozy Basement variant, or does the default store keep a paneled accent wall (e.g.,
    behind the counter)?
    A. No accent walls. Wood paneling was moreso here something we tried because the 'default' (stucco/drywall) walls were ... draining.
    We should try wood-paneling and some other variants in case we struggle to properly tune the drywall to avoid that.

## Deferred / research

14. **Runtime GLSL extraction from Material Maker graphs** — for true-runtime procedural
    surfaces with zero texture memory (possible liminal-mode synergy: infinite unique shell).
    No first-class export path exists; would be a research spike. Parked until a concrete need.
    Comment: Schedule a research spike somewhere, there is value here, and I'd like to know its viability.
    Also, a speculative shot at anything we can do runtime ... we should ideally be able to change hues and such, as is often a feature in games...
    R. Spike scheduled (project plan, Phase 3). Note the two asks decompose: runtime
    *hue/tint control* doesn't need MM GLSL at all — an HSV-shift/tint hook in the material
    shader over baked textures is a standard, cheap game technique, and is now planned as part
    of the runtime layer proper. The GLSL-extraction spike is specifically about
    fully-procedural surfaces (zero texture memory — liminal-shell territory), and its output
    is a viability verdict, not an implementation.
15. **Blend/transition authoring** — MM authors single materials; runtime blending between
    materials (thresholds, masks) is engine-side. Do we eventually want authored blend masks
    (e.g., worn-path carpet) baked as extra maps? Parked until Phase 3/4 shows a need.
16. **Web research follow-ups deliberately skipped this round** (local sources sufficed):
    three.js-ecosystem ports of hex-tiling/stochastic sampling and their licenses; lygia's
    actual license terms; KTX2 encoder settings for normal maps. Verify at Phase 3
    implementation time — small, self-contained lookups.
