# Plan: ProceduralTextureWorker → ManagedWorker refactor (foundation for NeonTubeSignRenderer)

## Goal
Establish a `ManagedWorker` pattern that can build geometry data off-thread and post results back,
using `ProceduralTextureWorker` as the existing precedent to refactor from.

This unlocks `NeonTubeSignRenderer` running TubeGeometry construction in a worker instead of
the current `requestIdleCallback/setTimeout` ladder.

## Background: what ManagedWorker does today
`client/src/utils/ManagedWorker.ts` — wraps a Worker with:
- Promise-based request/response (`sendRequest`)
- Error handling and anonymous store
- Lifecycle management (terminate, etc.)

`ProceduralTextureWorker` uses it to dispatch texture generation messages and receive
`ImageBitmap` payloads back.

## What we need: geometry data transfer

Worker message types needed:
```ts
// Request: sent from main thread to worker
interface NeonGeometryRequest {
    kind: 'neon-geometry'
    text: string
    fontSize: number   // e.g. 0.3
    tubeRadius: number // e.g. 0.015
    segments: number   // path interpolation count, e.g. 12
    requestId: string
}

// Response: sent from worker back to main thread
interface NeonGeometryResponse {
    kind: 'neon-geometry'
    requestId: string
    // Transferable typed arrays for each tube path
    // Each tube: a flat Float32Array of [x,y,z, x,y,z, ...] vertex positions
    tubes: Float32Array[]
}
```

Worker-side uses `FontLoader` to rasterize text, computes tube paths,
and posts back the raw vertex arrays as Transferables (zero-copy).

Main thread receives the arrays, reconstructs `THREE.BufferGeometry` per tube,
builds `TubeGeometry` instances, and adds meshes to the group.

## How ProceduralTextureWorker is the precedent

`ProceduralTextureWorker`:
1. Sends a message with pattern type + params
2. Worker generates `ImageBitmap` (Transferable)
3. Worker posts `{ type, bitmap }` back
4. Main thread receives and sets `material.map = bitmap`

`NeonTubeSignRenderer` follows the same shape:
1. Sends `NeonGeometryRequest` with text + font params
2. Worker loads font, builds paths, packs vertex data into `Float32Array[]`
3. Worker posts `NeonGeometryResponse` with Transferables
4. Main thread builds THREE geometry from the arrays

## Files to touch

### New: `client/src/utils/workers/neon-geometry.worker.ts`
Worker entry point. Handles `NeonGeometryRequest`, loads font via `fetch`,
builds tube vertex data, posts `NeonGeometryResponse`.

### New: `client/src/scene/signs/NeonGeometryWorker.ts`
Typed wrapper around `ManagedWorker`. Exposes:
```ts
class NeonGeometryWorker {
    buildTubes(text: string, config: NeonGeometryConfig): Promise<Float32Array[]>
}
```

### New: `client/src/scene/signs/NeonTubeSignRenderer.ts`
Implements `ISignRenderer`. Uses `NeonGeometryWorker` to build geometry.
Replaces the inline `requestIdleCallback` ladder in current `NeonTubeSign.ts`.

### Keep: `NeonTubeSign.ts`
Existing class stays as-is (labeled `TD: neon-worker-migration`) until
`NeonTubeSignRenderer` is complete, then it gets deleted.

## Font loading in worker
Workers can `fetch()` but not use `FontLoader` directly (Three.js assumes DOM).
Options:
1. Pass font data as a raw JSON param in the request (large but simple)
2. `fetch('/fonts/helvetiker_bold.typeface.json')` inside the worker and cache it

Option 2 preferred — worker fetches once and caches in module scope.

## Tests
- Unit: `NeonGeometryWorker.test.ts` — mock the worker, verify request/response shape
- Unit: `NeonTubeSignRenderer.test.ts` — mock `NeonGeometryWorker`, verify:
  - meshes added to scene after geometry resolves
  - dispose cleans up all geometry/materials
  - `PointLightRequested` emitted after build completes

## Definition of done
- `NeonGeometryWorker` wraps `ManagedWorker`, geometry transfer working
- `NeonTubeSignRenderer` implements `ISignRenderer`, uses worker, passes tests
- No `requestIdleCallback` or `setTimeout` in production sign code
- `yarn validate` passes
- `NeonTubeSign.ts` removed (or clearly flagged for next PR)
