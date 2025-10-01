/**
 * Steam Game Manager
 * 
 * Handles Steam game loading, texture application, and game box management.
 * Extracted from SteamBrickAndMortarApp to reduce complexity.
 */

import * as THREE from 'three'
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
        // Create game box with immediate fallback color
        const gameBox = this.gameBoxRenderer.createGameBox(this.sceneManager.getScene(), game, index)
        if (gameBox) {
            this.currentGameIndex = index + 1
            
            // Apply texture asynchronously when artwork is available
            await this.applyGameArtworkTexture(gameBox, game)
        }
    }

    /**
     * Apply artwork texture to a game box
     */
    private async applyGameArtworkTexture(gameBox: THREE.Mesh, game: SteamGameData): Promise<void> {
        try {
            // Get cached artwork for this game
            const artworkBlobs = await this.getGameArtworkBlobs(game)
            
            if (artworkBlobs && Object.values(artworkBlobs).some(blob => blob !== null)) {
                // Calculate viewing distance for performance optimization
                const camera = this.sceneManager.getCamera()
                const viewingDistance = camera.position.distanceTo(gameBox.position)
                
                // Apply optimized texture using the GameBoxRenderer texture system
                const textureOptions = {
                    artworkBlobs,
                    fallbackColor: undefined, // Keep current fallback color
                    enableLazyLoading: true, // Enable lazy loading for performance
                    viewingDistance
                }
                
                // Apply optimized texture to existing game box
                await this.gameBoxRenderer.applyTexture(gameBox, game, textureOptions)
                console.log(`🖼️ Applied optimized artwork texture to: ${game.name}`)
            }
        } catch (error) {
            console.warn(`⚠️ Failed to apply artwork texture to ${game.name}:`, error)
        }
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
