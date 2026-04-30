/**
 * Regression tests for the "no games on shelves" bug observed 2026-04-10.
 *
 * Root cause: GameBoxSpawner was constructed inside setupProps(), which runs
 * asynchronously and can complete AFTER BatchReadyForPlacement events have
 * already fired. By the time GameBoxSpawner subscribes, the game payloads
 * are gone — so every ShelfCreated lookup fails with "No pending games".
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as THREE from 'three'
import { EventManager } from '../../src/core/EventManager'
import { DataDomain, DataKey, DataManager } from '../../src/core/data'
import { createStorePropsTestHarness } from '../helpers/StorePropsTestHarness'
import { ShelfLayoutCoordinator } from '../../src/scene/shelves/ShelfLayoutCoordinator'
import {
    StorePropsEventTypes,
    SteamEventTypes,
    GameEventTypes,
    BatchProcessingStatus,
    type SteamGamesBatchEvent,
    type SteamLibraryManifestReadyEvent,
    type GamesPlacedEvent,
} from '../../src/types/InteractionEvents'
import type { SteamGame } from '../../src/steam'
import type { SectionsReadyEvent, SectionsReadyForPlacementEvent } from '../../src/types/EnvironmentEvents'
import type { SteamGameData } from '../../src/scene'

vi.mock('../../src/utils/TextureManager', async () => {
    const { MockTextureManager } = await import('../mocks/utils/TextureManager.mock')
    return { TextureManager: { getInstance: () => MockTextureManager.getInstance() } }
})

function makeGames(count: number, batchIndex = 0): ReadonlyArray<SteamGame> {
    return Array.from({ length: count }, (_, index) => ({
        appid: batchIndex * 1000 + index + 1,
        name: `Game ${batchIndex}-${index}`,
        playtime_forever: 10,
        img_icon_url: '',
        img_logo_url: '',
        artwork: {
            library: `https://cdn.akamai.steamstatic.com/steam/apps/${batchIndex * 1000 + index + 1}/library_600x900.jpg`,
            header: `https://cdn.akamai.steamstatic.com/steam/apps/${batchIndex * 1000 + index + 1}/header.jpg`,
            icon: '',
            logo: '',
        },
    }))
}

function emitBatch(
    eventManager: EventManager,
    batchIndex: number,
    totalBatches: number,
    games: ReadonlyArray<SteamGame>,
): void {
    eventManager.emit<SteamGamesBatchEvent>(SteamEventTypes.GamesBatchReady, {
        games,
        batchIndex,
        totalBatches,
    })
}

function emitSectionsByBatch(
    eventManager: EventManager,
    batches: ReadonlyArray<ReadonlyArray<SteamGame>>,
): void {
    const sections = batches.map((games, index) => ({
        name: `Section ${index + 1}`,
        games: games as SteamGameData[],
        groupMode: 'none' as const,
        sortMode: 'alphabetical' as const,
    }))

    eventManager.emit<SectionsReadyForPlacementEvent>(GameEventTypes.SectionsReadyForPlacement, {
        sections: sections.map((section, index) => ({
            sectionId: `batch-${index}`,
            sectionIndex: index,
            section,
        })),
        groupMode: 'none',
        sortMode: 'alphabetical',
    })

    eventManager.emit<SectionsReadyEvent>(GameEventTypes.SectionsReady, {
        sections,
        groupMode: 'none',
        sortMode: 'alphabetical',
    })
}

let scene: THREE.Scene
let eventManager: EventManager
let dataManager: DataManager

beforeEach(() => {
    ;(ShelfLayoutCoordinator as unknown as { instance: ShelfLayoutCoordinator | null }).instance = null
    scene = new THREE.Scene()
    eventManager = EventManager.getInstance()
    eventManager.removeAllListeners()
    dataManager = DataManager.getInstance()
    dataManager.clear()
    dataManager.set(DataKey.MainScene, scene, {
        domain: DataDomain.Scene,
        description: 'regression test scene',
    })
})

afterEach(() => {
    eventManager.removeAllListeners()
    ;(ShelfLayoutCoordinator as unknown as { instance: ShelfLayoutCoordinator | null }).instance = null
    dataManager.clear()
    scene.clear()
    vi.clearAllMocks()
})

describe('games-on-shelves regression (manifest + sections + batches ordering)', () => {
    it('places one GamesPlaced event for each batch when manifest and sections are present', async () => {
        const harness = createStorePropsTestHarness(scene)

        const placedEvents: GamesPlacedEvent[] = []
        eventManager.registerEventHandler(
            StorePropsEventTypes.GamesPlaced,
            (event: CustomEvent<GamesPlacedEvent>) => placedEvents.push(event.detail)
        )

        const batches = [makeGames(5, 0), makeGames(5, 1), makeGames(5, 2)]
        const allGames = batches.flat()

        eventManager.emit<SteamLibraryManifestReadyEvent>(SteamEventTypes.LibraryManifestReady, {
            totalGames: allGames.length,
        })

        batches.forEach((games, batchIndex) => {
            emitBatch(eventManager, batchIndex, batches.length, games)
        })
        emitSectionsByBatch(eventManager, batches)

        await vi.waitFor(() => {
            expect(placedEvents.length).toBe(batches.length)
        }, { timeout: 8000, interval: 50 })

        for (const placedEvent of placedEvents) {
            expect(placedEvent.status).toBe(BatchProcessingStatus.GamesPlaced)
        }

        harness.dispose()
    })
})
