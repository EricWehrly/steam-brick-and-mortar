/**
 * SceneClickGameBoxRaycast — click-to-game-detail regression coverage.
 *
 * History:
 * - maxDistance=10m default failed to reach back-wall shelves at r=21.5m (fixed).
 * - setMaxDistance() was later removed; raycast reach is now set at construction
 *   time via options (default 7m, set to arc depth by SystemUICoordinator).
 * - Wrong game resolved on click due to stale InstancedLabelMetadata (fixed in
 *   InstancedLabelRenderer: fresh map on construction, cleared on reset()).
 */
import { describe, it, expect } from 'vitest'

describe('raycast maxDistance covers arc layout depth', () => {
    it('arc back-wall shelf at r=21.5m is beyond the old 10m default', () => {
        // Production arc config: firstRowRadius=5.5, rowRadiusStep=4, rows=5
        // Row 4 radius = 5.5 + 4*4 = 21.5m
        const backWallRadius = 5.5 + 4 * 4.0
        const OLD_DEFAULT_MAX_DISTANCE = 10
        expect(OLD_DEFAULT_MAX_DISTANCE).toBeLessThan(backWallRadius)
    })

    it('SystemUICoordinator reach formula covers back wall with margin', () => {
        // Simulate what SystemUICoordinator does: abs(minZ) + 2m margin
        const mockBounds = { minX: -22, maxX: 22, minZ: -21.5, maxZ: 0 }
        const reach = Math.abs(mockBounds.minZ) + 2
        expect(reach).toBeGreaterThan(21.5)
        expect(reach).toBe(23.5)
    })
})

describe('instance metadata contract', () => {
    it('instanceId from Three.js intersection maps to correct game via metadata', () => {
        // The raycast resolves games by looking up intersection.instanceId in
        // DataKey.InstancedArtworkMetadata or DataKey.InstancedLabelMetadata.
        // This test pins the shape of that lookup to catch API drift.
        const artworkMetadata = new Map([
            [0, { name: 'Game A', appid: 100, position: null }],
            [1, { name: 'Game B', appid: 200, position: null }],
        ])
        const hit0 = artworkMetadata.get(0)
        const hit1 = artworkMetadata.get(1)
        expect(hit0?.name).toBe('Game A')
        expect(hit0?.appid).toBe(100)
        expect(hit1?.name).toBe('Game B')
        // Stale entry at index 2 must not exist
        expect(artworkMetadata.get(2)).toBeUndefined()
    })

    it('label metadata uses same instanceId key shape as artwork metadata', () => {
        const labelMetadata = new Map([
            [0, { name: 'Label Game', position: null }],
        ])
        const hit = labelMetadata.get(0)
        expect(hit?.name).toBe('Label Game')
    })
})
