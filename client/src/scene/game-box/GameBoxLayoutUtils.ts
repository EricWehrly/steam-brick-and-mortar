/**
 * GameBox Layout Utilities
 * 
 * Handles positioning, sorting, and layout calculations for game boxes:
 * - Game sorting by playtime and alphabetical order
 * - Position calculations for shelf layouts  
 * - Centering logic for game box arrangements
 * - Layout spacing and configuration management
 */

import type { GameData, SteamGameData } from './types/GameData'
import type { GameBoxPosition, ShelfConfiguration } from './types/GameBoxOptions'

export class GameBoxLayoutUtils {
    // TODO: Guessing at shelf offsets should be removed entirely
    public static readonly DEFAULT_SHELF_CONFIG: ShelfConfiguration = {
        surfaceY: -0.8,
        centerZ: -3,
        centerX: 0,
        spacing: 0.16
    }

    /**
     * Sort games by playtime (played games first by playtime, then unplayed alphabetically)
     */
    public static sortAndLimitGames(games: (GameData | SteamGameData)[]): (GameData | SteamGameData)[] {
        // Get games with recent playtime first, then alphabetical
        const playedGames = games
            .filter(game => GameBoxLayoutUtils.getGamePlaytime(game) > 0)
            .sort((a, b) => GameBoxLayoutUtils.getGamePlaytime(b) - GameBoxLayoutUtils.getGamePlaytime(a))
        
        // Add unplayed games alphabetically
        const unplayedGames = games
            .filter(game => GameBoxLayoutUtils.getGamePlaytime(game) === 0)
            .sort((a, b) => a.name.localeCompare(b.name))
        
        playedGames.push(...unplayedGames)
        
        return playedGames
    }

    /**
     * Calculate the starting X position to center a set of game boxes
     */
    public static calculateStartX(numBoxes: number, config: ShelfConfiguration): number {
        return -(numBoxes - 1) * config.spacing / 2
    }

    /**
     * Calculate the position for a specific game box in a linear layout
     */
    public static calculateBoxPosition(
        index: number, 
        startX: number, 
        config: ShelfConfiguration
    ): GameBoxPosition {
        return {
            x: config.centerX + startX + (index * config.spacing),
            y: config.surfaceY, // Use exact Y position calculated by StoreLayout
            z: config.centerZ    // Use exact Z position calculated by StoreLayout
        }
    }

    /**
     * Calculate positions for a batch of game boxes with centering
     */
    public static calculateBatchPositions(
        count: number,
        config: ShelfConfiguration = GameBoxLayoutUtils.DEFAULT_SHELF_CONFIG
    ): GameBoxPosition[] {
        const positions: GameBoxPosition[] = []
        const startX = GameBoxLayoutUtils.calculateStartX(count, config)
        
        for (let i = 0; i < count; i++) {
            positions.push(GameBoxLayoutUtils.calculateBoxPosition(i, startX, config))
        }
        
        return positions
    }

    /**
     * Get game playtime from different game data formats
     */
    public static getGamePlaytime(game: GameData | SteamGameData): number {
        return 'playtime' in game ? game.playtime : game.playtime_forever
    }

    /**
     * Get game ID from different game data formats
     */
    public static getGameId(game: GameData | SteamGameData): string | number {
        return 'id' in game ? game.id : game.appid
    }

    /**
     * Create a shelf configuration with custom overrides
     */
    public static createShelfConfig(overrides: Partial<ShelfConfiguration> = {}): ShelfConfiguration {
        return { ...GameBoxLayoutUtils.DEFAULT_SHELF_CONFIG, ...overrides }
    }

    /**
     * Calculate the total width required for a given number of game boxes
     */
    public static calculateTotalWidth(numBoxes: number, spacing: number): number {
        if (numBoxes <= 1) return 0
        return (numBoxes - 1) * spacing
    }

    /**
     * Calculate optimal spacing for a given number of boxes within a maximum width
     */
    public static calculateOptimalSpacing(numBoxes: number, maxWidth: number): number {
        if (numBoxes <= 1) return 0
        return Math.min(GameBoxLayoutUtils.DEFAULT_SHELF_CONFIG.spacing, maxWidth / (numBoxes - 1))
    }

    /**
     * Validate shelf configuration parameters
     */
    public static validateShelfConfig(config: ShelfConfiguration): boolean {
        return (
            typeof config.surfaceY === 'number' &&
            typeof config.centerZ === 'number' &&
            typeof config.centerX === 'number' &&
            typeof config.spacing === 'number' &&
            config.spacing > 0
        )
    }
}