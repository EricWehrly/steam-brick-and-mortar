/**
 * Shared Steam Metadata Types
 * 
 * Single source of truth for Steam Store API metadata structures.
 * These types represent the data returned from Steam's Store API
 * and normalized by our Lambda batch endpoint.
 */

export interface SteamCategory {
    id: number
    description: string
}

export interface SteamGenre {
    id: string
    description: string
}

export interface SteamReleaseDate {
    coming_soon: boolean
    date: string
}

export interface SteamMetacriticInfo {
    score: number
    url: string
}

/**
 * Common metadata fields available from Steam Store API batch endpoint.
 * Used by SteamGame, SteamGameData, and AppDetailsData interfaces.
 */
export interface SteamGameMetadata {
    categories?: SteamCategory[]
    genres?: SteamGenre[]
    developers?: string[]
    publishers?: string[]
    release_date?: SteamReleaseDate | null
    metacritic?: SteamMetacriticInfo | null
    short_description?: string
    
    // SteamSpy Hydrator Data
    steamspy_tags?: Record<string, number>
    steamspy_top_tags?: string[]
    positive?: number
    negative?: number
    userscore?: number
    owners?: string
}
