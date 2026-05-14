import * as THREE from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EventManager } from '../../../src/core/EventManager'
import { LightingRenderer } from '../../../src/scene/LightingRenderer'
import { RoomEventTypes, type RoomResizedEvent } from '../../../src/types/InteractionEvents'

describe('LightingRenderer ceiling-height fixture refresh', () => {
    let eventManager: EventManager
    let lightingRenderer: LightingRenderer

    beforeEach(() => {
        EventManager['instance'] = undefined as unknown as EventManager
        eventManager = EventManager.getInstance()

        const scene = new THREE.Scene()
        const renderer = {
            shadowMap: {
                enabled: false,
                type: THREE.PCFSoftShadowMap,
            },
        } as unknown as THREE.WebGLRenderer

        lightingRenderer = new LightingRenderer(scene, renderer)
    })

    afterEach(() => {
        lightingRenderer.dispose()
        EventManager['instance'] = undefined as unknown as EventManager
    })

    it('rebuilds fixtures when only room height changes after shelf layout is known', () => {
        const fixtureSetupSpy = vi
            .spyOn(lightingRenderer as unknown as { setupFluorescentFixtures: (layout?: { rows: number; shelvesPerRow?: number }) => void }, 'setupFluorescentFixtures')
            .mockImplementation(() => undefined)

        eventManager.emit<RoomResizedEvent>(RoomEventTypes.Resized, {
            dimensions: { width: 22, depth: 16, height: 4.0 },
            shelfLayout: { rows: 4, shelvesPerRow: 3 },
        })

        expect(fixtureSetupSpy).toHaveBeenCalledTimes(1)
        expect(fixtureSetupSpy).toHaveBeenLastCalledWith({ rows: 4, shelvesPerRow: 3 })

        // Simulate fixture creation by setting the currentFixtures field directly
        const mockFixtures = new THREE.Group()
        const lightingRendererTyped = lightingRenderer as unknown as { currentFixtures: THREE.Group | null; lightingGroup: THREE.Group }
        lightingRendererTyped.currentFixtures = mockFixtures
        lightingRendererTyped.lightingGroup.add(mockFixtures)

        eventManager.emit<RoomResizedEvent>(RoomEventTypes.Resized, {
            dimensions: { width: 22, depth: 16, height: 4.7 },
        })

        expect(fixtureSetupSpy).toHaveBeenCalledTimes(2)
        expect(fixtureSetupSpy).toHaveBeenLastCalledWith({ rows: 4, shelvesPerRow: 3 })
    })
})
