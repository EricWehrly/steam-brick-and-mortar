# Material Maker CLI Export Patch — Executor Context

**Status: RESOLVED (2026-07-06).** This doc originated as an executor brief for a Sonnet
implementation session (2026-07-03); sections below through [Upstream check](#upstream-check)
are that original investigation/brief, kept as accurate technical reference for the fix
rationale. Skip to **[What was done](#what-was-done)** for the actual outcome and
**[What remains](#what-remains)** for follow-ups.

**Author:** Opus (Phase 0 investigation), 2026-07-03.
**Parent:** [`docs/plans/procedural-materials-pipeline-plan.md`](../docs/plans/procedural-materials-pipeline-plan.md) (Phase 0).

---

## TL;DR mission

MM's from-source CLI export (`--export-material`) currently races: the async compute-render
system hasn't settled when export captures buffers, so **compute-buffer-backed maps are dropped
with `buffer is invalid`, and a different incomplete subset is written on every run.** Make it
export the full set, identically, every time. Keep the change minimal and upstreamable.

## Environment (all verified)

- **Fork/clone (work in place):** `F:\FilePrograms\Dropbox\Projects\material-maker` — branch
  `master`, HEAD `59b4519f` (`git describe` = `1.6-82-g59b4519f`, 2026-06-28). Owner confirmed
  Dropbox sync is not a concern; do not relocate.
- **Do NOT use the release binary** (`release/material_maker_1_6_windows/material_maker.exe`).
  Its CLI export hard-crashes with an access violation (`0xC0000005`) before writing anything —
  a separate, worse, unfixable-by-us bug in the *exported* Godot build. **From-source only.**
- **Godot:** standardize on **4.6-stable** (matches what MM 1.6 was written against):
  `F:\Program Files\Godot\Godot_v4.6-stable_win64.exe\Godot_v4.6-stable_win64_console.exe`
  (the `_console.exe` variant — proper stdio/exit codes). Godot 4.7 also runs and shows the
  **same race** (not a version issue), so 4.6 is the clean choice.
- **First run / after switching engines** needs an import cache:
  `<godot> --path <clone> --headless --import` (~10-40s; writes `.godot/`, churns tracked
  `*.import` metadata — harmless, do not commit).

## Reproduce the bug (use the bake wrapper — do not hand-write the invocation)

Wrapper: [`materials/scripts/mm-bake.ps1`](scripts/mm-bake.ps1) (full usage in its header).

```powershell
$clone = "F:\FilePrograms\Dropbox\Projects\material-maker"
$godot = "F:\Program Files\Godot\Godot_v4.6-stable_win64.exe\Godot_v4.6-stable_win64_console.exe"
$ex    = "$clone\release\material_maker_1_6_windows\examples\improved_brick.ptex"
& "materials\scripts\mm-bake.ps1" -InputFile $ex -OutDir "<scratch>\mm-test" -Target Blender -GodotBin $godot
```

**Observed:** exit 0, but `--- Output files ---` shows an *incomplete* set that **changes each
run** (e.g. run A: `occlusion.exr` only; run B: `albedo.png`+`normal.png`), always with
`buffer is invalid` in stdout and a backtrace in stderr.
**Expected (Blender profile) for `improved_brick`:** albedo `.png`, normal `.png`, occlusion
`.exr` (roughness/metallic/etc. as connected) — the *same* files every run.

## Execution guardrails & git discipline (read before editing)

- **Branch first.** In the MM clone: `git checkout -b fix/cli-export-buffer-race` off `master`
  before any edit. Keep it PR-ready (we won't PR now, but might later).
- **Tag every change** with a comment `# MM-FORK: <reason>` so the diff is rebaseable/PR-able.
- **Commit only intentional `.gd` edits.** `git add <specific paths>` — never `git add -A`. Do
  NOT commit `.godot/`, `*.import` churn (the clone already has unstaged `.import` mods from
  earlier imports — leave them unstaged, don't revert or commit them), or `release/`. Don't
  push, don't open a PR.
- **Preserve diagnostics on failure.** If an approach fails, commit it (message noting it failed
  and why) rather than reverting into oblivion — failed attempts have diagnostic value.
- **Bounded effort.** Cap at ~8-10 export-test iterations. If the acceptance criteria aren't met
  by then, STOP and write up what you tried + the single best next hypothesis. A well-diagnosed
  failure is a valid outcome; thrashing is not.
- **No re-import after `.gd` edits.** Editing GDScript does not require `--import` (that's for
  assets). Just edit and re-run the bake. Only run `--import` on a fresh clone / after switching
  Godot versions (see Environment).
- **Test harness:** use `mm-bake.ps1` (command above); a fresh `-OutDir` per run
  (`...\run1`, `run2`, `run3`) so you can diff file sets to prove determinism.

## Root cause (traced; verify, then fix)

1. `parse_args.gd` `_ready()` sees `--export-material`, calls `export_files()`.
2. `export_files()` (around line 55-90): per file, `load_gen(f)` then **`add_child(gen)` (line
   ~56)**, then walks the node tree and `await`s `export_material(...)` on capable nodes.
3. `add_child(gen)` fires `_ready()` on every generator node. For **`MMGenBuffer`**
   (`addons/material_maker/engine/nodes/gen_buffer.gd`):
   - `_ready()` (lines 25-30) creates an `MMShaderCompute` and calls **`do_update_shader()`
     without awaiting it** (line 30 — fire-and-forget).
   - `do_update_shader()` (lines 99-126) does
     `var shader_status = await shader_compute.set_shader_from_shadercode(...)`; when that
     returns **false**, it prints **`"buffer is invalid"` (line 126)** and the buffer texture
     is never produced.
4. `shader_compute.gd:8-9` forwards to `MMComputeShader.set_shader_from_shadercode`
   (`addons/material_maker/engine/pipeline/compute_shader.gd`), which drives a
   `RenderingDevice` compute pass. **This is where the `false` originates** — determine why it
   fails in export mode specifically.
5. `gen_material.export_material()` (`gen_material.gd:650+`) *does* `await mm_deps.updated` and
   `get_tree().process_frame` before capturing outputs (see lines ~726, 754, 779) — but that
   runs **after** the buffer already failed during `add_child`. Its waiting is necessary but
   not sufficient.

**Net:** in CLI export mode the async dependency/compute-render subsystem
(`mm_deps` = `engine/dependencies.gd`; `multi_renderer.gd`; `pipeline/compute_shader.gd`) isn't
given the chance to initialize/settle before buffer shaders compile, and buffer compilation
returns `false` nondeterministically. The GUI path works only because frames keep pumping.

**Why the existing render-queue wait doesn't save us (the key subtlety):**
`gen_material.export_material()` already waits on `mm_deps` before reading buffer textures
(`get_render_queue_size()` / `await mm_deps.updated` / `render_queue_empty`). But a buffer whose
`set_shader_from_shadercode` returned **false** never reaches
`mm_deps.buffer_create_compute_material(...)` (gen_buffer.gd:123, inside the `if shader_status`
branch) — so it is **not counted as a pending/invalidated buffer** in
`dependencies.gd` (`pending_dependencies`, `render_queue_size`, `update()` at :178-211). The
queue therefore reports "empty" while the buffer is silently broken, and the wait passes over a
missing texture. **Conclusion: waiting harder is not enough — the fix must make the buffer
actually compile successfully** (retry `do_update_shader()` until valid, and/or ensure the
compute `RenderingDevice`/pipeline is initialized before `add_child`). This reframes the fix
directions below: #1 (wait) alone will not close the race; combine with #2/#3.

Relevant `dependencies.gd` anchors: `signal updated` :4, `signal render_queue_empty` :43,
`create_buffer` :46, `buffer_has_pending_dependencies` :105, `update` :178,
`get_render_queue_size` :215, `buffer_create_compute_material` :228.

## Fix directions (pick what actually proves out; prefer the smallest)

1. **Let the system settle before export.** In `parse_args.gd export_files`, after
   `add_child(gen)`, `await mm_deps.updated` and/or pump `await get_tree().process_frame` in a
   loop until `mm_deps` reports no pending work — mirror the wait pattern `export_material`
   already uses. Likely the cleanest, most upstreamable fix.
2. **Await buffer setup.** Make `MMGenBuffer._ready()` `await do_update_shader()` (line 30), or
   expose a way for export to await all buffers' shader setup before capturing.
3. **Fix export-mode init.** If `set_shader_from_shadercode` returns `false` because the
   compute `RenderingDevice`/pipeline isn't initialized in export mode (something GUI startup
   does but `parse_args` skips), initialize it before `add_child`.

Combine 1+2 if needed. **Determinism + completeness is the acceptance bar**, not "fewer errors".

## Key files

| File | Why |
|---|---|
| `parse_args.gd` | Export entry + `export_files` loop; `add_child(gen)` at ~:56 — primary patch site for fix #1 |
| `addons/material_maker/engine/nodes/gen_buffer.gd` | `_ready` :25-30, `do_update_shader` :99-126, `"buffer is invalid"` :126 — fix #2 site |
| `addons/material_maker/engine/shader_compute.gd` | :8-9 thin wrapper |
| `addons/material_maker/engine/pipeline/compute_shader.gd` | `MMComputeShader.set_shader_from_shadercode` — where `false` originates (fix #3) |
| `addons/material_maker/engine/dependencies.gd` | `mm_deps`: `updated` signal + pending/update logic to await against |
| `addons/material_maker/engine/multi_renderer.gd` | async render queue |
| `addons/material_maker/engine/nodes/gen_material.gd` | `export_material` :650 — existing wait pattern to mirror |

## Constraints / conventions

- This is our **fork**. Mark every change with a comment like `# MM-FORK: <reason>` so we can
  rebase on upstream and potentially submit a PR. Keep diffs minimal.
- Do not touch the `release/` tree. Do not commit `.godot/` or `*.import` churn — only the
  intentional `.gd` edits.
- The `mm-bake.ps1` wrapper is the test harness; extend it only if the fix needs a new flag.

## Acceptance criteria

1. Repro command exits 0 with **zero** `buffer is invalid` messages.
2. **Complete** map set for `improved_brick` (albedo + normal + occlusion at minimum).
3. **Identical** output file set across **>= 3 consecutive runs** (determinism).
4. Spot-check: open the albedo PNG — it looks like bricks, not garbage/blank.
5. Repeat the check on a second material that uses explicit Buffer nodes (pick one from
   `release/.../examples/` that shows `buffer is invalid` on current code) to prove generality.

## Upstream check

Focused research pass completed 2026-07-03. **Verdict: no upstream fix exists — we must patch
ourselves.** Details:

- **No issue matches our exact symptom** (nondeterministic subset of buffer maps + `buffer is
  invalid`). The only `"buffer is invalid"` hit,
  [#749](https://github.com/RodZill4/material-maker/issues/749), is an unrelated shader-compile
  bug. Closest related (but different symptom — CLI export not triggering *at all*, on Linux):
  [#1132](https://github.com/RodZill4/material-maker/issues/1132) (open, reproducing on 1.5p1)
  and [#804](https://github.com/RodZill4/material-maker/issues/804) (closed).
- **Nothing newer to pull.** `59b4519f` (our HEAD) IS current `origin/master`.
  `gen_buffer.gd` unchanged since 2025-07-05; `shader_compute.gd` since 2024-09-24 — both
  already in our clone.
- **[PR #1412 "Improve CLI export automation"](https://github.com/RodZill4/material-maker/pull/1412)**
  (open, unmerged, no reviews) rewrites `parse_args.gd`: **fixes the `--size` no-op**, adds exit
  codes, `--list-export-profiles`, and `--json` summaries. It does **NOT** touch the
  buffer/shader readiness path, so **it would not fix our race** — but it is a useful companion
  to fold into our fork (it removes our need to stamp `.ptex` size ourselves, and its exit
  codes / `--json` would make `mm-bake.ps1` more robust). Consider cherry-picking it *alongside*
  the race fix, not instead of it.
- **Maintainer sentiment:** CLI/batch export is a known-fragile, community-contributed area —
  removed and "reintroduced" in 1.5, previously fixed by third parties; RodZill4 has not
  hardened it. Expect no upstream help; our fork is the path.

**Bottom line: implement the race fix here (fix directions above), optionally cherry-picking PR
#1412 for `--size`/exit-codes/`--json` ergonomics. Do not wait on upstream.**

## After the patch

- Update Phase 0 status in the pipeline plan and add a short "how baking works" note to
  `materials/README.md` (to be created).
- The batch/variant bake flow (stamping `.ptex` size per tier, iterating materials) builds on
  this — out of scope for the patch task itself.

**Model guidance:** mechanical-but-careful GDScript debugging following this doc — Sonnet-suited.
Escalate to Opus only if the true cause is a deeper engine/init redesign rather than an
await/ordering fix.

## What was done

CLI export went from "crashes outright" (release binary) to "runs from source but produces a
different incomplete map set every time, no two runs alike" to **fully deterministic and
complete**, across two work sessions. Three independent races, found and fixed in this order:

**Pass 1 (Sonnet, direct execution) — two races fixed, determinism not yet achieved:**

1. **`RenderingDevice` creation race** — `multi_renderer.gd`'s `initialize_rendering_thread()`
   creates the `RenderingDevice` on a background thread via fire-and-forget `thread_run()`,
   never awaited. In CLI mode, export could start before the device existed, so the first
   buffer shader compile failed and printed `"buffer is invalid"`. Fix in `parse_args.gd`
   `_ready()`: `while mm_renderer.rendering_device == null: await get_tree().process_frame`
   before any export work. This eliminated 100% of `"buffer is invalid"` messages.
2. **Broken render-queue wait** — `gen_material.gd`'s `export_material()` had a comment saying
   "wait until the render queue is empty" but the code only checked "did the count stop
   changing across one cycle," which could return early while buffers were still pending
   (confirmed: `normal_map.mmg` registers its own Buffer node *lazily*, as a side effect of
   `get_shader_code()`, after the original wait already ran once). Fixed to an actual
   drain-to-zero loop, in both `gen_material.gd` and a new call site in `gen_base.gd`'s
   `render_output_to_texture` (since buffers can be registered mid-export).

Effect: `buffer is invalid` never recurred, but only 4 of 13 test runs produced the full
4-file set — real improvement, not yet deterministic, and now *silently* incomplete (no error
message of any kind). Diagnostic `print("MM-FORK-DIAG ...")` calls were added in
`render_output_to_texture` to catch a suspected shader-compile/render failure there — but they
**never fired** on a failing run, which ruled out that code path and pointed downstream, into
Godot's own texture read-back. That negative result is what made Pass 2 fast; it wasn't wasted
effort. Full blow-by-blow of this pass (iteration counts, per-run file lists, hypotheses tried
and discarded) is preserved in the branch's first commit message (`e9de68d9`) — not repeated
here.

**Pass 2 (Opus diagnosis, Sonnet verification) — the actual root cause:**

3. **Deferred texture read-back race.** `MMTexture.in_thread_get_texture()` (`texture.gd`), which
   runs on `mm_renderer`'s dedicated render thread, applied the GPU read-back via
   `texture.set_image.call_deferred(image)` — `call_deferred` queues the call for the next
   main-thread idle frame, it does **not** run synchronously. `get_texture()` awaited the
   render-thread round trip but not that deferred call, so `save_to_file()` could call
   `texture.get_image()` before the image was actually assigned — silently returning
   `ERR_DOES_NOT_EXIST` with zero console output. This is the exact "no error anywhere, output
   just missing, different subset every run" symptom from Pass 1. Fix: `in_thread_get_texture()`
   now returns the decoded `Image` instead of deferring `set_image` itself; `get_texture()`
   calls `texture.set_image(image)` synchronously on the main thread after the round trip,
   before returning.

**Verification:** 6/6 consecutive runs on `improved_brick.ptex` — identical, complete 4-file
set (albedo/normal/occlusion/displace), zero errors, zero `buffer is invalid`. 3/3 consecutive
runs on `stylized_wall.ptex` (a second, independent material with an explicit Buffer node) —
same result, confirming the fix isn't specific to one graph shape. Albedo output visually
inspected in both cases — correct tileable texture, not blank/garbage. All five acceptance
criteria above are met.

**State of the fork:** branch `fix/cli-export-buffer-race`, two commits
(`e9de68d9`, `d8078d3c`), **not pushed, no PR opened** (per owner instruction — kept local and
PR-ready). Every change is tagged `# MM-FORK: <reason>`. The `MM-FORK-DIAG` diagnostic prints
from Pass 1 are still in `gen_base.gd` — left in deliberately, since the original code silently
discarded these two failure signals entirely; they're now a permanent, cheap improvement to
future debuggability even though they didn't fire for this particular bug.

## What remains

Nothing is blocking Phase 0 baking anymore. Left for later, roughly in priority order:

- **Upstream disposition undecided.** The branch is local-only. Options: leave it as our
  permanent fork baseline (simplest, matches the "fork if we need changes" decision already
  made in the pipeline plan); or push + open an upstream PR for goodwill/maintenance-sharing
  (all three fixes are minimal, well-commented, and plausibly mergeable — the `render_output_to_texture`
  drain fix and the `texture.gd` deferred-call fix especially, since neither is CLI-specific
  and could affect the GUI in a bad case too, e.g. saving a texture immediately after it renders).
  No urgency; revisit whenever upstream contribution is a priority.
- **PR #1412 not folded in.** Still open upstream, still unmerged, still just an ergonomics
  improvement (fixes the `--size` no-op properly, adds exit codes / `--json` /
  `--list-export-profiles`). Our `mm-bake.ps1` already works around `--size` by stamping the
  `.ptex` directly, so this is a nice-to-have, not a blocker. Worth a look if the bake wrapper
  needs exit-code granularity later.
- **`materials/README.md` doesn't exist yet** — was flagged as a follow-up in the original brief
  (a short "how baking works" note for the shared library). Still not written; low priority
  until Phase 0's remaining tasks (below) land, since the bake flow will change shape slightly.
- **Rest of Phase 0** (tooling validation, not this doc's scope): confirm community-library
  licensing (open question 8), decide the asset-home/loading path, and the variant/tier bake
  scripts — tracked in `docs/plans/procedural-textures-project-plan.md`'s Phase 0 checklist, not
  duplicated here.
- **Tracked but not urgent:** the clone has long-standing unstaged `*.import` metadata churn
  (from repeated `--import` runs across Godot 4.6/4.7 during investigation) — harmless, left
  unstaged/uncommitted per the git-discipline rule; can be discarded with
  `git checkout -- '*.import'` in the clone whenever convenient, or just ignored indefinitely.
- **Not investigated, no longer needed:** the "retry the bake N times" pragmatic workaround
  floated at the end of Pass 1 is moot now that the underlying race is actually fixed.
