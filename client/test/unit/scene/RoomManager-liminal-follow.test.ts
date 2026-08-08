import * as THREE from 'three'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AppSettings } from '../../../src/core/AppSettings'
import { DataManager } from '../../../src/core/data/DataManager'
import { DataDomain, DataKey } from '../../../src/core/data/DataTypes'
import { EventManager } from '../../../src/core/EventManager'
import { RenderLoopRegistry } from '../../../src/scene/RenderLoopRegistry'
import { RoomManager } from '../../../src/scene/RoomManager'
import { GameEventTypes, UIEventTypes, type ShelfLayoutDeterminedEvent } from '../../../src/types/InteractionEvents'
import type { LayoutRequestedEvent } from '../../../src/types/EnvironmentEvents'

describe('RoomManager — liminal treadmill follow', () => {
    let roomManager: RoomManager
    let cameraRig: THREE.Object3D
    let eventManager: EventManager
    let frameCallback: (now: number, deltaTime: number) => void

    function roomGroupZ(): number {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (roomManager as any).roomGroup.position.z
    }

    function emitShelfLayoutDetermined(): void {
        eventManager.emit<ShelfLayoutDeterminedEvent>(GameEventTypes.ShelfLayoutDetermined, {
            layoutMode: 'liminal',
            shelfBounds: { minX: -10, maxX: 10, minZ: -20, maxZ: -2 },
            shelfLayout: { rows: 1 },
            stockStrategy: { order: (boards: unknown[]) => boards } as any,
        })
    }

    function emitLayoutRequested(layoutMode: string): void {
        eventManager.emit<LayoutRequestedEvent>(UIEventTypes.LayoutRequested, { layoutMode: layoutMode as any })
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

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        frameCallback = (RenderLoopRegistry.getInstance() as any).callbacks.get('RoomManager')!
    })

    afterEach(() => {
        roomManager.dispose()
        EventManager['instance'] = undefined as unknown as EventManager
    })

    it('does not move the room while not in liminal mode', async () => {
        emitShelfLayoutDetermined()
        await Promise.resolve()
        const initialZ = roomGroupZ()

        cameraRig.position.z = -50
        frameCallback(0, 0)

        expect(roomGroupZ()).toBe(initialZ)
    })

    it('follows the camera 1:1 once liminal is active', async () => {
        emitShelfLayoutDetermined()
        await Promise.resolve()
        const initialZ = roomGroupZ()
        const initialCameraZ = cameraRig.position.z

        emitLayoutRequested('liminal')
        cameraRig.position.z = initialCameraZ - 12
        frameCallback(0, 0)

        expect(roomGroupZ()).toBeCloseTo(initialZ - 12)
    })

    it('keeps following as the camera continues moving across multiple frames', async () => {
        emitShelfLayoutDetermined()
        await Promise.resolve()
        const initialZ = roomGroupZ()
        const initialCameraZ = cameraRig.position.z
        emitLayoutRequested('liminal')

        cameraRig.position.z = initialCameraZ - 5
        frameCallback(0, 0)
        expect(roomGroupZ()).toBeCloseTo(initialZ - 5)

        cameraRig.position.z = initialCameraZ - 30
        frameCallback(0, 0)
        expect(roomGroupZ()).toBeCloseTo(initialZ - 30)
    })

    it('stops following once layout switches away from liminal', async () => {
        emitShelfLayoutDetermined()
        await Promise.resolve()
        const initialZ = roomGroupZ()
        const initialCameraZ = cameraRig.position.z
        emitLayoutRequested('liminal')

        cameraRig.position.z = initialCameraZ - 10
        frameCallback(0, 0)
        expect(roomGroupZ()).toBeCloseTo(initialZ - 10)

        emitLayoutRequested('row')
        cameraRig.position.z = initialCameraZ - 999
        frameCallback(0, 0)

        // Room stays wherever it was left when liminal deactivated.
        expect(roomGroupZ()).toBeCloseTo(initialZ - 10)
    })

    it('re-baselines on the next room rebuild (e.g. resort mid-walk)', async () => {
        emitShelfLayoutDetermined()
        await Promise.resolve()
        emitLayoutRequested('liminal')

        cameraRig.position.z = -40
        frameCallback(0, 0)
        expect(roomGroupZ()).not.toBe(0)

        // A fresh ShelfLayoutDetermined (e.g. resort) rebuilds with the camera
        // wherever it currently is — the new baseline should match immediately.
        emitShelfLayoutDetermined()
        await Promise.resolve()
        const rebuiltZ = roomGroupZ()

        frameCallback(0, 0) // no camera movement since rebuild
        expect(roomGroupZ()).toBeCloseTo(rebuiltZ)
    })

    it('unregisters its render loop callback on dispose', () => {
        roomManager.dispose()
        expect((RenderLoopRegistry.getInstance() as unknown as {
            callbacks: Map<string, unknown>
        }).callbacks.has('RoomManager')).toBe(false)
    })
})
