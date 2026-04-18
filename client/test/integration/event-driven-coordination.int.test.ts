/**
 * Integration Test: Event-Driven Coordination (Phase 3f)
 * 
 * Purpose: Verify the complete event-driven coordination flow works correctly
 * with proper sequencing between BatchCoordinator, GameBoxSpawner, and GpuStorePropsRenderer.
 * 
 * Event Flow:
 * 1. BatchCoordinator emits BatchReadyForPlacement
 * 2. GameBoxSpawner receives BatchReadyForPlacement → stores pending games
 * 3. ShelfLayoutCoordinator emits ShelfReady (deferred via queueMicrotask)
 * 4. GameBoxSpawner receives ShelfReady → finds pending games → spawns them → emits GamesPlaced
 * 5. BatchCoordinator emits AllBatchesComplete when all batches processed
 * 
 * This test validates that:
 * - Events fire in the correct order
 * - No timing race conditions occur
 * - No "No pending games found" warnings appear
 * - Games are successfully placed on shelves
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
import { createStorePropsTestHarness, type StorePropsTestHarness } from '../helpers/StorePropsTestHarness'
import { 
    SteamEventTypes, 
    StorePropsEventTypes,
    GameEventTypes, 
    type SteamGamesBatchEvent,
    type BatchReadyForPlacementEvent,
    type ShelfReadyEvent,
    type GamesPlacedEvent
} from '../../src/types/InteractionEvents'
import type { SteamGame } from '../../src/steam'

describe('Event-Driven Coordination Integration (Phase 3f)', () => {
    let scene: THREE.Scene
    let eventManager: EventManager
    let dataManager: DataManager
    let harness: StorePropsTestHarness
    
    // Event tracking
    let batchReadyEvents: BatchReadyForPlacementEvent[] = []
    let shelfReadyEvents: ShelfReadyEvent[] = []
    let gamesPlacedEvents: GamesPlacedEvent[] = []
    let allBatchesCompleteReceived: boolean = false
    
    // Timeline tracking
    const eventTimeline: Array<{ event: string; batchIndex: number; timestamp: number }> = []

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

    const findTimelineIndex = (eventName: string, batchIndex: number): number => {
        return eventTimeline.findIndex((entry) => entry.event === eventName && entry.batchIndex === batchIndex)
    }

    beforeEach(async () => {
        scene = new THREE.Scene()
        eventManager = EventManager.getInstance()
        eventManager.removeAllListeners()
        dataManager = DataManager.getInstance()
        
        // Clear state
        dataManager.clear()
        batchReadyEvents = []
        shelfReadyEvents = []
        gamesPlacedEvents = []
        allBatchesCompleteReceived = false
        eventTimeline.length = 0
        
        // Setup event listeners to track the complete flow
        eventManager.registerEventHandler(
            StorePropsEventTypes.BatchReadyForPlacement,
            (event: CustomEvent<BatchReadyForPlacementEvent>) => {
                batchReadyEvents.push(event.detail)
                eventTimeline.push({ 
                    event: 'BatchReadyForPlacement', 
                    batchIndex: event.detail.batchIndex,
                    timestamp: Date.now() 
                })
                console.log(`[EVENT] BatchReadyForPlacement: batch ${event.detail.batchIndex}, ${event.detail.games.length} games`)
            }
        )
        
        eventManager.registerEventHandler(
            StorePropsEventTypes.ShelfReady,
            (event: CustomEvent<ShelfReadyEvent>) => {
                shelfReadyEvents.push(event.detail)
                eventTimeline.push({ 
                    event: 'ShelfReady', 
                    batchIndex: event.detail.batchIndex,
                    timestamp: Date.now() 
                })
                console.log(`[EVENT] ShelfReady: batch ${event.detail.batchIndex}`)
            }
        )
        
        eventManager.registerEventHandler(
            StorePropsEventTypes.GamesPlaced,
            (event: CustomEvent<GamesPlacedEvent>) => {
                gamesPlacedEvents.push(event.detail)
                eventTimeline.push({ 
                    event: 'GamesPlaced', 
                    batchIndex: event.detail.batchIndex,
                    timestamp: Date.now() 
                })
                console.log(`[EVENT] GamesPlaced: batch ${event.detail.batchIndex}`)
            }
        )
        
        eventManager.registerEventHandler(
            GameEventTypes.AllBatchesComplete,
            () => {
                allBatchesCompleteReceived = true
                eventTimeline.push({ 
                    event: 'AllBatchesComplete', 
                    batchIndex: -1,
                    timestamp: Date.now() 
                })
                console.log('[EVENT] AllBatchesComplete')
            }
        )
        
        // Create subsystems AFTER listeners are registered
        harness = createStorePropsTestHarness(scene)
    })

    afterEach(() => {
        harness?.dispose()
        eventManager.removeAllListeners()
        dataManager.clear()
        scene.clear()
        vi.clearAllMocks()
    })

    describe('Single Batch Flow', () => {
        it('should emit events in correct sequence: BatchReady → ShelfReady → GamesPlaced', async () => {
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
            
            // Wait for complete flow
            await vi.waitFor(() => {
                expect(allBatchesCompleteReceived).toBe(true)
                expect(gamesPlacedEvents.length).toBeGreaterThan(0)
            }, { timeout: 8000, interval: 100 })
            
            // Verify all events fired
            expect(uniqueBatchIndices(batchReadyEvents)).toEqual([0])
            expect(shelfReadyEvents).toHaveLength(1)
            expect(gamesPlacedEvents).toHaveLength(1)
            expect(allBatchesCompleteReceived).toBe(true)
            
            // Verify event sequence for batch 0
            const batchReadyIdx = findTimelineIndex('BatchReadyForPlacement', 0)
            const shelfReadyIdx = findTimelineIndex('ShelfReady', 0)
            const gamesPlacedIdx = findTimelineIndex('GamesPlaced', 0)
            const completeIdx = eventTimeline.findIndex((entry) => entry.event === 'AllBatchesComplete')

            expect(batchReadyIdx).toBeGreaterThanOrEqual(0)
            expect(shelfReadyIdx).toBeGreaterThan(batchReadyIdx)
            expect(gamesPlacedIdx).toBeGreaterThan(shelfReadyIdx)
            expect(completeIdx).toBeGreaterThan(gamesPlacedIdx)
            
            console.log('Event Timeline:', eventTimeline.map(e => `${e.event}[${e.batchIndex}]`).join(' → '))
        })

        it('should have matching batch indices across all events', async () => {
            const games = createMockGames(8, 0)
            
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
            }, { timeout: 8000, interval: 100 })
            
            // All events should reference the same batch index
            expect(uniqueBatchIndices(batchReadyEvents)).toEqual([0])
            expect(shelfReadyEvents[0].batchIndex).toBe(0)
            expect(gamesPlacedEvents[0].batchIndex).toBe(0)
        })

        it('should pass correct game counts through the flow', async () => {
            const gameCount = 12
            const games = createMockGames(gameCount, 0)
            
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
            }, { timeout: 8000, interval: 100 })
            
            // Game counts should match across events
            const latestBatchReady = [...batchReadyEvents].reverse().find((event) => event.batchIndex === 0)
            expect(latestBatchReady).toBeDefined()
            expect(latestBatchReady!.games).toHaveLength(gameCount)
            expect(gamesPlacedEvents[0].status).toBe('games-placed')
        })

        it('should not emit "No pending games found" warnings', async () => {
            const games = createMockGames(10, 0)
            
            // Capture console warnings
            const warnSpy = vi.spyOn(console, 'warn')
            
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
            }, { timeout: 8000, interval: 100 })
            
            // Check that no "No pending games" warnings were emitted
            const noPendingWarnings = warnSpy.mock.calls.filter(call => 
                call.some(arg => typeof arg === 'string' && arg.includes('No pending games found'))
            )
            
            expect(noPendingWarnings).toHaveLength(0)
            
            warnSpy.mockRestore()
        })
    })

    describe('Multiple Batches Flow', () => {
        it('should process multiple batches with correct event sequencing', async () => {
            const batch1 = createMockGames(5, 0)
            const batch2 = createMockGames(6, 1)
            const batch3 = createMockGames(4, 2)
            
            // Emit all batches
            eventManager.emit<SteamGamesBatchEvent>(
                SteamEventTypes.GamesBatchReady,
                { games: batch1, batchIndex: 0, totalBatches: 3 }
            )
            eventManager.emit<SteamGamesBatchEvent>(
                SteamEventTypes.GamesBatchReady,
                { games: batch2, batchIndex: 1, totalBatches: 3 }
            )
            eventManager.emit<SteamGamesBatchEvent>(
                SteamEventTypes.GamesBatchReady,
                { games: batch3, batchIndex: 2, totalBatches: 3 }
            )
            
            // Wait for all batches to complete
            await vi.waitFor(() => {
                expect(gamesPlacedEvents.length).toBe(3)
                expect(allBatchesCompleteReceived).toBe(true)
            }, { timeout: 10000, interval: 100 })
            
            // Verify all events fired for each batch
            expect(uniqueBatchIndices(batchReadyEvents)).toEqual([0, 1, 2])
            expect(shelfReadyEvents).toHaveLength(3)
            expect(gamesPlacedEvents).toHaveLength(3)
            
            expect(shelfReadyEvents.map(e => e.batchIndex)).toEqual([0, 1, 2])
            expect(gamesPlacedEvents.map(e => e.batchIndex)).toEqual([0, 1, 2])
        })

        it('should not have race conditions between batches', async () => {
            const batches = Array.from({ length: 5 }, (_, i) => createMockGames(8, i))
            
            // Capture console warnings
            const warnSpy = vi.spyOn(console, 'warn')
            
            // Emit all batches rapidly
            batches.forEach((games, index) => {
                eventManager.emit<SteamGamesBatchEvent>(
                    SteamEventTypes.GamesBatchReady,
                    { games, batchIndex: index, totalBatches: batches.length }
                )
            })
            
            // Wait for completion
            await vi.waitFor(() => {
                expect(allBatchesCompleteReceived).toBe(true)
            }, { timeout: 10000, interval: 100 })
            
            // No "No pending games" warnings should appear
            const noPendingWarnings = warnSpy.mock.calls.filter(call => 
                call.some(arg => typeof arg === 'string' && arg.includes('No pending games found'))
            )
            
            expect(noPendingWarnings).toHaveLength(0)
            
            // All batches should have complete event chains
            expect(gamesPlacedEvents).toHaveLength(batches.length)
            
            warnSpy.mockRestore()
        })
    })

    describe('Event Timing Validation', () => {
        it('should have ShelfReady after BatchReadyForPlacement', async () => {
            const games = createMockGames(5, 0)
            
            eventManager.emit<SteamGamesBatchEvent>(
                SteamEventTypes.GamesBatchReady,
                { games, batchIndex: 0, totalBatches: 1 }
            )
            
            await vi.waitFor(() => {
                expect(gamesPlacedEvents.length).toBeGreaterThan(0)
            }, { timeout: 8000, interval: 100 })
            
            const batchReadyIdx = findTimelineIndex('BatchReadyForPlacement', 0)
            const shelfReadyIdx = findTimelineIndex('ShelfReady', 0)

            expect(batchReadyIdx).toBeGreaterThanOrEqual(0)
            expect(shelfReadyIdx).toBeGreaterThan(batchReadyIdx)
        })

        it('should have GamesPlaced shortly after ShelfReady', async () => {
            const games = createMockGames(5, 0)
            
            eventManager.emit<SteamGamesBatchEvent>(
                SteamEventTypes.GamesBatchReady,
                { games, batchIndex: 0, totalBatches: 1 }
            )
            
            await vi.waitFor(() => {
                expect(gamesPlacedEvents.length).toBeGreaterThan(0)
            }, { timeout: 8000, interval: 100 })
            
            const shelfReadyIdx = findTimelineIndex('ShelfReady', 0)
            const gamesPlacedIdx = findTimelineIndex('GamesPlaced', 0)
            
            // GamesPlaced should come right after ShelfReady
            expect(gamesPlacedIdx).toBe(shelfReadyIdx + 1)
            
            // Time delta should be minimal
            const timeDelta = eventTimeline[gamesPlacedIdx].timestamp - eventTimeline[shelfReadyIdx].timestamp
            expect(timeDelta).toBeLessThan(100)
        })
    })

    describe('Error Resilience', () => {
        it('should handle empty batch without breaking event chain', async () => {
            const games: Readonly<SteamGame>[] = []
            
            eventManager.emit<SteamGamesBatchEvent>(
                SteamEventTypes.GamesBatchReady,
                { games, batchIndex: 0, totalBatches: 1 }
            )
            
            // Should complete gracefully
            await vi.waitFor(() => {
                expect(allBatchesCompleteReceived).toBe(true)
            }, { timeout: 3000 })
            
            // Events should still fire (even if no games)
            expect(uniqueBatchIndices(batchReadyEvents)).toEqual([0])
            expect(allBatchesCompleteReceived).toBe(true)
        })
    })
})
