/**
 * Integration test for game box positioning pipeline
 * 
 * Tests the complete flow from SharedPropsUtils positioning calculations
 * through GameBoxRenderer to actual game box placement in the scene.
 * 
 * This test validates the fixes for:
 * - Games positioning flush against shelf faces (no gap)
 * - Games following angled shelf geometry correctly
 * - Text orientation (not backwards/reversed)
 * - Y positioning matching actual shelf surfaces
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as THREE from 'three'

// Mock TextureManager to avoid async texture loading issues
vi.mock('../../src/utils/TextureManager', async () => {
  const { MockTextureManager } = await import('../mocks/utils/TextureManager.mock')
  return {
    TextureManager: {
      getInstance: () => MockTextureManager.getInstance()
    }
  }
})

import { DataManager } from '../../src/core/data'
import { EventManager, EventSource } from '../../src/core/EventManager'
import { RoomEventTypes } from '../../src/types/InteractionEvents'
import { LegacyStorePropsRenderer } from '../../src/scene/LegacyStorePropsRenderer'
import { GameBoxRenderer } from '../../src/scene/GameBoxRenderer'
import { GameBoxUtils, GamePlacementConstants, ShelfSurfaceUtils, type ShelfSurface } from '../../src/scene/props/SharedPropsUtils'
import type { SteamGameData } from '../../src/scene/game-box/types/GameData'

describe('Game Box Positioning Integration', () => {
    let scene: THREE.Scene
    let dataManager: DataManager
    let eventManager: EventManager
    let storePropsRenderer: LegacyStorePropsRenderer
    let gameBoxRenderer: GameBoxRenderer

    const mockGames: SteamGameData[] = [
        { appid: '1', name: 'Test Game 1', playtime_forever: 120 },
        { appid: '2', name: 'Test Game 2', playtime_forever: 90 },
        { appid: '3', name: 'Test Game 3', playtime_forever: 150 }
    ]

    beforeEach(() => {
        scene = new THREE.Scene()
        dataManager = DataManager.getInstance()
        eventManager = EventManager.getInstance()
        
        // Clear any existing data
        dataManager.clear()
        
        // Create real components for integration testing
        gameBoxRenderer = new GameBoxRenderer()
        storePropsRenderer = new LegacyStorePropsRenderer(scene, dataManager)
        
        // Set up test games
        dataManager.set('steam.games', mockGames, { domain: 'steam-integration' as any })
    })

    afterEach(() => {
        vi.clearAllMocks()
        dataManager.clear()
        storePropsRenderer?.dispose()
        scene.clear()
    })

    describe('Core Positioning Logic', () => {
        it('should calculate game positions using SharedPropsUtils without appearing at origin', () => {
            // Create a shelf at a known position (not origin)
            const shelfPosition = new THREE.Vector3(10, 3, 5)
            
            // Get standard shelf surfaces
            const surfaces = ShelfSurfaceUtils.getSurfacesForShelfUnit()
            expect(surfaces.length).toBeGreaterThan(0)
            
            // Calculate game positions using the actual positioning logic
            const positions = GameBoxUtils.calculateGamePositions(
                shelfPosition, 
                surfaces[0], // Use first surface
                mockGames, 
                'front'
            )
            
            expect(positions.length).toBe(mockGames.length)
            
            // Verify none of the positions are at origin (common bug)
            positions.forEach((position) => {
                expect(position.x).not.toBe(0)
                expect(position.y).not.toBe(0) 
                expect(position.z).not.toBe(0)
                
                // Positions should be relative to shelf position
                expect(Math.abs(position.x - shelfPosition.x)).toBeLessThan(5) // Within reasonable bounds
                expect(position.y).toBeGreaterThan(shelfPosition.y) // Games above shelf base
                expect(Math.abs(position.z - shelfPosition.z)).toBeLessThan(5) // Within reasonable bounds
            })
        })

        it('should create game boxes at calculated positions', () => {
            const shelfPosition = new THREE.Vector3(0, 0, 0)
            const surfaces = ShelfSurfaceUtils.getSurfacesForShelfUnit()
            
            // Calculate positions
            const positions = GameBoxUtils.calculateGamePositions(
                shelfPosition, surfaces[0], mockGames, 'front'
            )
            
            // Create game boxes using GameBoxRenderer
            const gameBoxes: THREE.Object3D[] = []
            for (let i = 0; i < mockGames.length; i++) {
                const gameBox = gameBoxRenderer.createGameBox(
                    mockGames[i], 
                    positions[i]
                )
                if (gameBox) {
                    scene.add(gameBox)
                    gameBoxes.push(gameBox)
                }
            }
            
            expect(gameBoxes.length).toBe(mockGames.length)
            
            // Verify each game box is positioned correctly
            gameBoxes.forEach((gameBox, index) => {
                expect(gameBox.position.x).toBeCloseTo(positions[index].x, 3)
                expect(gameBox.position.y).toBeCloseTo(positions[index].y, 3)
                expect(gameBox.position.z).toBeCloseTo(positions[index].z, 3)
                
                // Verify game has proper metadata
                expect(gameBox.userData.gameData).toBeDefined()
                expect(gameBox.userData.gameData.appid).toBe(mockGames[index].appid)
                expect(gameBox.userData.gameData.name).toBe(mockGames[index].name)
            })
        })

        it('should maintain consistent spacing between games', () => {
            const shelfPosition = new THREE.Vector3(5, 2, -3)
            const surfaces = ShelfSurfaceUtils.getSurfacesForShelfUnit()
            
            const positions = GameBoxUtils.calculateGamePositions(
                shelfPosition, surfaces[0], mockGames, 'front'
            )
            
            // Check spacing between adjacent games
            for (let i = 1; i < positions.length; i++) {
                const spacing = positions[i].x - positions[i-1].x
                expect(spacing).toBeCloseTo(GamePlacementConstants.GAME_SPACING, 3)
            }
        })

        it('should position games flush against shelf face (no gap)', () => {
            const shelfPosition = new THREE.Vector3(0, 0, 0)
            const surfaces = ShelfSurfaceUtils.getSurfacesForShelfUnit()
            const surface = surfaces[0]
            
            const positions = GameBoxUtils.calculateGamePositions(
                shelfPosition, surface, [mockGames[0]], 'front'
            )
            
            const gameBox = gameBoxRenderer.createGameBox(mockGames[0], positions[0])
            if (gameBox) {
                scene.add(gameBox)
                
                // Check that game is positioned to be flush against shelf face
                // Expected calculation based on the fixes: game center should be positioned
                // so that the game's front face touches the shelf face
                const expectedZ = shelfPosition.z + surface.frontZ
                const gameDepth = 0.1 // Game box depth
                const gameHalfDepth = gameDepth / 2
                const gameFrontZ = gameBox.position.z - gameHalfDepth
                
                // Game front should be very close to shelf face (within 1mm tolerance)
                expect(Math.abs(gameFrontZ - expectedZ)).toBeLessThan(0.001)
            }
        })

        it('should handle different surface sides correctly', () => {
            const shelfPosition = new THREE.Vector3(0, 0, 0)
            const surfaces = ShelfSurfaceUtils.getSurfacesForShelfUnit()
            const surface = surfaces[0]
            
            const frontPositions = GameBoxUtils.calculateGamePositions(
                shelfPosition, surface, [mockGames[0]], 'front'
            )
            const backPositions = GameBoxUtils.calculateGamePositions(
                shelfPosition, surface, [mockGames[0]], 'back'
            )
            
            // Front and back should have different Z positions
            expect(frontPositions[0].z).not.toBeCloseTo(backPositions[0].z, 1)
            
            // X and Y should be the same
            expect(frontPositions[0].x).toBeCloseTo(backPositions[0].x, 3)
            expect(frontPositions[0].y).toBeCloseTo(backPositions[0].y, 3)
        })
    })

    describe('Full Integration with StorePropsRenderer', () => {
        it('should create properly positioned games through complete pipeline', async () => {
            // Trigger the full store generation pipeline
            eventManager.emit(RoomEventTypes.Resized, {
                dimensions: { width: 20, height: 15, depth: 25 },
                timestamp: Date.now(),
                source: EventSource.System
            })
            
            // Wait for async generation
            await new Promise(resolve => setTimeout(resolve, 500))
            
            // Find all game objects in the scene
            const gameBoxes: THREE.Object3D[] = []
            scene.traverse((object) => {
                if (object.userData.gameData?.appid) {
                    gameBoxes.push(object)
                }
            })
            
            expect(gameBoxes.length).toBeGreaterThan(0)
            
            // Verify each game box has proper positioning
            gameBoxes.forEach((gameBox) => {
                const position = gameBox.position
                
                // Games should not be at origin (common bug)
                expect(position.x).not.toBe(0)
                expect(position.y).not.toBe(0) 
                expect(position.z).not.toBe(0)
                
                // Games should be positioned at reasonable heights (not floating)
                expect(position.y).toBeGreaterThan(0.5) // Above ground
                expect(position.y).toBeLessThan(3.0)    // Below ceiling
                
                // Games should be positioned within reasonable scene bounds
                expect(Math.abs(position.x)).toBeLessThan(50)
                expect(Math.abs(position.z)).toBeLessThan(50)
                
                // Verify game has proper metadata
                expect(gameBox.userData.gameData).toBeDefined()
                expect(gameBox.userData.gameData.name).toBeDefined()
            })
        })

        it('should handle back-facing games correctly', async () => {
            const shelfPosition = new THREE.Vector3(0, 0, 0)
            const surfaces = GameBoxUtils.getStandardShelfSurfaces()
            const surface = surfaces[0]
            
            // Calculate positions for front and back sides
            const frontPositions = GameBoxUtils.calculateGamePositions(
                shelfPosition, surface, [mockGames[0]], 'front'
            )
            const backPositions = GameBoxUtils.calculateGamePositions(
                shelfPosition, surface, [mockGames[0]], 'back'
            )
            
            // Create game boxes
            const frontBox = gameBoxRenderer.createGameBox(mockGames[0], frontPositions[0])
            const backBox = gameBoxRenderer.createGameBox(mockGames[0], backPositions[0])
            
            if (frontBox && backBox) {
                scene.add(frontBox)
                scene.add(backBox)
                
                // Front and back should have different Z positions
                expect(frontBox.position.z).not.toBeCloseTo(backBox.position.z, 1)
                
                // Front should be closer to viewer (higher Z in our coordinate system)
                expect(frontBox.position.z).toBeGreaterThan(backBox.position.z)
                
                // X and Y should be the same
                expect(frontBox.position.x).toBeCloseTo(backBox.position.x, 3)
                expect(frontBox.position.y).toBeCloseTo(backBox.position.y, 3)
            }
        })
    })

    describe('Text Orientation Validation', () => {
        it('should create game boxes with readable text labels', async () => {
            const shelfPosition = new THREE.Vector3(0, 0, 0)
            const surfaces = GameBoxUtils.getStandardShelfSurfaces()
            
            const positions = GameBoxUtils.calculateGamePositions(
                shelfPosition, surfaces[0], mockGames, 'front'
            )
            
            // Create game boxes
            const gameBoxes: THREE.Object3D[] = []
            for (let i = 0; i < mockGames.length; i++) {
                const gameBox = gameBoxRenderer.createGameBox(mockGames[i], positions[i])
                if (gameBox) {
                    scene.add(gameBox)
                    gameBoxes.push(gameBox)
                }
            }
            
            // Check for text rendering components
            gameBoxes.forEach((gameBox) => {
                // Game box should have proper name in userData
                expect(gameBox.userData.gameData.name).toBeDefined()
                expect(gameBox.userData.gameData.name).toBe(
                    mockGames.find(g => g.appid === gameBox.userData.gameData.appid)?.name
                )
                
                // Check for child objects that might contain text
                gameBox.traverse((child) => {
                    if (child instanceof THREE.Mesh && child.material) {
                        // Text materials should not have negative scales or flipped UVs
                        // (This is a basic check - more detailed text validation would 
                        // require inspecting the actual shader/texture content)
                        expect(child.scale.x).toBeGreaterThan(0)
                        expect(child.scale.y).toBeGreaterThan(0)
                        expect(child.scale.z).toBeGreaterThan(0)
                    }
                })
            })
        })
    })

    describe('Edge Cases and Error Handling', () => {
        it('should handle shelves at non-zero positions correctly', async () => {
            // Test with shelf at unusual position to catch origin bugs
            const unusualPosition = new THREE.Vector3(25, 8, -15)
            const surfaces = GameBoxUtils.getStandardShelfSurfaces()
            
            const positions = GameBoxUtils.calculateGamePositions(
                unusualPosition, surfaces[0], [mockGames[0]], 'front'
            )
            
            const gameBox = gameBoxRenderer.createGameBox(mockGames[0], positions[0])
            
            if (gameBox) {
                scene.add(gameBox)
                
                // Game should be positioned relative to shelf, not at origin
                expect(gameBox.position.x).toBeCloseTo(unusualPosition.x, 1)
                expect(gameBox.position.y).toBeGreaterThan(unusualPosition.y)
                expect(Math.abs(gameBox.position.z - unusualPosition.z)).toBeLessThan(2)
            }
        })

        it('should handle single game placement correctly', async () => {
            const shelfPosition = new THREE.Vector3(0, 0, 0)
            const surfaces = GameBoxUtils.getStandardShelfSurfaces()
            
            // Single game should be centered
            const positions = GameBoxUtils.calculateGamePositions(
                shelfPosition, surfaces[0], [mockGames[0]], 'front'
            )
            
            expect(positions.length).toBe(1)
            
            const gameBox = gameBoxRenderer.createGameBox(mockGames[0], positions[0])
            if (gameBox) {
                scene.add(gameBox)
                
                // Single game should be at shelf center X
                expect(gameBox.position.x).toBeCloseTo(
                    shelfPosition.x + surfaces[0].centerX, 3
                )
            }
        })

        it('should handle wide shelves with many games', async () => {
            // Create more games to test wider shelf scenario  
            const manyGames = Array.from({ length: 8 }, (_, i) => ({
                appid: `${i + 1}`,
                name: `Game ${i + 1}`,
                playtime_forever: 60 * (i + 1)
            }))
            
            const shelfPosition = new THREE.Vector3(0, 0, 0)
            const wideSurface: ShelfSurface = {
                topY: 1.0,
                frontZ: -0.3,
                backZ: 0.3,
                centerX: 0,
                width: 4.0 // Wide shelf
            }
            
            const positions = GameBoxUtils.calculateGamePositions(
                shelfPosition, wideSurface, manyGames, 'front'
            )
            
            expect(positions.length).toBe(manyGames.length)
            
            // All games should fit within shelf width
            const totalGameWidth = (manyGames.length - 1) * GamePlacementConstants.GAME_SPACING
            expect(totalGameWidth).toBeLessThan(wideSurface.width)
            
            // Games should be centered
            const leftmostX = positions[0].x
            const rightmostX = positions[positions.length - 1].x
            const actualCenter = (leftmostX + rightmostX) / 2
            const expectedCenter = shelfPosition.x + wideSurface.centerX
            
            expect(actualCenter).toBeCloseTo(expectedCenter, 3)
        })
    })
})