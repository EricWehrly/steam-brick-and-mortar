# Three.js / WebGL Performance Quirks

A curated internal reference for common gotchas in Three.js/WebGL codebases. Loaded on demand — not persistent context.

---

## Texture Upload Hitches (`needsUpdate = true`)

### The Problem
Setting `texture.needsUpdate = true` causes Three.js to call `texImage2D` / `texSubImage2D` on the next `renderer.render()` call. For large textures (2048×2048+) this blocks the main thread for 2–15ms per texture. With multiple materials updating simultaneously, the cumulative stall is visible.

This is **not** a Three.js bug — it's a fundamental WebGL constraint. `texImage2D` must synchronize the CPU→GPU transfer, and in WebGL (unlike native OpenGL) you can't use Pixel Buffer Objects (PBOs) to make this async. The browser's GPU process pipeline doesn't expose that level of control.

### Mitigations (best to worst)

1. **Stagger upserts across frames** (what we do via `FrameBudgetScheduler`) — limits the per-frame stall to one texture upload instead of five. Each still hitches ~2–4ms but they're spread out.

2. **Smaller textures** — halving resolution (2048→1024) cuts upload time by ~4×. For procedural materials on mid-distance surfaces, 1024 is often sufficient. The wood grain on walls vs. up-close shelf boards could be different resolutions.

3. **Compressed textures (KTX2/Basis Universal)** — GPU-compressed formats (`ETC1S`, `UASTC`) can be uploaded at a fraction of the VRAM footprint. But: only useful for *static* textures loaded from files. Procedurally-generated `ImageBitmap` from a web worker cannot be compressed at runtime without significant additional work. **Not applicable to our procedural prewarm path.**

4. **`ImageBitmap` source** — Three.js uploads `ImageBitmap` faster than `HTMLImageElement` or `HTMLCanvasElement` because it doesn't need to do premultiplied-alpha conversion or color space transforms. Our worker already produces `ImageBitmap`, so we're already taking this win.

5. **Mipmap disable** — `texture.generateMipmaps = false` skips mipmap generation, which is a significant portion of upload time. Trade-off: lower quality at distance. For close-up surfaces (shelf boards) this matters; for floor carpet seen from above, probably fine.

6. **`texture.flipY = false`** — avoids a CPU-side flip operation before upload. Minor win. Works for textures generated with correct orientation (top-left origin, which ImageBitmap from canvas already is).

### Our specific situation
We're uploading five 2048×2048 ImageBitmap textures (wood diffuse+normal × 2, carpet, ceiling). The `upsertMaterial` path already uses `ImageBitmap` (good). Staggering via FrameBudgetScheduler is the right call. If per-frame hitches are still noticeable after staggering, consider reducing wood textures to 1024×1024 since they're primarily seen at shelf distance (~1–3m).

---

## Shader Compilation (`KHR_parallel_shader_compile`)

### The Problem
When a `THREE.Mesh` is first seen by `renderer.render()`, Three.js compiles the GLSL shader for that geometry/material/light combo synchronously. For instanced meshes with multiple light types, this can be 9+ programs, each taking 50–300ms. Total: 2000–3000ms freeze on the first render call that sees new geometry.

### `renderer.compileAsync()` (Three.js r153+)
- Pre-compiles shaders before the first render
- **Requires `KHR_parallel_shader_compile`** for non-blocking behavior
- Without it: same blocking work, just moved from render-time to compile-time. Three.js logs a warning.
- AMD R9 200 (and older AMD desktop GPUs generally): **does not support KHR_parallel_shader_compile**
- Modern Intel/AMD/Nvidia iGPU and dGPU in Chromium: usually supported

### Mitigation without KHR
Stagger `addToMainScene()` calls using `FrameBudgetScheduler`. Each mesh added triggers one shader compile on next render. Spreading 4 meshes across 4+ frames converts one 2900ms freeze into ~4 smaller hitches (~350ms each). Still not great but perceived as "progressive loading" rather than "app froze."

---

## `renderer.setAnimationLoop` vs `requestAnimationFrame`

Three.js's `setAnimationLoop` is the right place for the main render loop. It hooks into the WebXR device frame scheduler when in XR mode, which `requestAnimationFrame` does NOT. Any rAF loop that needs to run during XR sessions must be registered via `RenderLoopRegistry` (which `SceneManager.startRenderLoop` uses) or it will silently stop during XR.

---

## `InstancedMesh` + `material.needsUpdate`

When `upsertMaterial()` swaps map/normalMap on a material shared across all instances, the GPU re-uploads the texture for all instances on the next render. This is O(1) draw calls but O(texture_size) upload work. Cannot be avoided. Mitigations: smaller textures, stagger via scheduler.

---

## Double `PerformanceMonitor` classes

In this codebase: `src/ui/PerformanceMonitor.ts` (stats overlay) and `src/utils/PerformanceMonitor.ts` (frame timing / violation tracking) are two separate classes with the same name. They don't conflict at runtime (different import paths) but are confusing. The UI one should be renamed `PerformanceMonitorUI` or similar.

---

## `FrameBudgetScheduler` — Stagger vs. GPU Upload Timing

**Important:** `onFrameStart` fires *before* `renderer.render()`. Setting `material.needsUpdate = true` inside a scheduled task only schedules the GPU upload — the actual `texImage2D` call happens in the *next* `renderer.render()`. This means each upserted material causes a heavy render frame *after* the frame where the JS mutation runs.

**Consequence:** Staggering upserts to one per frame results in N consecutive heavy render frames (one per material), not one combined stall. This is still better than all-at-once, but each individual frame is still heavy.

**The real mitigation:** Reduce texture resolution. A 1024×1024 uploads ~4× faster than 2048×2048. For materials viewed at >1m distance, 1024 is visually equivalent.

**Quadrant-split idea (future):** In theory, splitting a 2048×2048 into four 1024×1024 quadrants and distributing across UV tiles could spread the upload cost across 4 frames and 4 render calls. Downsides: 4× draw calls per mesh using the material; complex UV seam management; probably not worth it unless textures are genuinely huge (4096+).

## Wall Texture Repeat Values

Room dimensions: 22m wide × 16m deep × 3.5m tall.
- `repeatX = 3, repeatY = 1` (old) → each tile spans ~7.3m horizontally — hugely stretched planks
- `repeatX = 12, repeatY = 1` (new) → each tile spans ~1.8m — reads as narrow wall boards
- `repeatY = 1` keeps planks running floor-to-ceiling without vertical distortion

The `woodGrainLinear` function is periodically seamless vertically (uses `Math.sin`) but uses noise horizontally — meaning visible seams at horizontal tile boundaries. At wall distance (~5–10m) this is typically not noticeable.



## Build-Time Texture Generation (Future Option)

Currently we generate procedural textures at runtime via web worker. This means:
- Flat-color fallback visible until worker resolves (~1-3s)
- Upload stall when textures arrive (mitigated by FrameBudgetScheduler stagger)
- Worker bundle overhead

**Better long-term:** Generate textures at build time (Vite plugin or standalone script), ship as static KTX2/Basis Universal files, load with KTX2Loader. Benefits:
- Zero runtime generation cost
- No fallback/pop-in
- GPU-compressed format = smaller upload, faster GPU sampling
- Can use higher quality offline generation (no web worker perf constraints)

**Compression in-flight (mid-term option):** basis_encoder.wasm runs in workers. Could compress ImageBitmap pixel data to ETC1S in the worker before returning, then upload via compressedTexImage2D. More work but eliminates the texImage2D stall entirely. Worth investigating once the worker pipeline is stable.

**External texture programs worth watching:** Substance Alchemist (Adobe), AwesomeBump, NormalMap-Online, Material Maker (open source, Godot-based). Could replace the procedural generator entirely for non-dynamic materials.
