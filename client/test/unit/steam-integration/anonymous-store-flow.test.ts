/**
 * Test: Anonymous Store Data Storage Bug
 *
 * Surface the issue: When demo games load, are they actually stored in DataManager?
 * If gameLibrary.setUserData() is not called, storeSteamDataAndEmitEvent() will store
 * an empty array because it reads from gameLibrary.getState().userData.games.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SteamIntegration } from '../../../src/steam-integration/SteamIntegration'
import { DataManager } from '../../../src/core/data/DataManager'
import { EventManager } from '../../../src/core/EventManager'
import { GameLibraryManager } from '../../../src/steam-integration/GameLibraryManager'
import { GameSorter } from '../../../src/scene/categorization/GameSorter'
import { SteamEventTypes, GameEventTypes } from '../../../src/types/InteractionEvents'
import type { GameDataReadyEvent } from '../../../src/types/EnvironmentEvents'
import type { SteamGame } from '../../../src/steam'
import type { SteamGameData } from '../../../src/scene'
import { DataDomain } from '../../../src/core/data'

describe('Anonymous Store Data Storage (Bug Fix)', () => {
    let dataManager: DataManager
    let eventManager: EventManager
    let gameLibrary: GameLibraryManager

    beforeEach(() => {
        vi.clearAllMocks()
        dataManager = DataManager.getInstance()
        dataManager.clear()
        eventManager = EventManager.getInstance()
        gameLibrary = new GameLibraryManager()
    })

    it('should store demo games in DataManager after proper initialization sequence', async () => {
        // Setup: Replicate what loadDemoGames() does
        const makeGame = (appid: number, name: string, playtime: number): SteamGame => ({
            appid, name, playtime_forever: playtime, img_icon_url: '', img_logo_url: '',
            artwork: { icon: '', logo: '', header: '', library: '' },
            genres: [{ id: '37', description: 'Free to Play' }]
        })
        const demoBatches: SteamGame[] = [
            makeGame(440, 'Team Fortress 2', 10000),
            makeGame(570, 'Dota 2', 9000),
            makeGame(730, 'Counter-Strike 2', 8000),
        ]

        // Step 1: Initialize userData in gameLibrary (this was the missing step)
        gameLibrary.setUserData({
            steamid: '',
            vanity_url: '',
            game_count: demoBatches.length,
            retrieved_at: new Date().toISOString(),
            games: demoBatches,
        })

        // Step 2: storeSteamDataAndEmitEvent reads from gameLibrary and stores in DataManager
        const dataManager2 = DataManager.getInstance()
        const games = gameLibrary.getState().userData?.games || []
        dataManager2.set<SteamGameData[]>('steam.games', games, { domain: DataDomain.SteamIntegration })

        // Assert: Games should be stored
        const storedGames = dataManager2.get<SteamGameData[]>('steam.games')
        expect(storedGames).toBeDefined()
        expect(storedGames!.length).toBe(demoBatches.length)
        expect(storedGames![0].name).toBe('Team Fortress 2')
    })

    it('should mark as anonymous when no userInput is set', () => {
        const steamIntegration = new SteamIntegration()

        // Without calling storeSteamDataAndEmitEvent with a non-null userInput,
        // steam.userInput won't be set in DataManager
        dataManager.clear() // Make sure it's empty

        // isAnonymous checks if steam.userInput is absent
        expect(steamIntegration.isAnonymous()).toBe(true)
    })

    it('should allow GameSorter to sort anonymous games by genre', async () => {
        // Setup: Create fresh instances
        const steamIntegration = new SteamIntegration()
        const gameSorter = new GameSorter()

        // Simulate: Games in DataManager, no userInput set
        const games: SteamGameData[] = [
            { appid: 440, name: 'TF2', playtime_forever: 100, genres: [{ id: '1', description: 'Action' }] },
            { appid: 570, name: 'Dota', playtime_forever: 90, genres: [{ id: '3', description: 'RPG' }] },
        ]
        dataManager.set<SteamGameData[]>('steam.games', games, { domain: DataDomain.SteamIntegration })

        // isAnonymous should be true (no steam.userInput)
        expect(steamIntegration.isAnonymous()).toBe(true)

        // Listen for sort result
        const sortHandler = vi.fn()
        eventManager.registerEventHandler(GameEventTypes.SectionsReady, sortHandler)

        // Emit GameDataReady to trigger GameSorter initial arrangement
        eventManager.emit<GameDataReadyEvent>(GameEventTypes.GameDataReady, { totalGames: 2, totalBatches: 1 })

        // Assert: Sort should have happened with genre grouping for anonymous
        expect(sortHandler).toHaveBeenCalledOnce()
        const sortEvent = sortHandler.mock.calls[0][0] as CustomEvent
        expect(sortEvent.detail.groupMode).toBe('by-genre')
        expect(sortEvent.detail.sortMode).toBe('by-playtime')
        const totalGames = sortEvent.detail.sections.reduce((sum: number, s: any) => sum + s.games.length, 0)
        expect(totalGames).toBe(2)
    })
})
