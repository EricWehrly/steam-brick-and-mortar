/**
 * Game Data Types
 * 
 * Interface definitions for representing game data from various sources.
 * GameData is generic and source-agnostic, while SteamGameData is 
 * specific to Steam API responses.
 */

// Generic game data interface - not specific to Steam
export interface GameData {
    id: string | number
    name: string
    playtime: number
    recentPlaytime?: number
    // Artwork URLs are handled separately via texture options
    // This keeps the renderer agnostic to data source
}

// Legacy Steam interface for backward compatibility
// TODO: Remove this once SteamGameManager is refactored
export interface SteamGameData {
    appid: string | number
    name: string
    playtime_forever: number
    playtime_2weeks?: number
    img_icon_url?: string
    img_logo_url?: string
    artwork?: {
        icon: string
        logo: string
        header: string
        library: string
    }
}