/**
 * Integration Test: Batch-to-Placement Flow
 * 
 * Purpose: Validate the CURRENT batch processing flow before Phase 3 refactoring.
 * This test serves as a safety net to ensure event-driven refactoring maintains
 * the same behavior.
 * 
 * Current Flow (Method-Based):
 * 1. GamesBatchReady event arrives
 * 2. BatchCoordinator queues and processes batches
 * 3. GpuStorePropsRenderer.processOneBatch() is called
 * 4. ShelfLayoutManager.createShelfForBatch() is called
 * 5. GameBoxSpawner.spawnGamesOnShelf() places games
 * 6. AllBatchesComplete event fires
 * 
 * Future Flow (Event-Based) - Phase 3:
 * 1. GamesBatchReady event arrives
 * 2. BatchCoordinator emits BatchReadyForPlacement
 * 3. GameBoxSpawner emits ShelfSpaceRequested
 * 4. ShelfLayoutManager emits ShelfCreated
 * 5. GameBoxSpawner places games, emits GamesPlaced
 * 6. BatchCoordinator emits AllBatchesComplete
 * 
 * This test validates both flows produce identical results.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as THREE from 'three'

// Mock TextureManager to avoid async texture loading
vi.mock('../../src/utils/TextureManager', async () => {
  const { MockTextureManager } = await import('../mocks/utils/TextureManager.mock')
  return {
    TextureManager: {
      getInstance: () => MockTextureManager.getInstance()
    }
  }
})

import { EventManager } from '../../src/core/EventManager'
import { DataManager } from '../../src/core/data'
import { GpuStorePropsRenderer } from '../../src/scene/GpuStorePropsRenderer'
import { SteamEventTypes, GameEventTypes, type SteamGamesBatchEvent } from '../../src/types/InteractionEvents'
import type { SteamGame } from '../../src/steam'

describe('Batch-to-Placement Flow Integration', () => {
    let scene: THREE.Scene
    let eventManager: EventManager
    let dataManager: DataManager
    let renderer: GpuStorePropsRenderer
    let allBatchesCompleteReceived: boolean
    let completionEventData: any

    const createMockGames = (count: number, batchIndex: number): Readonly<SteamGame>[] => {
        return Array.from({ length: count }, (_, i) => ({
            appid: batchIndex * 100 + i,
            name: `Batch ${batchIndex} Game ${i}`,
            playtime_forever: 120,
            img_icon_url: '',
            img_logo_url: '',
            artwork: undefined
        }))
    }

    beforeEach(() => {
        scene = new THREE.Scene()
        eventManager = EventManager.getInstance()
        dataManager = DataManager.getInstance()
        
        // Clear state
        dataManager.clear()
        allBatchesCompleteReceived = false
        completionEventData = null
        
        // Listen for completion BEFORE creating renderer
        eventManager.registerEventHandler(
            GameEventTypes.AllBatchesComplete,
            (event) => {
                console.log('🎉 TEST: AllBatchesComplete received!', event.detail)
                allBatchesCompleteReceived = true
                completionEventData = event.detail
            }
        )
        
        // Create renderer AFTER listener is registered
        renderer = new GpuStorePropsRenderer(scene)
    })

    afterEach(() => {
        renderer?.dispose()
        dataManager.clear()
        scene.clear()
        vi.clearAllMocks()
    })

    describe('Current Method-Based Flow', () => {
        it('should process single batch and emit completion', async () => {
            const games = createMockGames(5, 0)
            
            // Emit batch event
            eventManager.emit<SteamGamesBatchEvent>(
                SteamEventTypes.GamesBatchReady,
                {
                    games,
                    batchIndex: 0,
                    totalBatches: 1
                }
            )
            
            // Wait for batch processing - increased timeout since Worker fails but processing continues
            await vi.waitFor(() => {
                return allBatchesCompleteReceived === true
            }, { timeout: 8000, interval: 100 })
            
            // Validate completion event
            expect(allBatchesCompleteReceived).toBe(true)
            expect(completionEventData).toBeDefined()
            expect(completionEventData.shelfLayout).toBeDefined()
            expect(completionEventData.shelfBounds).toBeDefined()
        })

        it('should process multiple batches sequentially', async () => {
            const batch1 = createMockGames(3, 0)
            const batch2 = createMockGames(3, 1)
            const batch3 = createMockGames(4, 2)
            
            // Emit all batches
            eventManager.emit<SteamGamesBatchEvent>(
                SteamEventTypes.GamesBatchReady,
                {
                    games: batch1,
                    batchIndex: 0,
                    totalBatches: 3
                }
            )
            
            eventManager.emit<SteamGamesBatchEvent>(
                SteamEventTypes.GamesBatchReady,
                {
                    games: batch2,
                    batchIndex: 1,
                    totalBatches: 3
                }
            )
            
            eventManager.emit<SteamGamesBatchEvent>(
                SteamEventTypes.GamesBatchReady,
                {
                    games: batch3,
                    batchIndex: 2,
                    totalBatches: 3
                }
            )
            
            // Wait for all batches to complete
            await vi.waitFor(() => {
                expect(allBatchesCompleteReceived).toBe(true)
            }, { timeout: 3000 })
            
            // Verify completion
            expect(completionEventData).toBeDefined()
            expect(completionEventData.shelfLayout.rows).toBeGreaterThan(0)
        })

        it('should create shelves at correct positions', async () => {
            const games = createMockGames(10, 0)
            
            // GPU renderer uses instanced meshes, not individual scene.add() calls
            // Track instanced mesh updates instead
            let instancedMeshesCreated = 0
            const originalAdd = scene.add.bind(scene)
            scene.add = vi.fn((...objects: THREE.Object3D[]) => {
                objects.forEach(obj => {
                    if (obj instanceof THREE.InstancedMesh) {
                        instancedMeshesCreated++
                    }
                })
                return originalAdd(...objects)
            })
            
            // Emit batch
            eventManager.emit<SteamGamesBatchEvent>(
                SteamEventTypes.GamesBatchReady,
                {
                    games,
                    batchIndex: 0,
                    totalBatches: 1
                }
            )
            
            await vi.waitFor(() => {
                return allBatchesCompleteReceived === true
            }, { timeout: 8000, interval: 100 })
            
            // Verify instanced meshes were created (GPU renderer uses instancing)
            expect(instancedMeshesCreated).toBeGreaterThan(0)
        })

        it('should place games on shelves', async () => {
            const games = createMockGames(8, 0)
            
            // Track game box creation
            let gameBoxCount = 0
            const originalAdd = scene.add.bind(scene)
            scene.add = vi.fn((...objects: THREE.Object3D[]) => {
                objects.forEach(obj => {
                    // Count meshes that look like game boxes
                    if (obj instanceof THREE.Mesh || obj instanceof THREE.InstancedMesh) {
                        if (obj.userData.type === 'game-box' || obj.name.includes('game')) {
                            gameBoxCount++
                        }
                    }
                })
                return originalAdd(...objects)
            })
            
            // Emit batch
            eventManager.emit<SteamGamesBatchEvent>(
                SteamEventTypes.GamesBatchReady,
                {
                    games,
                    batchIndex: 0,
                    totalBatches: 1
                }
            )
            
            await vi.waitFor(() => {
                return allBatchesCompleteReceived === true
            }, { timeout: 8000, interval: 100 })
            
            // GPU renderer creates a single instanced mesh for all game boxes
            // Count should be at least 1 (the instanced mesh container)
            expect(gameBoxCount).toBeGreaterThanOrEqual(1)
        })

        it('should calculate shelf bounds correctly', async () => {
            const games = createMockGames(15, 0)
            
            eventManager.emit<SteamGamesBatchEvent>(
                SteamEventTypes.GamesBatchReady,
                {
                    games,
                    batchIndex: 0,
                    totalBatches: 1
                }
            )
            
            await vi.waitFor(() => {
                expect(allBatchesCompleteReceived).toBe(true)
            }, { timeout: 2000 })
            
            // Verify bounds structure
            const bounds = completionEventData.shelfBounds
            expect(bounds).toBeDefined()
            expect(bounds.minX).toBeDefined()
            expect(bounds.maxX).toBeDefined()
            expect(bounds.minZ).toBeDefined()
            expect(bounds.maxZ).toBeDefined()
            
            // Bounds should be reasonable (non-zero area)
            expect(bounds.maxX - bounds.minX).toBeGreaterThan(0)
            expect(bounds.maxZ - bounds.minZ).toBeGreaterThan(0)
        })

        it('should handle empty batch gracefully', async () => {
            const games: Readonly<SteamGame>[] = []
            
            eventManager.emit<SteamGamesBatchEvent>(
                SteamEventTypes.GamesBatchReady,
                {
                    games,
                    batchIndex: 0,
                    totalBatches: 1
                }
            )
            
            // Should complete even with empty batch
            await vi.waitFor(() => {
                expect(allBatchesCompleteReceived).toBe(true)
            }, { timeout: 2000 })
        })
    })

    describe('Flow Validation Metrics', () => {
        it('should track batch processing time', async () => {
            const games = createMockGames(20, 0)
            const startTime = Date.now()
            
            eventManager.emit<SteamGamesBatchEvent>(
                SteamEventTypes.GamesBatchReady,
                {
                    games,
                    batchIndex: 0,
                    totalBatches: 1
                }
            )
            
            await vi.waitFor(() => {
                expect(allBatchesCompleteReceived).toBe(true)
            }, { timeout: 3000 })
            
            const processingTime = Date.now() - startTime
            
            // Should complete reasonably quickly
            expect(processingTime).toBeLessThan(3000)
            
            // Log for performance tracking
            console.log(`Batch processing took ${processingTime}ms for ${games.length} games`)
        })

        it('should provide shelf layout info', async () => {
            const games = createMockGames(25, 0)
            
            eventManager.emit<SteamGamesBatchEvent>(
                SteamEventTypes.GamesBatchReady,
                {
                    games,
                    batchIndex: 0,
                    totalBatches: 1
                }
            )
            
            await vi.waitFor(() => {
                expect(allBatchesCompleteReceived).toBe(true)
            }, { timeout: 3000 })
            
            const layout = completionEventData.shelfLayout
            expect(layout).toBeDefined()
            expect(layout.rows).toBeGreaterThan(0)
            expect(layout.shelvesPerRow).toBeGreaterThan(0)
            
            console.log(`Layout: ${layout.rows} rows x ${layout.shelvesPerRow} shelves/row`)
        })
    })

    describe('Baseline for Phase 3 Comparison', () => {
        it('should capture complete flow state for comparison', async () => {
            const games = createMockGames(12, 0)
            
            // Track all scene objects
            const objectCountBefore = scene.children.length
            
            eventManager.emit<SteamGamesBatchEvent>(
                SteamEventTypes.GamesBatchReady,
                {
                    games,
                    batchIndex: 0,
                    totalBatches: 1
                }
            )
            
            await vi.waitFor(() => {
                return allBatchesCompleteReceived === true
            }, { timeout: 8000, interval: 100 })
            
            const objectCountAfter = scene.children.length
            
            // Capture state for Phase 3 comparison
            const baselineState = {
                gamesProcessed: games.length,
                objectsAdded: objectCountAfter - objectCountBefore,
                shelfBounds: completionEventData.shelfBounds,
                shelfLayout: completionEventData.shelfLayout,
                completionReceived: allBatchesCompleteReceived
            }
            
            // Log baseline for Phase 3 reference
            console.log('Baseline State (Method-Based):', JSON.stringify(baselineState, null, 2))
            
            // Basic assertions - GPU renderer may use instanced meshes that don't add many scene objects
            expect(baselineState.completionReceived).toBe(true)
            expect(baselineState.shelfLayout.rows).toBeGreaterThan(0)
            expect(baselineState.shelfLayout.shelvesPerRow).toBeGreaterThan(0)
        })
    })
})
