/**
 * Steam Game Data Types
 * 
 * Interface definitions for representing Steam game data from Steam API responses.
 * Since we only work with Steam games, this is the single source of truth for game data.
 */

import type { SteamGameMetadata } from '../../../steam/types/SteamMetadata'

export interface ArtworkAttemptResult {
    type: 'library' | 'capsule' | 'header' | 'other' | 'label'
    url: string
    result: 'success' | 'failure' | 'skipped-permanent'
    error?: string
}

export interface SteamGameData extends SteamGameMetadata {
    appid: string | number
    name: string
    playtime_forever: number
    playtime_2weeks?: number
    rtime_last_played?: number
    img_icon_url?: string
    img_logo_url?: string
    artwork?: {
        icon: string
        logo: string
        header: string
        library: string
    }
    artworkSelectedType?: 'library' | 'capsule' | 'header' | 'label'
    artworkSelectedUrl?: string
    artworkAttemptResults?: ArtworkAttemptResult[]
}