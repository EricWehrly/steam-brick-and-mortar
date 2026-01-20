/**
 * Integration Test: Event-Driven Coordination (Phase 3f)
 * 
 * Purpose: Verify the complete event-driven coordination flow works correctly
 * with proper sequencing between BatchCoordinator, GameBoxSpawner, and GpuStorePropsRenderer.
 * 
 * Event Flow:
 * 1. BatchCoordinator emits BatchReadyForPlacement
 * 2. GameBoxSpawner receives BatchReadyForPlacement → stores games → emits ShelfSpaceRequested
 * 3. GpuStorePropsRenderer receives ShelfSpaceRequested → creates shelf → emits ShelfCreated
 * 4. GameBoxSpawner receives ShelfCreated → finds pending games → spawns them → emits GamesPlaced
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
import { GpuStorePropsRenderer } from '../../src/scene/GpuStorePropsRenderer'
import { 
    SteamEventTypes, 
    StorePropsEventTypes,
    GameEventTypes, 
    type SteamGamesBatchEvent,
    type BatchReadyForPlacementEvent,
    type ShelfSpaceRequestedEvent,
    type ShelfCreatedEvent,
    type GamesPlacedEvent
} from '../../src/types/InteractionEvents'
import type { SteamGame } from '../../src/steam'

describe('Event-Driven Coordination Integration (Phase 3f)', () => {
    let scene: THREE.Scene
    let eventManager: EventManager
    let dataManager: DataManager
    let renderer: GpuStorePropsRenderer
    
    // Event tracking
    let batchReadyEvents: BatchReadyForPlacementEvent[] = []
    let shelfSpaceRequestedEvents: ShelfSpaceRequestedEvent[] = []
    let shelfCreatedEvents: ShelfCreatedEvent[] = []
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

    beforeEach(() => {
        scene = new THREE.Scene()
        eventManager = EventManager.getInstance()
        dataManager = DataManager.getInstance()
        
        // Clear state
        dataManager.clear()
        batchReadyEvents = []
        shelfSpaceRequestedEvents = []
        shelfCreatedEvents = []
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
            StorePropsEventTypes.ShelfSpaceRequested,
            (event: CustomEvent<ShelfSpaceRequestedEvent>) => {
                shelfSpaceRequestedEvents.push(event.detail)
                eventTimeline.push({ 
                    event: 'ShelfSpaceRequested', 
                    batchIndex: event.detail.batchIndex,
                    timestamp: Date.now() 
                })
                console.log(`[EVENT] ShelfSpaceRequested: batch ${event.detail.batchIndex}, ${event.detail.gamesCount} games`)
            }
        )
        
        eventManager.registerEventHandler(
            StorePropsEventTypes.ShelfCreated,
            (event: CustomEvent<ShelfCreatedEvent>) => {
                shelfCreatedEvents.push(event.detail)
                eventTimeline.push({ 
                    event: 'ShelfCreated', 
                    batchIndex: event.detail.batchIndex,
                    timestamp: Date.now() 
                })
                console.log(`[EVENT] ShelfCreated: batch ${event.detail.batchIndex}`)
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
                console.log(`[EVENT] GamesPlaced: batch ${event.detail.batchIndex}, ${event.detail.gamesCount} games`)
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
        
        // Create renderer AFTER listeners are registered
        renderer = new GpuStorePropsRenderer(scene)
    })

    afterEach(() => {
        renderer?.dispose()
        dataManager.clear()
        scene.clear()
        vi.clearAllMocks()
    })

    describe('Single Batch Flow', () => {
        it('should emit events in correct sequence: BatchReady → ShelfRequested → ShelfCreated → GamesPlaced', async () => {
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
                return allBatchesCompleteReceived === true && gamesPlacedEvents.length > 0
            }, { timeout: 8000, interval: 100 })
            
            // Verify all events fired
            expect(batchReadyEvents).toHaveLength(1)
            expect(shelfSpaceRequestedEvents).toHaveLength(1)
            expect(shelfCreatedEvents).toHaveLength(1)
            expect(gamesPlacedEvents).toHaveLength(1)
            expect(allBatchesCompleteReceived).toBe(true)
            
            // Verify event sequence
            expect(eventTimeline[0].event).toBe('BatchReadyForPlacement')
            expect(eventTimeline[1].event).toBe('ShelfSpaceRequested')
            expect(eventTimeline[2].event).toBe('ShelfCreated')
            expect(eventTimeline[3].event).toBe('GamesPlaced')
            expect(eventTimeline[4].event).toBe('AllBatchesComplete')
            
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
                return gamesPlacedEvents.length > 0
            }, { timeout: 8000, interval: 100 })
            
            // All events should reference the same batch index
            expect(batchReadyEvents[0].batchIndex).toBe(0)
            expect(shelfSpaceRequestedEvents[0].batchIndex).toBe(0)
            expect(shelfCreatedEvents[0].batchIndex).toBe(0)
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
                return gamesPlacedEvents.length > 0
            }, { timeout: 8000, interval: 100 })
            
            // Game counts should match across events
            expect(batchReadyEvents[0].games).toHaveLength(gameCount)
            expect(shelfSpaceRequestedEvents[0].gamesCount).toBe(gameCount)
            expect(gamesPlacedEvents[0].gamesCount).toBe(gameCount)
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
                return allBatchesCompleteReceived === true
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
                return gamesPlacedEvents.length === 3 && allBatchesCompleteReceived === true
            }, { timeout: 10000, interval: 100 })
            
            // Verify all events fired for each batch
            expect(batchReadyEvents).toHaveLength(3)
            expect(shelfSpaceRequestedEvents).toHaveLength(3)
            expect(shelfCreatedEvents).toHaveLength(3)
            expect(gamesPlacedEvents).toHaveLength(3)
            
            // Verify batch indices are in order
            expect(batchReadyEvents.map(e => e.batchIndex)).toEqual([0, 1, 2])
            expect(shelfSpaceRequestedEvents.map(e => e.batchIndex)).toEqual([0, 1, 2])
            expect(shelfCreatedEvents.map(e => e.batchIndex)).toEqual([0, 1, 2])
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
                return allBatchesCompleteReceived === true
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
        it('should have ShelfSpaceRequested immediately after BatchReadyForPlacement', async () => {
            const games = createMockGames(5, 0)
            
            eventManager.emit<SteamGamesBatchEvent>(
                SteamEventTypes.GamesBatchReady,
                { games, batchIndex: 0, totalBatches: 1 }
            )
            
            await vi.waitFor(() => {
                return gamesPlacedEvents.length > 0
            }, { timeout: 8000, interval: 100 })
            
            // Find the timeline indices for these events
            const batchReadyIdx = eventTimeline.findIndex(e => e.event === 'BatchReadyForPlacement')
            const shelfRequestedIdx = eventTimeline.findIndex(e => e.event === 'ShelfSpaceRequested')
            
            // ShelfSpaceRequested should come right after BatchReadyForPlacement
            expect(shelfRequestedIdx).toBe(batchReadyIdx + 1)
            
            // Time delta should be minimal (< 50ms typically)
            const timeDelta = eventTimeline[shelfRequestedIdx].timestamp - eventTimeline[batchReadyIdx].timestamp
            expect(timeDelta).toBeLessThan(100)
        })

        it('should have ShelfCreated shortly after ShelfSpaceRequested', async () => {
            const games = createMockGames(5, 0)
            
            eventManager.emit<SteamGamesBatchEvent>(
                SteamEventTypes.GamesBatchReady,
                { games, batchIndex: 0, totalBatches: 1 }
            )
            
            await vi.waitFor(() => {
                return gamesPlacedEvents.length > 0
            }, { timeout: 8000, interval: 100 })
            
            const shelfRequestedIdx = eventTimeline.findIndex(e => e.event === 'ShelfSpaceRequested')
            const shelfCreatedIdx = eventTimeline.findIndex(e => e.event === 'ShelfCreated')
            
            // ShelfCreated should come right after ShelfSpaceRequested
            expect(shelfCreatedIdx).toBe(shelfRequestedIdx + 1)
        })

        it('should have GamesPlaced shortly after ShelfCreated', async () => {
            const games = createMockGames(5, 0)
            
            eventManager.emit<SteamGamesBatchEvent>(
                SteamEventTypes.GamesBatchReady,
                { games, batchIndex: 0, totalBatches: 1 }
            )
            
            await vi.waitFor(() => {
                return gamesPlacedEvents.length > 0
            }, { timeout: 8000, interval: 100 })
            
            const shelfCreatedIdx = eventTimeline.findIndex(e => e.event === 'ShelfCreated')
            const gamesPlacedIdx = eventTimeline.findIndex(e => e.event === 'GamesPlaced')
            
            // GamesPlaced should come right after ShelfCreated
            expect(gamesPlacedIdx).toBe(shelfCreatedIdx + 1)
            
            // Time delta should be minimal
            const timeDelta = eventTimeline[gamesPlacedIdx].timestamp - eventTimeline[shelfCreatedIdx].timestamp
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
                return allBatchesCompleteReceived === true
            }, { timeout: 3000 })
            
            // Events should still fire (even if no games)
            expect(batchReadyEvents).toHaveLength(1)
            expect(allBatchesCompleteReceived).toBe(true)
        })
    })
})
