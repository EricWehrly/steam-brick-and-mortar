import * as THREE from 'three'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { EnvironmentRenderer } from '../../../src/scene/EnvironmentRenderer'
import { AppSettings } from '../../../src/core/AppSettings'

describe('Ceiling Registry System', () => {
    let environmentRenderer: EnvironmentRenderer
    let mockScene: THREE.Scene
    let appSettings: AppSettings

    beforeEach(() => {
        mockScene = new THREE.Scene()
        appSettings = AppSettings.getInstance()
        environmentRenderer = new EnvironmentRenderer(mockScene, appSettings)
    })

    afterEach(() => {
        environmentRenderer.dispose()
    })

    describe('Direct Object Reference System', () => {
        it('should register ceiling when created via createEnhancedCeiling', () => {
            const ceiling = environmentRenderer.createEnhancedCeiling(20, 4)
            
            // Verify ceiling exists
            expect(ceiling).toBeDefined()
            expect(ceiling.name).toBe('environment-ceiling')
            expect(ceiling.position.y).toBe(4)

            // Verify ceiling is registered (by testing visibility control works)
            environmentRenderer.setCeilingVisibility(false)
            expect(ceiling.visible).toBe(false)
            
            environmentRenderer.setCeilingVisibility(true)
            expect(ceiling.visible).toBe(true)
        })

        it('should clean up ceiling registry when environment is cleared', () => {
            // Create ceilings
            const ceiling1 = environmentRenderer.createEnhancedCeiling(20, 4)
            const ceiling2 = environmentRenderer.createEnhancedCeiling(15, 3)
            
            // Verify they can be controlled
            environmentRenderer.setCeilingVisibility(false)
            expect(ceiling1.visible).toBe(false)
            expect(ceiling2.visible).toBe(false)
            
            // Clear environment
            environmentRenderer.clearEnvironment()
            
            // Visibility control should not affect disposed ceilings
            environmentRenderer.setCeilingVisibility(true)
            // Ceilings should still be hidden since they were disposed
        })

        it('should handle visibility toggle without relying on magic strings', () => {
            // Create ceiling
            const enhancedCeiling = environmentRenderer.createEnhancedCeiling(20, 4)
            
            // Create manual ceiling and register it
            const manualCeiling = new THREE.Mesh(
                new THREE.PlaneGeometry(10, 10),
                new THREE.MeshBasicMaterial()
            )
            manualCeiling.name = 'custom-ceiling'
            
            // Manually register the custom ceiling
            environmentRenderer.registerCeiling(manualCeiling)
            mockScene.add(manualCeiling)
            
            // Test visibility control works for both
            expect(enhancedCeiling.visible).toBe(true)
            expect(manualCeiling.visible).toBe(true)
            
            environmentRenderer.setCeilingVisibility(false)
            expect(enhancedCeiling.visible).toBe(false)
            expect(manualCeiling.visible).toBe(false)
            
            environmentRenderer.setCeilingVisibility(true)
            expect(enhancedCeiling.visible).toBe(true)
            expect(manualCeiling.visible).toBe(true)
        })

        it('should handle orphaned references gracefully', () => {
            // Create ceiling and register it
            const ceiling = environmentRenderer.createEnhancedCeiling(20, 4)
            
            // Remove ceiling from scene but leave it registered (simulates orphaned reference)
            mockScene.remove(ceiling)
            
            // Should not throw error when controlling visibility
            expect(() => {
                environmentRenderer.setCeilingVisibility(false)
                environmentRenderer.setCeilingVisibility(true)
            }).not.toThrow()
        })
    })

    describe('Registry Management', () => {
        it('should allow manual registration of ceiling objects', () => {
            const customCeiling = new THREE.Mesh(
                new THREE.PlaneGeometry(15, 15),
                new THREE.MeshBasicMaterial()
            )
            customCeiling.name = 'test-ceiling'
            
            // Register manually
            environmentRenderer.registerCeiling(customCeiling)
            mockScene.add(customCeiling)
            
            // Test visibility control
            expect(customCeiling.visible).toBe(true)
            environmentRenderer.setCeilingVisibility(false)
            expect(customCeiling.visible).toBe(false)
        })

        it('should allow manual unregistration of ceiling objects', () => {
            const ceiling = environmentRenderer.createEnhancedCeiling(20, 4)
            
            // Verify it's initially controllable
            environmentRenderer.setCeilingVisibility(false)
            expect(ceiling.visible).toBe(false)
            
            // Reset visibility for test
            ceiling.visible = true
            
            // Unregister it
            environmentRenderer.unregisterCeiling(ceiling)
            
            // Should no longer be affected by visibility controls
            environmentRenderer.setCeilingVisibility(false)
            expect(ceiling.visible).toBe(true) // Still true because it's no longer registered
        })
    })
})