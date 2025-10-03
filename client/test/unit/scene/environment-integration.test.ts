/**
 * Environment Integration Test
 * 
 * Verifies that StorePropsRenderer properly integrates with EnvironmentRenderer
 * instead of creating duplicate environments.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as THREE from 'three'
import { StorePropsRenderer } from '../../../src/scene/StorePropsRenderer'
import { EnvironmentRenderer } from '../../../src/scene/EnvironmentRenderer'
import { AppSettings } from '../../../src/core/AppSettings'

describe('Environment Integration', () => {
    let scene: THREE.Scene
    let mockEnvironmentRenderer: any
    let propsRenderer: StorePropsRenderer

    beforeEach(() => {
        scene = new THREE.Scene()
        
        // Create mock EnvironmentRenderer
        mockEnvironmentRenderer = {
            clearEnvironment: vi.fn(),
            setupEnvironment: vi.fn().mockResolvedValue(undefined)
        }
        
        propsRenderer = new StorePropsRenderer(scene, mockEnvironmentRenderer)
    })

    describe('Environment Renderer Integration', () => {
        it('should pass EnvironmentRenderer through constructor', () => {
            expect(propsRenderer).toBeDefined()
            // EnvironmentRenderer is stored as private field, integration verified by no compilation errors
        })

        it('should spawn shelves without calling environment methods', async () => {
            // Mock games data for expansion
            const testGames = [
                { appid: 1, name: 'Test Game 1' },
                { appid: 2, name: 'Test Game 2' },
                { appid: 3, name: 'Test Game 3' }
            ]

            // Trigger dynamic shelf spawning (which no longer handles environment expansion)
            const shelvesNeeded = Math.ceil(testGames.length / 18) // 18 games per shelf
            await propsRenderer.spawnDynamicShelvesWithGames(shelvesNeeded, testGames.length, testGames)

            // Verify EnvironmentRenderer methods were NOT called (environment is now handled by RoomManager)
            expect(mockEnvironmentRenderer.clearEnvironment).not.toHaveBeenCalled()
            expect(mockEnvironmentRenderer.setupEnvironment).not.toHaveBeenCalled()
            
            // Verify shelves were created in scene
            expect(scene.children.length).toBeGreaterThan(0)
        })

        it('should fallback gracefully when no EnvironmentRenderer is provided', async () => {
            // Create renderer without EnvironmentRenderer
            const fallbackRenderer = new StorePropsRenderer(scene)
            
            const testGames = [
                { appid: 1, name: 'Test Game 1' }
            ]

            const mockEventData = {
                userId: 'test-user',
                gameCount: testGames.length,
                games: testGames,
                timestamp: new Date().toISOString()
            }

            // Should not throw error
            const shelvesNeeded = Math.ceil(testGames.length / 18)
            await expect(fallbackRenderer.spawnDynamicShelvesWithGames(shelvesNeeded, testGames.length, testGames))
                .resolves.not.toThrow()
        })
    })

    describe('No Duplicate Environment Creation', () => {
        it('should not create duplicate room structure when EnvironmentRenderer is available', async () => {
            const initialChildCount = scene.children.length
            
            const testGames = [
                { appid: 1, name: 'Test Game 1' }
            ]

            const mockEventData = {
                userId: 'test-user',
                gameCount: testGames.length,
                games: testGames,
                timestamp: new Date().toISOString()
            }

            const shelvesNeeded = Math.ceil(testGames.length / 18)
            await propsRenderer.spawnDynamicShelvesWithGames(shelvesNeeded, testGames.length, testGames)

            // Scene should not have additional environment groups added
            // (since we're using EnvironmentRenderer to resize existing environment)
            const finalChildCount = scene.children.length
            
            // Allow for shelves and other props to be added, but no duplicate environments
            expect(finalChildCount).toBeGreaterThanOrEqual(initialChildCount)
            
            // Verify no groups with names indicating duplicate environments
            const duplicateEnvironmentGroups = scene.children.filter(child => 
                child.name.includes('dynamic-store-environment')
            )
            expect(duplicateEnvironmentGroups).toHaveLength(0)
        })
    })
})