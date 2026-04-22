/**
 * Integration test for arrangement‑change performance.
 *
 * Ensures that changing group/sort modes within the same layout completes
 * within a reasonable time and does not emit duplicate events or perform
 * unnecessary GPU work.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as THREE from 'three'
import { EventManager } from '../../src/core/EventManager'
import { DataManager, DataKey, DataDomain } from '../../src/core/data'
import { createStorePropsTestHarness } from '../helpers/StorePropsTestHarness'
import {
    SteamEventTypes,
    GameEventTypes,
    UIEventTypes,
    StorePropsEventTypes,
    type SteamLibraryManifestReadyEvent,
    type GameDataReadyEvent,
    type AllBatchesCompleteEvent,
    type ArrangementRequestedEvent,
    type StorePropsLayoutClearRequestEvent,
    type SectionsReadyEvent as SectionsReadyEventType,
} from '../../src/types/InteractionEvents'
import type { SectionsReadyEvent } from '../../src/types/EnvironmentEvents'
import type { SteamGame } from '../../src/steam'
import type { SteamGameData } from '../../src/scene'

// Ensure GameSorter is instantiated (side‑effect import)
import '../../src/scene/categorization/GameSorter'

// Mock TextureManager to avoid WebGL errors
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

function emitBatch(eventManager: EventManager, batchIndex: number, totalBatches: number, games: SteamGame[]) {
    eventManager.emit(SteamEventTypes.GamesBatchReady, {
        games: games as SteamGameData[],
        batchIndex,
        totalBatches,
    })
}

describe('arrangement change performance', () => {
    let scene: THREE.Scene
    let eventManager: EventManager
    let dataManager: DataManager
    let harness: ReturnType<typeof createStorePropsTestHarness>

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

        // Small library for predictable shelf count
        const games = makeGames(1000, 36) // 36 games → 2 batches of 18 each
        dataManager.set('steam.games', games, { domain: DataDomain.SteamIntegration })

        harness = createStorePropsTestHarness(scene)
    })

    afterEach(() => {
        harness?.dispose()
        eventManager.removeAllListeners()
        dataManager.clear()
        scene.clear()
        vi.clearAllMocks()
    })

    /**
     * Sets up initial layout (genre grouping) and waits for AllBatchesComplete.
     */
    async function setupInitialLayout(): Promise<void> {
        return new Promise<void>((resolve) => {
            eventManager.registerEventHandler(GameEventTypes.AllBatchesComplete, () => {
                resolve()
            }, { once: true })

            const games = dataManager.get<SteamGame[]>('steam.games')!
            const totalBatches = Math.max(1, Math.ceil(games.length / 18))

            eventManager.emit<SteamLibraryManifestReadyEvent>(SteamEventTypes.LibraryManifestReady, {
                totalGames: games.length,
                totalBatches,
                appids: games.map((g) => g.appid),
            })

            eventManager.emit<GameDataReadyEvent>(GameEventTypes.GameDataReady, {
                totalGames: games.length,
                totalBatches,
            })

            // Split games into batches (18 per batch)
            for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
                const start = batchIndex * 18
                const batchGames = games.slice(start, start + 18)
                emitBatch(eventManager, batchIndex, totalBatches, batchGames)
            }

            // Initial sections (by genre)
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
            eventManager.emit<SectionsReadyEventType>(GameEventTypes.SectionsReady, sections)
        })
    }

    /**
     * Triggers an arrangement change and returns the duration until AllBatchesComplete.
     */
    async function measureArrangementChange(
        groupMode: 'by-genre' | 'by-recently-played' | 'by-playtime' | 'by-alphabetical',
        sortMode?: 'by-playtime' | 'by-last-played' | 'by-alphabetical' | 'by-rating'
    ): Promise<number> {
        return new Promise<number>((resolve) => {
            const start = performance.now()
            let completed = false

            const finish = () => {
                if (completed) return
                completed = true
                eventManager.deregisterEventHandler(GameEventTypes.AllBatchesComplete, onComplete)
                const duration = performance.now() - start
                resolve(duration)
            }

            const onComplete = () => {
                finish()
            }

            eventManager.registerEventHandler(GameEventTypes.AllBatchesComplete, onComplete, { once: true })

            // Emit ArrangementRequested
            eventManager.emit<ArrangementRequestedEvent>(UIEventTypes.ArrangementRequested, {
                groupMode,
                sortMode: sortMode ?? 'by-playtime',
                source: 'test',
            })
        })
    }

    it.only('completes an arrangement change within reasonable time', async () => {
        // Spy on critical methods to detect redundant work
        const resetSpy = vi.spyOn(harness.instancedShelfRenderer, 'reset')
        const setInstanceSpy = vi.spyOn(harness.instancedShelfRenderer, 'setInstance')
        const layoutClearSpy = vi.spyOn(eventManager, 'emit')

        await setupInitialLayout()
        console.log('Initial layout ready')

        // Clear spies after initial setup
        resetSpy.mockClear()
        setInstanceSpy.mockClear()
        layoutClearSpy.mockClear()

        const duration = await measureArrangementChange('by-recently-played')
        console.log(`Arrangement change duration: ${duration.toFixed(2)}ms`)

        // Duration should be under 500ms in mocked environment (no real GPU work)
        expect(duration).toBeLessThan(500)

        // Reset should be called exactly once
        expect(resetSpy).toHaveBeenCalledTimes(1)

        // setInstance should be called for each shelf unit (we expect at least 2 shelves)
        expect(setInstanceSpy).toHaveBeenCalled()
        // We could assert exact count if we know shelf count, but it's variable.
        // At least ensure it's called more than zero times.
        expect(setInstanceSpy.mock.calls.length).toBeGreaterThan(0)

        // LayoutClearRequest should be emitted exactly once
        const layoutClearCalls = layoutClearSpy.mock.calls.filter(
            call => call[0] === StorePropsEventTypes.LayoutClearRequest
        )
        expect(layoutClearCalls.length).toBe(1)

        // SectionsReady should be emitted exactly once for the new arrangement
        const sectionsReadyCalls = layoutClearSpy.mock.calls.filter(
            call => call[0] === GameEventTypes.SectionsReady
        )
        expect(sectionsReadyCalls.length).toBe(1)
    })

    it.skip('does not emit duplicate events when arrangement does not change', async () => {
        // Temporarily skipped to focus on first test
    })
})