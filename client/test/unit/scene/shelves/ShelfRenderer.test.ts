import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as THREE from 'three'
import { EventManager } from '../../../../src/core/EventManager'
import {
    StorePropsEventTypes,
    type ShelfReadyEvent,
    type ShelfPlacementReadyEvent,
} from '../../../../src/types/InteractionEvents'

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

const makePlacementEvent = (shelfId: number, overrides?: Partial<ShelfPlacementReadyEvent>): ShelfPlacementReadyEvent => ({
    shelfId,
    totalShelves: 10,
    position: new THREE.Vector3(1, 0, -5),
    rotationY: Math.PI,
    rowIndex: 0,
    shelfIndex: shelfId,
    ...overrides,
})

describe('ShelfRenderer', () => {
    let eventManager: EventManager

    beforeEach(() => {
        eventManager = EventManager.getInstance()
        eventManager.removeAllListeners()
    })

    it('initialize() delegates to InstancedShelfRenderer', async () => {
        const renderer = new ShelfRenderer()
        await expect(renderer.initialize()).resolves.toBeUndefined()
    })

    it('isReady() delegates to InstancedShelfRenderer', () => {
        const renderer = new ShelfRenderer()
        expect(renderer.isReady()).toBe(true)
    })

    it('emits ShelfReady with correct payload when ShelfPlacementReady fires', () => {
        const renderer = new ShelfRenderer()
        void renderer.initialize()

        const position = new THREE.Vector3(3, 0, -8)
        let received: ShelfReadyEvent | null = null
        eventManager.registerEventHandler(
            StorePropsEventTypes.ShelfReady,
            (event: CustomEvent<ShelfReadyEvent>) => { received = event.detail }
        )

        eventManager.emit<ShelfPlacementReadyEvent>(
            StorePropsEventTypes.ShelfPlacementReady,
            makePlacementEvent(4, { position, rotationY: Math.PI / 2 })
        )

        expect(received).toBeTruthy()
        expect(received?.shelfId).toBe(4)
        expect(received?.rotationY).toBeCloseTo(Math.PI / 2)
        expect(received?.position).toEqual(position)
        expect(received?.position).not.toBe(position) // must be cloned
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
