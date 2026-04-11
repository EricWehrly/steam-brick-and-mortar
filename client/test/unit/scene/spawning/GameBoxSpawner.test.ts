/**
 * Unit Tests: GameBoxSpawner Event-Driven Coordination
 * 
 * Tests verify that GameBoxSpawner correctly:
 * 1. Listens for BatchReadyForPlacement events and stores games as pending
 * 2. Listens for ShelfReady events and places stored games
 * 3. Emits GamesPlaced events
 */

import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest'
import * as THREE from 'three'
import { EventManager, EventSource } from '../../../../src/core/EventManager'
import { DataManager } from '../../../../src/core/data/DataManager'
import { DataKey, DataDomain } from '../../../../src/core/data/DataTypes'
import { GameBoxSpawner } from '../../../../src/scene/spawning/GameBoxSpawner'
import {
    StorePropsEventTypes,
    type BatchReadyForPlacementEvent,
    type ShelfReadyEvent,
    type GamesPlacedEvent,
    type GameBoxSpawnedEvent,
} from '../../../../src/types/InteractionEvents'
import type { SteamGame } from '../../../../src/steam'

// Mock EventManager with test helper
vi.mock('../../../../src/core/EventManager', async (importOriginal) => {
    const actual = await importOriginal() as any
    type MockInstance = { registerEventHandler: Mock; emit: Mock; removeEventHandler: Mock }
    let mockInstance: MockInstance | null = null
    
    return {
        ...actual,
        EventManager: Object.assign(
            vi.fn(() => ({ registerEventHandler: vi.fn(), emit: vi.fn(), removeEventHandler: vi.fn() })),
            {
                getInstance: vi.fn(() => mockInstance ??= { registerEventHandler: vi.fn(), emit: vi.fn(), removeEventHandler: vi.fn() }),
                resetInstance: () => { mockInstance = null }
            }
        )
    }
})

// Access mock's test helper
const resetEventManager = () => (EventManager as unknown as { resetInstance: () => void }).resetInstance()

/** Helper to build a minimal valid ShelfReadyEvent payload */
function makeShelfReady(batchIndex: number, position = new THREE.Vector3(0, 0, 0), rotationY = 0): ShelfReadyEvent {
    return { batchIndex, position, rotationY, rowIndex: 0 }
}

describe('GameBoxSpawner Event Coordination', () => {
    let eventManager: EventManager
    let spawner: GameBoxSpawner
    let spawnedEvents: GameBoxSpawnedEvent[]

    const createMockGames = (count: number, batchIndex: number): readonly SteamGame[] => {
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
        // Mock Scene for SceneSignManager
        const mockScene = new THREE.Scene()
        DataManager.getInstance().set(DataKey.MainScene, mockScene, { domain: DataDomain.Scene })

        // Reset the singleton and get a fresh instance
        resetEventManager()
        eventManager = EventManager.getInstance()
        
        // Set up event handler map to track registrations
        const eventHandlers = new Map<string, Set<Function>>()
        
        // Mock registerEventHandler to actually store handlers
        vi.mocked(eventManager.registerEventHandler).mockImplementation((eventType: string, handler: Function) => {
            if (!eventHandlers.has(eventType)) {
                eventHandlers.set(eventType, new Set())
            }
            eventHandlers.get(eventType)!.add(handler)
        })
        
        // Mock emit to call registered handlers (returns boolean to match real signature)
        vi.mocked(eventManager.emit).mockImplementation((eventType: string, detail: any) => {
            const handlers = eventHandlers.get(eventType)
            if (handlers) {
                const event = new CustomEvent(eventType, { detail })
                handlers.forEach(handler => handler(event))
            }
            return true
        })

        // Create spawner (will register its own event handlers)
        spawner = new GameBoxSpawner()

        spawnedEvents = []
        eventManager.registerEventHandler(
            StorePropsEventTypes.GameBoxSpawned,
            (event: CustomEvent<GameBoxSpawnedEvent>) => {
                spawnedEvents.push(event.detail)
            }
        )
    })

    afterEach(() => {
        vi.clearAllMocks()
    })

    describe('BatchReadyForPlacement Event Handling', () => {
        it('should store games when receiving BatchReadyForPlacement', () => {
            const games = createMockGames(5, 0)

            eventManager.emit<BatchReadyForPlacementEvent>(
                StorePropsEventTypes.BatchReadyForPlacement,
                { games, batchIndex: 0, totalBatches: 1 }
            )

            // Games stored as pending — verify by triggering ShelfReady
            eventManager.emit<ShelfReadyEvent>(
                StorePropsEventTypes.ShelfReady,
                makeShelfReady(0)
            )

            expect(spawnedEvents).toHaveLength(5)
        })

        it('should store batches independently by batchIndex', () => {
            const batch1 = createMockGames(5, 0)
            const batch2 = createMockGames(6, 1)
            const batch3 = createMockGames(4, 2)

            eventManager.emit<BatchReadyForPlacementEvent>(
                StorePropsEventTypes.BatchReadyForPlacement,
                { games: batch1, batchIndex: 0, totalBatches: 3 }
            )
            eventManager.emit<BatchReadyForPlacementEvent>(
                StorePropsEventTypes.BatchReadyForPlacement,
                { games: batch2, batchIndex: 1, totalBatches: 3 }
            )
            eventManager.emit<BatchReadyForPlacementEvent>(
                StorePropsEventTypes.BatchReadyForPlacement,
                { games: batch3, batchIndex: 2, totalBatches: 3 }
            )

            // Trigger shelves — each should place its own batch
            for (let i = 0; i < 3; i++) {
                eventManager.emit<ShelfReadyEvent>(
                    StorePropsEventTypes.ShelfReady,
                    makeShelfReady(i, new THREE.Vector3(i * 3, 0, 0))
                )
            }

            expect(spawnedEvents.length).toBeGreaterThan(0)
        })

        it('should handle empty batches without errors', () => {
            const games: readonly SteamGame[] = []

            expect(() => {
                eventManager.emit<BatchReadyForPlacementEvent>(
                    StorePropsEventTypes.BatchReadyForPlacement,
                    { games, batchIndex: 0, totalBatches: 1 }
                )
            }).not.toThrow()

            expect(spawnedEvents).toHaveLength(0)
        })
    })

    describe('ShelfReady Event Handling', () => {
        it('should spawn games when shelf is ready', () => {
            const games = createMockGames(8, 0)
            const gamesPlacedEvents: GamesPlacedEvent[] = []

            eventManager.registerEventHandler(
                StorePropsEventTypes.GamesPlaced,
                (event: CustomEvent<GamesPlacedEvent>) => {
                    gamesPlacedEvents.push(event.detail)
                }
            )

            // Store games
            eventManager.emit<BatchReadyForPlacementEvent>(
                StorePropsEventTypes.BatchReadyForPlacement,
                { games, batchIndex: 0, totalBatches: 1 }
            )

            // Shelf ready
            eventManager.emit<ShelfReadyEvent>(
                StorePropsEventTypes.ShelfReady,
                makeShelfReady(0)
            )

            // Should emit one GameBoxSpawned event per spawned game
            expect(spawnedEvents).toHaveLength(8)

            // Should emit GamesPlaced
            expect(gamesPlacedEvents).toHaveLength(1)
            expect(gamesPlacedEvents[0].batchIndex).toBe(0)
            expect(gamesPlacedEvents[0].status).toBe('games-placed')
        })

        it('preserves side convention on PI-rotated shelves (no front/back swap)', () => {
            const games = createMockGames(2, 0)

            eventManager.emit<BatchReadyForPlacementEvent>(
                StorePropsEventTypes.BatchReadyForPlacement,
                { games, batchIndex: 0, totalBatches: 1 }
            )

            eventManager.emit<ShelfReadyEvent>(
                StorePropsEventTypes.ShelfReady,
                makeShelfReady(0, new THREE.Vector3(0, 0, 0), Math.PI)
            )

            expect(spawnedEvents.length).toBeGreaterThan(0)
            expect(spawnedEvents[0].side).toBe('back')
        })

        it('should warn if no pending games found for batch', () => {
            const warnSpy = vi.spyOn(console, 'warn')
            const gamesPlacedEvents: GamesPlacedEvent[] = []

            eventManager.registerEventHandler(
                StorePropsEventTypes.GamesPlaced,
                (event: CustomEvent<GamesPlacedEvent>) => {
                    gamesPlacedEvents.push(event.detail)
                }
            )

            // Shelf ready without storing games first
            eventManager.emit<ShelfReadyEvent>(
                StorePropsEventTypes.ShelfReady,
                makeShelfReady(5)
            )

            // Should warn about missing games (Logger outputs multiple args)
            expect(warnSpy).toHaveBeenCalled()
            const warnCall = warnSpy.mock.calls[0]
            const warnMessage = warnCall.join(' ')
            expect(warnMessage).toContain('No pending games found for batch 5')

            // Emit terminal failure to prevent coordinator completion deadlock
            expect(gamesPlacedEvents).toHaveLength(1)
            expect(gamesPlacedEvents[0].batchIndex).toBe(5)
            expect(gamesPlacedEvents[0].status).toBe('failed')

            warnSpy.mockRestore()
        })

        it('should handle multiple batches correctly', () => {
            const batch1 = createMockGames(5, 0)
            const batch2 = createMockGames(6, 1)
            const gamesPlacedEvents: GamesPlacedEvent[] = []

            eventManager.registerEventHandler(
                StorePropsEventTypes.GamesPlaced,
                (event: CustomEvent<GamesPlacedEvent>) => {
                    gamesPlacedEvents.push(event.detail)
                }
            )

            // Store batches
            eventManager.emit<BatchReadyForPlacementEvent>(
                StorePropsEventTypes.BatchReadyForPlacement,
                { games: batch1, batchIndex: 0, totalBatches: 2 }
            )
            eventManager.emit<BatchReadyForPlacementEvent>(
                StorePropsEventTypes.BatchReadyForPlacement,
                { games: batch2, batchIndex: 1, totalBatches: 2 }
            )

            // Shelves ready
            eventManager.emit<ShelfReadyEvent>(StorePropsEventTypes.ShelfReady, makeShelfReady(0))
            eventManager.emit<ShelfReadyEvent>(StorePropsEventTypes.ShelfReady, makeShelfReady(1, new THREE.Vector3(2, 0, 0)))

            // Should spawn all games
            expect(spawnedEvents).toHaveLength(11)
            expect(gamesPlacedEvents).toHaveLength(2)
        })
    })

    describe('Complete Event Flow', () => {
        it('should follow correct sequence: BatchReady → ShelfReady → GamesPlaced', () => {
            const games = createMockGames(10, 0)
            const eventSequence: string[] = []

            const originalEmit = eventManager.emit.bind(eventManager)
            eventManager.emit = vi.fn((eventType: string, detail: any) => {
                eventSequence.push(eventType)
                return originalEmit(eventType, detail)
            }) as any

            eventManager.emit<BatchReadyForPlacementEvent>(
                StorePropsEventTypes.BatchReadyForPlacement,
                { games, batchIndex: 0, totalBatches: 1 }
            )

            eventManager.emit<ShelfReadyEvent>(
                StorePropsEventTypes.ShelfReady,
                makeShelfReady(0)
            )

            expect(eventSequence).toContain(StorePropsEventTypes.BatchReadyForPlacement)
            expect(eventSequence).toContain(StorePropsEventTypes.ShelfReady)
            expect(eventSequence).toContain(StorePropsEventTypes.GamesPlaced)

            const readyIdx = eventSequence.indexOf(StorePropsEventTypes.ShelfReady)
            const placedIdx = eventSequence.indexOf(StorePropsEventTypes.GamesPlaced)
            expect(readyIdx).toBeLessThan(placedIdx)
        })

        it('should maintain pending games across multiple shelf requests', () => {
            const batch1 = createMockGames(5, 0)
            const batch2 = createMockGames(6, 1)
            const batch3 = createMockGames(4, 2)
            const gamesPlacedEvents: GamesPlacedEvent[] = []

            eventManager.registerEventHandler(
                StorePropsEventTypes.GamesPlaced,
                (event: CustomEvent<GamesPlacedEvent>) => {
                    gamesPlacedEvents.push(event.detail)
                }
            )

            // Store all batches first
            eventManager.emit<BatchReadyForPlacementEvent>(
                StorePropsEventTypes.BatchReadyForPlacement,
                { games: batch1, batchIndex: 0, totalBatches: 3 }
            )
            eventManager.emit<BatchReadyForPlacementEvent>(
                StorePropsEventTypes.BatchReadyForPlacement,
                { games: batch2, batchIndex: 1, totalBatches: 3 }
            )
            eventManager.emit<BatchReadyForPlacementEvent>(
                StorePropsEventTypes.BatchReadyForPlacement,
                { games: batch3, batchIndex: 2, totalBatches: 3 }
            )

            // Shelves ready in different order
            eventManager.emit<ShelfReadyEvent>(StorePropsEventTypes.ShelfReady, makeShelfReady(1))
            eventManager.emit<ShelfReadyEvent>(StorePropsEventTypes.ShelfReady, makeShelfReady(0))
            eventManager.emit<ShelfReadyEvent>(StorePropsEventTypes.ShelfReady, makeShelfReady(2))

            // All games should be spawned
            expect(spawnedEvents).toHaveLength(15)
            expect(gamesPlacedEvents).toHaveLength(3)
        })

        it('should not spawn games twice for the same batch', () => {
            const games = createMockGames(5, 0)
            const gamesPlacedEvents: GamesPlacedEvent[] = []

            eventManager.registerEventHandler(
                StorePropsEventTypes.GamesPlaced,
                (event: CustomEvent<GamesPlacedEvent>) => {
                    gamesPlacedEvents.push(event.detail)
                }
            )

            // Store games
            eventManager.emit<BatchReadyForPlacementEvent>(
                StorePropsEventTypes.BatchReadyForPlacement,
                { games, batchIndex: 0, totalBatches: 1 }
            )

            // Shelf ready (spawns games)
            eventManager.emit<ShelfReadyEvent>(StorePropsEventTypes.ShelfReady, makeShelfReady(0))

            const firstCallCount = spawnedEvents.length

            // Try to fire shelf ready again (should warn, not spawn)
            const warnSpy = vi.spyOn(console, 'warn')
            eventManager.emit<ShelfReadyEvent>(StorePropsEventTypes.ShelfReady, makeShelfReady(0))

            // Should not spawn again
            expect(spawnedEvents).toHaveLength(firstCallCount)
            expect(warnSpy).toHaveBeenCalled()
            const warnCall = warnSpy.mock.calls[0]
            const warnMessage = warnCall.join(' ')
            expect(warnMessage).toContain('No pending games found for batch 0')

            warnSpy.mockRestore()
        })
    })

    describe('Edge Cases', () => {
        it('should handle batch with zero games', () => {
            const games: readonly SteamGame[] = []
            const gamesPlacedEvents: GamesPlacedEvent[] = []

            eventManager.registerEventHandler(
                StorePropsEventTypes.GamesPlaced,
                (event: CustomEvent<GamesPlacedEvent>) => {
                    gamesPlacedEvents.push(event.detail)
                }
            )

            eventManager.emit<BatchReadyForPlacementEvent>(
                StorePropsEventTypes.BatchReadyForPlacement,
                { games, batchIndex: 0, totalBatches: 1 }
            )

            eventManager.emit<ShelfReadyEvent>(StorePropsEventTypes.ShelfReady, makeShelfReady(0))

            // Should not emit any GameBoxSpawned events
            expect(spawnedEvents).toHaveLength(0)

            // Should still emit GamesPlaced for this batch
            expect(gamesPlacedEvents).toHaveLength(1)
            expect(gamesPlacedEvents[0].batchIndex).toBe(0)
            expect(gamesPlacedEvents[0].status).toBe('games-placed')
        })

        it('should handle large batch counts', () => {
            const games = createMockGames(100, 0)
            const gamesPlacedEvents: GamesPlacedEvent[] = []

            eventManager.registerEventHandler(
                StorePropsEventTypes.GamesPlaced,
                (event: CustomEvent<GamesPlacedEvent>) => {
                    gamesPlacedEvents.push(event.detail)
                }
            )

            eventManager.emit<BatchReadyForPlacementEvent>(
                StorePropsEventTypes.BatchReadyForPlacement,
                { games, batchIndex: 0, totalBatches: 1 }
            )

            // Shelf ready — will spawn as many games as fit on one shelf
            eventManager.emit<ShelfReadyEvent>(StorePropsEventTypes.ShelfReady, makeShelfReady(0))

            // Should spawn games (actual count depends on shelf layout constants)
            const callCount = spawnedEvents.length
            expect(callCount).toBeGreaterThan(0)
            expect(callCount).toBeLessThanOrEqual(100)
            
            // Should emit GamesPlaced event
            expect(gamesPlacedEvents).toHaveLength(1)
            expect(gamesPlacedEvents[0].batchIndex).toBe(0)
            expect(gamesPlacedEvents[0].status).toBe('games-placed')
        })
    })
})
