/**
 * Unit tests for InstancedShelfRenderer event behavior.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as THREE from 'three'
import { InstancedShelfRenderer } from '../../../../src/scene/instancing/InstancedShelfRenderer'
import { EventManager } from '../../../../src/core/EventManager'
import { StorePropsEventTypes, type ShelfReadyEvent } from '../../../../src/types/InteractionEvents'

describe('InstancedShelfRenderer Events', () => {
    let renderer: InstancedShelfRenderer
    let eventManager: EventManager

    beforeEach(() => {
        eventManager = EventManager.getInstance()
        renderer = new InstancedShelfRenderer({
            maxShelfUnits: 10
        })
    })

    afterEach(() => {
        renderer?.dispose()
    })

    it('supports initialize() promise and readiness state', async () => {
        expect(renderer.isReady()).toBe(false)
        await renderer.initialize()
        expect(renderer.isReady()).toBe(true)
    })

    describe('Idempotent shelf updates via ShelfReady', () => {
        it('does not increase instance count when same shelfId is received twice', async () => {
            await renderer.initialize()
            const pos = new THREE.Vector3(5, 0, -10)
            const event: ShelfReadyEvent = { batchIndex: 0, position: pos, rotationY: 0 }

            eventManager.emit<ShelfReadyEvent>(StorePropsEventTypes.ShelfReady, event)
            const statsAfterFirst = renderer.getStats().shelfUnits

            // Send the same batchIndex again with updated position
            const event2: ShelfReadyEvent = { batchIndex: 0, position: new THREE.Vector3(6, 0, -11), rotationY: Math.PI }
            eventManager.emit<ShelfReadyEvent>(StorePropsEventTypes.ShelfReady, event2)
            const statsAfterSecond = renderer.getStats().shelfUnits

            expect(statsAfterFirst).toBe(1)
            expect(statsAfterSecond).toBe(1) // must not increase
        })

        it('accepts a second distinct batchIndex as a new unit', async () => {
            await renderer.initialize()
            eventManager.emit<ShelfReadyEvent>(StorePropsEventTypes.ShelfReady, {
                batchIndex: 0, position: new THREE.Vector3(0, 0, -5), rotationY: 0
            })
            eventManager.emit<ShelfReadyEvent>(StorePropsEventTypes.ShelfReady, {
                batchIndex: 1, position: new THREE.Vector3(5, 0, -5), rotationY: 0
            })
            expect(renderer.getStats().shelfUnits).toBe(2)
        })
    })
})
