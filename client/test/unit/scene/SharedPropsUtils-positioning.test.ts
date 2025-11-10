/**
 * Unit tests for SharedPropsUtils positioning logic
 * Tests the fixes for game box positioning issues discovered in production
 */

import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { GameBoxUtils, GamePlacementConstants, type ShelfSurface, ShelfSide } from '../../../src/scene/props/SharedPropsUtils'
import type { SteamGameData } from '../../../src/scene/game-box/types/GameData'

describe('SharedPropsUtils - Game Positioning Fixes', () => {
    
    const mockGames: SteamGameData[] = [
        { appid: 1, name: 'Game 1', playtime_forever: 100 },
        { appid: 2, name: 'Game 2', playtime_forever: 200 },
        { appid: 3, name: 'Game 3', playtime_forever: 300 }
    ]

    describe('GameBoxUtils.calculateGamePositions', () => {
        
        it('should position games correctly relative to shelf and surface coordinates', () => {
            const shelfPosition = new THREE.Vector3(10, 5, 2)
            const surface: ShelfSurface = {
                topY: 1.5,      // Surface top in world coordinates
                frontZ: -0.2,   // Front Z in shelf-relative coordinates
                backZ: 0.2,     // Back Z in shelf-relative coordinates  
                centerX: 0,     // Center X in shelf-relative coordinates
                width: 2.0
            }
            
            const positions = GameBoxUtils.calculateGamePositions(shelfPosition, surface, mockGames, ShelfSide.Front)
            
            // Verify we get 3 positions
            expect(positions).toHaveLength(3)
            
            // Check Y positioning: shelfPosition.y + surface.topY + Y_OFFSET + GAME_HEIGHT/2
            const expectedY = shelfPosition.y + surface.topY + GamePlacementConstants.Y_OFFSET + GamePlacementConstants.GAME_HEIGHT / 2
            positions.forEach(pos => {
                expect(pos.y).toBeCloseTo(expectedY, 3)
            })
            
            // Check Z positioning: shelf Z + surface Z + offset
            const expectedZ = shelfPosition.z + surface.frontZ + GamePlacementConstants.Z_OFFSET
            positions.forEach(pos => {
                expect(pos.z).toBeCloseTo(expectedZ, 3)
            })
            
            // Check X positioning: games should be centered and spaced correctly
            const totalWidth = (mockGames.length - 1) * GamePlacementConstants.GAME_SPACING
            const expectedStartX = shelfPosition.x + surface.centerX - totalWidth / 2
            
            positions.forEach((pos, i) => {
                const expectedX = expectedStartX + (i * GamePlacementConstants.GAME_SPACING)
                expect(pos.x).toBeCloseTo(expectedX, 3)
            })
        })

        it('should handle back-facing games correctly', () => {
            const shelfPosition = new THREE.Vector3(0, 0, 0)
            const surface: ShelfSurface = {
                topY: 1.0,
                frontZ: -0.25,
                backZ: 0.25,
                centerX: 0,
                width: 2.0
            }
            
            const frontPositions = GameBoxUtils.calculateGamePositions(shelfPosition, surface, [mockGames[0]], ShelfSide.Front)
            const backPositions = GameBoxUtils.calculateGamePositions(shelfPosition, surface, [mockGames[0]], ShelfSide.Back)
            
            // Front and back should have different Z positions
            const frontZ = shelfPosition.z + surface.frontZ + GamePlacementConstants.Z_OFFSET
            const backZ = shelfPosition.z + surface.backZ - GamePlacementConstants.Z_OFFSET
            
            expect(frontPositions[0].z).toBeCloseTo(frontZ, 3)
            expect(backPositions[0].z).toBeCloseTo(backZ, 3)
            
            // Other coordinates should be the same
            expect(frontPositions[0].x).toBeCloseTo(backPositions[0].x, 3)
            expect(frontPositions[0].y).toBeCloseTo(backPositions[0].y, 3)
        })

        it('should not place games at origin when shelf has non-zero position', () => {
            const shelfPosition = new THREE.Vector3(15, 10, 8)
            const surface: ShelfSurface = {
                topY: 2.5,
                frontZ: -0.3,
                backZ: 0.3,
                centerX: 0.1,
                width: 1.8
            }
            
            const positions = GameBoxUtils.calculateGamePositions(shelfPosition, surface, [mockGames[0]], ShelfSide.Front)
            
            // None of the coordinates should be zero (games at origin bug)
            expect(positions[0].x).not.toBe(0)
            expect(positions[0].y).not.toBe(0)
            expect(positions[0].z).not.toBe(0)
            
            // Should be positioned relative to shelf position
            expect(Math.abs(positions[0].x - shelfPosition.x)).toBeLessThan(5) // Within reasonable bounds
            expect(positions[0].y).toBeGreaterThan(shelfPosition.y) // Games above shelf base
            expect(Math.abs(positions[0].z - shelfPosition.z)).toBeLessThan(5) // Within reasonable bounds
        })

        it('should maintain consistent spacing between games', () => {
            const shelfPosition = new THREE.Vector3(0, 0, 0)
            const surface: ShelfSurface = {
                topY: 1.0,
                frontZ: -0.2,
                backZ: 0.2,
                centerX: 0,
                width: 3.0
            }
            
            const positions = GameBoxUtils.calculateGamePositions(shelfPosition, surface, mockGames, ShelfSide.Front)
            
            // Check spacing between adjacent games
            for (let i = 1; i < positions.length; i++) {
                const spacing = positions[i].x - positions[i-1].x
                expect(spacing).toBeCloseTo(GamePlacementConstants.GAME_SPACING, 3)
            }
        })

        it('should center games correctly on narrow and wide shelves', () => {
            const shelfPosition = new THREE.Vector3(0, 0, 0)
            
            // Test narrow shelf
            const narrowSurface: ShelfSurface = {
                topY: 1.0,
                frontZ: -0.1,
                backZ: 0.1,
                centerX: 0,
                width: 1.0
            }
            
            // Test wide shelf  
            const wideSurface: ShelfSurface = {
                topY: 1.0,
                frontZ: -0.3,
                backZ: 0.3,
                centerX: 0,
                width: 4.0
            }
            
            const narrowPositions = GameBoxUtils.calculateGamePositions(shelfPosition, narrowSurface, mockGames, ShelfSide.Front)
            const widePositions = GameBoxUtils.calculateGamePositions(shelfPosition, wideSurface, mockGames, ShelfSide.Front)
            
            // Games should be centered on both shelves (middle game at centerX)
            const narrowMiddleX = narrowPositions[1].x // middle game
            const wideMiddleX = widePositions[1].x // middle game
            
            expect(narrowMiddleX).toBeCloseTo(narrowSurface.centerX, 3)
            expect(wideMiddleX).toBeCloseTo(wideSurface.centerX, 3)
        })
    })
    
    describe('Regression Tests', () => {
        
        it('should fix Issue #1: Games floating above shelves', () => {
            // Before fix: games were positioned too high due to Y coordinate double-counting
            const shelfPosition = new THREE.Vector3(0, 0, 0)
            const surface: ShelfSurface = {
                topY: 1.0, // 1 meter high shelf
                frontZ: -0.2,
                backZ: 0.2,
                centerX: 0,
                width: 2.0
            }
            
            const positions = GameBoxUtils.calculateGamePositions(shelfPosition, surface, [mockGames[0]], ShelfSide.Front)
            
            // Game should be positioned so its bottom sits on the shelf surface
            // Game center Y should be: surface.topY + Y_OFFSET + GAME_HEIGHT/2
            const expectedGameCenterY = surface.topY + GamePlacementConstants.Y_OFFSET + GamePlacementConstants.GAME_HEIGHT / 2
            
            expect(positions[0].y).toBeCloseTo(expectedGameCenterY, 3)
            
            // Game bottom should be approximately at shelf surface (allowing for small offset)
            const gameBottomY = positions[0].y - GamePlacementConstants.GAME_HEIGHT / 2
            const expectedGameBottomY = surface.topY + GamePlacementConstants.Y_OFFSET
            
            expect(gameBottomY).toBeCloseTo(expectedGameBottomY, 3)
        })
        
        it('should fix Issue #2: Games appearing at origin', () => {
            // After overcorrection: games were appearing at (0,0,0) due to missing position offsets
            const shelfPosition = new THREE.Vector3(20, 15, 10)
            const surface: ShelfSurface = {
                topY: 2.0,
                frontZ: -0.25,
                backZ: 0.25,
                centerX: 0.5,
                width: 1.5
            }
            
            const positions = GameBoxUtils.calculateGamePositions(shelfPosition, surface, [mockGames[0]], ShelfSide.Front)
            
            // Games should NOT be at origin
            expect(positions[0].x).not.toBe(0)
            expect(positions[0].y).not.toBe(0)
            expect(positions[0].z).not.toBe(0)
            
            // Games should be positioned relative to shelf position
            expect(positions[0].x).toBeCloseTo(shelfPosition.x + surface.centerX, 2)
            expect(positions[0].y).toBe(shelfPosition.y + surface.topY + GamePlacementConstants.Y_OFFSET + GamePlacementConstants.GAME_HEIGHT / 2)
            expect(positions[0].z).toBeCloseTo(shelfPosition.z + surface.frontZ + GamePlacementConstants.Z_OFFSET, 3)
        })
    })
})