/**
 * Test helper: constructs the store props subsystems directly (no StorePropsCoordinator,
 * which requires GPU capabilities unavailable in test environments).
 *
 * Replaces the old pattern of `new GpuStorePropsRenderer(scene)` + `setupProps()` in
 * integration tests. Returns a dispose function for teardown.
 */

import * as THREE from 'three'
import { BatchCoordinator } from '../../src/scene/batch/BatchCoordinator'
import { GameBoxSpawner } from '../../src/scene/spawning/GameBoxSpawner'
import { ShelfLayoutCoordinator } from '../../src/scene/shelves/ShelfLayoutCoordinator'
import { InstancedShelfRenderer } from '../../src/scene/instancing/InstancedShelfRenderer'

export interface StorePropsTestHarness {
    batchCoordinator: BatchCoordinator<unknown>
    gameBoxSpawner: GameBoxSpawner
    shelfLayoutCoordinator: ShelfLayoutCoordinator
    instancedShelfRenderer: InstancedShelfRenderer
    propsGroup: THREE.Group
    dispose(): void
}

export function createStorePropsTestHarness(scene: THREE.Scene): StorePropsTestHarness {
    const batchCoordinator = new (BatchCoordinator as any)()
    const gameBoxSpawner = new (GameBoxSpawner as any)()
    const shelfLayoutCoordinator = ShelfLayoutCoordinator.getInstance()
    const instancedShelfRenderer = new InstancedShelfRenderer()

    const propsGroup = new THREE.Group()
    propsGroup.name = 'props-instanced'
    scene.add(propsGroup)

    // Initialize shelf renderer (mirrors what StorePropsCoordinator.handleSetupRequest does)
    instancedShelfRenderer.initialize().catch(() => {
        // Expected to fail in test environment (no GPU) — that's fine
    })

    return {
        batchCoordinator,
        gameBoxSpawner,
        shelfLayoutCoordinator,
        instancedShelfRenderer,
        propsGroup,
        dispose() {
            // Event-coordinator instances (batchCoordinator, gameBoxSpawner) are test-scoped
            // and simply go out of scope — their handlers die with them.
            // Only GPU resources need explicit teardown.
            instancedShelfRenderer.dispose()
            scene.remove(propsGroup)
        }
    }
}
