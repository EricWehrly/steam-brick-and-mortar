import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as THREE from 'three'
import { EventManager } from '../../../../src/core/EventManager'
import { StorePropsEventTypes, type ShelfReadyEvent } from '../../../../src/types/InteractionEvents'

// Mock InstancedShelfRenderer before importing ShelfRenderer so the constructor
// doesn't attempt real GPU allocation.
vi.mock('../../../../src/scene/instancing/InstancedShelfRenderer', () => ({
    InstancedShelfRenderer: class {
        initialize() { return Promise.resolve() }
        setInstance() { return true }
        reset() {}
        isReady() { return true }
        getStats() { return {} }
        dispose() {}
    }
}))

import { ShelfRenderer } from '../../../../src/scene/shelves/ShelfRenderer'

describe('ShelfRenderer', () => {
    let eventManager: EventManager

    beforeEach(() => {
        eventManager = EventManager.getInstance()
        eventManager.removeAllListeners()
    })

    it('initialize() resolves via InstancedShelfRenderer', async () => {
        const renderer = new ShelfRenderer()
        // Should not throw; InstancedShelfRenderer.initialize() handles RendererReady
        await expect(renderer.initialize()).resolves.toBeUndefined()
    })

    it('isReady() delegates to InstancedShelfRenderer', () => {
        const renderer = new ShelfRenderer()
        // Mock always returns true from instancedShelfRenderer.isReady()
        expect(renderer.isReady()).toBe(true)
    })

    it('emits ShelfReady with correct transform payload from createShelf()', () => {
        const renderer = new ShelfRenderer()
        const position = new THREE.Vector3(1, 2, 3)
        let received: ShelfReadyEvent | null = null

        eventManager.registerEventHandler(
            StorePropsEventTypes.ShelfReady,
            (event: CustomEvent<ShelfReadyEvent>) => {
                received = event.detail
            }
        )

        renderer.createShelf(7, position, Math.PI)

        expect(received).toBeTruthy()
        expect(received?.shelfId).toBe(7)
        expect(received?.rotationY).toBe(Math.PI)
        // Position should be cloned, not same reference
        expect(received?.position).toEqual(position)
        expect(received?.position).not.toBe(position)
    })

    it('waitUntilReady resolves immediately when already ready', async () => {
        const renderer = new ShelfRenderer()
        const resolved = await Promise.race([
            renderer.waitUntilReady().then(() => true),
            new Promise(r => setTimeout(() => r(false), 50))
        ])
        expect(resolved).toBe(true)
    })
})
