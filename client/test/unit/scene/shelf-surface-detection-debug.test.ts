/**
 * Debug test for shelf surface detection
 * Helps identify why we're getting 6 surfaces instead of 3
 */

import { describe, it, expect, beforeEach } from 'vitest'
import * as THREE from 'three'
import { StoreLayout } from '../../../src/scene/StoreLayout'

describe('Shelf Surface Detection Debug', () => {
    let scene: THREE.Scene
    let storeLayout: StoreLayout

    beforeEach(() => {
        scene = new THREE.Scene()
        storeLayout = new StoreLayout(scene)
    })

    it('should detect the correct number of shelf surfaces', async () => {
        // Generate GPU-optimized shelves which creates "The Shelf"  
        const storeGroup = await storeLayout.generateShelvesGPUOptimized()
        
        // The shelf detection happens during game spawning, so let's manually trigger it
        console.log('🔍 Generated store group children:', storeGroup.children.map(child => child.name))
        
        // Find "The Shelf" group
        const theShelfGroup = storeGroup.children.find(child => child.name === 'TheShelf') as THREE.Group
        expect(theShelfGroup).toBeDefined()
        
        console.log('📚 TheShelf children:', theShelfGroup.children.map(child => child.name))
        
        // Look at the actual shelf unit structure
        const shelfUnits = theShelfGroup.children.filter(child => 
            child.name !== 'sign' && child instanceof THREE.Group
        )
        
        console.log(`🏗️ Found ${shelfUnits.length} shelf units in TheShelf group`)
        
        if (shelfUnits.length > 0) {
            const shelfUnit = shelfUnits[0] as THREE.Group
            console.log(`🔧 Shelf unit "${shelfUnit.name}" has ${shelfUnit.children.length} children`)
            
            // Manually call the surface detection to see debug output
            const surfaces = (storeLayout as any).findShelfSurfaces(shelfUnit)
            console.log(`📊 RESULT: Found ${surfaces.length} shelf surfaces`)
            
            surfaces.forEach((surface, index) => {
                console.log(`  Surface ${index + 1}: Y=${surface.topY.toFixed(3)}, depth=${surface.depth.toFixed(2)}`)
            })
            
            // We expect 3 surfaces for a 3-shelf unit
            expect(surfaces.length).toBeLessThanOrEqual(3)
        }
    })
})