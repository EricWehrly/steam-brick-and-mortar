import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { EventManager } from '../../../../src/core/EventManager'
import { DataManager } from '../../../../src/core/data/DataManager'
import { DataKey, DataDomain } from '../../../../src/core/data/DataTypes'
import { UIEventTypes } from '../../../../src/types/InteractionEvents'
import type { LayoutRequestedEvent } from '../../../../src/types/EnvironmentEvents'
import { RenderLoopRegistry } from '../../../../src/scene/RenderLoopRegistry'
import {
    LiminalBoundaryTracker,
    computeSlotIndexForWorldZ,
    BOUNDARY_CHECK_FRAME_INTERVAL,
    BOUNDARY_HYSTERESIS_SLOT_FRACTION,
} from '../../../../src/scene/liminal/LiminalBoundaryTracker'
import { LiminalEventTypes, type BoundaryCrossedEvent } from '../../../../src/scene/liminal/LiminalEvents'
import type { MockFn } from '../../../utils/test-types'
import { CORRIDOR_FIRST_SLOT_OFFSET_Z, CORRIDOR_UNIT_SPACING_Z } from '../../../../src/scene/liminal/LiminalCorridorLayout'

function emitLayoutRequested(layoutMode: string): void {
    EventManager.getInstance().emit<LayoutRequestedEvent>(UIEventTypes.LayoutRequested, { layoutMode: layoutMode as any })
}

describe('LiminalBoundaryTracker', () => {
    let camera: THREE.PerspectiveCamera
    let frameCallback: (now: number, deltaTime: number) => void
    let crossedSpy: MockFn<[BoundaryCrossedEvent], void>

    beforeEach(() => {
        EventManager.getInstance().removeAllListeners()

        camera = new THREE.PerspectiveCamera()
        camera.position.set(0, 1.6, 0)
        DataManager.getInstance().set(DataKey.MainCamera, camera, { domain: DataDomain.Scene })

        RenderLoopRegistry.getInstance().unregister('LiminalBoundaryTracker')
        new LiminalBoundaryTracker()

        // No public API to retrieve a registered callback — reach into the registry's
        // internal map rather than re-registering (which would just shadow the real one).
        frameCallback = (RenderLoopRegistry.getInstance() as unknown as {
            callbacks: Map<string, (now: number, deltaTime: number) => void>
        }).callbacks.get('LiminalBoundaryTracker')!

        crossedSpy = vi.fn()
        EventManager.getInstance().registerEventHandler<BoundaryCrossedEvent>(
            LiminalEventTypes.BoundaryCrossed,
            (e) => crossedSpy(e.detail)
        )
    })

    function tick(): void {
        frameCallback(0, 0)
    }

    // Baseline establishment is never throttled (see LiminalBoundaryTracker's
    // onFrame), but every check after that only actually samples position once
    // per BOUNDARY_CHECK_FRAME_INTERVAL frames — so tests exercising a
    // post-baseline crossing must tick through a full interval, not just once.
    function tickThroughCheckInterval(): void {
        for (let i = 0; i < BOUNDARY_CHECK_FRAME_INTERVAL; i++) tick()
    }

    it('does nothing while liminal is not active', () => {
        camera.position.z = -100
        tick()
        expect(crossedSpy).not.toHaveBeenCalled()
    })

    it('establishes a baseline on the first frame after activation without emitting a crossing', () => {
        emitLayoutRequested('liminal')
        camera.position.z = -CORRIDOR_FIRST_SLOT_OFFSET_Z
        tick()
        expect(crossedSpy).not.toHaveBeenCalled()
    })

    it('emits one forward crossing per depth-slot boundary passed', () => {
        emitLayoutRequested('liminal')
        camera.position.z = -CORRIDOR_FIRST_SLOT_OFFSET_Z
        tick() // baseline

        camera.position.z -= CORRIDOR_UNIT_SPACING_Z
        tickThroughCheckInterval()

        expect(crossedSpy).toHaveBeenCalledTimes(1)
        expect(crossedSpy).toHaveBeenCalledWith(expect.objectContaining({ direction: 'forward' }))
    })

    it('emits one backward crossing when walking back toward the entrance', () => {
        emitLayoutRequested('liminal')
        camera.position.z = -(CORRIDOR_FIRST_SLOT_OFFSET_Z + 2 * CORRIDOR_UNIT_SPACING_Z)
        tick() // baseline

        camera.position.z += CORRIDOR_UNIT_SPACING_Z
        tickThroughCheckInterval()

        expect(crossedSpy).toHaveBeenCalledTimes(1)
        expect(crossedSpy).toHaveBeenCalledWith(expect.objectContaining({ direction: 'backward' }))
    })

    it('emits multiple crossings if more than one slot is traversed between checks', () => {
        emitLayoutRequested('liminal')
        camera.position.z = -CORRIDOR_FIRST_SLOT_OFFSET_Z
        tick() // baseline

        camera.position.z -= 3 * CORRIDOR_UNIT_SPACING_Z
        tickThroughCheckInterval()

        expect(crossedSpy).toHaveBeenCalledTimes(3)
        crossedSpy.mock.calls.forEach(call => expect(call[0]).toEqual(expect.objectContaining({ direction: 'forward' })))
    })

    it('does not re-sample position on frames between checks, even if the camera moved', () => {
        emitLayoutRequested('liminal')
        camera.position.z = -CORRIDOR_FIRST_SLOT_OFFSET_Z
        tick() // baseline

        camera.position.z -= CORRIDOR_UNIT_SPACING_Z
        for (let i = 0; i < BOUNDARY_CHECK_FRAME_INTERVAL - 1; i++) tick()

        expect(crossedSpy).not.toHaveBeenCalled()
    })

    it('re-establishes the baseline (no spurious crossing) when re-activating liminal', () => {
        emitLayoutRequested('liminal')
        camera.position.z = -CORRIDOR_FIRST_SLOT_OFFSET_Z
        tick()

        emitLayoutRequested('row')
        camera.position.z = -500 // arbitrary movement while inactive
        tick()

        emitLayoutRequested('liminal')
        tick() // should just re-baseline at whatever z is now, not emit a crossing

        expect(crossedSpy).not.toHaveBeenCalled()
    })

    describe('directional hysteresis (reversal requires overshoot, continuing does not)', () => {
        function slotWorldZ(slot: number): number {
            return -(CORRIDOR_FIRST_SLOT_OFFSET_Z + slot * CORRIDOR_UNIT_SPACING_Z)
        }

        it('does not immediately re-cross backward after a forward crossing at just past the midpoint', () => {
            emitLayoutRequested('liminal')
            camera.position.z = slotWorldZ(0)
            tick() // baseline at slot 0

            // Cross forward into slot 1 (tight midpoint, no hysteresis on the first
            // crossing) — 0.5 + a hair, not exactly 0.5, to avoid float-precision
            // flakiness right at the boundary (irrelevant in the real app, where the
            // player's position never lands on an exact midpoint by coincidence).
            camera.position.z = slotWorldZ(0.51)
            tickThroughCheckInterval()
            expect(crossedSpy).toHaveBeenCalledTimes(1)
            expect(crossedSpy).toHaveBeenLastCalledWith(expect.objectContaining({ direction: 'forward' }))

            // Retreat past the plain midpoint (which would trip under the old,
            // hysteresis-free rule) but not past the hysteresis-extended
            // threshold — must NOT re-trip backward yet.
            camera.position.z = slotWorldZ(0.5 - BOUNDARY_HYSTERESIS_SLOT_FRACTION / 2)
            tickThroughCheckInterval()
            expect(crossedSpy).toHaveBeenCalledTimes(1)
        })

        it('re-crosses backward once retreat overshoots the hysteresis margin', () => {
            emitLayoutRequested('liminal')
            camera.position.z = slotWorldZ(0)
            tick() // baseline at slot 0

            camera.position.z = slotWorldZ(0.51)
            tickThroughCheckInterval() // forward crossing into slot 1
            crossedSpy.mockClear()

            camera.position.z = slotWorldZ(0.5 - BOUNDARY_HYSTERESIS_SLOT_FRACTION - 0.01)
            tickThroughCheckInterval()

            expect(crossedSpy).toHaveBeenCalledTimes(1)
            expect(crossedSpy).toHaveBeenCalledWith(expect.objectContaining({ direction: 'backward' }))
        })

        it('keeps tight thresholds while continuing in the same direction across multiple crossings', () => {
            emitLayoutRequested('liminal')
            camera.position.z = slotWorldZ(0)
            tick() // baseline at slot 0

            // Sustained forward walking: each subsequent slot should still trip at
            // the plain midpoint, never delayed by hysteresis.
            camera.position.z = slotWorldZ(2.5)
            tickThroughCheckInterval()

            expect(crossedSpy).toHaveBeenCalledTimes(3)
            crossedSpy.mock.calls.forEach(call => expect(call[0]).toEqual(expect.objectContaining({ direction: 'forward' })))
        })
    })

    it('does nothing when the camera is not available in DataManager', () => {
        DataManager.getInstance().set(DataKey.MainCamera, null as unknown as THREE.Camera, { domain: DataDomain.Scene })
        emitLayoutRequested('liminal')
        expect(() => tick()).not.toThrow()
        expect(crossedSpy).not.toHaveBeenCalled()
    })
})

describe('computeSlotIndexForWorldZ', () => {
    it('rounds to the nearest slot index', () => {
        expect(computeSlotIndexForWorldZ(-CORRIDOR_FIRST_SLOT_OFFSET_Z)).toBe(0)
        expect(computeSlotIndexForWorldZ(-(CORRIDOR_FIRST_SLOT_OFFSET_Z + CORRIDOR_UNIT_SPACING_Z))).toBe(1)
        expect(computeSlotIndexForWorldZ(-(CORRIDOR_FIRST_SLOT_OFFSET_Z + 2 * CORRIDOR_UNIT_SPACING_Z))).toBe(2)
    })
})
