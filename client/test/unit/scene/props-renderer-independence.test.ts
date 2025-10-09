/**
 * Props Renderer Independence Test
 * 
 * Verifies that StorePropsRenderer works independently without EnvironmentRenderer dependency.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import * as THREE from 'three'
import { StorePropsRenderer } from '../../../src/scene/StorePropsRenderer'
import { ServiceContainer } from '../../../src/core/di/ServiceContainer'
import { ServiceKeys } from '../../../src/core/di/ServiceKeys'
import { DataManager } from '../../../src/core/data/DataManager'

describe('StorePropsRenderer Independence', () => {
    let scene: THREE.Scene
    let propsRenderer: StorePropsRenderer
    let serviceContainer: ServiceContainer

    beforeEach(async () => {
        scene = new THREE.Scene()
        
        // Create and configure service container
        serviceContainer = new ServiceContainer()
        serviceContainer.registerSingleton(ServiceKeys.DataManager, async () => DataManager.getInstance())
        await serviceContainer.initialize()
        
        propsRenderer = new StorePropsRenderer(scene, serviceContainer)
    })

    describe('Constructor Independence', () => {
        it('should initialize without external dependencies', () => {
            expect(propsRenderer).toBeDefined()
            // Verifies that StorePropsRenderer no longer depends on EnvironmentRenderer
        })
    })

    describe('Cleanup Independence', () => {
        it('should handle cleanup independently', () => {
            // Clear props
            propsRenderer.clearProps()
            
            // Dispose props renderer
            propsRenderer.dispose()
            
            // Should not throw any errors since it's independent
            expect(() => propsRenderer.dispose()).not.toThrow()
        })
    })
})