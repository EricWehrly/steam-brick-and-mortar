# Memory Optimization Plan: Texture Array Right-Sizing

**Status**: ✅ Completed  
**Created**: 2025-04-02  
**Completed**: 2026-04-02  
**Branch**: 6.1.x  

---

## Results

### Measured vs Estimated Savings

| Metric | Estimate | Measured |
|---|---|---|
| Label array (JS heap) | ~927 MB | — |
| Label array (GPU) | ~927 MB | — |
| Combined savings | ~1.8 GB | **~3 GB GPU RAM** (Firefox task manager) |

The measured savings exceeded estimates by roughly 1.2 GB. The gap likely reflects:

- **GPU driver overhead**: Alignment padding, metadata, command buffer state — our estimates count only raw RGBA bytes
- **WebGL context overhead**: Three.js may create internal staging copies during `needsUpdate` cycles, temporarily doubling memory during upload
- **DataArrayTexture specifics**: Large array textures may require driver-side duplication for mip generation or format conversion even when mipmaps are disabled

This confirms that our "estimated" labels in `logMemoryStats()` are structurally correct but will always underreport actual GPU impact. The real cost is the raw allocation plus driver multiplier.

---

## Problem Statement (original)

With 826 games, the app allocated several gigabytes of memory across JS heap and GPU VRAM. The root causes were pre-allocated `DataArrayTexture` objects holding massive `Uint8Array` backing buffers on the JS heap AND uploading to the GPU — paying for the memory twice.

### Original Memory Breakdown (826 games, maxGames ≈ 946)

| Allocation | Dimensions | JS Heap (est.) | GPU VRAM (est.) | Notes |
|---|---|---|---|---|
| **Label texture array** | 512×512×946×4 | **~927 MB** | **~927 MB** | Fallback text boxes. 512² is huge for text. |
| MID texture array | 180×270×946 | ~175 MB | ~175 MB | Confirmed by startup logs |
| HIGH texture array | 300×450×160 | ~82 MB | ~82 MB | LRU cache — appropriately sized |
| InstancedMesh buffers | matrices + attrs | ~5 MB | ~5 MB | Negligible |
| **Totals** | | **~1,189 MB** | **~1,189 MB** | **~2.38 GB combined (est.)** |

The label array alone was 78% of total tracked memory.

---

## Completed Work

### ✅ Feature 1: Deferred Right-Sized Label System (Stories 1.1–1.3)

**Before**: `addLabelInstance()` lazily allocated `512×512×946 Uint8Array` on first artwork failure (~927 MB).

**After**:
1. **Story 1.1** — `deferLabels` flag + `pendingLabels` buffer. Label requests are buffered with no allocation.
2. **Story 1.2** — `materializeLabels()` in `InstancedLabelRenderer`. After `AllBatchesComplete`, creates the texture array at exact count (`pendingLabels.length + 32` overflow slots). Wired internally via `EventManager` inside `InstancedLabelRenderer` (not from the orchestrating class).
3. **Story 1.3** — Default texture size changed `512 → 128`. 128×128 is legible at VR distances and is a 16× reduction per slot.

**Memory impact**: 512×512×946 = 927 MB → 128×128×~150 = ~9 MB

### ✅ Memory Instrumentation

- `LabelTextureArrayManager.initializeEmptyTextureArray()` registers MB with `DataManager.addMemoryConsumption()`
- `LodArtworkOrchestratorDebug.logMemoryStats()` reports all registered consumers in one flat section with `(est.)` markers
- All tracked values are marked as estimates — actual GPU usage is higher due to driver overhead
- JS Heap from `window.performance.memory` (Chrome/Edge only) is real, not estimated

### 🔮 Deferred: Story 1.4 — PBR Label Boxes (no memory benefit)

Two synchronized `InstancedMesh`es — `MeshStandardMaterial` box body + transparent text plane overlay. Gives physically-lit fallback boxes matching the LOD artwork path. No memory win; purely a rendering quality improvement. See the original plan sections below for implementation notes.

### 🔮 Deferred: Feature 2 — MID Array Right-Sizing (~40 MB additional)

After all batches complete, compact the MID tier from estimated depth (~946) to actual game count (~726). Saves ~40 MB heap + GPU. Lower priority now that the label fix delivered the major savings. See original plan sections below.

---

## Future: Deterministic Memory Testing

Our current estimates are always theoretical (raw bytes from dimensions). The measured savings (~3 GB) exceeding estimates (~1.8 GB) highlights that we're not really measuring — we're calculating.

### Stepwise Feature Profiling

The most deterministic approach: load the page with every memory-allocating feature disabled, snapshot baseline memory, then enable features one at a time and measure the diff.

**Concept**:
```
1. Load page — all texture allocation disabled (or feature flags off)
   → snapshot memory (Firefox DevTools, Task Manager process row, or performance.memory)
   
2. Enable LOD MID tier allocation
   → snapshot → diff = MID tier true cost (raw + driver overhead)
   
3. Enable LOD HIGH tier (LRU cache)
   → snapshot → diff = HIGH tier true cost

4. Enable label renderer (trigger a load)
   → snapshot → diff = label texture array true cost

5. Enable instanced mesh geometry
   → snapshot → diff = geometry buffer cost
```

**Why this is more accurate than calculations**:
- Captures driver overhead that raw byte math can't predict
- Captures Three.js internal copies (staging buffers, mip scratch space)
- Gives per-feature budget numbers that are reproducible across hardware

**Implementation sketch**:
- Add a `MemoryBenchmarkMode` flag (URL param or AppSettings)
- When active: initialize the app in a "stripped" state with all major allocations behind feature flags
- Console command `memorySnapshot()` prints current Firefox/Chrome process memory (or prompts user to check task manager)
- Console command `enableFeature('mid-tier')` enables one feature and triggers its allocation
- A `memoryBenchmark()` sequence could walk through features automatically with `setTimeout` pauses, printing before/after at each step

**Limitations to be aware of**:
- `performance.memory` (Chrome/Edge only) measures JS heap, not GPU VRAM — need task manager or DevTools Memory tab for GPU
- Firefox GPU process is shared across tabs — close other tabs before measuring
- GC timing can skew heap readings — trigger GC manually in DevTools before snapshotting
- Driver behavior varies across GPUs — benchmark on representative hardware

---

## Original Plan Sections (preserved for reference)

### Story 1.4: Default Box Color for Label Games (Deferred)

**Files**: `InstancedLabelRenderer.ts`, `instanced-label.frag`, `instanced-label.vert`

Two synchronized `InstancedMesh`es — one `MeshStandardMaterial` box body (flat color, full PBR lighting) and one `PlaneGeometry` with a text-only transparent texture overlaid on the front face.

**Why it won't save memory**: A transparent background pixel is `(0,0,0,0)` — same 4 bytes as the current dark background. Savings come from right-sizing (Stories 1.1–1.3).

**What it does buy**: Lighting parity between textured game boxes and label fallback boxes.

**Gotchas**: Z-fighting (fix with `polygonOffset`), synchronized instance indices, `DoubleSide` for back face.

---

### Feature 2: MID Texture Array Right-Sizing

**Goal**: After all batches, rebuild MID array from estimated depth (~946) to actual game count.

#### Story 2.1: MID Array Compaction in LodTextureArrayManager
1. Add `compactTier(tierName: string): boolean`
2. Creates new `DataArrayTexture` with `depth = nextSlotIndex`
3. Copies pixel data via `Uint8Array.set` for used portion
4. Disposes old texture, replaces reference
5. Updates memory registration

#### Story 2.2: Wire Compaction to AllBatchesComplete
1. Call `textureManager.compactTier('mid')` after all batches
2. Pass new texture reference to renderer shader uniform
3. Log savings

**Memory impact**: 180×270×946 = ~175 MB → 180×270×726 = ~135 MB (**~40 MB savings**)
