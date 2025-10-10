/**
 * Steam Game Data Types
 * 
 * Interface definitions for representing Steam game data from Steam API responses.
 * Since we only work with Steam games, this is the single source of truth for game data.
 */

// Steam interface for Steam API responses
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