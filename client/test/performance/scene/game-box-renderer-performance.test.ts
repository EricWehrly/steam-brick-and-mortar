/**
 * Performance optimization tests for texture management and large libraries
 * Tests Task 5.2.2.2 implementation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as THREE from 'three'
import { GameBoxRenderer, type SteamGameData, type TexturePerformanceConfig } from '../../../src/scene'

// Mock URL object methods
Object.defineProperty(globalThis, 'URL', {
    value: {
        createObjectURL: vi.fn(() => 'mock-blob-url'),
        revokeObjectURL: vi.fn()
    },
    writable: true
})

// Mock Image constructor
Object.defineProperty(globalThis, 'Image', {
    value: class MockImage {
        onload?: () => void
        onerror?: () => void
        src?: string
        width = 512
        height = 512
        
        constructor() {
            // Simulate successful image load after a short delay
            setTimeout(() => {
                if (this.onload) {
                    this.onload()
                }
            }, 10)
        }
    },
    writable: true
})

// Mock canvas context
const mockCanvas = {
    getContext: vi.fn(() => ({
        drawImage: vi.fn(),
    })),
    width: 0,
    height: 0
}

Object.defineProperty(globalThis, 'document', {
    value: {
        createElement: vi.fn(() => mockCanvas)
    },
    writable: true
})

describe('GameBox Renderer Performance - Experimental Features', () => {
    let renderer: GameBoxRenderer
    let scene: THREE.Scene
    let camera: THREE.PerspectiveCamera
    let mockGameData: SteamGameData[]
    let performanceManager: any
    let textureManager: any
    
    beforeEach(() => {
        const performanceConfig: TexturePerformanceConfig = {
            maxTextureSize: 1024,
            nearDistance: 2.0,
            farDistance: 10.0,
            highResolutionSize: 512,
            mediumResolutionSize: 256,
            lowResolutionSize: 128,
            maxActiveTextures: 10, // Low limit for testing
            frustumCullingEnabled: true
        }
        
        renderer = new GameBoxRenderer({}, {}, performanceConfig)
        performanceManager = renderer.getPerformanceManager()
        textureManager = renderer.getTextureManager()
        scene = new THREE.Scene()
        camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000)
        camera.position.set(0, 0, 0)
        
        // Create mock game data
        mockGameData = Array.from({ length: 20 }, (_, i) => ({
            appid: i + 1,
            name: `Test Game ${i + 1}`,
            playtime_forever: 120,
            artwork: {
                icon: `https://test.com/icon${i}.jpg`,
                logo: `https://test.com/logo${i}.jpg`,
                header: `https://test.com/header${i}.jpg`,
                library: `https://test.com/library${i}.jpg`
            }
        }))
    })
    
    afterEach(() => {
        scene.clear()
        vi.clearAllMocks()
    })
    
    describe('Texture Resolution Scaling', () => {
        it('should select high resolution for near objects', () => {
            const nearDistance = 1.5
            const resolution = performanceManager?.getOptimalTextureResolution(nearDistance) ?? 256
            expect(resolution).toBe(512) // High resolution
        })
        
        it('should select medium resolution for medium distance objects', () => {
            const mediumDistance = 5.0
            const resolution = performanceManager?.getOptimalTextureResolution(mediumDistance) ?? 256
            expect(resolution).toBe(256) // Medium resolution
        })
        
        it('should select low resolution for far objects', () => {
            const farDistance = 15.0
            const resolution = performanceManager?.getOptimalTextureResolution(farDistance) ?? 256
            expect(resolution).toBe(128) // Low resolution
        })
    })
    
    describe('Performance Data Management', () => {
        it('should update performance data for all game boxes', () => {
            // Create some game boxes positioned in front of camera
            const gameBoxes = mockGameData.slice(0, 5).map((game, index) => {
                const box = renderer.createGameBox(scene, game, index)
                if (box) {
                    // Position boxes in front of camera (camera looks down -Z axis by default)
                    box.position.set(index * 2 - 4, 0, -5)
                }
                return box
            }).filter(box => box !== null)
            
            expect(gameBoxes).toHaveLength(5)
            
            // Position camera to look at the boxes
            camera.position.set(0, 0, 0)
            camera.lookAt(0, 0, -5)
            camera.updateMatrixWorld()
            
            // Update performance data
            renderer.updatePerformanceData(camera, scene)
            
            // Check performance stats
            const stats = renderer.getPerformanceStats()
            expect(stats.totalGameBoxes).toBe(5)
            expect(stats.visibleGameBoxes).toBeGreaterThan(0)
        })
        
        it('should track viewing distance correctly', () => {
            // Create a game box at a specific position
            const game = mockGameData[0]
            const gameBox = renderer.createGameBox(scene, game, 0)
            expect(gameBox).toBeDefined()
            
            if (gameBox) {
                gameBox.position.set(5, 0, 0) // 5 units away on X axis
                
                // Update performance data
                renderer.updatePerformanceData(camera, scene)
                
                // Check that distance is calculated correctly
                expect(gameBox.userData.distanceFromCamera).toBeCloseTo(5, 1)
            }
        })
    })
    
    describe('Lazy Loading', () => {
        it('should skip texture loading for off-screen objects when lazy loading enabled', async () => {
            const game = mockGameData[0]
            const gameBox = renderer.createGameBox(scene, game, 0)
            expect(gameBox).toBeDefined()
            
            if (gameBox) {
                // Position game box far off to the side (should be off-screen)
                gameBox.position.set(100, 0, 0)
                
                // Update performance data first
                renderer.updatePerformanceData(camera, scene)
                
                // Try to apply texture with lazy loading enabled
                const mockBlob = new Blob(['test'], { type: 'image/jpeg' })
                const artworkBlobs = { library: mockBlob, header: null, logo: null, icon: null }
                
                const result = await textureManager.applyOptimizedTexture(gameBox, game, {
                    artworkBlobs,
                    enableLazyLoading: true
                })
                
                // Should skip loading because object is off-screen
                expect(result).toBe(false)
            }
        })
        
        it('should load textures for visible objects even with lazy loading', async () => {
            const game = mockGameData[0]
            const gameBox = renderer.createGameBox(scene, game, 0)
            expect(gameBox).toBeDefined()
            
            if (gameBox) {
                // Position game box in front of camera (should be visible)
                gameBox.position.set(0, 0, -2)
                
                // Update performance data first
                renderer.updatePerformanceData(camera, scene)
                
                // Try to apply texture with lazy loading enabled
                const mockBlob = new Blob(['test'], { type: 'image/jpeg' })
                const artworkBlobs = { library: mockBlob, header: null, logo: null, icon: null }
                
                const result = await textureManager.applyOptimizedTexture(gameBox, game, {
                    artworkBlobs,
                    enableLazyLoading: true
                })
                
                // Should load because object is visible
                expect(result).toBe(true)
                expect(gameBox.userData.textureLoaded).toBe(true)
            }
        })
    })
    
    describe('Memory Management', () => {
        it('should enforce texture memory limits', async () => {
            // Create more game boxes than the limit allows
            const gameBoxes = []
            
            for (let i = 0; i < 15; i++) { // More than maxActiveTextures (10)
                const game = mockGameData[i % mockGameData.length]
                const gameBox = renderer.createGameBox(scene, game, i)
                if (gameBox) {
                    gameBox.position.set(0, 0, -2) // All visible
                    gameBoxes.push({ box: gameBox, game })
                }
            }
            
            // Update performance data
            renderer.updatePerformanceData(camera, scene)
            
            // Load textures for all boxes
            const mockBlob = new Blob(['test'], { type: 'image/jpeg' })
            const artworkBlobs = { library: mockBlob, header: null, logo: null, icon: null }
            
            for (const { box, game } of gameBoxes) {
                await textureManager.applyOptimizedTexture(box, game, { artworkBlobs })
            }
            
            // Get initial stats
            const initialStats = renderer.getPerformanceStats()
            expect(initialStats.loadedTextures).toBe(15)
            
            // Trigger cleanup (this should enforce memory limits)
            performanceManager?.enforceTextureMemoryLimit()
            
            // Check that textures were cleaned up
            const finalStats = renderer.getPerformanceStats()
            expect(finalStats.activeTextures).toBeLessThanOrEqual(10)
        })
        
        it('should clean up off-screen textures', () => {
            const game = mockGameData[0]
            const gameBox = renderer.createGameBox(scene, game, 0)
            expect(gameBox).toBeDefined()
            
            if (gameBox) {
                // Simulate texture being loaded
                gameBox.userData.textureLoaded = true
                
                // Mock performance data as off-screen and old
                const gameId = game.appid.toString()
                const performanceData = {
                    isVisible: false,
                    distanceFromCamera: 10,
                    lastUpdated: Date.now() - 60000, // 1 minute ago
                    textureLoaded: true,
                    currentTextureSize: 256
                }
                performanceManager?.gameBoxPerformanceDataMap.set(gameId, performanceData)
                
                // Trigger cleanup
                renderer.cleanupOffScreenTextures()
                
                // Check that texture was marked as unloaded
                const updatedPerformanceData = performanceManager?.gameBoxPerformanceDataMap.get(gameId)
                expect(updatedPerformanceData?.textureLoaded).toBe(false)
            }
        })
    })
    
    describe('Performance Statistics', () => {
        it('should provide accurate performance statistics', () => {
            // Create some game boxes
            const gameBoxes = mockGameData.slice(0, 8).map((game, index) => {
                const box = renderer.createGameBox(scene, game, index)
                if (box) {
                    box.position.set(index * 2, 0, -3) // Spread them out
                }
                return box
            }).filter(box => box !== null)
            
            expect(gameBoxes).toHaveLength(8)
            
            // Update performance data
            renderer.updatePerformanceData(camera, scene)
            
            // Get stats
            const stats = renderer.getPerformanceStats()
            
            expect(stats.totalGameBoxes).toBe(8)
            expect(stats.visibleGameBoxes).toBeGreaterThan(0)
            expect(stats.averageDistance).toBeGreaterThan(0)
            expect(typeof stats.loadedTextures).toBe('number')
            expect(typeof stats.activeTextures).toBe('number')
        })
    })
    
    describe('Large Library Support', () => {
        it('should handle creation of many game boxes efficiently', () => {
            const startTime = Date.now()
            
            // Create 100 game boxes (simulating large library)
            const createdBoxes = []
            for (let i = 0; i < 100; i++) {
                const game = {
                    appid: i + 1,
                    name: `Game ${i + 1}`,
                    playtime_forever: Math.random() * 1000,
                    artwork: {
                        icon: `https://test.com/icon${i}.jpg`,
                        logo: `https://test.com/logo${i}.jpg`,
                        header: `https://test.com/header${i}.jpg`,
                        library: `https://test.com/library${i}.jpg`
                    }
                }
                
                const box = renderer.createGameBox(scene, game, i)
                if (box) {
                    createdBoxes.push(box)
                }
            }
            
            const endTime = Date.now()
            const duration = endTime - startTime
            
            expect(createdBoxes.length).toBe(100)
            expect(duration).toBeLessThan(1000) // Should complete in under 1 second
            
            // Verify scene has all the boxes
            const gameBoxesInScene = scene.children.filter(child => child.userData?.isGameBox)
            expect(gameBoxesInScene).toHaveLength(100)
        })
        
        it('should update performance data efficiently for large numbers of objects', () => {
            // Create a new renderer for this test with performance features enabled
            const largeRenderer = new GameBoxRenderer({}, {}, {
                maxTextureSize: 1024,
                nearDistance: 2.0,
                farDistance: 10.0,
                highResolutionSize: 512,
                mediumResolutionSize: 256,
                lowResolutionSize: 128,
                maxActiveTextures: 50,
                frustumCullingEnabled: true
            })
            
            // Create 200 game boxes
            for (let i = 0; i < 200; i++) {
                const game = {
                    appid: i + 1,
                    name: `Game ${i + 1}`,
                    playtime_forever: Math.random() * 1000
                }
                
                const box = largeRenderer.createGameBox(scene, game, i)
                if (box) {
                    // Spread them out in 3D space
                    box.position.set(
                        (i % 20) * 2 - 20,
                        Math.floor(i / 100) * 2,
                        -(i % 10) * 2 - 5
                    )
                }
            }
            
            const startTime = Date.now()
            
            // Update performance data
            largeRenderer.updatePerformanceData(camera, scene)
            
            const endTime = Date.now()
            const duration = endTime - startTime
            
            // Should complete quickly even with 200 objects
            expect(duration).toBeLessThan(100) // Under 100ms
            
            // Verify stats are calculated
            const stats = largeRenderer.getPerformanceStats()
            expect(stats.totalGameBoxes).toBe(200)
        })
    })
})
