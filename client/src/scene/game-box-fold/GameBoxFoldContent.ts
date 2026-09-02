/** What the three game-box faces display, assembled by GameBoxFoldCoordinator from SteamGameData
 *  and consumed by the uikit panels under ./panels. Every field is pre-formatted for display:
 *  the panels lay content out, they don't derive it. */
export interface GameBoxFoldContent {
    readonly name: string
    /** Pre-formatted, e.g. "92% Overwhelmingly Positive" - see RatingFormat.ts. Absent (not
     *  "Unrated") when there's genuinely no rating data, so the panel omits the row. */
    readonly rating?: string
    readonly playtimeHours?: number
    readonly recentPlaytimeHours?: number
    /** Steam's own genres (Action, Indie, ...) - shown as their own section, separate from tags. */
    readonly genres?: readonly string[]
    /** Top community tags (SteamSpy), pre-built/ordered/capped by the caller. */
    readonly tags?: readonly string[]
    /** Steam's own feature categories (Single-player, Steam Achievements, ...), distinct from tags. */
    readonly categories?: readonly string[]
    /** The desktop user's own Steam library collections this game belongs to. */
    readonly userCollections?: readonly string[]
    readonly description?: string
    /** Pre-formatted, e.g. "Metacritic: 84". */
    readonly metacritic?: string
    /** Pretty-printed JSON of the raw cache entry - fills the debug face's scrollable viewport. */
    readonly debugJson?: string
}

/** Decoded header-art pixels for the store panel's disc, from GameArtworkProvider's CORS-safe
 *  pixel pipeline (same reason GameBoxFoldCoordinator never uses a raw cross-origin <img> for
 *  artwork - see applyHeaderImage() there). */
export interface GameBoxFoldHeaderImage {
    readonly pixels: Uint8ClampedArray
    readonly width: number
    readonly height: number
}
