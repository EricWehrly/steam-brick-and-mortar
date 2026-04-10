import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as THREE from 'three'
import { EventManager } from '../../../../src/core/EventManager'
import { StorePropsEventTypes, type ShelfReadyEvent, type RendererReadyEvent } from '../../../../src/types/InteractionEvents'

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

    it('emits RendererReady after initialize() resolves', async () => {
        const renderer = new ShelfRenderer()
        let readyReceived: RendererReadyEvent | null = null

        eventManager.registerEventHandler(
            StorePropsEventTypes.RendererReady,
            (event: CustomEvent<RendererReadyEvent>) => {
                readyReceived = event.detail
            }
        )

        renderer.initialize()
        // Flush the microtask queue so the .then() in initialize() runs
        await Promise.resolve()

        expect(readyReceived).toBeTruthy()
        expect(readyReceived?.rendererType).toBe('shelf')
        expect(renderer.isReady()).toBe(true)
    })

    it('emits ShelfReady with correct transform payload from createShelf()', async () => {
        const renderer = new ShelfRenderer()
        renderer.initialize()
        await Promise.resolve()   // let initialize .then() settle

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
        renderer.initialize()
        await Promise.resolve()

        const resolved = await Promise.race([
            renderer.waitUntilReady().then(() => true),
            new Promise(r => setTimeout(() => r(false), 10))
        ])
        expect(resolved).toBe(true)
    })

    it('does not emit ShelfReady if called before ready', async () => {
        // isReady() returns true from mock, so test the guard log path by
        // temporarily making mock return false — simplest: spy on isReady
        const renderer = new ShelfRenderer()
        // Don't call initialize() — _isReady stays false.
        // But mock always returns true from instancedShelfRenderer.isReady(),
        // so override via the public accessor:
        vi.spyOn(renderer, 'isReady').mockReturnValue(false)

        const received: ShelfReadyEvent[] = []
        eventManager.registerEventHandler(
            StorePropsEventTypes.ShelfReady,
            (event: CustomEvent<ShelfReadyEvent>) => received.push(event.detail)
        )

        renderer.createShelf(0, new THREE.Vector3(), 0)
        expect(received).toHaveLength(0)
    })
})
