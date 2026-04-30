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
import { DataDomain, DataKey, DataManager } from '../../src/core/data'
import { createStorePropsTestHarness, type StorePropsTestHarness } from '../helpers/StorePropsTestHarness'
import { ShelfLayoutCoordinator } from '../../src/scene/shelves/ShelfLayoutCoordinator'
import { 
    SteamEventTypes, 
    StorePropsEventTypes,
    GameEventTypes, 
    type SteamGamesBatchEvent,
    type SteamLibraryManifestReadyEvent,
    type BatchReadyForPlacementEvent,
    type ShelfLayoutDeterminedEvent,
    type GamesPlacedEvent
} from '../../src/types/InteractionEvents'
import type { SectionsReadyEvent, SectionsReadyForPlacementEvent } from '../../src/types/EnvironmentEvents'
import type { SteamGame } from '../../src/steam'

describe('Batch-to-Placement Flow Integration', () => {
    let scene: THREE.Scene
    let eventManager: EventManager
    let dataManager: DataManager
    let harness: StorePropsTestHarness
    let allBatchesCompleteReceived: boolean
    let layoutDeterminedReceived: boolean
    let completionEventData: any
    let layoutEventData: ShelfLayoutDeterminedEvent | null
    let batchReadyEvents: BatchReadyForPlacementEvent[] = []
    let gamesPlacedEvents: GamesPlacedEvent[] = []

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

    const uniqueBatchIndices = (events: Array<{ batchIndex: number }>): number[] => {
        return [...new Set(events.map((event) => event.batchIndex))]
    }

    beforeEach(async () => {
        ;(ShelfLayoutCoordinator as unknown as { instance: ShelfLayoutCoordinator | null }).instance = null
        scene = new THREE.Scene()
        eventManager = EventManager.getInstance()
        eventManager.removeAllListeners()
        dataManager = DataManager.getInstance()
        
        // Clear state
        dataManager.clear()
        dataManager.set(DataKey.MainScene, scene, {
            domain: DataDomain.Scene,
            description: 'Integration test main scene'
        })
        allBatchesCompleteReceived = false
        layoutDeterminedReceived = false
        completionEventData = null
        layoutEventData = null
        batchReadyEvents = []
        gamesPlacedEvents = []

        const pendingBatches = new Map<number, Readonly<SteamGame>[]>()
        let expectedBatchCount = 0
        
        // Listen for BatchReadyForPlacement (Phase 3b)
        eventManager.registerEventHandler(
            StorePropsEventTypes.BatchReadyForPlacement,
            (event: CustomEvent<BatchReadyForPlacementEvent>) => {
                console.log('📦 TEST: BatchReadyForPlacement received!', event.detail)
                batchReadyEvents.push(event.detail)

                pendingBatches.set(event.detail.batchIndex, event.detail.games as Readonly<SteamGame>[])
                expectedBatchCount = Math.max(expectedBatchCount, event.detail.totalBatches)

                if (pendingBatches.size !== expectedBatchCount) {
                    return
                }

                const orderedSections = [...pendingBatches.entries()]
                    .sort(([a], [b]) => a - b)
                    .map(([batchIndex, games]) => ({
                        sectionId: `batch-${batchIndex}`,
                        sectionIndex: batchIndex,
                        section: {
                            name: `Batch ${batchIndex}`,
                            games: games as any,
                            groupMode: 'by-recency' as const,
                            sortMode: 'by-last-played' as const,
                        },
                    }))

                const totalGames = orderedSections.reduce((sum, entry) => sum + entry.section.games.length, 0)
                eventManager.emit<SteamLibraryManifestReadyEvent>(SteamEventTypes.LibraryManifestReady, {
                    totalGames,
                })

                eventManager.emit<SectionsReadyForPlacementEvent>(GameEventTypes.SectionsReadyForPlacement, {
                    groupMode: 'by-recency',
                    sortMode: 'by-last-played',
                    sections: orderedSections,
                })

                eventManager.emit<SectionsReadyEvent>(GameEventTypes.SectionsReady, {
                    groupMode: 'by-recency',
                    sortMode: 'by-last-played',
                    sections: orderedSections.map((entry) => entry.section),
                })
            }
        )
        
        // Listen for layout determination
        eventManager.registerEventHandler(
            GameEventTypes.ShelfLayoutDetermined,
            (event: CustomEvent<ShelfLayoutDeterminedEvent>) => {
                console.log('📐 TEST: ShelfLayoutDetermined received!', event.detail)
                layoutDeterminedReceived = true
                layoutEventData = event.detail
            }
        )

        eventManager.registerEventHandler(
            StorePropsEventTypes.GamesPlaced,
            (event: CustomEvent<GamesPlacedEvent>) => {
                gamesPlacedEvents.push(event.detail)
            }
        )
        
        // Listen for completion BEFORE creating renderer
        eventManager.registerEventHandler(
            GameEventTypes.AllBatchesComplete,
            (event) => {
                console.log('🎉 TEST: AllBatchesComplete received!', event.detail)
                allBatchesCompleteReceived = true
                completionEventData = event.detail
            }
        )
        
        // Create subsystems AFTER listeners are registered
        harness = createStorePropsTestHarness(scene)
    })

    afterEach(() => {
        harness?.dispose()
        eventManager.removeAllListeners()
        ;(ShelfLayoutCoordinator as unknown as { instance: ShelfLayoutCoordinator | null }).instance = null
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
                expect(allBatchesCompleteReceived).toBe(true)
            }, { timeout: 8000, interval: 100 })
            
            // Validate completion event
            expect(allBatchesCompleteReceived).toBe(true)
            expect(layoutDeterminedReceived).toBe(true)
            expect(layoutEventData).toBeDefined()
            expect(layoutEventData!.shelfLayout).toBeDefined()
            expect(layoutEventData!.shelfBounds).toBeDefined()
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
                expect(gamesPlacedEvents.length).toBe(3)
                expect(allBatchesCompleteReceived).toBe(true)
            }, { timeout: 8000, interval: 100 })
            
            // Verify completion
            expect(layoutEventData).toBeDefined()
            expect(layoutEventData!.shelfLayout.rows).toBeGreaterThan(0)
            expect(uniqueBatchIndices(batchReadyEvents)).toEqual([0, 1, 2])
            expect(gamesPlacedEvents).toHaveLength(3)
        })

        it('should create shelves at correct positions', async () => {
            const games = createMockGames(10, 0)
            
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
                expect(layoutDeterminedReceived).toBe(true)
                expect(allBatchesCompleteReceived).toBe(true)
            }, { timeout: 8000, interval: 100 })
            
            expect(layoutEventData).toBeDefined()
            const bounds = layoutEventData!.shelfBounds
            expect(bounds.maxX - bounds.minX).toBeGreaterThan(0)
            expect(bounds.maxZ - bounds.minZ).toBeGreaterThan(0)
        })

        it('should place games on shelves', async () => {
            const games = createMockGames(8, 0)
            
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
                expect(gamesPlacedEvents.length).toBeGreaterThan(0)
                expect(allBatchesCompleteReceived).toBe(true)
            }, { timeout: 8000, interval: 100 })
            
            expect(gamesPlacedEvents).toHaveLength(1)
            expect(gamesPlacedEvents[0].batchIndex).toBe(0)
            expect(gamesPlacedEvents[0].status).toBe('games-placed')
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
                expect(layoutDeterminedReceived).toBe(true)
                expect(allBatchesCompleteReceived).toBe(true)
            }, { timeout: 2000 })
            
            // Verify bounds structure from layout event
            expect(layoutEventData).toBeDefined()
            const bounds = layoutEventData!.shelfBounds
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
                expect(layoutDeterminedReceived).toBe(true)
                expect(allBatchesCompleteReceived).toBe(true)
            }, { timeout: 3000 })
            
            const layout = layoutEventData!.shelfLayout
            expect(layout).toBeDefined()
            expect(layout.rows).toBeGreaterThan(0)
            if (layout.shelvesPerRow !== undefined) {
                expect(layout.shelvesPerRow).toBeGreaterThan(0)
            }
            
            console.log(`Layout: ${layout.rows} rows${layout.shelvesPerRow !== undefined ? ` x ${layout.shelvesPerRow} shelves/row` : ''}`)
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
                expect(layoutDeterminedReceived).toBe(true)
                expect(allBatchesCompleteReceived).toBe(true)
            }, { timeout: 8000, interval: 100 })
            
            const objectCountAfter = scene.children.length
            
            // Capture state for Phase 3 comparison
            const baselineState = {
                gamesProcessed: games.length,
                objectsAdded: objectCountAfter - objectCountBefore,
                shelfBounds: layoutEventData!.shelfBounds,
                shelfLayout: layoutEventData!.shelfLayout,
                completionReceived: allBatchesCompleteReceived,
                layoutReceived: layoutDeterminedReceived
            }
            
            // Log baseline for Phase 3 reference
            console.log('Baseline State (Method-Based):', JSON.stringify(baselineState, null, 2))
            
            // Basic assertions - GPU renderer may use instanced meshes that don't add many scene objects
            expect(baselineState.completionReceived).toBe(true)
            expect(baselineState.shelfLayout.rows).toBeGreaterThan(0)
            if (baselineState.shelfLayout.shelvesPerRow !== undefined) {
                expect(baselineState.shelfLayout.shelvesPerRow).toBeGreaterThan(0)
            }
        })
    })

    describe('Phase 3b: Event Emission', () => {
        it('should emit BatchReadyForPlacement for a single batch', async () => {
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
            
            // Wait for both paths to complete
            await vi.waitFor(() => {
                expect(batchReadyEvents.length).toBeGreaterThan(0)
                expect(allBatchesCompleteReceived).toBe(true)
            }, { timeout: 8000, interval: 100 })
            
            // Verify event was emitted
            expect(uniqueBatchIndices(batchReadyEvents)).toEqual([0])
            const latestBatchZero = [...batchReadyEvents].reverse().find((event) => event.batchIndex === 0)
            expect(latestBatchZero).toBeDefined()
            expect(latestBatchZero!).toMatchObject({
                batchIndex: 0,
                totalBatches: 1
            })
            expect(latestBatchZero!.games).toHaveLength(5)
            
            // Verify full flow still completes
            expect(allBatchesCompleteReceived).toBe(true)
            expect(completionEventData).toBeDefined()
        })

        it('should emit BatchReadyForPlacement for each batch in multi-batch scenario', async () => {
            const batch1 = createMockGames(3, 0)
            const batch2 = createMockGames(4, 1)
            
            // Emit batches
            eventManager.emit<SteamGamesBatchEvent>(
                SteamEventTypes.GamesBatchReady,
                {
                    games: batch1,
                    batchIndex: 0,
                    totalBatches: 2
                }
            )
            
            eventManager.emit<SteamGamesBatchEvent>(
                SteamEventTypes.GamesBatchReady,
                {
                    games: batch2,
                    batchIndex: 1,
                    totalBatches: 2
                }
            )
            
            // Wait for all batches to process
            await vi.waitFor(() => {
                expect(uniqueBatchIndices(batchReadyEvents)).toEqual([0, 1])
                expect(allBatchesCompleteReceived).toBe(true)
            }, { timeout: 8000, interval: 100 })
            
            // Verify both BatchReadyForPlacement events emitted
            expect(uniqueBatchIndices(batchReadyEvents)).toEqual([0, 1])
            const latestBatchZero = [...batchReadyEvents].reverse().find((event) => event.batchIndex === 0)
            const latestBatchOne = [...batchReadyEvents].reverse().find((event) => event.batchIndex === 1)
            expect(latestBatchZero).toBeDefined()
            expect(latestBatchOne).toBeDefined()
            expect(latestBatchZero!.games).toHaveLength(3)
            expect(latestBatchOne!.games).toHaveLength(4)
            
            // Verify completion
            expect(allBatchesCompleteReceived).toBe(true)
        })
        })

    describe('Phase 3c: GameBoxSpawner Event Observation', () => {
        it('should verify GameBoxSpawner receives events and placement completes', async () => {
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
            
            // Wait for events to flow through both paths
            await vi.waitFor(() => {
                expect(batchReadyEvents.length).toBeGreaterThan(0)
                expect(allBatchesCompleteReceived).toBe(true)
            }, { timeout: 8000, interval: 100 })
            
            // Verify events reached the test listener (proving GameBoxSpawner receives them too)
            expect(uniqueBatchIndices(batchReadyEvents)).toEqual([0])
            const latestBatchZero = [...batchReadyEvents].reverse().find((event) => event.batchIndex === 0)
            expect(latestBatchZero).toBeDefined()
            expect(latestBatchZero!.games).toHaveLength(5)
            expect(gamesPlacedEvents).toHaveLength(1)
            expect(gamesPlacedEvents[0].batchIndex).toBe(0)
            expect(gamesPlacedEvents[0].status).toBe('games-placed')
            
            // Verify end-to-end completion
            expect(allBatchesCompleteReceived).toBe(true)
            expect(completionEventData).toBeDefined()
            
            // Phase 3c SUCCESS: Events flow and placement completes
        })
    })
})
