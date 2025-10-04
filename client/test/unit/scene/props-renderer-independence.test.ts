/**
 * Props Renderer Independence Test
 * 
 * Verifies that StorePropsRenderer works independently without EnvironmentRenderer dependency.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import * as THREE from 'three'
import { StorePropsRenderer } from '../../../src/scene/StorePropsRenderer'

describe('StorePropsRenderer Independence', () => {
    let scene: THREE.Scene
    let propsRenderer: StorePropsRenderer

    beforeEach(() => {
        scene = new THREE.Scene()
        propsRenderer = new StorePropsRenderer(scene)
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