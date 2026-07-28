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
        tick()

        expect(crossedSpy).toHaveBeenCalledTimes(1)
        expect(crossedSpy).toHaveBeenCalledWith(expect.objectContaining({ direction: 'forward' }))
    })

    it('emits one backward crossing when walking back toward the entrance', () => {
        emitLayoutRequested('liminal')
        camera.position.z = -(CORRIDOR_FIRST_SLOT_OFFSET_Z + 2 * CORRIDOR_UNIT_SPACING_Z)
        tick() // baseline

        camera.position.z += CORRIDOR_UNIT_SPACING_Z
        tick()

        expect(crossedSpy).toHaveBeenCalledTimes(1)
        expect(crossedSpy).toHaveBeenCalledWith(expect.objectContaining({ direction: 'backward' }))
    })

    it('emits multiple crossings if more than one slot is traversed in a single frame', () => {
        emitLayoutRequested('liminal')
        camera.position.z = -CORRIDOR_FIRST_SLOT_OFFSET_Z
        tick() // baseline

        camera.position.z -= 3 * CORRIDOR_UNIT_SPACING_Z
        tick()

        expect(crossedSpy).toHaveBeenCalledTimes(3)
        crossedSpy.mock.calls.forEach(call => expect(call[0]).toEqual(expect.objectContaining({ direction: 'forward' })))
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
