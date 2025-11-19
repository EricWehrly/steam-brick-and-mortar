/**
 * Shelf Spacing Integration Test
 * 
 * Tests that shelves don't cluster or overlap when spawned in multiple rows.
 * Specifically targets the issue where shelves at the "back" of rows share
 * or overlap positions.
 */

import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { VRLayoutUtils } from '../../src/scene/props/shared/VRLayoutUtils'
import { RoomConstants } from '../../src/scene/RoomManager'

describe('Shelf Spacing - Row Positioning', () => {
    describe('VRLayoutUtils.calculateOptimalRowPosition', () => {
        it('should maintain minimum spacing between consecutive rows', () => {
            const positions: number[] = []
            const rowCount = 10
            
            // Calculate positions for multiple rows
            for (let i = 0; i < rowCount; i++) {
                positions.push(VRLayoutUtils.calculateOptimalRowPosition(i))
            }
            
            // Check that consecutive rows maintain minimum spacing
            const minSpacing = RoomConstants.SHELF_SPACING_Z * 0.5 // Allow 50% compression
            
            for (let i = 1; i < positions.length; i++) {
                const spacing = Math.abs(positions[i] - positions[i - 1])
                expect(spacing, `Row ${i} and ${i-1} spacing (${spacing.toFixed(2)}) is less than minimum (${minSpacing.toFixed(2)})`).toBeGreaterThan(minSpacing)
            }
        })
        
        it('should not cluster rows at maximum depth', () => {
            const positions: number[] = []
            const rowCount = 10
            
            // Calculate positions for multiple rows
            for (let i = 0; i < rowCount; i++) {
                positions.push(VRLayoutUtils.calculateOptimalRowPosition(i))
            }
            
            // Check for clustering - no more than 2 shelves should share the same Z position
            const positionCounts = new Map<number, number>()
            
            positions.forEach(pos => {
                const roundedPos = Math.round(pos * 10) / 10 // Round to 0.1 precision
                positionCounts.set(roundedPos, (positionCounts.get(roundedPos) || 0) + 1)
            })
            
            positionCounts.forEach((count, position) => {
                expect(count, `Too many shelves (${count}) clustered at z=${position}`).toBeLessThanOrEqual(2)
            })
        })
        
        it('should produce progressively deeper positions', () => {
            const positions: number[] = []
            const rowCount = 5
            
            for (let i = 0; i < rowCount; i++) {
                positions.push(VRLayoutUtils.calculateOptimalRowPosition(i))
            }
            
            // Each row should be behind (lower Z) than the previous
            for (let i = 1; i < positions.length; i++) {
                expect(positions[i], `Row ${i} (z=${positions[i]}) should be behind row ${i-1} (z=${positions[i-1]})`).toBeLessThan(positions[i - 1])
            }
        })
        
        it('should handle large row counts without excessive clustering', () => {
            const positions: number[] = []
            const rowCount = 20 // Test with many rows
            
            for (let i = 0; i < rowCount; i++) {
                positions.push(VRLayoutUtils.calculateOptimalRowPosition(i))
            }
            
            // Calculate unique positions (within 0.1 units)
            const uniquePositions = new Set(
                positions.map(p => Math.round(p * 10) / 10)
            )
            
            // Should have at least 50% unique positions (not all clustered)
            const uniqueRatio = uniquePositions.size / rowCount
            expect(uniqueRatio, `Only ${uniquePositions.size} unique positions out of ${rowCount} rows (${(uniqueRatio * 100).toFixed(1)}%)`).toBeGreaterThan(0.5)
        })
    })
    
    describe('Shelf Row Positioning Integration', () => {
        it('should create distinct row positions for multi-row layouts', () => {
            const shelvesNeeded = 16 // 4 rows × 4 shelves
            const maxShelvesPerRow = 4
            const rows = Math.ceil(shelvesNeeded / maxShelvesPerRow)
            
            const rowPositions: THREE.Vector3[] = []
            
            // Simulate row creation logic from GpuStorePropsRenderer
            for (let row = 0; row < rows; row++) {
                const rowZ = VRLayoutUtils.calculateOptimalRowPosition(row)
                const shelfSpacing = VRLayoutUtils.calculateOptimalShelfSpacing(maxShelvesPerRow)
                const startX = -(maxShelvesPerRow - 1) * shelfSpacing / 2
                
                for (let i = 0; i < maxShelvesPerRow; i++) {
                    rowPositions.push(new THREE.Vector3(
                        startX + (i * shelfSpacing),
                        0,
                        rowZ
                    ))
                }
            }
            
            // Group by Z position
            const shelvesPerZ = new Map<number, number>()
            rowPositions.forEach(pos => {
                const roundedZ = Math.round(pos.z * 10) / 10
                shelvesPerZ.set(roundedZ, (shelvesPerZ.get(roundedZ) || 0) + 1)
            })
            
            // Each Z position should have exactly 4 shelves (one row)
            shelvesPerZ.forEach((count, z) => {
                expect(count, `Z position ${z} has ${count} shelves, expected ${maxShelvesPerRow}`).toBe(maxShelvesPerRow)
            })
            
            // Should have exactly 4 distinct Z positions (4 rows)
            expect(shelvesPerZ.size, `Should have ${rows} distinct Z positions, found ${shelvesPerZ.size}`).toBe(rows)
        })
    })
})
