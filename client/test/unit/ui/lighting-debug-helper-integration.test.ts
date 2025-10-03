/**
 * Lighting Controls Panel Debug Helper Integration Tests
 * 
 * Tests that the lighting controls panel properly toggles debug helpers
 * when lights are toggled on/off
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { LightingControlsPanel } from '../../../src/ui/LightingControlsPanel'
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

    beforeEach(() => {
        // Clear document body
        document.body.innerHTML = ''
        
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
        
        // Create the lighting panel
        lightingPanel = new LightingControlsPanel()

        // Manually set the scene (simulating getting it from a light creation event)
        ;(lightingPanel as any).scene = scene

        // Manually populate light groups to simulate discovered lights
        ;(lightingPanel as any).lightGroups = new Map([
            ['PointLight', {
                type: 'PointLight',
                lights: [pointLight],
                enabled: true
            }],
            ['SpotLight', {
                type: 'SpotLight',
                lights: [spotLight],
                enabled: true
            }],
            ['RectAreaLight', {
                type: 'RectAreaLight',
                lights: [rectAreaLight],
                enabled: true
            }]
        ])

        // Enable debug indicators for all tests
        ;(lightingPanel as any).debugIndicatorEnabled = true
    })

    afterEach(() => {
        if (lightingPanel) {
            lightingPanel.dispose()
        }
        document.body.innerHTML = ''
    })

    it('should toggle point light debug helper when point light is toggled', () => {
        // Initially both light and debug helper should be visible
        expect(pointLight.visible).toBe(true)
        expect(debugPointHelper.visible).toBe(true)
        
        // Call the private method to toggle the light
        ;(lightingPanel as any).toggleIndividualLight(pointLight, false)
        
        // Light should be hidden
        expect(pointLight.visible).toBe(false)
        
        // Debug helper should also be hidden
        expect(debugPointHelper.visible).toBe(false)
        
        // Toggle back on
        ;(lightingPanel as any).toggleIndividualLight(pointLight, true)
        
        expect(pointLight.visible).toBe(true)
        expect(debugPointHelper.visible).toBe(true)
    })

    it('should toggle spot light debug helper when spot light is toggled', () => {
        // Initially both light and debug helper should be visible
        expect(spotLight.visible).toBe(true)
        expect(debugSpotHelper.visible).toBe(true)
        
        // Toggle light off
        ;(lightingPanel as any).toggleIndividualLight(spotLight, false)
        
        expect(spotLight.visible).toBe(false)
        expect(debugSpotHelper.visible).toBe(false)
        
        // Toggle back on
        ;(lightingPanel as any).toggleIndividualLight(spotLight, true)
        
        expect(spotLight.visible).toBe(true)
        expect(debugSpotHelper.visible).toBe(true)
    })

    it('should toggle rect area light debug helper when rect area light is toggled', () => {
        // Initially both light and debug helper should be visible
        expect(rectAreaLight.visible).toBe(true)
        expect(debugRectHelper.visible).toBe(true)
        
        // Toggle light off
        ;(lightingPanel as any).toggleIndividualLight(rectAreaLight, false)
        
        expect(rectAreaLight.visible).toBe(false)
        expect(debugRectHelper.visible).toBe(false)
        
        // Toggle back on
        ;(lightingPanel as any).toggleIndividualLight(rectAreaLight, true)
        
        expect(rectAreaLight.visible).toBe(true)
        expect(debugRectHelper.visible).toBe(true)
    })

    it('should toggle all debug helpers when toggling light groups', () => {
        // Initially all should be visible
        expect(pointLight.visible).toBe(true)
        expect(debugPointHelper.visible).toBe(true)
        
        // Toggle point light group off
        ;(lightingPanel as any).toggleLightGroup('PointLight', false)
        
        expect(pointLight.visible).toBe(false)
        expect(debugPointHelper.visible).toBe(false)
        
        // Toggle back on
        ;(lightingPanel as any).toggleLightGroup('PointLight', true)
        
        expect(pointLight.visible).toBe(true)
        expect(debugPointHelper.visible).toBe(true)
    })

    it('should toggle all debug helpers when using master toggle', () => {
        // Initially all should be visible
        expect(pointLight.visible).toBe(true)
        expect(spotLight.visible).toBe(true)
        expect(rectAreaLight.visible).toBe(true)
        expect(debugPointHelper.visible).toBe(true)
        expect(debugSpotHelper.visible).toBe(true)
        expect(debugRectHelper.visible).toBe(true)
        
        // Toggle all lights off
        ;(lightingPanel as any).toggleAllLights(false)
        
        // All lights should be off
        expect(pointLight.visible).toBe(false)
        expect(spotLight.visible).toBe(false)
        expect(rectAreaLight.visible).toBe(false)
        
        // All debug helpers should be off
        expect(debugPointHelper.visible).toBe(false)
        expect(debugSpotHelper.visible).toBe(false)
        expect(debugRectHelper.visible).toBe(false)
        
        // Toggle all back on
        ;(lightingPanel as any).toggleAllLights(true)
        
        expect(pointLight.visible).toBe(true)
        expect(spotLight.visible).toBe(true)
        expect(rectAreaLight.visible).toBe(true)
        expect(debugPointHelper.visible).toBe(true)
        expect(debugSpotHelper.visible).toBe(true)
        expect(debugRectHelper.visible).toBe(true)
    })

    it('should handle lights without debug helpers gracefully', () => {
        // Create a light without a corresponding debug helper
        const orphanLight = new THREE.PointLight(0xffffff, 1, 5)
        orphanLight.name = 'orphan-light'
        scene.add(orphanLight)
        
        // This should not throw an error even though no debug helper exists
        expect(() => {
            ;(lightingPanel as any).toggleIndividualLight(orphanLight, false)
        }).not.toThrow()
        
        expect(orphanLight.visible).toBe(false)
    })

    it('should find debug helpers nested in groups', () => {
        // Create a debug group (simulating LightingDebugHelper structure)
        const debugGroup = new THREE.Group()
        debugGroup.name = 'lighting-debug'
        scene.add(debugGroup)
        
        // Create a nested debug helper
        const nestedDebugHelper = new THREE.Mesh(
            new THREE.SphereGeometry(1),
            new THREE.MeshBasicMaterial({ color: 0xff0000 })
        )
        nestedDebugHelper.name = 'debug-point-nested-light'
        nestedDebugHelper.visible = true
        debugGroup.add(nestedDebugHelper)
        
        // Create the corresponding light
        const nestedLight = new THREE.PointLight(0xffffff, 1, 10)
        nestedLight.name = 'nested-light'
        scene.add(nestedLight)
        
        // Toggle the light - should find the nested debug helper
        ;(lightingPanel as any).toggleIndividualLight(nestedLight, false)
        
        expect(nestedLight.visible).toBe(false)
        expect(nestedDebugHelper.visible).toBe(false)
        
        // Toggle back on
        ;(lightingPanel as any).toggleIndividualLight(nestedLight, true)
        
        expect(nestedLight.visible).toBe(true)
        expect(nestedDebugHelper.visible).toBe(true)
    })
})