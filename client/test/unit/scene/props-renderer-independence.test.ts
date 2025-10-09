/**
 * Props Renderer Independence Test
 * 
 * Verifies that StorePropsRenderer works independently without EnvironmentRenderer dependency.
 * 
 * Migration: Updated to use createSceneTestContainer() for proper DI isolation
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as THREE from 'three'
import { StorePropsRenderer } from '../../../src/scene/StorePropsRenderer'
import { ServiceContainer } from '../../../src/core/di/ServiceContainer'
import { ServiceKeys } from '../../../src/core/di/ServiceKeys'
import { DataManager } from '../../../src/core/data/DataManager'
import { createSceneTestContainer } from '../../utils/test-container-helpers'

describe('StorePropsRenderer Independence', () => {
    let container: ServiceContainer
    let scene: THREE.Scene
    let propsRenderer: StorePropsRenderer

    beforeEach(async () => {
        // Create isolated test container
        container = await createSceneTestContainer()
        
        scene = new THREE.Scene()
        
        // Resolve DataManager from container
        const dataManager = await container.resolve(ServiceKeys.DataManager) as DataManager
        
        propsRenderer = new StorePropsRenderer(scene, dataManager)
    })

    afterEach(async () => {
        // Dispose container to clean up all services
        await container.dispose()
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