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

## `FrameBudgetScheduler` — Tuning Notes

- Default `maxDeferMs: 400` — forces tasks after 400ms regardless of frame budget. For material upserts, this is too aggressive during heavy startup. Consider `maxDeferMs: Infinity` (or a very large value like 30000) for non-critical visual upgrades.
- `maxTasksPerFrame: 1` — already set conservatively. Good.
- The scheduler only processes tasks at `onFrameStart()`. If `RenderLoopRegistry` calls `onFrameStart` every frame, tasks will process once per frame at most.
- **No breathing room between forced tasks** — if a heavy frame occurs, the scheduler doesn't back off. A "cooldown" counter (skip N frames after a force or after a heavy frame) would help here.
