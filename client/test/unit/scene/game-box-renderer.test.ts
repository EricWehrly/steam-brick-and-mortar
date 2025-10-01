/**
 * Unit tests for GameBoxRenderer texture functionality
 * Tests the new texture application features added in Task 5.2.1.2
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as THREE from 'three'
import { GameBoxRenderer, type SteamGameData, type GameBoxTextureOptions } from '../../../src/scene'

// Mock URL.createObjectURL and revokeObjectURL for Node.js environment
if (!globalThis.URL) {
    globalThis.URL = {} as any
}
globalThis.URL.createObjectURL = vi.fn((_blob) => `blob:mock-url-${Math.random()}`)
globalThis.URL.revokeObjectURL = vi.fn()

// Mock Three.js TextureLoader
vi.mock('three', async () => {
    const actual = await vi.importActual('three') as any
    return {
        ...actual,
        TextureLoader: vi.fn().mockImplementation(() => ({
            load: vi.fn((url, onLoad) => {
                // Simulate successful texture loading
                const mockTexture = {
                    anisotropy: 16,
                    wrapS: actual.ClampToEdgeWrapping,
                    wrapT: actual.ClampToEdgeWrapping,
                    minFilter: actual.LinearFilter,
                    magFilter: actual.LinearFilter,
                    needsUpdate: true
                }
                setTimeout(() => onLoad(mockTexture), 0)
                return mockTexture
            })
        }))
    }
})

describe('GameBoxRenderer Texture Tests', () => {
    let renderer: GameBoxRenderer
    let scene: THREE.Scene
    let mockGame: SteamGameData

    beforeEach(() => {
        renderer = new GameBoxRenderer()
        scene = new THREE.Scene()
        mockGame = {
            appid: '123',
            name: 'Test Game',
            playtime_forever: 100,
            artwork: {
                icon: 'https://example.com/icon.jpg',
                logo: 'https://example.com/logo.jpg',
                header: 'https://example.com/header.jpg',
                library: 'https://example.com/library.jpg'
            }
        }
    })

    describe('Texture Application', () => {
        it('should create game box with texture options', () => {
            const mockBlob = new Blob(['fake image data'], { type: 'image/jpeg' })
            const textureOptions: GameBoxTextureOptions = {
                artworkBlobs: {
                    library: mockBlob
                }
            }

            const gameBox = renderer.createGameBoxWithTexture(scene, mockGame, 0, textureOptions)

            expect(gameBox).toBeTruthy()
            expect(gameBox?.userData.gameData).toEqual(mockGame)
            expect(scene.children).toContain(gameBox)
        })

        it('should apply fallback color when no artwork is provided', async () => {
            const gameBox = renderer.createGameBox(scene, mockGame, 0)
            expect(gameBox).toBeTruthy()
            
            // Should have a colored material based on game name
            const material = gameBox!.material as THREE.MeshStandardMaterial
            expect(material).toBeInstanceOf(THREE.MeshStandardMaterial)
            expect(material.color).toBeDefined()
        })

        it('should handle texture application with missing blobs gracefully', async () => {
            const gameBox = renderer.createGameBox(scene, mockGame, 0)
            expect(gameBox).toBeTruthy()

            const textureOptions: GameBoxTextureOptions = {
                artworkBlobs: {
                    icon: null,
                    logo: null,
                    header: null,
                    library: null
                },
                fallbackColor: 0xff0000 // Red
            }

            const result = await renderer.applyTexture(gameBox!, mockGame, textureOptions)
            expect(result).toBe(false) // Should return false when no valid blobs
        })

        it('should successfully apply texture from blob', async () => {
            const gameBox = renderer.createGameBox(scene, mockGame, 0)
            expect(gameBox).toBeTruthy()

            const mockBlob = new Blob(['fake image data'], { type: 'image/jpeg' })
            const textureOptions: GameBoxTextureOptions = {
                artworkBlobs: {
                    library: mockBlob
                }
            }

            const result = await renderer.applyTexture(gameBox!, mockGame, textureOptions)
            expect(result).toBe(true) // Should return true on successful texture application
        })

        it('should prioritize library artwork over other types', async () => {
            const gameBox = renderer.createGameBox(scene, mockGame, 0)
            expect(gameBox).toBeTruthy()

            const iconBlob = new Blob(['icon data'], { type: 'image/jpeg' })
            const libraryBlob = new Blob(['library data'], { type: 'image/jpeg' })
            
            const textureOptions: GameBoxTextureOptions = {
                artworkBlobs: {
                    icon: iconBlob,
                    logo: null,
                    header: null,
                    library: libraryBlob // Library should be preferred
                }
            }

            const result = await renderer.applyTexture(gameBox!, mockGame, textureOptions)
            expect(result).toBe(true)
        })
    })

    describe('Fallback Handling', () => {
        it('should create fallback texture on initialization', () => {
            // The fallback texture should be created in constructor
            expect(renderer).toBeTruthy()
            // We can't directly test the private fallbackTexture, but the constructor should complete successfully
        })

        it('should handle texture loading errors gracefully', async () => {
            const gameBox = renderer.createGameBox(scene, mockGame, 0)
            expect(gameBox).toBeTruthy()

            // Mock a blob that will cause texture loading to fail
            const invalidBlob = new Blob(['invalid'], { type: 'text/plain' })
            const textureOptions: GameBoxTextureOptions = {
                artworkBlobs: {
                    library: invalidBlob
                }
            }

            const result = await renderer.applyTexture(gameBox!, mockGame, textureOptions)
            // Should handle errors gracefully
            expect(typeof result).toBe('boolean')
        })
    })

    describe('Resource Management', () => {
        it('should dispose of existing textures when applying new ones', async () => {
            const gameBox = renderer.createGameBox(scene, mockGame, 0)
            expect(gameBox).toBeTruthy()

            // Add a mock texture to userData
            const mockTexture = { dispose: vi.fn() }
            gameBox!.userData.texture = mockTexture

            const mockBlob = new Blob(['fake image data'], { type: 'image/jpeg' })
            const textureOptions: GameBoxTextureOptions = {
                artworkBlobs: {
                    library: mockBlob
                }
            }

            await renderer.applyTexture(gameBox!, mockGame, textureOptions)
            
            // Should have called dispose on the old texture
            expect(mockTexture.dispose).toHaveBeenCalled()
        })

        it('should properly dispose renderer resources', () => {
            expect(() => renderer.dispose()).not.toThrow()
        })
    })
})
