/**
 * Deterministic performance test for arrangement changes.
 *
 * Measures wall‑clock duration from ArrangementRequested → AllBatchesComplete
 * with and without shadows.
 *
 * Runs in Vitest (JSDOM) with mocked GPU subsystems.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as THREE from 'three'

import { EventManager } from '../../src/core/EventManager'
import { DataManager } from '../../src/core/data'
import { AppSettings } from '../../src/core/AppSettings'
import { createStorePropsTestHarness } from '../helpers/StorePropsTestHarness'
import {
    SteamEventTypes,
    GameEventTypes,
    UIEventTypes,
    type SteamLibraryManifestReadyEvent,
    type GameDataReadyEvent,
    type AllBatchesCompleteEvent,
    type ArrangementRequestedEvent,
} from '../../src/types/InteractionEvents'
import type { SectionsReadyEvent } from '../../src/types/EnvironmentEvents'
import type { SteamGame } from '../../src/steam'
import type { SteamGameData } from '../../src/scene'

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
    eventManager.emit(SteamEventTypes.GamesBatch, {
        batchIndex,
        totalBatches,
        games: games as SteamGameData[],
        source: 'test',
    })
}

describe('arrangement change performance', () => {
    let eventManager: EventManager
    let dataManager: DataManager
    let appSettings: AppSettings
    let harness: ReturnType<typeof createStorePropsTestHarness>
    let scene: THREE.Scene

    beforeEach(() => {
        eventManager = EventManager.getInstance()
        dataManager = DataManager.getInstance()
        appSettings = AppSettings.getInstance()

        // Reset DataManager state
        dataManager.clear()
        // Set a small library for predictable shelf count
        const games = makeGames(1000, 36) // 36 games → 2 batches of 18 each
        dataManager.set('steam.games', games)

        // Create a minimal scene for the store props harness
        scene = new THREE.Scene()
        harness = createStorePropsTestHarness(scene)
    })

    afterEach(() => {
        harness.dispose()
        // Clean up any leftover event listeners
        eventManager.clearAllEventHandlers()
    })

    /**
     * Helper that sets up initial store layout and waits for AllBatchesComplete.
     * Returns a promise that resolves when the initial layout is fully placed.
     */
    async function setupInitialLayout(): Promise<void> {
        return new Promise<void>((resolve) => {
            eventManager.registerEventHandler(GameEventTypes.AllBatchesComplete, () => {
                resolve()
            }, { once: true })

            // Emit the pipeline events that trigger store props
            const games = dataManager.get<SteamGame[]>('steam.games')!
            eventManager.emit<SteamLibraryManifestReadyEvent>(SteamEventTypes.LibraryManifestReady, {
                totalGames: games.length,
                totalBatches: Math.max(1, Math.ceil(games.length / 18)),
                appids: games.map((g) => g.appid),
            })

            eventManager.emit<GameDataReadyEvent>(GameEventTypes.GameDataReady, {
                totalGames: games.length,
                totalBatches: Math.max(1, Math.ceil(games.length / 18)),
            })

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
            eventManager.emit<SectionsReadyEvent>(GameEventTypes.SectionsReady, sections)
        })
    }

    /**
     * Trigger an arrangement change and measure duration until AllBatchesComplete.
     * @param groupMode - new group mode
     * @param sortMode - new sort mode (optional)
     * @returns duration in milliseconds
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

    it('should complete an arrangement change within reasonable time (shadows off)', async () => {
        // Disable shadows via AppSettings before lighting system initializes
        appSettings.setSetting('shadowQuality', 0)

        await setupInitialLayout()
        console.log('Initial layout ready')

        const duration = await measureArrangementChange('by-recently-played')
        console.log(`Arrangement change duration: ${duration.toFixed(2)}ms`)

        // Expect under 500ms in a mocked environment (no real GPU work)
        expect(duration).toBeLessThan(500)
    })

    // We could add a second test with shadows enabled, but that would require
    // a real WebGL context (not available in Vitest). That's better suited for
    // a Playwright test that runs in a real browser.
})