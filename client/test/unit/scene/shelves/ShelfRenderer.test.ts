import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as THREE from 'three'
import { EventManager } from '../../../../src/core/EventManager'
import {
    StorePropsEventTypes,
    type ShelfReadyEvent,
    type ShelfSpaceRequestedEvent,
} from '../../../../src/types/InteractionEvents'
import type { ShelfPlacement } from '../../../../src/scene/shelves/ShelfRenderer'

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

const makeLayout = (overrides?: Partial<ShelfPlacement>): ShelfPlacement => ({
    position: new THREE.Vector3(1, 0, -5),
    rotationY: Math.PI,
    rowIndex: 0,
    shelfIndex: 0,
    ...overrides,
})

describe('ShelfRenderer', () => {
    let eventManager: EventManager

    beforeEach(() => {
        eventManager = EventManager.getInstance()
        eventManager.removeAllListeners()
    })

    it('initialize() delegates to InstancedShelfRenderer', async () => {
        const renderer = new ShelfRenderer(() => makeLayout())
        await expect(renderer.initialize()).resolves.toBeUndefined()
    })

    it('isReady() delegates to InstancedShelfRenderer', () => {
        const renderer = new ShelfRenderer(() => makeLayout())
        expect(renderer.isReady()).toBe(true)
    })

    it('emits ShelfReady with correct payload when ShelfSpaceRequested fires', () => {
        const position = new THREE.Vector3(3, 0, -8)
        const renderer = new ShelfRenderer(() => makeLayout({ position, rotationY: Math.PI / 2 }))
        void renderer.initialize()

        let received: ShelfReadyEvent | null = null
        eventManager.registerEventHandler(
            StorePropsEventTypes.ShelfReady,
            (event: CustomEvent<ShelfReadyEvent>) => { received = event.detail }
        )

        eventManager.emit<ShelfSpaceRequestedEvent>(StorePropsEventTypes.ShelfSpaceRequested, {
            batchIndex: 4,
            gamesCount: 18,
        })

        expect(received).toBeTruthy()
        expect(received?.shelfId).toBe(4)
        expect(received?.rotationY).toBeCloseTo(Math.PI / 2)
        expect(received?.position).toEqual(position)
        expect(received?.position).not.toBe(position) // must be cloned
    })

    it('skips emit when layout provider returns undefined', () => {
        const renderer = new ShelfRenderer(() => undefined)
        void renderer.initialize()

        const received: ShelfReadyEvent[] = []
        eventManager.registerEventHandler(
            StorePropsEventTypes.ShelfReady,
            (event: CustomEvent<ShelfReadyEvent>) => received.push(event.detail)
        )

        eventManager.emit<ShelfSpaceRequestedEvent>(StorePropsEventTypes.ShelfSpaceRequested, {
            batchIndex: 0,
            gamesCount: 5,
        })

        expect(received).toHaveLength(0)
    })

    it('waitUntilReady resolves immediately when already ready', async () => {
        const renderer = new ShelfRenderer(() => makeLayout())
        const resolved = await Promise.race([
            renderer.waitUntilReady().then(() => true),
            new Promise(r => setTimeout(() => r(false), 50))
        ])
        expect(resolved).toBe(true)
    })
})
