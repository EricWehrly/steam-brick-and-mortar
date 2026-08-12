import * as THREE from 'three'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DataManager } from '../../../src/core/data/DataManager'
import { DataDomain, DataKey } from '../../../src/core/data/DataTypes'
import { EventManager } from '../../../src/core/EventManager'
import { RenderLoopRegistry } from '../../../src/scene/RenderLoopRegistry'
import { RoomManager } from '../../../src/scene/RoomManager'
import { GameEventTypes, type ShelfLayoutDeterminedEvent } from '../../../src/types/InteractionEvents'

/**
 * Regression coverage for a real bug: RoomManager.buildRoom() used to call
 * cameraRig.lookAt(0, 1.6, targetZ) to face the player at the store on first layout. THREE's
 * Object3D.lookAt() special-cases isCamera/isLight objects to orient TOWARD the target; for any
 * other object type - cameraRig is a plain THREE.Group, not a Camera - it builds the matrix with
 * eye/target swapped, orienting the object AWAY from the target instead (see
 * node_modules/three/src/core/Object3D.js's lookAt()). That silently spawned the player facing
 * the glass storefront (positive Z) instead of the shelves (negative Z, per real shelf bounds).
 */
describe('RoomManager — initial camera facing', () => {
    let roomManager: RoomManager
    let cameraRig: THREE.Object3D
    let eventManager: EventManager

    function emitShelfLayoutDetermined(): void {
        eventManager.emit<ShelfLayoutDeterminedEvent>(GameEventTypes.ShelfLayoutDetermined, {
            layoutMode: 'row',
            shelfBounds: { minX: -12, maxX: 12, minZ: -20, maxZ: -2 },
            shelfLayout: { rows: 2 },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            stockStrategy: { order: (boards: unknown[]) => boards } as any,
        })
    }

    beforeEach(async () => {
        EventManager['instance'] = undefined as unknown as EventManager
        eventManager = EventManager.getInstance()

        const scene = new THREE.Scene()
        cameraRig = new THREE.Group()
        cameraRig.position.set(0, 1.6, 0)

        DataManager.getInstance().set(DataKey.MainScene, scene, { domain: DataDomain.Scene })
        DataManager.getInstance().set(DataKey.MainCameraRig, cameraRig, { domain: DataDomain.Scene })

        RenderLoopRegistry.getInstance().unregister('RoomManager')
        roomManager = new RoomManager()
        await Promise.resolve()
        await Promise.resolve()
    })

    afterEach(() => {
        roomManager.dispose()
        EventManager['instance'] = undefined as unknown as EventManager
    })

    it('orients the rig to face the shelves (negative Z), not away from them, on first layout', async () => {
        emitShelfLayoutDetermined()
        await Promise.resolve()
        await Promise.resolve()

        // Real shelf bounds are always well into negative Z (this project's room layout puts the
        // glass storefront at positive Z, shelves at negative Z - see RoomManager's own wall
        // construction). The rig's un-rotated forward is local -Z, so facing the shelves means
        // this should land near 0, not PI (which would mean facing the storefront instead).
        const forward = new THREE.Vector3(0, 0, -1).applyEuler(cameraRig.rotation)
        expect(forward.z).toBeLessThan(0)
        expect(cameraRig.rotation.y).toBeCloseTo(0, 1)
    })
})
