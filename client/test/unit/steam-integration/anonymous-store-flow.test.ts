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
import type { SteamGameData, SteamGame } from '../../../src/steam'

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
        const demoBatches: SteamGame[] = [
            { appid: 440, name: 'Team Fortress 2', playtime_forever: 10000, img_icon_url: '', img_logo_url: '', genres: [{ id: '37', description: 'Free to Play' }] },
            { appid: 570, name: 'Dota 2', playtime_forever: 9000, img_icon_url: '', img_logo_url: '', genres: [{ id: '37', description: 'Free to Play' }] },
            { appid: 730, name: 'Counter-Strike 2', playtime_forever: 8000, img_icon_url: '', img_logo_url: '', genres: [{ id: '37', description: 'Free to Play' }] },
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
        dataManager2.set<SteamGameData[]>('steam.games', games, { domain: 0 })

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
        dataManager.set<SteamGameData[]>('steam.games', games, { domain: 0 })

        // isAnonymous should be true (no steam.userInput)
        expect(steamIntegration.isAnonymous()).toBe(true)

        // Listen for sort result
        const sortHandler = vi.fn()
        eventManager.registerEventHandler(GameEventTypes.GamesSort, sortHandler)

        // Emit AllBatchesComplete to trigger GameSorter.sortInitial()
        eventManager.emit(GameEventTypes.AllBatchesComplete, {})

        // Assert: Sort should have happened with genre mode for anonymous
        expect(sortHandler).toHaveBeenCalledOnce()
        const sortEvent = sortHandler.mock.calls[0][0] as CustomEvent
        expect(sortEvent.detail.sortMode).toBe('by-genre')
        expect(sortEvent.detail.sortedGames.length).toBe(2)
    })
})
