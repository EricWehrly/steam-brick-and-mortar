/**
 * Where the currently-loaded library came from, and enough to reload it at startup without
 * re-deriving lost context — the single source of truth handleGameStart() reads, replacing
 * the old two-signal setup (a dedicated imported-library key, plus scanning SteamApiClient's
 * CacheManager for an online profile). CacheManager itself is untouched: it's a content cache
 * ("what did Steam last tell us about this steamid"), this is routing state ("what should
 * boot at startup"). See docs/plans/manual-library-export-feasibility.md.
 */

export interface ImportedGame {
    readonly appid: number
    readonly name: string
    readonly playtime_forever: number
}

/**
 * File and bookmarklet imports share a validated payload shape today, but they're genuinely
 * different capture mechanisms (one reads a saved JSON file, the other mines a live Steam
 * page's React Query hydration blob) that could diverge in format later. Keeping the channel
 * as real metadata — not just for the UI, persisted alongside the library itself — means a
 * future format mismatch shows up as "this came from X" instead of a mystery.
 */
export type ImportChannel = 'bookmarklet' | 'file'

export type LibrarySource =
    /** userInput: whatever string round-trips through LoadLibrary correctly on reload — a
     *  real vanity name, or the raw SteamID64 digits when there's no vanity (never the
     *  internal "steamid:<id>" placeholder, which parseSteamUserInput can't parse back). */
    | { readonly type: 'online', readonly userInput: string }
    | {
        readonly type: 'imported'
        readonly channel: ImportChannel
        readonly importedAt: string
        readonly displayName?: string
        readonly steamId?: string
        readonly games: readonly ImportedGame[]
    }

/** The wire shape both the bookmarklet's postMessage payload and a saved export file share. */
export interface LibraryExportPayload {
    readonly schema: string
    readonly display_name?: string | null
    readonly steam_id?: string | null
    readonly games: readonly ImportedGame[]
}

/**
 * Validates an untrusted payload from either capture channel (postMessage or a picked file) —
 * shared so the two entry points can't drift into checking slightly different things. Pure and
 * DOM-free on purpose: easy to unit test without any browser fixtures.
 */
export function validateLibraryExportPayload(payload: unknown): { games: ImportedGame[], displayName: string | null, steamId: string | null } | null {
    const isObject = (value: unknown): value is Record<string, unknown> =>
        typeof value === 'object' && value !== null

    if (!isObject(payload)) return null
    if ((payload as Partial<LibraryExportPayload>).schema !== 'sbam-library-export/v1') return null
    if (!Array.isArray(payload.games)) return null

    const games = payload.games.filter((g): g is ImportedGame =>
        isObject(g) && typeof g.appid === 'number' && typeof g.name === 'string' && typeof g.playtime_forever === 'number')
    if (games.length === 0) return null

    const displayName = typeof payload.display_name === 'string' ? payload.display_name.trim() || null : null
    const steamId = typeof payload.steam_id === 'string' ? payload.steam_id.trim() || null : null
    return { games, displayName, steamId }
}
