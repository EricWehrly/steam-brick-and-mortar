/**
 * Steam Game Manager
 * 
 * Handles Steam game loading, texture application, and game box management.
 * Extracted from SteamBrickAndMortarApp to reduce complexity.
 */

import type { SteamGameData, GameBoxRenderer, SceneManager } from '../scene'
import type { SteamIntegration } from '../steam-integration'

export class SteamGameManager {
    private gameBoxRenderer: GameBoxRenderer
    private sceneManager: SceneManager
    private steamIntegration: SteamIntegration
    private currentGameIndex: number = 0

    constructor(
        gameBoxRenderer: GameBoxRenderer,
        sceneManager: SceneManager,
        steamIntegration: SteamIntegration
    ) {
        this.gameBoxRenderer = gameBoxRenderer
        this.sceneManager = sceneManager
        this.steamIntegration = steamIntegration
    }

    /**
     * Reset the current game index
     */
    resetGameIndex(): void {
        this.currentGameIndex = 0
    }

    /**
     * Get the current game index
     */
    getCurrentGameIndex(): number {
        return this.currentGameIndex
    }

    /**
     * Clear existing game boxes from the scene
     */
    clearGameBoxes(): void {
        const clearedCount = this.sceneManager.clearObjectsByUserData('isGameBox')
        console.log(`🗑️ Cleared ${clearedCount} existing game boxes`)
    }

    /**
     * Add a game box to the scene with texture loading
     */
    async addGameBoxToScene(game: SteamGameData, index: number): Promise<void> {
        // Get artwork blobs for the game
        const artworkBlobs = await this.getGameArtworkBlobs(game)
        
        // Create game box with texture options
        const textureOptions = artworkBlobs ? {
            artworkBlobs,
            enableLazyLoading: true // Enable for performance
        } : undefined
        
        // Let GameBoxRenderer handle all the rendering logic
        const gameBox = this.gameBoxRenderer.createGameBoxWithTexture(
            this.sceneManager.getScene(), 
            game, 
            index, 
            textureOptions
        )
        
        if (gameBox) {
            this.currentGameIndex = index + 1
            console.log(`🎮 Added game with artwork: ${game.name}`)
        }
    }



    /**
     * Load multiple games into the scene efficiently
     */
    async loadGamesIntoScene(games: SteamGameData[]): Promise<any[]> {
        console.log(`🚀 Loading ${games.length} Steam games into scene...`)
        
        // Clear existing game boxes
        this.clearGameBoxes()
        this.resetGameIndex()
        
        // Create game boxes with Steam data (renderer handles generic conversion)
        const gameBoxes = this.gameBoxRenderer.createGameBoxesFromSteamData(
            this.sceneManager.getScene(),
            games
        )
        
        // Load artwork for all games asynchronously (don't block rendering)
        this.loadArtworkForGames(games, gameBoxes)
        
        return gameBoxes
    }
    
    /**
     * Load artwork for games asynchronously after initial rendering
     */
    private async loadArtworkForGames(games: SteamGameData[], gameBoxes: any[]): Promise<void> {
        const artworkPromises = games.map(async (game, index) => {
            const gameBox = gameBoxes[index]
            if (!gameBox) return
            
            try {
                const artworkBlobs = await this.getGameArtworkBlobs(game)
                if (artworkBlobs) {
                    const textureOptions = {
                        artworkBlobs,
                        enableLazyLoading: true
                    }
                    
                    await this.gameBoxRenderer.getTextureManager().applyTexture(gameBox, game, textureOptions)
                }
            } catch (error) {
                console.debug(`Could not load artwork for ${game.name}:`, error)
            }
        })
        
        // Load artwork in batches to avoid overwhelming the system
        const batchSize = 5
        for (let i = 0; i < artworkPromises.length; i += batchSize) {
            const batch = artworkPromises.slice(i, i + batchSize)
            await Promise.allSettled(batch)
            
            // Small delay between batches
            if (i + batchSize < artworkPromises.length) {
                await new Promise(resolve => setTimeout(resolve, 100))
            }
        }
        
        console.log(`✅ Completed artwork loading for ${games.length} games`)
    }
    
    /**
     * Get artwork blobs for a game from cache
     */
    private async getGameArtworkBlobs(game: SteamGameData): Promise<Record<string, Blob | null> | null> {
        // Try to get artwork from cache for all available types
        const artworkBlobs: Record<string, Blob | null> = {}
        let hasAnyArtwork = false
        
        const artworkTypes = ['library', 'header', 'logo', 'icon'] as const
        
        for (const type of artworkTypes) {
            const artworkUrl = game.artwork?.[type]
            if (artworkUrl) {
                try {
                    const blob = await this.steamIntegration.getSteamClient().downloadGameImage(artworkUrl)
                    artworkBlobs[type] = blob
                    if (blob) {
                        hasAnyArtwork = true
                    }
                } catch (error) {
                    console.debug(`Could not load ${type} artwork for ${game.name}:`, error)
                    artworkBlobs[type] = null
                }
            } else {
                artworkBlobs[type] = null
            }
        }
        
        return hasAnyArtwork ? artworkBlobs : null
    }
}
