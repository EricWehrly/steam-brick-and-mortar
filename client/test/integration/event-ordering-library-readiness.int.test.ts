import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as THREE from 'three'

import { EventManager } from '../../src/core/EventManager'
import { DataDomain, DataKey, DataManager } from '../../src/core/data'
import { createStorePropsTestHarness, type StorePropsTestHarness } from '../helpers/StorePropsTestHarness'
import { ShelfLayoutCoordinator } from '../../src/scene/shelves/ShelfLayoutCoordinator'
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
import type { SectionsReadyEvent, SectionsReadyForPlacementEvent } from '../../src/types/EnvironmentEvents'
import type { SteamGame } from '../../src/steam'
import type { SteamGameData } from '../../src/scene'

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

function emitSections(
    eventManager: EventManager,
    sections: SectionsReadyEvent
): void {
    const placementSections: SectionsReadyForPlacementEvent = {
        groupMode: sections.groupMode,
        sortMode: sections.sortMode,
        sections: sections.sections.map((section, sectionIndex) => ({
            sectionId: `${section.name}-${sectionIndex}`,
            sectionIndex,
            section,
        })),
    }

    eventManager.emit<SectionsReadyForPlacementEvent>(GameEventTypes.SectionsReadyForPlacement, placementSections)
    eventManager.emit<SectionsReadyEvent>(GameEventTypes.SectionsReady, sections)
}

describe('library readiness ordering integration', () => {
    let scene: THREE.Scene
    let eventManager: EventManager
    let dataManager: DataManager
    let harness: StorePropsTestHarness

    beforeEach(() => {
        ;(ShelfLayoutCoordinator as unknown as { instance: ShelfLayoutCoordinator | null }).instance = null
        scene = new THREE.Scene()
        eventManager = EventManager.getInstance()
        eventManager.removeAllListeners()
        dataManager = DataManager.getInstance()
        dataManager.clear()
        dataManager.set(DataKey.MainScene, scene, {
            domain: DataDomain.Scene,
            description: 'library-readiness integration scene',
        })

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

    it('places games and emits shelf ownership when manifest, batches, and sections are emitted', async () => {
        const firstSectionGames = makeGames(1000, 18)
        const secondSectionGames = makeGames(2000, 18)
        const allGames = [...firstSectionGames, ...secondSectionGames]

        const gamesPlacedEvents: GamesPlacedEvent[] = []
        const shelfReadyEvents: ShelfReadyEvent[] = []
        eventManager.registerEventHandler(
            StorePropsEventTypes.ShelfReady,
            (event: CustomEvent<ShelfReadyEvent>) => shelfReadyEvents.push(event.detail)
        )
        eventManager.registerEventHandler(
            StorePropsEventTypes.GamesPlaced,
            (event: CustomEvent<GamesPlacedEvent>) => gamesPlacedEvents.push(event.detail)
        )

        eventManager.emit<SteamLibraryManifestReadyEvent>(SteamEventTypes.LibraryManifestReady, {
            totalGames: allGames.length,
        })

        emitBatch(eventManager, 0, 2, firstSectionGames)
        emitBatch(eventManager, 1, 2, secondSectionGames)

        const sections: SectionsReadyEvent = {
            sections: [
                {
                    name: 'Action',
                    games: firstSectionGames as SteamGameData[],
                    groupMode: 'by-genre',
                    sortMode: 'alphabetical',
                },
                {
                    name: 'RPG',
                    games: secondSectionGames as SteamGameData[],
                    groupMode: 'by-genre',
                    sortMode: 'alphabetical',
                },
            ],
            groupMode: 'by-genre',
            sortMode: 'alphabetical',
        }
        emitSections(eventManager, sections)

        await vi.waitFor(() => {
            expect(gamesPlacedEvents.length).toBeGreaterThan(0)
        }, { timeout: 8000, interval: 50 })

        await vi.waitFor(() => {
            expect(shelfReadyEvents.length).toBeGreaterThanOrEqual(2)
        }, { timeout: 8000, interval: 50 })

        const sectionIndices = new Set(shelfReadyEvents.map((event) => event.sectionIndex))
        expect(sectionIndices.has(0)).toBe(true)
        expect(sectionIndices.has(1)).toBe(true)
    })

    it('does not emit ShelfReady for empty sections in mixed section runs', async () => {
        const firstSectionGames = makeGames(3000, 18)
        const thirdSectionGames = makeGames(4000, 18)
        const allGames = [...firstSectionGames, ...thirdSectionGames]

        const shelfReadyEvents: ShelfReadyEvent[] = []
        eventManager.registerEventHandler(
            StorePropsEventTypes.ShelfReady,
            (event: CustomEvent<ShelfReadyEvent>) => shelfReadyEvents.push(event.detail)
        )

        eventManager.emit<SteamLibraryManifestReadyEvent>(SteamEventTypes.LibraryManifestReady, {
            totalGames: allGames.length,
        })

        emitBatch(eventManager, 0, 2, firstSectionGames)
        emitBatch(eventManager, 1, 2, thirdSectionGames)

        const sections: SectionsReadyEvent = {
            sections: [
                {
                    name: 'Action',
                    games: firstSectionGames as SteamGameData[],
                    groupMode: 'by-genre',
                    sortMode: 'alphabetical',
                },
                {
                    name: 'Empty Genre',
                    games: [],
                    groupMode: 'by-genre',
                    sortMode: 'alphabetical',
                },
                {
                    name: 'RPG',
                    games: thirdSectionGames as SteamGameData[],
                    groupMode: 'by-genre',
                    sortMode: 'alphabetical',
                },
            ],
            groupMode: 'by-genre',
            sortMode: 'alphabetical',
        }

        emitSections(eventManager, sections)

        await vi.waitFor(() => {
            expect(shelfReadyEvents.length).toBeGreaterThan(0)
        }, { timeout: 8000, interval: 50 })

        const sectionIndices = new Set(shelfReadyEvents.map((event) => event.sectionIndex))
        expect(sectionIndices.has(0)).toBe(true)
        expect(sectionIndices.has(1)).toBe(false)
        expect(sectionIndices.has(2)).toBe(true)
    })

    it('emits shelf lifecycle events on first boot and after regroup rerun', async () => {
        const initialGames = makeGames(5000, 36)
        const regroupGames = makeGames(6000, 72)
        const shelfReadyEvents: ShelfReadyEvent[] = []
        eventManager.registerEventHandler(
            StorePropsEventTypes.ShelfReady,
            (event: CustomEvent<ShelfReadyEvent>) => shelfReadyEvents.push(event.detail)
        )

        eventManager.emit<SteamLibraryManifestReadyEvent>(SteamEventTypes.LibraryManifestReady, {
            totalGames: initialGames.length,
        })

        emitBatch(eventManager, 0, 1, initialGames)
        emitSections(eventManager, {
            sections: [
                {
                    name: 'Initial',
                    games: initialGames as SteamGameData[],
                    groupMode: 'none',
                    sortMode: 'alphabetical',
                },
            ],
            groupMode: 'none',
            sortMode: 'alphabetical',
        })

        await vi.waitFor(() => {
            expect(shelfReadyEvents.length).toBeGreaterThan(0)
        }, { timeout: 8000, interval: 50 })

        shelfReadyEvents.length = 0

        eventManager.emit(UIEventTypes.ArrangementRequested, {
            grouping: 'by-tag',
            sortBy: 'alphabetical',
        } as any)

        eventManager.emit<SteamLibraryManifestReadyEvent>(SteamEventTypes.LibraryManifestReady, {
            totalGames: regroupGames.length,
        })
        emitBatch(eventManager, 0, 1, regroupGames)
        emitSections(eventManager, {
            sections: [
                {
                    name: 'Regroup A',
                    games: regroupGames.slice(0, 36) as SteamGameData[],
                    groupMode: 'by-tag',
                    sortMode: 'alphabetical',
                },
                {
                    name: 'Regroup B',
                    games: regroupGames.slice(36) as SteamGameData[],
                    groupMode: 'by-tag',
                    sortMode: 'alphabetical',
                },
            ],
            groupMode: 'by-tag',
            sortMode: 'alphabetical',
        })

        await vi.waitFor(() => {
            expect(shelfReadyEvents.length).toBeGreaterThan(0)
        }, { timeout: 8000, interval: 50 })

        const sectionIndices = new Set(shelfReadyEvents.map((event) => event.sectionIndex))
        expect(sectionIndices.has(0)).toBe(true)
        expect(sectionIndices.has(1)).toBe(true)
    })
})
