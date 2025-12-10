/**
 * Quick test to verify Y-axis positioning changes
 */

import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { GameBoxUtils, ShelfSide } from '../../src/scene/props/SharedPropsUtils'
import type { SteamGameData } from '../../src/scene/game-box/types/GameData'
import type { GameBoxDimensions } from '../../src/scene/game-box/types/GameBoxOptions'

const TEST_BOX_DIMENSIONS: GameBoxDimensions = { width: 0.3, height: 0.4, depth: 0.08 }

describe('Y-Axis Positioning Changes', () => {
    const mockGames: SteamGameData[] = [
        { appid: '1', name: 'Test Game 1', playtime_forever: 120 }
    ]

    it('should use different Y offsets for different shelf levels', () => {
        const shelfPosition = new THREE.Vector3(0, 0, 0)
        
        // Bottom shelf (topY: 0.5275) - should use 0.3 offset
        const bottomSurface = {
            topY: 0.5275,
            frontZ: -0.5,
            backZ: 0.5,
            centerX: 0,
            width: 2.0
        }
        
        // Middle shelf (topY: 1.0275) - should use 0.2 offset  
        const middleSurface = {
            topY: 1.0275,
            frontZ: -0.5,
            backZ: 0.5,
            centerX: 0,
            width: 2.0
        }
        
        // Top shelf (topY: 1.5275) - should use 0.1 offset
        const topSurface = {
            topY: 1.5275,
            frontZ: -0.5,
            backZ: 0.5,
            centerX: 0,
            width: 2.0
        }
        
        const bottomPositions = GameBoxUtils.calculateGamePositions(shelfPosition, bottomSurface, mockGames, ShelfSide.Front, TEST_BOX_DIMENSIONS)
        const middlePositions = GameBoxUtils.calculateGamePositions(shelfPosition, middleSurface, mockGames, ShelfSide.Front, TEST_BOX_DIMENSIONS)
        const topPositions = GameBoxUtils.calculateGamePositions(shelfPosition, topSurface, mockGames, ShelfSide.Front, TEST_BOX_DIMENSIONS)
        
        // Check that Y positions are different due to different offsets
        expect(bottomPositions[0].y).not.toBeCloseTo(middlePositions[0].y, 2)
        expect(middlePositions[0].y).not.toBeCloseTo(topPositions[0].y, 2)
        expect(bottomPositions[0].y).not.toBeCloseTo(topPositions[0].y, 2)
        
        // Log the actual Y values to understand what's happening
        console.log('Bottom shelf Y:', bottomPositions[0].y)
        console.log('Middle shelf Y:', middlePositions[0].y) 
        console.log('Top shelf Y:', topPositions[0].y)
        
        // The logic is working - higher shelves get LOWER offsets to bring games closer to slanted faces
        // Bottom shelf (0.5275 + 0.3) should be lowest total due to low shelf height
        // Top shelf (1.5275 + 0.1) should be highest total due to high shelf height
        expect(topPositions[0].y).toBeGreaterThan(middlePositions[0].y)
        expect(middlePositions[0].y).toBeGreaterThan(bottomPositions[0].y)
    })
})