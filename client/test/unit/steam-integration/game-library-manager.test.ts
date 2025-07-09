/**
 * Unit tests for GameLibraryManager
 */

import { describe, test, expect, beforeEach } from 'vitest'
import { GameLibraryManager } from '../../../src/steam-integration/GameLibraryManager'
import type { SteamUser, SteamGame } from '../../../src/steam'

describe('GameLibraryManager Unit Tests', () => {
    let gameLibraryManager: GameLibraryManager

    beforeEach(() => {
        gameLibraryManager = new GameLibraryManager()
    })

    describe('Initial State', () => {
        test('should have empty initial state', () => {
            const state = gameLibraryManager.getState()
            
            expect(state.userData).toBeNull()
            expect(state.currentGameIndex).toBe(0)
            expect(state.isLoading).toBe(false)
            expect(state.error).toBeNull()
        })

        test('should return false for hasUserData initially', () => {
            expect(gameLibraryManager.hasUserData()).toBe(false)
        })

        test('should return null for vanity URL initially', () => {
            expect(gameLibraryManager.getVanityUrl()).toBeNull()
        })

        test('should return 0 for game count initially', () => {
            expect(gameLibraryManager.getGameCount()).toBe(0)
        })

        test('should return empty array for games initially', () => {
            expect(gameLibraryManager.getGames()).toEqual([])
        })
    })

    describe('User Data Management', () => {
        const mockUserData: SteamUser = {
            steamid: '76561198000000000',
            vanity_url: 'testuser',
            game_count: 2,
            games: [
                {
                    appid: 440,
                    name: 'Team Fortress 2',
                    playtime_forever: 1000,
                    img_icon_url: 'icon1',
                    img_logo_url: 'logo1',
                    artwork: {
                        icon: 'icon1_url',
                        logo: 'logo1_url',
                        header: 'header1_url',
                        library: 'library1_url'
                    }
                },
                {
                    appid: 570,
                    name: 'Dota 2',
                    playtime_forever: 2000,
                    img_icon_url: 'icon2',
                    img_logo_url: 'logo2',
                    artwork: {
                        icon: 'icon2_url',
                        logo: 'logo2_url',
                        header: 'header2_url',
                        library: 'library2_url'
                    }
                }
            ],
            retrieved_at: '2023-01-01T00:00:00Z'
        }

        test('should set user data correctly', () => {
            gameLibraryManager.setUserData(mockUserData)
            const state = gameLibraryManager.getState()
            
            expect(state.userData).toEqual(mockUserData)
            expect(state.currentGameIndex).toBe(0)
            expect(state.error).toBeNull()
        })

        test('should return true for hasUserData after setting data', () => {
            gameLibraryManager.setUserData(mockUserData)
            expect(gameLibraryManager.hasUserData()).toBe(true)
        })

        test('should return correct vanity URL after setting data', () => {
            gameLibraryManager.setUserData(mockUserData)
            expect(gameLibraryManager.getVanityUrl()).toBe('testuser')
        })

        test('should return correct game count after setting data', () => {
            gameLibraryManager.setUserData(mockUserData)
            expect(gameLibraryManager.getGameCount()).toBe(2)
        })

        test('should return games array after setting data', () => {
            gameLibraryManager.setUserData(mockUserData)
            expect(gameLibraryManager.getGames()).toEqual(mockUserData.games)
        })
    })

    describe('Game Updates', () => {
        const mockUserData: SteamUser = {
            steamid: '76561198000000000',
            vanity_url: 'testuser',
            game_count: 1,
            games: [
                {
                    appid: 440,
                    name: 'Team Fortress 2',
                    playtime_forever: 1000,
                    img_icon_url: 'icon1',
                    img_logo_url: 'logo1',
                    artwork: {
                        icon: 'icon1_url',
                        logo: 'logo1_url',
                        header: 'header1_url',
                        library: 'library1_url'
                    }
                }
            ],
            retrieved_at: '2023-01-01T00:00:00Z'
        }

        test('should update existing game data', () => {
            gameLibraryManager.setUserData(mockUserData)
            
            const updatedGame: SteamGame = {
                appid: 440,
                name: 'Team Fortress 2 Updated',
                playtime_forever: 1500,
                img_icon_url: 'new_icon',
                img_logo_url: 'new_logo',
                artwork: {
                    icon: 'new_icon_url',
                    logo: 'new_logo_url',
                    header: 'new_header_url',
                    library: 'new_library_url'
                }
            }
            
            gameLibraryManager.updateGameData(updatedGame)
            const games = gameLibraryManager.getGames()
            
            expect(games[0]).toEqual(updatedGame)
        })

        test('should not update if game not found', () => {
            gameLibraryManager.setUserData(mockUserData)
            
            const nonExistentGame: SteamGame = {
                appid: 999,
                name: 'Non-existent Game',
                playtime_forever: 100,
                img_icon_url: 'icon',
                img_logo_url: 'logo',
                artwork: {
                    icon: 'icon_url',
                    logo: 'logo_url',
                    header: 'header_url',
                    library: 'library_url'
                }
            }
            
            gameLibraryManager.updateGameData(nonExistentGame)
            const games = gameLibraryManager.getGames()
            
            expect(games).toEqual(mockUserData.games)
        })

        test('should handle update when no user data exists', () => {
            const game: SteamGame = {
                appid: 440,
                name: 'Test Game',
                playtime_forever: 100,
                img_icon_url: 'icon',
                img_logo_url: 'logo',
                artwork: {
                    icon: 'icon_url',
                    logo: 'logo_url',
                    header: 'header_url',
                    library: 'library_url'
                }
            }
            
            // Should not throw error
            expect(() => gameLibraryManager.updateGameData(game)).not.toThrow()
        })
    })

    describe('State Management', () => {
        test('should set and get loading state', () => {
            gameLibraryManager.setLoading(true)
            expect(gameLibraryManager.getState().isLoading).toBe(true)
            
            gameLibraryManager.setLoading(false)
            expect(gameLibraryManager.getState().isLoading).toBe(false)
        })

        test('should set and get error state', () => {
            const errorMessage = 'Test error'
            gameLibraryManager.setError(errorMessage)
            expect(gameLibraryManager.getState().error).toBe(errorMessage)
            
            gameLibraryManager.setError(null)
            expect(gameLibraryManager.getState().error).toBeNull()
        })

        test('should manage current game index', () => {
            expect(gameLibraryManager.getCurrentGameIndex()).toBe(0)
            
            gameLibraryManager.setCurrentGameIndex(5)
            expect(gameLibraryManager.getCurrentGameIndex()).toBe(5)
            
            const newIndex = gameLibraryManager.incrementGameIndex()
            expect(newIndex).toBe(6)
            expect(gameLibraryManager.getCurrentGameIndex()).toBe(6)
        })

        test('should clear all data', () => {
            const mockUserData: SteamUser = {
                steamid: '76561198000000000',
                vanity_url: 'testuser',
                game_count: 1,
                games: [],
                retrieved_at: '2023-01-01T00:00:00Z'
            }
            
            gameLibraryManager.setUserData(mockUserData)
            gameLibraryManager.setLoading(true)
            gameLibraryManager.setError('Test error')
            gameLibraryManager.setCurrentGameIndex(5)
            
            gameLibraryManager.clear()
            
            const state = gameLibraryManager.getState()
            expect(state.userData).toBeNull()
            expect(state.currentGameIndex).toBe(0)
            expect(state.isLoading).toBe(false)
            expect(state.error).toBeNull()
        })
    })
})
