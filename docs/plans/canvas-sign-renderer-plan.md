# Plan: CanvasSignRenderer — Migrate to ISignRenderer

## Goal
Wrap the existing canvas-based flat-sign rendering path in an `ISignRenderer` implementation,
making `SceneSignManager` renderer-agnostic and setting up the pattern for `NeonTubeSignRenderer`
and future sign types.

## Interface reference
`client/src/scene/signs/ISignRenderer.ts`

## What exists today
- `SignageRenderer` — creates canvas textures and `PlaneGeometry` meshes for signs.
  Lives at `client/src/scene/SignageRenderer.ts`.
- `SceneSignManager` — owns a single `SignageRenderer` instance and calls it directly.
  All sign creation and update logic is tightly coupled to it.

## What to build: `CanvasSignRenderer`

### File: `client/src/scene/signs/CanvasSignRenderer.ts`

Implement `ISignRenderer`. Internally wraps `SignageRenderer` (do not rewrite it — delegate).

```ts
export class CanvasSignRenderer implements ISignRenderer {
    private readonly renderer: SignageRenderer
    private readonly signs: Map<string, { mesh: THREE.Mesh; width: number; height: number }>

    setSign(request: SignRequest, scene: THREE.Scene): THREE.Object3D {
        // Use request.style for dimensions/colors, request.text for content
        // Recycle geometry on same-dimensions updates (same pattern as current SceneSignManager)
        // Apply request.facingY to mesh.rotation.y
    }

    removeSign(label: string, scene: THREE.Scene): boolean { ... }

    dispose(scene: THREE.Scene): void {
        // Remove all meshes from scene, dispose geometry+materials+textures
    }
}
```

### SignRequest mapping

| SignRequest field | Current SceneSignManager analog |
|------------------|---------------------------------|
| `request.label` | `descriptor.label` |
| `request.position` | `descriptor.anchorPosition` (after mount resolution) |
| `request.text` | `descriptor.text ?? descriptor.label` |
| `request.facingY` | `mount.signFacingY` |
| `request.style.color` | `style.backgroundColor` / `style.textColor` |
| `request.style.width` | `style.width` |
| `request.style.height` | `style.height` |

**Note:** Mount-style resolution (above-shelf offsets, ceiling vs wall) stays in `SceneSignManager` —
it computes the final world position and passes it to the renderer via `SignRequest.position`.
The renderer only cares about position, not how it was derived.

## Changes to SceneSignManager
- Add `CanvasSignRenderer` instance alongside existing `SignageRenderer`
- Replace direct `SignageRenderer` calls in `setSign()` with `this.canvasRenderer.setSign(request, this.scene)`
- Eventually remove the direct `SignageRenderer` field once fully migrated

## Tests
- Unit test: `client/src/scene/signs/CanvasSignRenderer.test.ts`
- Cover: create, update (same dims), update (different dims — geometry replacement), remove, dispose
- Use the same mock patterns as `SceneSignManager.test.ts` (mock `SignageRenderer`)

## Definition of done
- `CanvasSignRenderer` implements `ISignRenderer` and passes tests
- `SceneSignManager.setSign()` delegates to it instead of `SignageRenderer` directly
- No behavior change in existing sign tests
- `yarn validate` passes
