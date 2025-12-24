/**
 * Game Library Manager
 * 
 * Manages game library state including:
 * - Current game data tracking
 * - Sorting and filtering (future)
 * - Game selection state (future)
 */

import type { SteamGame, SteamUser } from '../steam'
import { EventManager } from '../core/EventManager'
import { SteamEventTypes } from '../types/InteractionEvents'
import type { SteamGamesBatchEvent } from '../types/InteractionEvents'

export interface GameLibraryState {
    userData: SteamUser | null
    currentGameIndex: number
    isLoading: boolean
    error: string | null
}

/**
 * Manages the state of the Steam game library
 */
export class GameLibraryManager {
    private state: GameLibraryState = {
        userData: null,
        currentGameIndex: 0,
        isLoading: false,
        error: null
    }
    
    private eventManager: EventManager

    constructor() {
        this.eventManager = EventManager.getInstance()
        this.eventManager.registerEventHandler(SteamEventTypes.GamesBatchReady, this.handleGamesBatch.bind(this))
    }
    
    private handleGamesBatch(event: CustomEvent<SteamGamesBatchEvent>): void {
        const { games } = event.detail
        
        for (const game of games) {
            this.updateGameData(game as SteamGame)
        }
    }

    /**
     * Set the user data from Steam API
     */
    setUserData(userData: SteamUser): void {
        this.state.userData = userData
        this.state.currentGameIndex = 0
        this.state.error = null
    }

    /**
     * Update a specific game's data
     */
    updateGameData(updatedGame: SteamGame): void {
        if (!this.state.userData?.games) {
            return
        }

        const gameIndex = this.state.userData.games.findIndex(
            game => game.appid === updatedGame.appid
        )
        
        if (gameIndex !== -1) {
            this.state.userData.games[gameIndex] = updatedGame
        }
    }

    /**
     * Get current game library state
     */
    getState(): GameLibraryState {
        return { ...this.state }
    }

    /**
     * Set loading state
     */
    setLoading(isLoading: boolean): void {
        this.state.isLoading = isLoading
    }

    /**
     * Set error state
     */
    setError(error: string | null): void {
        this.state.error = error
    }

    /**
     * Get current game count
     */
    getGameCount(): number {
        return this.state.userData?.game_count ?? 0
    }

    /**
     * Get games array
     */
    getGames(): SteamGame[] {
        return this.state.userData?.games ?? []
    }

    /**
     * Get current game index
     */
    getCurrentGameIndex(): number {
        return this.state.currentGameIndex
    }

    /**
     * Set current game index
     */
    setCurrentGameIndex(index: number): void {
        this.state.currentGameIndex = index
    }

    /**
     * Increment current game index
     */
    incrementGameIndex(): number {
        return ++this.state.currentGameIndex
    }

    /**
     * Clear all data
     */
    clear(): void {
        this.state = {
            userData: null,
            currentGameIndex: 0,
            isLoading: false,
            error: null
        }
    }

    /**
     * Check if we have user data
     */
    hasUserData(): boolean {
        return this.state.userData !== null
    }

    /**
     * Get vanity URL if available
     */
    getVanityUrl(): string | null {
        return this.state.userData?.vanity_url ?? null
    }
}
