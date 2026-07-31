import * as THREE from 'three'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AppSettings } from '../../../src/core/AppSettings'
import { DataManager } from '../../../src/core/data/DataManager'
import { DataDomain, DataKey } from '../../../src/core/data/DataTypes'
import { EventManager, EventSource } from '../../../src/core/EventManager'
import { RoomManager } from '../../../src/scene/RoomManager'
import { RoomEventTypes, type RoomResizedEvent } from '../../../src/types/InteractionEvents'

describe('RoomManager ceilingHeight AppSettings integration', () => {
    let roomManager: RoomManager
    let appSettings: AppSettings
    let eventManager: EventManager

    beforeEach(() => {
        localStorage.clear()
        AppSettings['instance'] = undefined as unknown as AppSettings
        EventManager['instance'] = undefined as unknown as EventManager

        eventManager = EventManager.getInstance()
        appSettings = AppSettings.getInstance()

        const scene = new THREE.Scene()
        const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000)
        const cameraRig = new THREE.Group()
        cameraRig.add(camera)
        cameraRig.position.set(0, 1.6, 0)

        const dataManager = DataManager.getInstance()
        dataManager.set(DataKey.MainScene, scene, { domain: DataDomain.Scene })
        dataManager.set(DataKey.MainCamera, camera, { domain: DataDomain.Scene })
        dataManager.set(DataKey.MainCameraRig, cameraRig, { domain: DataDomain.Scene })

        roomManager = new RoomManager()
    })

    afterEach(() => {
        roomManager.dispose()
        AppSettings['instance'] = undefined as unknown as AppSettings
        EventManager['instance'] = undefined as unknown as EventManager
        localStorage.clear()
    })

    it('emits room:resized and updates room height when ceilingHeight changes', async () => {
        const resizedEvents: RoomResizedEvent[] = []
        eventManager.registerEventHandler<RoomResizedEvent>(
            RoomEventTypes.Resized,
            (event: CustomEvent<RoomResizedEvent>) => {
                resizedEvents.push(event.detail)
            }
        )

        const initialHeight = roomManager.getCurrentDimensions().height
        const updatedHeight = initialHeight + 0.7

        appSettings.setSetting('ceilingHeight', updatedHeight, EventSource.UI)

        await Promise.resolve()

        expect(roomManager.getCurrentDimensions().height).toBe(updatedHeight)
        expect(resizedEvents.length).toBeGreaterThan(0)
        expect(resizedEvents.at(-1)?.dimensions.height).toBe(updatedHeight)
    })
})
