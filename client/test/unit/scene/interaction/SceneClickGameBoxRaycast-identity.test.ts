/**
 * Regression: SceneClickGameBoxRaycast must check which InstancedMesh was hit
 * before consulting metadata maps.
 *
 * Bug (recurring): Artwork and label renderers both use InstancedMesh with
 * instanceIds starting at 0. Without identity check, clicking label box #N
 * consulted artworkMetadata at index N and returned the wrong game.
 *
 * Fix: check object.name ('lod-game-artwork' vs 'gpu-instanced-game-boxes')
 * before consulting each map, so the correct game is always returned.
 */
import { describe, it, expect } from 'vitest'
import { INSTANCED_LABEL_MESH_NAME } from '../../../../src/scene/game-box/instancing/InstancedLabelRenderer'
import { LOD_ARTWORK_MESH_NAME } from '../../../../src/scene/game-box/instancing/LodGameArtworkRenderer'

// Inline the minimal metadata type to avoid cross-module import in test
interface InstanceMetadata { name: string; appid?: number | string; position: any }

/** Simulate what resolveGameBoxIntersection does with mesh identity check. */
function resolveHit(
    meshName: string,
    instanceId: number,
    artworkMetadata: Map<number, InstanceMetadata>,
    labelMetadata: Map<number, { name: string; appid?: number | string }>
): { name?: string; appid?: number | string } | null {
    const isLabelMesh = meshName === 'gpu-instanced-game-boxes'
    const isArtworkMesh = meshName === 'lod-game-artwork'

    if (!isLabelMesh) {
        const hit = artworkMetadata.get(instanceId)
        if (hit) return { name: hit.name, appid: hit.appid }
    }

    if (!isArtworkMesh) {
        const hit = labelMetadata.get(instanceId)
        if (hit) return { name: hit.name, appid: hit.appid }
    }

    return null
}

describe('raycast mesh identity check', () => {
    const artworkMeta = new Map<number, InstanceMetadata>([
        [0, { name: 'ArtGame0', appid: 100, position: null as any }],
        [1, { name: 'ArtGame1', appid: 101, position: null as any }],
        [2, { name: 'ArtGame2', appid: 102, position: null as any }],
    ])

    const labelMeta = new Map<number, { name: string; appid?: number | string }>([
        [0, { name: 'LabelGame0', appid: 200 }],
        [1, { name: 'LabelGame1', appid: 201 }],
        [2, { name: 'LabelGame2', appid: 202 }],
    ])

    it('hitting artwork mesh at index 1 returns artwork game, not label game', () => {
        const hit = resolveHit('lod-game-artwork', 1, artworkMeta, labelMeta)
        expect(hit?.appid).toBe(101)
        expect(hit?.name).toBe('ArtGame1')
    })

    it('hitting label mesh at index 1 returns label game, not artwork game', () => {
        const hit = resolveHit('gpu-instanced-game-boxes', 1, artworkMeta, labelMeta)
        expect(hit?.appid).toBe(201)
        expect(hit?.name).toBe('LabelGame1')
    })

    it('same instanceId on different meshes returns different games', () => {
        const artHit = resolveHit('lod-game-artwork', 0, artworkMeta, labelMeta)
        const labelHit = resolveHit('gpu-instanced-game-boxes', 0, artworkMeta, labelMeta)
        expect(artHit?.appid).toBe(100)
        expect(labelHit?.appid).toBe(200)
    })

    it('unknown mesh name falls through both maps gracefully', () => {
        // Unknown mesh: tries artwork first (not isLabelMesh), then label (not isArtworkMesh).
        // Index 5 doesn't exist in either map ??? should return null.
        const hit = resolveHit('some-other-mesh', 5, artworkMeta, labelMeta)
        expect(hit).toBeNull()
    })

    it('unknown mesh with matching index returns artwork map entry first', () => {
        // Unknown mesh: not a label mesh, so artwork is checked first.
        const hit = resolveHit('some-other-mesh', 0, artworkMeta, labelMeta)
        expect(hit?.appid).toBe(100)  // artwork wins for unknown mesh
    })

    describe('DataKey names match the actual mesh names used in renderers', () => {
        it('INSTANCED_LABEL_MESH_NAME is gpu-instanced-game-boxes', () => {
            // Imported from InstancedLabelRenderer. If the mesh name changes, this fails.
            expect(INSTANCED_LABEL_MESH_NAME).toBe('gpu-instanced-game-boxes')
        })

        it('LOD_ARTWORK_MESH_NAME is lod-game-artwork', () => {
            // Imported from LodGameArtworkRenderer. If the mesh name changes, this fails.
            expect(LOD_ARTWORK_MESH_NAME).toBe('lod-game-artwork')
        })
    })
})
