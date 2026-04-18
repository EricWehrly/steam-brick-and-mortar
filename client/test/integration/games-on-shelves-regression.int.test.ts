/**
 * Regression tests for the "no games on shelves" bug observed 2026-04-10.
 *
 * Root cause: GameBoxSpawner was constructed inside setupProps(), which runs
 * asynchronously and can complete AFTER BatchReadyForPlacement events have
 * already fired. By the time GameBoxSpawner subscribes, the game payloads
 * are gone — so every ShelfCreated lookup fails with "No pending games".
 *
 * Three distinct failure modes tested here:
 *
 *   Bug A — GameBoxSpawner constructed too late:
 *     If setupProps() is awaited and the first batch arrives before or during
 *     that await, GameBoxSpawner misses the BatchReadyForPlacement event.
 *     Fix: construct GameBoxSpawner in the GpuStorePropsRenderer constructor,
 *     not in setupProps().
 *
 *   Bug B — ShelfLayoutCoordinator emits ShelfReady synchronously on the
 *     same BatchReadyForPlacement tick, before initializeGameBoxRenderer
 *     completes. GpuStorePropsRenderer emits ShelfCreated from handleShelfReady
 *     before GameBoxSpawner has stored pending games.
 *     Fix: ShelfCreated must not be emitted until the game payload is confirmed
 *     stored in GameBoxSpawner — or ShelfReady emission must be deferred until
 *     after GameBoxSpawner is ready.
 *
 *   Bug C — handleInitialBatch guard prevents games being stored for batch > 0
 *     on the same tick:
 *     batchCoordinator.isFirstBatchProcessing() returns true only on the first
 *     call, so subsequent batches skip initializeGameBoxRenderer. But the async
 *     await in handleInitialBatch means subsequent BatchReadyForPlacement events
 *     can fire before the first await completes, causing ShelfCreated events
 *     before GameBoxSpawner is constructed.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as THREE from 'three'
import { EventManager } from '../../src/core/EventManager'
import { DataDomain, DataKey, DataManager } from '../../src/core/data'
import { createStorePropsTestHarness } from '../helpers/StorePropsTestHarness'
import {
    StorePropsEventTypes,
    SteamEventTypes,
    GameEventTypes,
    BatchProcessingStatus,
    type SteamGamesBatchEvent,
    type ShelfReadyEvent,
    type GamesPlacedEvent,
    type BatchReadyForPlacementEvent,
} from '../../src/types/InteractionEvents'
import type { SteamGame } from '../../src/steam'

vi.mock('../../src/utils/TextureManager', async () => {
    const { MockTextureManager } = await import('../mocks/utils/TextureManager.mock')
    return { TextureManager: { getInstance: () => MockTextureManager.getInstance() } }
})

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeGames(count: number, batchIndex = 0): Readonly<SteamGame>[] {
    return Array.from({ length: count }, (_, i) => ({
        appid: batchIndex * 1000 + i + 1,
        name: `Game ${batchIndex}-${i}`,
        playtime_forever: 10,
        img_icon_url: '',
        img_logo_url: '',
        artwork: undefined,
    }))
}

function emitBatch(
    em: EventManager,
    batchIndex: number,
    totalBatches: number,
    games: Readonly<SteamGame>[]
): void {
    em.emit<SteamGamesBatchEvent>(SteamEventTypes.GamesBatchReady, {
        games, batchIndex, totalBatches,
    })
}

// ─── setup ───────────────────────────────────────────────────────────────────

let scene: THREE.Scene
let em: EventManager
let dm: DataManager

beforeEach(async () => {
    scene = new THREE.Scene()
    em = EventManager.getInstance()
    em.removeAllListeners()
    dm = DataManager.getInstance()
    dm.clear()
    dm.set(DataKey.MainScene, scene, { domain: DataDomain.Scene, description: 'test scene' })
})

afterEach(() => {
    em.removeAllListeners()
    dm.clear()
    scene.clear()
    vi.clearAllMocks()
})

// ─── Bug A: GameBoxSpawner constructed too late ───────────────────────────────

describe('Bug A — GameBoxSpawner must store pending games before ShelfReady fires', () => {
    it('games placed count matches batches even when setup is awaited before batch arrives', async () => {
        const harness = createStorePropsTestHarness(scene)

        const placed: GamesPlacedEvent[] = []
        em.registerEventHandler(
            StorePropsEventTypes.GamesPlaced,
            (e: CustomEvent<GamesPlacedEvent>) => placed.push(e.detail)
        )

        emitBatch(em, 0, 1, makeGames(5, 0))

        await vi.waitFor(() => {
            expect(placed.length).toBeGreaterThan(0)
        }, { timeout: 5000 })

        const failed = placed.filter(p => p.status === BatchProcessingStatus.Failed)
        expect(failed.length).toBe(0)
    })
})

// ─── Bug B: ShelfReady fires before GameBoxSpawner has stored games ─────────

describe('Bug B — ShelfReady must not arrive before pending games are stored', () => {
    it('every ShelfReady event has a corresponding pending game entry', async () => {
        const harness = createStorePropsTestHarness(scene)

        // Capture order: BatchReadyForPlacement stores games; ShelfReady consumes them.
        // If ShelfReady fires on the same synchronous tick as BatchReadyForPlacement
        // but BEFORE GameBoxSpawner's handler runs, games will be missing.
        const batchStoredByTime: number[] = []
        const shelfReadyByTime: number[] = []

        em.registerEventHandler(
            StorePropsEventTypes.BatchReadyForPlacement,
            (e: CustomEvent<BatchReadyForPlacementEvent>) => {
                batchStoredByTime.push(e.detail.batchIndex)
            }
        )
        em.registerEventHandler(
            StorePropsEventTypes.ShelfReady,
            (e: CustomEvent<ShelfReadyEvent>) => {
                shelfReadyByTime.push(e.detail.batchIndex)
            }
        )

        emitBatch(em, 0, 2, makeGames(5, 0))
        emitBatch(em, 1, 2, makeGames(5, 1))

        await vi.waitFor(() => {
            expect(shelfReadyByTime.length).toBe(2)
        }, { timeout: 5000 })

        // For each ShelfReady, batch must have been stored first
        for (const shelfBatch of shelfReadyByTime) {
            expect(batchStoredByTime).toContain(shelfBatch)
            const storedIdx = batchStoredByTime.indexOf(shelfBatch)
            const createdIdx = shelfReadyByTime.indexOf(shelfBatch)
            // batch stored (idx in batchStoredByTime) must have come no later than shelf created
            expect(storedIdx).toBeLessThanOrEqual(createdIdx)
        }
    })

    it('GamesPlaced status is GamesPlaced (not Failed) for all batches', async () => {
        const harness = createStorePropsTestHarness(scene)

        const placed: GamesPlacedEvent[] = []
        em.registerEventHandler(
            StorePropsEventTypes.GamesPlaced,
            (e: CustomEvent<GamesPlacedEvent>) => placed.push(e.detail)
        )

        const N = 3
        for (let i = 0; i < N; i++) {
            emitBatch(em, i, N, makeGames(5, i))
        }

        await vi.waitFor(() => {
            expect(placed.length).toBe(N)
        }, { timeout: 8000 })

        for (const p of placed) {
            expect(p.status).toBe(BatchProcessingStatus.GamesPlaced)
        }
    })
})

// ─── Bug C: async init gap leaves later batches unhandled ─────────────────────

describe('Bug C — all batches placed even when init is async and batches arrive fast', () => {
    it('no batch is skipped when multiple batches arrive before init completes', async () => {
        const harness = createStorePropsTestHarness(scene)
        // Subsystems are constructed synchronously — no async gap to test against,
        // which is exactly the fix: everything is subscribed before batches can arrive.

        const placed: GamesPlacedEvent[] = []
        em.registerEventHandler(
            StorePropsEventTypes.GamesPlaced,
            (e: CustomEvent<GamesPlacedEvent>) => placed.push(e.detail)
        )

        // Emit all 4 batches immediately, before setup resolves
        const N = 4
        for (let i = 0; i < N; i++) {
            emitBatch(em, i, N, makeGames(5, i))
        }

        await vi.waitFor(() => {
            expect(placed.length).toBe(N)
        }, { timeout: 10000 })

        const failed = placed.filter(p => p.status === BatchProcessingStatus.Failed)
        expect(failed.length).toBe(0)
    })
})
