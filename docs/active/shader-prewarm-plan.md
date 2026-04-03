# Shader Pre-warming Plan

## Problem

The instanced shelf meshes (4 InstancedMesh objects) are added to the main scene during the first
batch placement. On their first render, Three.js compiles all 9 shader programs synchronously
in one `renderer.render()` call — a ~2900ms freeze on the test machine (Radeon R9 200).

From the shader compile log:

```
21:49:54.809  ➕ InstancedShelf-* added to main scene  (4 separate lines, ~14ms gap)
21:49:54.823  🔧 [ShaderCompile] Program #13: STANDARD | MAP
21:49:54.???  🔧 [ShaderCompile] Program #14-21 ...     (9 programs total)
21:49:57.729  🐌 Slow frame: renderer.render() took 2908.0ms
```

Programs #13-21 all fire **inside** the same `renderer.render()` call — confirmed because the
`console.debug` timestamps are sequential within the duration reported by the slow-frame warning.

---

## Proposed Fix: `renderer.compileAsync()` Pre-warm

Three.js r153+ exposes `renderer.compileAsync(scene, camera)`. When the
`KHR_parallel_shader_compile` WebGL extension is present, it offloads shader linking to the
driver's background thread and resolves non-blockingly.

### Implementation

In `InstancedShelfRenderer.initialize()`, after meshes are constructed but before
`addToMainScene()` is ever called:

```typescript
// In InstancedShelfRenderer.initialize(), after mesh construction:
const renderer = DataManager.getInstance().get(DataKey.Renderer) as THREE.WebGLRenderer
const camera  = DataManager.getInstance().get(DataKey.MainCamera) as THREE.Camera

const prewarmScene = new THREE.Scene()
prewarmScene.add(this.angledBoardManager.getInstancedMesh())
prewarmScene.add(this.sideBoardManager.getInstancedMesh())
prewarmScene.add(this.shelfBoardManager.getInstancedMesh())
prewarmScene.add(this.interiorSurfaceManager.getInstancedMesh())

await renderer.compileAsync(prewarmScene, camera)
// meshes are NOT in the main scene yet — no visual artifact
```

When `setShelfUnit()` later calls `addToMainScene()`, the GPU programs are already linked.
First render = 0ms compile cost.

### Caveat: `KHR_parallel_shader_compile`

Without this extension (older GPUs, some mobile drivers, certain macOS configurations),
`compileAsync()` still resolves — but only **after** completing synchronous linkage on the main
thread. The call still blocks; it just doesn't throw. Net result: the freeze moves from
"first render" to "during initialize()", which may actually be better (hides behind the existing
async init delay) but doesn't eliminate the work.

**Detection:**
```typescript
const gl = renderer.getContext()
const hasParallelCompile = !!gl.getExtension('KHR_parallel_shader_compile')
```

**Fallback path (if KHR absent):** Use `FrameBudgetScheduler` to stagger the 4
`addToMainScene()` calls across separate frames. This converts the single 2900ms freeze into
~4 smaller hitches (~350ms each given ~9 programs across 4 meshes). Same total GPU work,
dramatically better perceived smoothness.

---

## Prerequisites

1. **Update Three.js** — currently at `^0.170.0`, which already has `compileAsync`.
   Run `yarn upgrade three` to pull latest patch. Check for any breaking changes in
   `InstancedMesh` / `WebGLRenderer` API.

2. **Update related packages** — `@types/three` should track the same version.

3. **Expose `getInstancedMesh()`** on `InstancedMeshManager` (or equivalent accessor) so
   `InstancedShelfRenderer` can add them to the prewarm scene without triggering `addToMainScene`.

---

## Steps

1. `yarn upgrade three @types/three` — verify no regressions (run unit tests + visual check)
2. Add `KHR_parallel_shader_compile` detection helper to `SystemCapabilities.ts`
3. Implement `renderer.compileAsync()` pre-warm in `InstancedShelfRenderer.initialize()`
4. Implement staggered-add fallback (gated on `!hasParallelCompile`) via `FrameBudgetScheduler`
5. Run app — confirm 2900ms slow-frame warning is gone from `ThreeWebGLRendererDebug` output
6. Test on a second machine / integrated GPU to exercise the fallback path

---

## Related

- `docs/active/startup-optimization-roadmap.md` — broader startup perf context
- `client/src/debug/ThreeWebGLRendererDebug.ts` — shader compile logging (proves the fix works)
- `client/src/scene/instancing/InstancedShelfRenderer.ts` — implementation site
- `client/src/utils/SystemCapabilities.ts` — add `hasParallelShaderCompile()` here
