import * as THREE from 'three'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AppSettings } from '../../../src/core/AppSettings'
import { EventManager, EventSource } from '../../../src/core/EventManager'
import { DataManager } from '../../../src/core/data/DataManager'
import { DataDomain, DataKey } from '../../../src/core/data/DataTypes'
import { LightingRenderer } from '../../../src/scene/LightingRenderer'
import { StorePropsEventTypes, type StorePropsSetupRequestEvent } from '../../../src/scene/props/PropsEvents'
import { RoomEventTypes, type RoomResizedEvent } from '../../../src/types/InteractionEvents'

function createRendererMock(): THREE.WebGLRenderer {
    return {
        shadowMap: {
            enabled: false,
            type: THREE.PCFSoftShadowMap,
        },
    } as unknown as THREE.WebGLRenderer
}

describe('LightingRenderer shadow casting integration', () => {
    let lightingRenderer: LightingRenderer
    let eventManager: EventManager

    beforeEach(() => {
        localStorage.clear()
        AppSettings['instance'] = undefined as unknown as AppSettings
        EventManager['instance'] = undefined as unknown as EventManager

        eventManager = EventManager.getInstance()
        const scene = new THREE.Scene()
        DataManager.getInstance().set(DataKey.MainScene, scene, { domain: DataDomain.Scene })
        lightingRenderer = new LightingRenderer(scene, createRendererMock())
    })

    afterEach(() => {
        lightingRenderer.dispose()
        AppSettings['instance'] = undefined as unknown as AppSettings
        EventManager['instance'] = undefined as unknown as EventManager
        localStorage.clear()
    })

    it('enables at least one directional shadow caster when shadowQuality is on', async () => {
        const appSettings = AppSettings.getInstance()
        appSettings.setSetting('shadowQuality', 2, EventSource.System)

        eventManager.emit<StorePropsSetupRequestEvent>(StorePropsEventTypes.SetupRequest, { config: {} })
        eventManager.emit(StorePropsEventTypes.SetupCompleted, {})
        await Promise.resolve()

        const renderer = (lightingRenderer as unknown as { renderer: THREE.WebGLRenderer }).renderer
        expect(renderer.shadowMap.enabled).toBe(true)

        const lightingGroup = (lightingRenderer as unknown as { lightingGroup: THREE.Group }).lightingGroup
        const directionalShadowCasters: THREE.DirectionalLight[] = []
        lightingGroup.traverse((child) => {
            if (child instanceof THREE.DirectionalLight && child.castShadow) {
                directionalShadowCasters.push(child)
            }
        })

        expect(directionalShadowCasters.length).toBeGreaterThan(0)
    })

    it('disables directional shadow casters when shadowQuality is off', async () => {
        const appSettings = AppSettings.getInstance()
        appSettings.setSetting('shadowQuality', 0, EventSource.System)

        eventManager.emit<StorePropsSetupRequestEvent>(StorePropsEventTypes.SetupRequest, { config: {} })
        eventManager.emit(StorePropsEventTypes.SetupCompleted, {})
        await Promise.resolve()

        const renderer = (lightingRenderer as unknown as { renderer: THREE.WebGLRenderer }).renderer
        expect(renderer.shadowMap.enabled).toBe(false)

        const lightingGroup = (lightingRenderer as unknown as { lightingGroup: THREE.Group }).lightingGroup
        let hasDirectionalShadowCaster = false
        lightingGroup.traverse((child) => {
            if (child instanceof THREE.DirectionalLight && child.castShadow) {
                hasDirectionalShadowCaster = true
            }
        })

        expect(hasDirectionalShadowCaster).toBe(false)
    })

    it('disables directional shadow casters when shadowMapEnabled is off', async () => {
        const appSettings = AppSettings.getInstance()
        appSettings.setSetting('shadowQuality', 2, EventSource.System)
        appSettings.setSetting('shadowMapEnabled', false, EventSource.System)

        eventManager.emit<StorePropsSetupRequestEvent>(StorePropsEventTypes.SetupRequest, { config: {} })
        eventManager.emit(StorePropsEventTypes.SetupCompleted, {})
        await Promise.resolve()

        const renderer = (lightingRenderer as unknown as { renderer: THREE.WebGLRenderer }).renderer
        expect(renderer.shadowMap.enabled).toBe(false)

        const lightingGroup = (lightingRenderer as unknown as { lightingGroup: THREE.Group }).lightingGroup
        let hasDirectionalShadowCaster = false
        lightingGroup.traverse((child) => {
            if (child instanceof THREE.DirectionalLight && child.castShadow) {
                hasDirectionalShadowCaster = true
            }
        })

        expect(hasDirectionalShadowCaster).toBe(false)
    })

    it('applies shared shadow policy to dramatic spotlight path', () => {
        ;(lightingRenderer as unknown as { config: { shadowQuality: number; shadowMapEnabled: boolean } }).config = {
            shadowQuality: 2,
            shadowMapEnabled: false,
        }
        ;(lightingRenderer as unknown as { addDramaticLighting: () => void }).addDramaticLighting()

        const lightingGroup = (lightingRenderer as unknown as { lightingGroup: THREE.Group }).lightingGroup
        const dramaticSpot = lightingGroup.getObjectByName('dramatic-spotlight')
        expect(dramaticSpot).toBeInstanceOf(THREE.SpotLight)
        expect((dramaticSpot as THREE.SpotLight).castShadow).toBe(false)
    })

    it('refits directional shadow camera when room footprint changes', async () => {
        const appSettings = AppSettings.getInstance()
        appSettings.setSetting('shadowQuality', 2, EventSource.System)
        appSettings.setSetting('shadowMapEnabled', true, EventSource.System)

        eventManager.emit<StorePropsSetupRequestEvent>(StorePropsEventTypes.SetupRequest, { config: {} })
        eventManager.emit(StorePropsEventTypes.SetupCompleted, {})
        await Promise.resolve()

        const lightingGroup = (lightingRenderer as unknown as { lightingGroup: THREE.Group }).lightingGroup
        const directional = lightingGroup.getObjectByName('exterior-ambient-light') as THREE.DirectionalLight
        expect(directional).toBeInstanceOf(THREE.DirectionalLight)

        const beforeLeft = directional.shadow.camera.left
        eventManager.emit<RoomResizedEvent>(RoomEventTypes.Resized, {
            dimensions: { width: 40, depth: 30, height: 4.2 },
        })

        expect(directional.shadow.camera.left).toBeCloseTo(-24, 5)
        expect(directional.shadow.camera.right).toBeCloseTo(24, 5)
        expect(directional.shadow.camera.top).toBeCloseTo(18, 5)
        expect(directional.shadow.camera.bottom).toBeCloseTo(-18, 5)
        expect(directional.shadow.camera.left).not.toBe(beforeLeft)
    })
})
