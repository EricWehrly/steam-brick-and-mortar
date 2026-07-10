import type { SteamGame } from '../SteamApiClient'

/**
 * Derives Steam CDN artwork URLs from an appid alone — no img_icon_url/img_logo_url hash
 * needed. Used for offline-sourced games (manual import) where those hashes aren't available.
 *
 * Lives in its own file rather than SteamIntegration.ts (where it originated) because it's
 * now shared by three consumers - SteamIntegration, GamesLoader, and demo-games.ts - and
 * SteamIntegration already imports demo-games.ts (for ANONYMOUS_STORE_USER) and transitively
 * depends on GamesLoader.ts (via SteamApiClient). Moving this function into SteamIntegration.ts
 * would make either of those a circular import. Revisit if/when this file's other consumers
 * move or this function's home turns out to matter for something bigger (see the
 * steam-integration-loading-strategy-split debt entry, which touches the same neighborhood).
 */
export function deriveArtworkFromAppId(appid: number): SteamGame['artwork'] {
    return {
        icon: '',
        logo: '',
        header: `https://cdn.akamai.steamstatic.com/steam/apps/${appid}/header.jpg`,
        library: `https://cdn.akamai.steamstatic.com/steam/apps/${appid}/library_600x900.jpg`
    }
}
