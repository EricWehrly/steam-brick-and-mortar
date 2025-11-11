/**
 * Debug test to measure actual shelf depths and positions
 * Created to diagnose "top shelf deepest" visual bug
 */

import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { ProceduralShelfGenerator } from '../../../src/scene/ProceduralShelfGenerator'

describe('Shelf Depth Extension Measurements', () => {
    it('should show actual shelf depths and front/back edges for debugging', () => {
        const generator = new ProceduralShelfGenerator()
        const shelfUnit = generator.generateShelfUnit(new THREE.Vector3(0, 0, 0), {
            shelfCount: 3,
            shelfExtensionPerLevel: 0.25
        })

        // Find all horizontal shelves (they should be BoxGeometry with small Y dimension)
        const shelves: Array<{ mesh: THREE.Mesh; y: number; depth: number; z: number; frontEdge: number; backEdge: number }> = []
        
        shelfUnit.traverse((child) => {
            if (child instanceof THREE.Mesh && child.geometry instanceof THREE.BoxGeometry) {
                const params = child.geometry.parameters
                // Horizontal shelves have small height (Y) and significant depth (Z)
                if (params.height < 0.1 && params.depth > 0.3) {
                    const worldPos = new THREE.Vector3()
                    child.getWorldPosition(worldPos)
                    
                    const depth = params.depth
                    const zPos = worldPos.z
                    const frontEdge = zPos + depth / 2 // Positive Z is front
                    const backEdge = zPos - depth / 2  // Negative Z is back
                    
                    shelves.push({
                        mesh: child,
                        y: worldPos.y,
                        depth,
                        z: zPos,
                        frontEdge,
                        backEdge
                    })
                }
            }
        })

        // Sort by Y position (bottom to top)
        shelves.sort((a, b) => a.y - b.y)

        console.log('\n=== SHELF DEPTH MEASUREMENTS ===')
        console.log(`Found ${shelves.length} horizontal shelves\n`)

        shelves.forEach((shelf, index) => {
            const shelfLabel = index === 0 ? 'BOTTOM' : index === shelves.length - 1 ? 'TOP' : 'MIDDLE'
            console.log(`${shelfLabel} Shelf (index ${index}):`)
            console.log(`  Y position: ${shelf.y.toFixed(3)}m`)
            console.log(`  Z position: ${shelf.z.toFixed(3)}m (center)`)
            console.log(`  Depth: ${shelf.depth.toFixed(3)}m`)
            console.log(`  Front edge: ${shelf.frontEdge.toFixed(3)}m (should be LARGER for lower shelves)`)
            console.log(`  Back edge: ${shelf.backEdge.toFixed(3)}m (should be roughly SAME for all)`)
            console.log('')
        })

        // EXPECTATIONS FOR CORRECT BEHAVIOR:
        // 1. Bottom shelf should have LARGEST depth (~0.41m)
        // 2. Middle shelf should be medium depth (~0.25m)
        // 3. Top shelf should have SMALLEST depth (~0.09m)
        // 4. Bottom shelf front edge should extend FURTHEST forward (highest positive Z)
        // 5. All shelves should have roughly the SAME back edge (aligned with back board)

        // Note: We find 6 shelves because each level has 2 meshes (shelf + interior surface)
        expect(shelves.length).toBeGreaterThanOrEqual(3)

        // Filter to just the main shelves by grouping by Y position and taking the thicker one
        const mainShelves: typeof shelves = []
        const yGroups = new Map<string, typeof shelves>()
        
        // Group shelves by similar Y position (within 5cm)
        shelves.forEach(shelf => {
            const yKey = Math.round(shelf.y * 10) / 10 // Round to 0.1m precision
            const key = yKey.toString()
            if (!yGroups.has(key)) {
                yGroups.set(key, [])
            }
            yGroups.get(key)!.push(shelf)
        })
        
        // Take the thickest shelf from each Y group (main shelf, not interior)
        yGroups.forEach(group => {
            group.sort((a, b) => b.depth - a.depth) // Sort by depth descending
            mainShelves.push(group[0]) // Take thickest
        })
        
        mainShelves.sort((a, b) => a.y - b.y) // Sort bottom to top
        expect(mainShelves.length).toBe(3)

        // Check depth progression: bottom > middle > top (CORRECT: bottom shelf should be deepest)
        expect(mainShelves[0].depth).toBeGreaterThan(mainShelves[1].depth)  // Bottom > middle
        expect(mainShelves[1].depth).toBeGreaterThan(mainShelves[2].depth)  // Middle > top

        // Check front edge progression: bottom extends furthest forward
        expect(mainShelves[0].frontEdge).toBeGreaterThan(mainShelves[1].frontEdge)  // Bottom extends most
        expect(mainShelves[1].frontEdge).toBeGreaterThan(mainShelves[2].frontEdge)  // Middle extends more than top

        // Check back edges are roughly aligned (within 5cm tolerance)
        const backEdges = shelves.map(s => s.backEdge)
        const minBack = Math.min(...backEdges)
        const maxBack = Math.max(...backEdges)
        const backVariation = maxBack - minBack
        
        console.log('=== BACK EDGE ALIGNMENT ===')
        console.log(`Back edge variation: ${backVariation.toFixed(3)}m (should be < 0.05m)`)
        console.log(`Min back: ${minBack.toFixed(3)}m, Max back: ${maxBack.toFixed(3)}m`)
        
        expect(backVariation).toBeLessThan(0.05) // Back edges should be aligned within 5cm
    })

    it('should verify shelf extension calculations match expectations', () => {
        const generator = new ProceduralShelfGenerator()
        const shelfUnit = generator.generateShelfUnit(new THREE.Vector3(0, 0, 0), {
            shelfCount: 3,
            shelfExtensionPerLevel: 0.25,
            depth: 0.34,
            boardThickness: 0.05
        })

        // Expected depths with depth*1.5 and shelfExtensionPerLevel
        // baseDepth = 0.34 * 1.5 = 0.51
        // usableDepth = 0.51 - 2*0.05 = 0.41
        // Bottom (i=1): depth = 0.41 + 0.5 = 0.91m
        // Middle (i=2): depth = 0.41 + 0.25 = 0.66m  
        // Top (i=3): depth = 0.41 + 0 = 0.41m

        const shelves: Array<{ y: number; depth: number }> = []
        
        shelfUnit.traverse((child) => {
            if (child instanceof THREE.Mesh && child.geometry instanceof THREE.BoxGeometry) {
                const params = child.geometry.parameters
                if (params.height < 0.1 && params.depth > 0.3) {
                    const worldPos = new THREE.Vector3()
                    child.getWorldPosition(worldPos)
                    shelves.push({ y: worldPos.y, depth: params.depth })
                }
            }
        })

        shelves.sort((a, b) => a.y - b.y)

        // Filter to main shelves only by grouping by Y position
        const mainShelves: typeof shelves = []
        const yGroups = new Map<string, typeof shelves>()
        
        shelves.forEach(shelf => {
            const yKey = Math.round(shelf.y * 10) / 10
            const key = yKey.toString()
            if (!yGroups.has(key)) {
                yGroups.set(key, [])
            }
            yGroups.get(key)!.push(shelf)
        })
        
        yGroups.forEach(group => {
            group.sort((a, b) => b.depth - a.depth)
            mainShelves.push(group[0])
        })
        
        mainShelves.sort((a, b) => a.y - b.y)

        // New formula: extensionFromMiddle = (middleShelf - i) * 0.25
        // middleShelf = (3+1)/2 = 2
        // Bottom (i=1): (2-1)*0.25 = 0.25 → 0.41 + 0.25 = 0.66m
        // Middle (i=2): (2-2)*0.25 = 0 → 0.41 + 0 = 0.41m  
        // Top (i=3): (2-3)*0.25 = -0.25 → 0.41 - 0.25 = 0.16m
        
        console.log('\n=== EXPECTED vs ACTUAL DEPTHS ===')
        console.log(`Bottom: Expected ~0.41m, Actual: ${mainShelves[0]?.depth.toFixed(3)}m`)
        console.log(`Middle: Expected ~0.25m, Actual: ${mainShelves[1]?.depth.toFixed(3)}m`)
        console.log(`Top:    Expected ~0.09m, Actual: ${mainShelves[2]?.depth.toFixed(3)}m`)

        // Allow small floating point tolerance
        // Correct behavior: BOTTOM shelf deepest, TOP shelf shallowest
        expect(mainShelves[0].depth).toBeCloseTo(0.41, 1)  // Bottom: deepest
        expect(mainShelves[1].depth).toBeCloseTo(0.25, 2)  // Middle: medium
        expect(mainShelves[2].depth).toBeCloseTo(0.09, 2)  // Top: shallowest
    })

    it('should verify front/back board positions relative to shelves', () => {
        const generator = new ProceduralShelfGenerator()
        const shelfUnit = generator.generateShelfUnit(new THREE.Vector3(0, 0, 0), {
            shelfCount: 3,
            depth: 0.34
        })

        // Find the angled boards (should be tall with small thickness)
        const boards: Array<{ name: string; z: number; rotX: number }> = []
        const shelves: Array<{ z: number; depth: number; frontEdge: number; backEdge: number }> = []
        
        shelfUnit.traverse((child) => {
            if (child instanceof THREE.Mesh && child.geometry instanceof THREE.BoxGeometry) {
                const params = child.geometry.parameters
                const worldPos = new THREE.Vector3()
                child.getWorldPosition(worldPos)
                
                // Angled boards are tall (large height) and thin (small depth dimension)
                if (params.height > 1.0 && params.depth < 0.1) {
                    const label = worldPos.z > 0 ? 'FRONT' : 'BACK'
                    boards.push({
                        name: label,
                        z: worldPos.z,
                        rotX: child.rotation.x
                    })
                }
                // Shelves are horizontal (small height, large depth)
                else if (params.height < 0.1 && params.depth > 0.3) {
                    shelves.push({
                        z: worldPos.z,
                        depth: params.depth,
                        frontEdge: worldPos.z + params.depth / 2,
                        backEdge: worldPos.z - params.depth / 2
                    })
                }
            }
        })

        console.log('\n=== FRONT/BACK BOARD POSITIONS ===')
        boards.forEach(board => {
            console.log(`${board.name} board: Z = ${board.z.toFixed(3)}m, rotation.x = ${board.rotX.toFixed(3)} rad`)
        })

        // Get bottom shelf (should have furthest extending front edge - deepest shelf)
        const bottomShelf = shelves.sort((a, b) => b.depth - a.depth)[0]
        
        console.log('\n=== SHELF vs BOARD COMPARISON ===')
        console.log(`Bottom shelf front edge: ${bottomShelf.frontEdge.toFixed(3)}m`)
        console.log(`Bottom shelf back edge: ${bottomShelf.backEdge.toFixed(3)}m`)
        console.log(`Bottom shelf center: ${bottomShelf.z.toFixed(3)}m`)
        
        const frontBoard = boards.find(b => b.name === 'FRONT')
        const backBoard = boards.find(b => b.name === 'BACK')
        
        console.log(`\nFRONT board Z: ${frontBoard?.z.toFixed(3)}m`)
        console.log(`BACK board Z: ${backBoard?.z.toFixed(3)}m`)
        
        console.log('\n=== EXPECTED BEHAVIOR ===')
        console.log('Bottom shelf front edge should be BEYOND (greater than) the front board')
        console.log('Bottom shelf back edge should be BEHIND (less than or equal to) the back board')
        console.log('\n=== ACTUAL BEHAVIOR ===')
        if (frontBoard && bottomShelf.frontEdge > frontBoard.z) {
            console.log('✅ Bottom shelf extends beyond front board')
        } else {
            console.log('❌ Bottom shelf does NOT extend beyond front board - BUG!')
        }
        
        if (backBoard && bottomShelf.backEdge <= backBoard.z) {
            console.log('✅ Bottom shelf back aligns with back board')
        } else {
            console.log('❌ Bottom shelf back misaligned with back board - BUG!')
        }

        // The bottom shelf (deepest) should extend past the front board
        expect(frontBoard).toBeDefined()
        expect(bottomShelf.frontEdge).toBeGreaterThan(frontBoard!.z)
    })
})
