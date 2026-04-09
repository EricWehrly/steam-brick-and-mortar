/**
 * Unit Tests: GameBoxSpawner Event-Driven Coordination
 * 
 * Tests verify that GameBoxSpawner correctly:
 * 1. Listens for BatchReadyForPlacement events
 * 2. Stores games in pending state
 * 3. Emits ShelfSpaceRequested events
 * 4. Listens for ShelfCreated events
 * 5. Spawns games from pending storage
 * 6. Emits GamesPlaced events
 */

import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest'
import * as THREE from 'three'
import { EventManager, EventSource } from '../../../../src/core/EventManager'
import { DataManager } from '../../../../src/core/data/DataManager'
import { DataKey, DataDomain } from '../../../../src/core/data/DataTypes'
import { GameBoxSpawner } from '../../../../src/scene/spawning/GameBoxSpawner'
import { GpuGameBoxRenderer } from '../../../../src/scene/game-box/GpuGameBoxRenderer'
import {
    StorePropsEventTypes,
    type BatchReadyForPlacementEvent,
    type ShelfSpaceRequestedEvent,
    type ShelfCreatedEvent,
    type GamesPlacedEvent
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


describe('GameBoxSpawner Event Coordination', () => {
    let eventManager: EventManager
    let mockRenderer: GpuGameBoxRenderer
    let spawner: GameBoxSpawner

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

        // Create mock renderer with minimal implementation
        mockRenderer = {
            createGameBoxAuto: vi.fn(),
            getDimensions: vi.fn(() => ({ width: 0.5, height: 0.7, depth: 0.1 })),
            getMemoryStats: vi.fn(() => ({ totalVRAM: 0, textureCount: 0, instanceCount: 0 })),
            dispose: vi.fn()
        } as any

        // Create spawner (will register its own event handlers)
        spawner = new GameBoxSpawner(mockRenderer)
    })

    afterEach(() => {
        vi.clearAllMocks()
    })

    describe('BatchReadyForPlacement Event Handling', () => {
        it('should store games when receiving BatchReadyForPlacement', () => {
            const games = createMockGames(5, 0)
            const shelfSpaceRequestedEvents: ShelfSpaceRequestedEvent[] = []

            // Listen for the emitted event
            eventManager.registerEventHandler(
                StorePropsEventTypes.ShelfSpaceRequested,
                (event: CustomEvent<ShelfSpaceRequestedEvent>) => {
                    shelfSpaceRequestedEvents.push(event.detail)
                }
            )

            eventManager.emit<BatchReadyForPlacementEvent>(
                StorePropsEventTypes.BatchReadyForPlacement,
                { games, batchIndex: 0, totalBatches: 1 }
            )

            // Should emit ShelfSpaceRequested
            expect(shelfSpaceRequestedEvents).toHaveLength(1)
            expect(shelfSpaceRequestedEvents[0].batchIndex).toBe(0)
            expect(shelfSpaceRequestedEvents[0].gamesCount).toBe(5)
        })

        it('should emit ShelfSpaceRequested for each batch', () => {
            const batch1 = createMockGames(5, 0)
            const batch2 = createMockGames(6, 1)
            const batch3 = createMockGames(4, 2)
            const shelfSpaceRequestedEvents: ShelfSpaceRequestedEvent[] = []

            eventManager.registerEventHandler(
                StorePropsEventTypes.ShelfSpaceRequested,
                (event: CustomEvent<ShelfSpaceRequestedEvent>) => {
                    shelfSpaceRequestedEvents.push(event.detail)
                }
            )

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

            expect(shelfSpaceRequestedEvents).toHaveLength(3)
            expect(shelfSpaceRequestedEvents[0].gamesCount).toBe(5)
            expect(shelfSpaceRequestedEvents[1].gamesCount).toBe(6)
            expect(shelfSpaceRequestedEvents[2].gamesCount).toBe(4)
        })

        it('should handle empty batches without errors', () => {
            const games: readonly SteamGame[] = []
            const shelfSpaceRequestedEvents: ShelfSpaceRequestedEvent[] = []

            eventManager.registerEventHandler(
                StorePropsEventTypes.ShelfSpaceRequested,
                (event: CustomEvent<ShelfSpaceRequestedEvent>) => {
                    shelfSpaceRequestedEvents.push(event.detail)
                }
            )

            eventManager.emit<BatchReadyForPlacementEvent>(
                StorePropsEventTypes.BatchReadyForPlacement,
                { games, batchIndex: 0, totalBatches: 1 }
            )

            expect(shelfSpaceRequestedEvents).toHaveLength(1)
            expect(shelfSpaceRequestedEvents[0].gamesCount).toBe(0)
        })
    })

    describe('ShelfCreated Event Handling', () => {
        it('should spawn games when shelf is created', () => {
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

            // Create shelf
            eventManager.emit<ShelfCreatedEvent>(
                StorePropsEventTypes.ShelfCreated,
                {
                    position: new THREE.Vector3(0, 0, 0),
                    batchIndex: 0,
                    bounds: { minX: -1, maxX: 1, minZ: -1, maxZ: 1 }
                }
            )

            // Should have called createGameBoxAuto for each game
            expect(mockRenderer.createGameBoxAuto).toHaveBeenCalledTimes(8)

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

            eventManager.emit<ShelfCreatedEvent>(
                StorePropsEventTypes.ShelfCreated,
                {
                    position: new THREE.Vector3(0, 0, 0),
                    batchIndex: 0,
                    shelfRotationY: Math.PI,
                    bounds: { minX: -1, maxX: 1, minZ: -1, maxZ: 1 }
                }
            )

            expect(mockRenderer.createGameBoxAuto).toHaveBeenCalled()
            const firstCall = (mockRenderer.createGameBoxAuto as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]
            // args: (game, worldPosition, side, rotation)
            expect(firstCall[2]).toBe('back')
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

            // Create shelf without storing games first
            eventManager.emit<ShelfCreatedEvent>(
                StorePropsEventTypes.ShelfCreated,
                {
                    position: new THREE.Vector3(0, 0, 0),
                    batchIndex: 5,
                    bounds: { minX: -1, maxX: 1, minZ: -1, maxZ: 1 }
                }
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

            // Create shelves
            eventManager.emit<ShelfCreatedEvent>(
                StorePropsEventTypes.ShelfCreated,
                {
                    position: new THREE.Vector3(0, 0, 0),
                    batchIndex: 0,
                    bounds: { minX: -1, maxX: 1, minZ: -1, maxZ: 1 }
                }
            )
            eventManager.emit<ShelfCreatedEvent>(
                StorePropsEventTypes.ShelfCreated,
                {
                    position: new THREE.Vector3(2, 0, 0),
                    batchIndex: 1,
                    bounds: { minX: 1, maxX: 3, minZ: -1, maxZ: 1 }
                }
            )

            // Should spawn all games
            expect(mockRenderer.createGameBoxAuto).toHaveBeenCalledTimes(11)
            expect(gamesPlacedEvents).toHaveLength(2)
        })
    })

    describe('Complete Event Flow', () => {
        it('should follow correct sequence: BatchReady → ShelfSpaceRequested → ShelfCreated → GamesPlaced', () => {
            const games = createMockGames(10, 0)
            const eventSequence: string[] = []

            // Track event sequence
            const originalEmit = eventManager.emit.bind(eventManager)
            eventManager.emit = vi.fn((eventType: string, detail: any) => {
                eventSequence.push(eventType)
                return originalEmit(eventType, detail)
            }) as any

            // Start flow
            eventManager.emit<BatchReadyForPlacementEvent>(
                StorePropsEventTypes.BatchReadyForPlacement,
                { games, batchIndex: 0, totalBatches: 1 }
            )

            // Create shelf
            eventManager.emit<ShelfCreatedEvent>(
                StorePropsEventTypes.ShelfCreated,
                {
                    position: new THREE.Vector3(0, 0, 0),
                    batchIndex: 0,
                    bounds: { minX: -1, maxX: 1, minZ: -1, maxZ: 1 }
                }
            )

            // Verify sequence
            expect(eventSequence).toContain(StorePropsEventTypes.BatchReadyForPlacement)
            expect(eventSequence).toContain(StorePropsEventTypes.ShelfSpaceRequested)
            expect(eventSequence).toContain(StorePropsEventTypes.ShelfCreated)
            expect(eventSequence).toContain(StorePropsEventTypes.GamesPlaced)

            // Verify order (ShelfSpaceRequested before ShelfCreated, ShelfCreated before GamesPlaced)
            const requestedIdx = eventSequence.indexOf(StorePropsEventTypes.ShelfSpaceRequested)
            const createdIdx = eventSequence.indexOf(StorePropsEventTypes.ShelfCreated)
            const placedIdx = eventSequence.indexOf(StorePropsEventTypes.GamesPlaced)

            expect(requestedIdx).toBeLessThan(createdIdx)
            expect(createdIdx).toBeLessThan(placedIdx)
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

            // Create shelves in different order
            eventManager.emit<ShelfCreatedEvent>(
                StorePropsEventTypes.ShelfCreated,
                {
                    position: new THREE.Vector3(0, 0, 0),
                    batchIndex: 1,
                    bounds: { minX: -1, maxX: 1, minZ: -1, maxZ: 1 }
                }
            )
            eventManager.emit<ShelfCreatedEvent>(
                StorePropsEventTypes.ShelfCreated,
                {
                    position: new THREE.Vector3(0, 0, 0),
                    batchIndex: 0,
                    bounds: { minX: -1, maxX: 1, minZ: -1, maxZ: 1 }
                }
            )
            eventManager.emit<ShelfCreatedEvent>(
                StorePropsEventTypes.ShelfCreated,
                {
                    position: new THREE.Vector3(0, 0, 0),
                    batchIndex: 2,
                    bounds: { minX: -1, maxX: 1, minZ: -1, maxZ: 1 }
                }
            )

            // All games should be spawned
            expect(mockRenderer.createGameBoxAuto).toHaveBeenCalledTimes(15)
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

            // Create shelf (spawns games)
            eventManager.emit<ShelfCreatedEvent>(
                StorePropsEventTypes.ShelfCreated,
                {
                    position: new THREE.Vector3(0, 0, 0),
                    batchIndex: 0,
                    bounds: { minX: -1, maxX: 1, minZ: -1, maxZ: 1 }
                }
            )

            const firstCallCount = (mockRenderer.createGameBoxAuto as any).mock.calls.length

            // Try to create shelf again (should warn, not spawn)
            const warnSpy = vi.spyOn(console, 'warn')
            eventManager.emit<ShelfCreatedEvent>(
                StorePropsEventTypes.ShelfCreated,
                {
                    position: new THREE.Vector3(0, 0, 0),
                    batchIndex: 0,
                    bounds: { minX: -1, maxX: 1, minZ: -1, maxZ: 1 }
                }
            )

            // Should not spawn again
            expect(mockRenderer.createGameBoxAuto).toHaveBeenCalledTimes(firstCallCount)
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

            eventManager.emit<ShelfCreatedEvent>(
                StorePropsEventTypes.ShelfCreated,
                {
                    position: new THREE.Vector3(0, 0, 0),
                    batchIndex: 0,
                    bounds: { minX: -1, maxX: 1, minZ: -1, maxZ: 1 }
                }
            )

            // Should not call createGameBoxAuto
            expect(mockRenderer.createGameBoxAuto).not.toHaveBeenCalled()

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

            // Create a shelf - this will spawn as many games as fit on one shelf
            // (limited by shelf surfaces and GAMES_PER_SURFACE constant)
            eventManager.emit<ShelfCreatedEvent>(
                StorePropsEventTypes.ShelfCreated,
                {
                    position: new THREE.Vector3(0, 0, 0),
                    batchIndex: 0,
                    bounds: { minX: -10, maxX: 10, minZ: -10, maxZ: 10 }
                }
            )

            // Should spawn games (actual count depends on shelf layout constants)
            // The important part is that createGameBoxAuto was called
            expect(mockRenderer.createGameBoxAuto).toHaveBeenCalled()
            const callCount = (mockRenderer.createGameBoxAuto as any).mock.calls.length
            expect(callCount).toBeGreaterThan(0)
            expect(callCount).toBeLessThanOrEqual(100)
            
            // Should emit GamesPlaced event
            expect(gamesPlacedEvents).toHaveLength(1)
            expect(gamesPlacedEvents[0].batchIndex).toBe(0)
            expect(gamesPlacedEvents[0].status).toBe('games-placed')
        })
    })
})
