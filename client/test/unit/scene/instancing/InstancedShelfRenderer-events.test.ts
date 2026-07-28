/**
 * Unit tests for InstancedShelfRenderer event behavior.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as THREE from 'three'
import { InstancedShelfRenderer } from '../../../../src/scene/instancing/InstancedShelfRenderer'
import { EventManager } from '../../../../src/core/EventManager'
import {
    StorePropsEventTypes,
    type ShelfReadyEvent,
    type ShelfUnitRepositionRequestedEvent,
} from '../../../../src/types/InteractionEvents'

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
            const event: ShelfReadyEvent = { shelfIndex: 0, sectionIndex: 0, position: pos, rotationY: 0 }

            eventManager.emit<ShelfReadyEvent>(StorePropsEventTypes.ShelfReady, event)
            const statsAfterFirst = renderer.getStats().shelfUnits

            // Send the same batchIndex again with updated position
            const event2: ShelfReadyEvent = { shelfIndex: 0, sectionIndex: 0, position: new THREE.Vector3(6, 0, -11), rotationY: Math.PI }
            eventManager.emit<ShelfReadyEvent>(StorePropsEventTypes.ShelfReady, event2)
            const statsAfterSecond = renderer.getStats().shelfUnits

            expect(statsAfterFirst).toBe(1)
            expect(statsAfterSecond).toBe(1) // must not increase
        })

        it('accepts a second distinct batchIndex as a new unit', async () => {
            await renderer.initialize()
            eventManager.emit<ShelfReadyEvent>(StorePropsEventTypes.ShelfReady, {
                shelfIndex: 0, sectionIndex: 0, position: new THREE.Vector3(0, 0, -5), rotationY: 0
            })
            eventManager.emit<ShelfReadyEvent>(StorePropsEventTypes.ShelfReady, {
                shelfIndex: 1, sectionIndex: 0, position: new THREE.Vector3(5, 0, -5), rotationY: 0
            })
            expect(renderer.getStats().shelfUnits).toBe(2)
        })
    })

    describe('ShelfUnitRepositionRequested (liminal treadmill recycling)', () => {
        it('moves an existing shelf unit without allocating a new one', async () => {
            await renderer.initialize()
            eventManager.emit<ShelfReadyEvent>(StorePropsEventTypes.ShelfReady, {
                shelfIndex: 0, sectionIndex: 0, position: new THREE.Vector3(5, 0, -10), rotationY: 0
            })
            expect(renderer.getStats().shelfUnits).toBe(1)

            eventManager.emit<ShelfUnitRepositionRequestedEvent>(StorePropsEventTypes.ShelfUnitRepositionRequested, {
                shelfIndex: 0, position: new THREE.Vector3(5, 0, -25), rotationY: Math.PI / 2
            })

            expect(renderer.getStats().shelfUnits).toBe(1)
        })

        it('does not affect a shelfIndex of 0 the way ShelfReady does (no anchor-cache-clear semantics apply here)', async () => {
            await renderer.initialize()
            eventManager.emit<ShelfReadyEvent>(StorePropsEventTypes.ShelfReady, {
                shelfIndex: 0, sectionIndex: 0, position: new THREE.Vector3(0, 0, -4), rotationY: 0
            })
            eventManager.emit<ShelfReadyEvent>(StorePropsEventTypes.ShelfReady, {
                shelfIndex: 1, sectionIndex: 0, position: new THREE.Vector3(2, 0, -4), rotationY: 0
            })
            expect(renderer.getStats().shelfUnits).toBe(2)

            eventManager.emit<ShelfUnitRepositionRequestedEvent>(StorePropsEventTypes.ShelfUnitRepositionRequested, {
                shelfIndex: 0, position: new THREE.Vector3(0, 0, -14.4), rotationY: Math.PI / 2
            })

            // Repositioning unit 0 must not remove/reset unit 1 — reposition is a single-unit update.
            expect(renderer.getStats().shelfUnits).toBe(2)
        })

        it('is idempotent — repositioning the same unit twice does not grow the instance count', async () => {
            await renderer.initialize()
            eventManager.emit<ShelfReadyEvent>(StorePropsEventTypes.ShelfReady, {
                shelfIndex: 3, sectionIndex: 0, position: new THREE.Vector3(5, 0, -10), rotationY: 0
            })

            eventManager.emit<ShelfUnitRepositionRequestedEvent>(StorePropsEventTypes.ShelfUnitRepositionRequested, {
                shelfIndex: 3, position: new THREE.Vector3(5, 0, -20), rotationY: Math.PI
            })
            eventManager.emit<ShelfUnitRepositionRequestedEvent>(StorePropsEventTypes.ShelfUnitRepositionRequested, {
                shelfIndex: 3, position: new THREE.Vector3(5, 0, -30), rotationY: 0
            })

            expect(renderer.getStats().shelfUnits).toBe(1)
        })
    })
})
