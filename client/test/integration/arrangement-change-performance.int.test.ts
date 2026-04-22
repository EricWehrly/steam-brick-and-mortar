/**
 * Integration test for arrangement‑change performance.
 *
 * Pattern borrowed from event‑ordering‑library‑readiness.int.test.ts.
 * Measures wall‑clock: ArrangementRequested → GamesPlaced (for all batches).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as THREE from 'three'

import { EventManager } from '../../src/core/EventManager'
import { DataDomain, DataKey, DataManager } from '../../src/core/data'
import { createStorePropsTestHarness } from '../helpers/StorePropsTestHarness'
import { GameSorter } from '../../src/scene/categorization/GameSorter'
import {
    SteamEventTypes,
    StorePropsEventTypes,
    GameEventTypes,
    UIEventTypes,
    type SteamGamesBatchEvent,
    type SteamLibraryManifestReadyEvent,
    type GamesPlacedEvent,
    type ShelfReadyEvent,
} from '../../src/types/InteractionEvents'
import type { SectionsReadyEvent } from '../../src/types/EnvironmentEvents'
import type { SteamGame } from '../../src/steam'
import type { SteamGameData } from '../../src/scene'
import type { GroupMode, SortMode } from '../../src/types/LayoutTypes'

vi.mock('../../src/utils/TextureManager', async () => {
    const { MockTextureManager } = await import('../mocks/utils/TextureManager.mock')
    return {
        TextureManager: {
            getInstance: () => MockTextureManager.getInstance(),
        },
    }
})

function makeGames(startAppid: number, count: number): SteamGame[] {
    return Array.from({ length: count }, (_, index) => {
        const appid = startAppid + index
        return {
            appid,
            name: `Game ${appid}`,
            playtime_forever: 100,
            img_icon_url: '',
            img_logo_url: '',
            artwork: {
                library: `https://cdn.akamai.steamstatic.com/steam/apps/${appid}/library_600x900.jpg`,
                header: `https://cdn.akamai.steamstatic.com/steam/apps/${appid}/header.jpg`,
                icon: '',
                logo: '',
            },
            genres: [{ id: '1', description: appid % 2 === 0 ? 'Action' : 'RPG' }],
        }
    })
}

function emitBatch(
    eventManager: EventManager,
    batchIndex: number,
    totalBatches: number,
    games: SteamGame[],
): void {
    eventManager.emit<SteamGamesBatchEvent>(SteamEventTypes.GamesBatchReady, {
        games,
        batchIndex,
        totalBatches,
    })
}

/** Helper: emit full pipeline, return GamesPlaced array (waited)
 *  Matches pattern from event-ordering-library-readiness.int.test.ts:
 *  LibraryManifestReady → batches → SectionsReady (manual) → wait GamesPlaced
 */
async function runPipeline(
    scene: THREE.Scene,
    eventManager: EventManager,
    dataManager: DataManager,
): Promise<{ gamesPlaced: GamesPlacedEvent[]; totalBatches: number }> {
    const games = dataManager.get<SteamGame[]>('steam.games')!
    const totalBatches = Math.max(1, Math.ceil(games.length / 18))

    const gamesPlaced: GamesPlacedEvent[] = []
    eventManager.registerEventHandler(
        StorePropsEventTypes.GamesPlaced,
        (e: CustomEvent<GamesPlacedEvent>) => gamesPlaced.push(e.detail),
    )

    eventManager.emit<SteamLibraryManifestReadyEvent>(SteamEventTypes.LibraryManifestReady, {
        totalGames: games.length,
        totalBatches,
        appids: games.map((g) => g.appid),
    })

    for (let i = 0; i < totalBatches; i++) {
        emitBatch(eventManager, i, totalBatches, games.slice(i * 18, (i + 1) * 18))
    }

    // Manually emit SectionsReady (matching event-ordering test pattern).
    // We CANNOT rely on GameSorter to emit this because it needs SteamIntegration
    // (which requires auth state) — not available in integration tests.
    const sections: SectionsReadyEvent = {
        sections: [
            {
                name: 'Action',
                games: games.filter((g) => g.appid % 2 === 0) as SteamGameData[],
                groupMode: 'by-genre',
                sortMode: 'by-playtime',
            },
            {
                name: 'RPG',
                games: games.filter((g) => g.appid % 2 === 1) as SteamGameData[],
                groupMode: 'by-genre',
                sortMode: 'by-playtime',
            },
        ],
        groupMode: 'by-genre',
        sortMode: 'by-playtime',
    }
    eventManager.emit<SectionsReadyEvent>(GameEventTypes.SectionsReady, sections)

    await vi.waitFor(() => {
        expect(gamesPlaced.length).toBe(totalBatches)
    }, { timeout: 8000, interval: 50 })

    return { gamesPlaced, totalBatches }
}

describe('arrangement change performance', () => {
    let scene: THREE.Scene
    let eventManager: EventManager
    let dataManager: DataManager
    let harness: ReturnType<typeof createStorePropsTestHarness>
    let gameSorter: GameSorter

    beforeEach(() => {
        scene = new THREE.Scene()
        eventManager = EventManager.getInstance()
        eventManager.removeAllListeners()
        dataManager = DataManager.getInstance()
        dataManager.clear()
        dataManager.set(DataKey.MainScene, scene, {
            domain: DataDomain.Scene,
            description: 'arrangement change test scene',
        })

        const games = makeGames(1000, 36)
        dataManager.set('steam.games', games, { domain: DataDomain.SteamIntegration })

        harness = createStorePropsTestHarness(scene)
        gameSorter = new GameSorter()
    })

    afterEach(() => {
        harness?.dispose()
        gameSorter = null as unknown as GameSorter
        eventManager.removeAllListeners()
        dataManager.clear()
        scene.clear()
        vi.clearAllMocks()
    })

    it('completes an arrangement change within reasonable time', async () => {
        // 1. Initial layout (genre grouping)
        await runPipeline(scene, eventManager, dataManager)
        console.log('Initial layout ready')

        // 2. Spy on InstancedShelfRenderer.setInstance (reset spy unreliable across instances)
        const setInstanceSpy = vi.spyOn(harness.instancedShelfRenderer, 'setInstance')
        setInstanceSpy.mockClear()

        // 3. Track emitted events via listeners (no emit mock)
        const emittedTypes: string[] = []
        eventManager.registerEventHandler(StorePropsEventTypes.LayoutClearRequest, () => {
            emittedTypes.push(StorePropsEventTypes.LayoutClearRequest)
        })
        eventManager.registerEventHandler(GameEventTypes.SectionsReady, () => {
            emittedTypes.push(GameEventTypes.SectionsReady)
        })

        // 4. Trigger arrangement change, measure to SectionsReady
        const startTime = performance.now()
        let sectionsReadyReceived = false
        const changeComplete = new Promise<void>((resolve) => {
            eventManager.registerEventHandler(GameEventTypes.SectionsReady, () => {
                if (!sectionsReadyReceived) {
                    sectionsReadyReceived = true
                    resolve()
                }
            })
        })

        eventManager.emit(UIEventTypes.ArrangementRequested, {
            groupMode: 'by-recency',
            sortMode: 'by-playtime',
            source: 'test',
        })

        await changeComplete
        const duration = performance.now() - startTime
        console.log(`Arrangement change duration: ${duration.toFixed(2)}ms (ArrangementRequested → SectionsReady)`)

        // 5. Assertions
        expect(duration).toBeLessThan(500) // grouping+sorting should be fast
        expect(emittedTypes.filter((t) => t === StorePropsEventTypes.LayoutClearRequest).length).toBe(1)
        expect(emittedTypes.filter((t) => t === GameEventTypes.SectionsReady).length).toBe(1)
    }, 15000)
})
