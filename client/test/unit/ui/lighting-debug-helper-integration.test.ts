/**
 * Lighting Controls Panel Debug Helper Integration Tests
 * 
 * Tests that the lighting controls panel properly toggles debug helpers
 * when lights are toggled on/off
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { LightingControlsPanel } from '../../../src/ui/LightingControlsPanel'
import { EventManager } from '../../../src/core/EventManager'
import { AppSettings } from '../../../src/core/AppSettings'
import { LightRegistry } from '../../../src/lighting/LightRegistry'
import * as THREE from 'three'

// Mock the EventManager
vi.mock('../../../src/core/EventManager', () => ({
    EventManager: {
        getInstance: () => ({
            emit: vi.fn(),
            registerEventHandler: vi.fn(),
            deregisterEventHandler: vi.fn()
        })
    },
    EventSource: {
        UI: 'ui',
        ManagedLight: 'managed-light'
    }
}))

describe('Lighting Controls Panel Debug Helper Integration', () => {
    let lightingPanel: LightingControlsPanel
    let scene: THREE.Scene
    let pointLight: THREE.PointLight
    let spotLight: THREE.SpotLight
    let rectAreaLight: THREE.RectAreaLight
    let debugPointHelper: THREE.Mesh
    let debugSpotHelper: THREE.Mesh
    let debugRectHelper: THREE.Mesh
    let lightRegistry: LightRegistry

    beforeEach(() => {
        // Clear document body
        document.body.innerHTML = ''
        
        // Get registry and clear it for clean test state
        lightRegistry = LightRegistry.getInstance()
        lightRegistry.clear()
        
        // Create the separate lighting controls button like it exists in index.html
        const separateButton = document.createElement('button')
        separateButton.id = 'lighting-controls-button'
        separateButton.className = 'settings-button lighting-button'
        separateButton.textContent = '💡 Lights'
        document.body.appendChild(separateButton)
        
        // Create a mock Three.js scene with lights and debug helpers
        scene = new THREE.Scene()
        
        // Create lights with names
        pointLight = new THREE.PointLight(0xffffff, 1, 10)
        pointLight.name = 'test-point'
        pointLight.position.set(0, 5, 0)
        scene.add(pointLight)
        
        spotLight = new THREE.SpotLight(0xffffff, 1, 15, Math.PI / 4)
        spotLight.name = 'test-spot'
        spotLight.position.set(2, 5, 2)
        scene.add(spotLight)
        
        rectAreaLight = new THREE.RectAreaLight(0xffffff, 1, 2, 2)
        rectAreaLight.name = 'test-rectarea'
        rectAreaLight.position.set(-2, 3, 0)
        scene.add(rectAreaLight)
        
        // Create mock debug helpers with the expected naming pattern
        debugPointHelper = new THREE.Mesh(
            new THREE.SphereGeometry(1),
            new THREE.MeshBasicMaterial({ color: 0xff0000 })
        )
        debugPointHelper.name = 'debug-point-test-point'
        debugPointHelper.visible = true
        scene.add(debugPointHelper)
        
        debugSpotHelper = new THREE.Mesh(
            new THREE.ConeGeometry(1, 2),
            new THREE.MeshBasicMaterial({ color: 0xff0000 })
        )
        debugSpotHelper.name = 'debug-spot-test-spot'
        debugSpotHelper.visible = true
        scene.add(debugSpotHelper)
        
        debugRectHelper = new THREE.Mesh(
            new THREE.PlaneGeometry(2, 2),
            new THREE.MeshBasicMaterial({ color: 0xff0000 })
        )
        debugRectHelper.name = 'debug-rectarea-test-rectarea'
        debugRectHelper.visible = true
        scene.add(debugRectHelper)
        
        // Register lights and debug helpers with the LightRegistry
        // (simulating what ManagedLights and LightingDebugHelper do)
        lightRegistry.registerLight(pointLight, { source: 'test' })
        lightRegistry.registerLight(spotLight, { source: 'test' })
        lightRegistry.registerLight(rectAreaLight, { source: 'test' })
        lightRegistry.attachGeometry(pointLight, debugPointHelper)
        lightRegistry.attachGeometry(spotLight, debugSpotHelper)
        lightRegistry.attachGeometry(rectAreaLight, debugRectHelper)
        
        // Setup mock dependencies
        const mockEventManager = EventManager.getInstance()
        const mockAppSettings = AppSettings.getInstance()
        
        // Create the lighting panel
        lightingPanel = new LightingControlsPanel(mockEventManager, mockAppSettings)

        // Manually set the scene (simulating getting it from a light creation event)
        ;(lightingPanel as any).scene = scene

        // Manually populate light groups to simulate discovered lights
        ;(lightingPanel as any).lightGroups = new Map([
            ['PointLight', {
                lights: [pointLight],
                collapsed: false,
                brightness: 1
            }],
            ['SpotLight', {
                lights: [spotLight],
                collapsed: false,
                brightness: 1
            }],
            ['RectAreaLight', {
                lights: [rectAreaLight],
                collapsed: false,
                brightness: 1
            }]
        ])

        // Enable debug indicators for all tests
        ;(lightingPanel as any).debugIndicatorEnabled = true
    })

    afterEach(() => {
        if (lightingPanel) {
            lightingPanel.dispose()
        }
        // Clear registry between tests
        lightRegistry.clear()
        document.body.innerHTML = ''
    })

    it('should hide point light debug helper when brightness set to zero', () => {
        expect(pointLight.visible).toBe(true)
        expect(debugPointHelper.visible).toBe(true)

        ;(lightingPanel as any).setIndividualBrightness(pointLight, 'PointLight', 0)

        expect(pointLight.visible).toBe(false)
        expect(debugPointHelper.visible).toBe(false)

        ;(lightingPanel as any).setIndividualBrightness(pointLight, 'PointLight', 1)

        expect(pointLight.visible).toBe(true)
        expect(debugPointHelper.visible).toBe(true)
    })

    it('should hide spot light debug helper when brightness set to zero', () => {
        expect(spotLight.visible).toBe(true)
        expect(debugSpotHelper.visible).toBe(true)

        ;(lightingPanel as any).setIndividualBrightness(spotLight, 'SpotLight', 0)

        expect(spotLight.visible).toBe(false)
        expect(debugSpotHelper.visible).toBe(false)

        ;(lightingPanel as any).setIndividualBrightness(spotLight, 'SpotLight', 1)

        expect(spotLight.visible).toBe(true)
        expect(debugSpotHelper.visible).toBe(true)
    })

    it('should hide rect area light debug helper when brightness set to zero', () => {
        expect(rectAreaLight.visible).toBe(true)
        expect(debugRectHelper.visible).toBe(true)

        ;(lightingPanel as any).setIndividualBrightness(rectAreaLight, 'RectAreaLight', 0)

        expect(rectAreaLight.visible).toBe(false)
        expect(debugRectHelper.visible).toBe(false)

        ;(lightingPanel as any).setIndividualBrightness(rectAreaLight, 'RectAreaLight', 1)

        expect(rectAreaLight.visible).toBe(true)
        expect(debugRectHelper.visible).toBe(true)
    })

    it('should hide group debug helpers when group brightness set to zero', () => {
        expect(pointLight.visible).toBe(true)
        expect(debugPointHelper.visible).toBe(true)

        ;(lightingPanel as any).setGroupBrightness('PointLight', 0)

        expect(pointLight.visible).toBe(false)
        expect(debugPointHelper.visible).toBe(false)

        ;(lightingPanel as any).setGroupBrightness('PointLight', 1)

        expect(pointLight.visible).toBe(true)
        expect(debugPointHelper.visible).toBe(true)
    })

    it('should hide all debug helpers when master brightness set to zero', () => {
        expect(pointLight.visible).toBe(true)
        expect(spotLight.visible).toBe(true)
        expect(rectAreaLight.visible).toBe(true)
        expect(debugPointHelper.visible).toBe(true)
        expect(debugSpotHelper.visible).toBe(true)
        expect(debugRectHelper.visible).toBe(true)

        ;(lightingPanel as any).setMasterBrightness(0)

        expect(pointLight.visible).toBe(false)
        expect(spotLight.visible).toBe(false)
        expect(rectAreaLight.visible).toBe(false)
        expect(debugPointHelper.visible).toBe(false)
        expect(debugSpotHelper.visible).toBe(false)
        expect(debugRectHelper.visible).toBe(false)

        ;(lightingPanel as any).setMasterBrightness(1)

        expect(pointLight.visible).toBe(true)
        expect(spotLight.visible).toBe(true)
        expect(rectAreaLight.visible).toBe(true)
        expect(debugPointHelper.visible).toBe(true)
        expect(debugSpotHelper.visible).toBe(true)
        expect(debugRectHelper.visible).toBe(true)
    })

    it('should handle lights without debug helpers gracefully', () => {
        const orphanLight = new THREE.PointLight(0xffffff, 1, 5)
        orphanLight.name = 'orphan-light'
        scene.add(orphanLight)

        expect(() => {
            ;(lightingPanel as any).setIndividualBrightness(orphanLight, 'PointLight', 0)
        }).not.toThrow()

        expect(orphanLight.visible).toBe(false)
    })

    it('should find debug helpers registered in LightRegistry when brightness set to zero', () => {
        const debugGroup = new THREE.Group()
        debugGroup.name = 'lighting-debug'
        scene.add(debugGroup)

        const nestedDebugHelper = new THREE.Mesh(
            new THREE.SphereGeometry(1),
            new THREE.MeshBasicMaterial({ color: 0xff0000 })
        )
        nestedDebugHelper.name = 'debug-point-nested-light'
        nestedDebugHelper.visible = true
        debugGroup.add(nestedDebugHelper)

        const nestedLight = new THREE.PointLight(0xffffff, 1, 10)
        nestedLight.name = 'nested-light'
        scene.add(nestedLight)

        lightRegistry.registerLight(nestedLight, { source: 'test' })
        lightRegistry.attachGeometry(nestedLight, nestedDebugHelper)

        ;(lightingPanel as any).setIndividualBrightness(nestedLight, 'PointLight', 0)

        expect(nestedLight.visible).toBe(false)
        expect(nestedDebugHelper.visible).toBe(false)

        ;(lightingPanel as any).setIndividualBrightness(nestedLight, 'PointLight', 1)

        expect(nestedLight.visible).toBe(true)
        expect(nestedDebugHelper.visible).toBe(true)
    })
})