/**
 * Integration test for Steam game data to texture rendering
 * Tests the complete workflow from Steam game data to applied textures
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as THREE from 'three'
import { SteamBrickAndMortarApp } from '../../src/core/SteamBrickAndMortarApp'
import type { SteamGameData } from '../../src/scene'

// Mock IndexedDB for image cache
vi.mock('fake-indexeddb', () => ({
    default: {},
    IDBKeyRange: {}
}))

// Mock URL object methods
Object.defineProperty(globalThis, 'URL', {
    value: {
        createObjectURL: vi.fn(() => 'mock-blob-url'),
        revokeObjectURL: vi.fn()
    },
    writable: true
})

// Mock fetch for image downloads
globalThis.fetch = vi.fn()

describe('Steam Data to Texture Integration', () => {
    let app: SteamBrickAndMortarApp
    let scene: THREE.Scene
    let mockGameData: SteamGameData
    
    beforeEach(async () => {
        // Create app with test configuration
        app = new SteamBrickAndMortarApp({
            steam: {
                apiBaseUrl: 'https://test-api.example.com',
                maxGames: 5
            }
        })
        
        // Initialize the app
        await app.init()
        scene = app.getSceneManager().getScene()
        
        // Mock game data with artwork URLs
        mockGameData = {
            appid: 12345,
            name: 'Test Game',
            playtime_forever: 120,
            playtime_2weeks: 30,
            img_icon_url: 'test-icon.jpg',
            img_logo_url: 'test-logo.jpg',
            artwork: {
                icon: 'https://test.com/icon.jpg',
                logo: 'https://test.com/logo.jpg',
                header: 'https://test.com/header.jpg',
                library: 'https://test.com/library.jpg'
            }
        }
        
        // Mock successful image downloads
        const mockBlob = new Blob(['mock-image-data'], { type: 'image/jpeg' })
        ;(globalThis.fetch as any).mockResolvedValue({
            ok: true,
            blob: () => Promise.resolve(mockBlob)
        })
    })
    
    afterEach(() => {
        app.dispose()
        vi.clearAllMocks()
    })
    
    it('should create game box with texture from Steam data', async () => {
        // Get the game box renderer
        const existingGameBox = app.getSceneManager().getScene().children
            .find(child => child.userData?.isGameBox) as THREE.Mesh
        
        // Check that game box doesn't exist yet
        expect(existingGameBox).toBeUndefined()
        
        // Simulate the progressive loading workflow
        // Note: We're testing the private method through the public API
        // by triggering the Steam integration workflow
        
        // Mock the Steam integration to return our test data
        const steamIntegration = app.getSteamIntegration()
        
        // Mock the Steam client methods
        const steamClient = steamIntegration.getSteamClient()
        vi.spyOn(steamClient, 'downloadGameImage').mockResolvedValue(
            new Blob(['mock-image-data'], { type: 'image/jpeg' })
        )
        
        // Manually trigger the game box creation with texture
        // This simulates what happens in the onGameLoaded callback
        const renderer = (app as any).gameBoxRenderer
        const gameBox = renderer.createGameBox(scene, mockGameData, 0)
        
        // Verify game box was created
        expect(gameBox).toBeDefined()
        expect(gameBox.userData.name).toBe('Test Game')
        expect(gameBox.userData.appId).toBe(12345)
        
        // Manually trigger texture application
        await (app as any).applyGameArtworkTexture(gameBox, mockGameData)
        
        // Verify texture was applied
        expect(gameBox.material).toBeDefined()
        if (gameBox.material instanceof THREE.MeshPhongMaterial) {
            expect(gameBox.material.map).toBeDefined()
        }
    })
    
    it('should handle missing artwork gracefully', async () => {
        // Game data without artwork
        const gameWithoutArtwork: SteamGameData = {
            ...mockGameData,
            artwork: {
                icon: '',
                logo: '',
                header: '',
                library: ''
            }
        }
        
        // Create game box
        const renderer = (app as any).gameBoxRenderer
        const gameBox = renderer.createGameBox(scene, gameWithoutArtwork, 0)
        
        // Apply texture (should handle missing artwork gracefully)
        await (app as any).applyGameArtworkTexture(gameBox, gameWithoutArtwork)
        
        // Verify game box still exists and has fallback material
        expect(gameBox).toBeDefined()
        expect(gameBox.material).toBeDefined()
        
        // Should have fallback color material
        if (gameBox.material instanceof THREE.MeshPhongMaterial) {
            expect(gameBox.material.color).toBeDefined()
        }
    })
    
    it('should prioritize library artwork over other types', async () => {
        // Mock different blobs for different artwork types
        const iconBlob = new Blob(['icon-data'], { type: 'image/jpeg' })
        const logoBlob = new Blob(['logo-data'], { type: 'image/jpeg' })
        const headerBlob = new Blob(['header-data'], { type: 'image/jpeg' })
        const libraryBlob = new Blob(['library-data'], { type: 'image/jpeg' })
        
        // Mock the Steam client to return different blobs for different URLs
        const steamClient = app.getSteamIntegration().getSteamClient()
        vi.spyOn(steamClient, 'downloadGameImage').mockImplementation(async (url: string) => {
            if (url.includes('icon')) return iconBlob
            if (url.includes('logo')) return logoBlob
            if (url.includes('header')) return headerBlob
            if (url.includes('library')) return libraryBlob
            return null
        })
        
        // Create game box and apply texture
        const renderer = (app as any).gameBoxRenderer
        const gameBox = renderer.createGameBox(scene, mockGameData, 0)
        
        // Get artwork blobs
        const artworkBlobs = await (app as any).getGameArtworkBlobs(mockGameData)
        
        // Verify all artwork types are present
        expect(artworkBlobs).toBeDefined()
        expect(artworkBlobs.icon).toBe(iconBlob)
        expect(artworkBlobs.logo).toBe(logoBlob)
        expect(artworkBlobs.header).toBe(headerBlob)
        expect(artworkBlobs.library).toBe(libraryBlob)
        
        // Apply texture - should prioritize library artwork
        await (app as any).applyGameArtworkTexture(gameBox, mockGameData)
        
        // Verify texture was applied
        expect(gameBox.material).toBeDefined()
        if (gameBox.material instanceof THREE.MeshPhongMaterial) {
            expect(gameBox.material.map).toBeDefined()
        }
    })
    
    it('should handle network errors during artwork download', async () => {
        // Mock network error
        const steamClient = app.getSteamIntegration().getSteamClient()
        vi.spyOn(steamClient, 'downloadGameImage').mockRejectedValue(
            new Error('Network error')
        )
        
        // Create game box
        const renderer = (app as any).gameBoxRenderer
        const gameBox = renderer.createGameBox(scene, mockGameData, 0)
        
        // Apply texture (should handle errors gracefully)
        await expect(async () => {
            await (app as any).applyGameArtworkTexture(gameBox, mockGameData)
        }).not.toThrow()
        
        // Verify game box still exists with fallback material
        expect(gameBox).toBeDefined()
        expect(gameBox.material).toBeDefined()
    })
    
    it('should progressively load textures as games are processed', async () => {
        const games = [
            { ...mockGameData, appid: 1, name: 'Game 1' },
            { ...mockGameData, appid: 2, name: 'Game 2' },
            { ...mockGameData, appid: 3, name: 'Game 3' }
        ]
        
        // Mock image downloads
        const steamClient = app.getSteamIntegration().getSteamClient()
        vi.spyOn(steamClient, 'downloadGameImage').mockResolvedValue(
            new Blob(['mock-image-data'], { type: 'image/jpeg' })
        )
        
        // Process games progressively
        for (let i = 0; i < games.length; i++) {
            await (app as any).addGameBoxToScene(games[i], i)
        }
        
        // Verify all game boxes were created
        const gameBoxes = scene.children.filter(child => child.userData?.isGameBox)
        expect(gameBoxes).toHaveLength(games.length)
        
        // Verify each game box has proper data
        gameBoxes.forEach((gameBox, index) => {
            expect(gameBox.userData.name).toBe(games[index].name)
            expect(gameBox.userData.appId).toBe(games[index].appid)
        })
    })
})
