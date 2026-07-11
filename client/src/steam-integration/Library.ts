/**
 * The resolved, in-hand library — same shape no matter how it was captured (online fetch,
 * bookmarklet, or file import). The channel is decorative provenance, never an execution
 * discriminant. Persisted so handleGameStart() can restore it on startup without re-deriving
 * lost context. See docs/plans/library-source-convergence-plan.md.
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

/** How a Library was captured. Decorative only — never switched on for execution. */
export type LibraryChannel = 'online' | ImportChannel

/** Who the library belongs to. steamId absent ⇒ not re-fetchable (see Fork A in the plan). */
export interface LibraryOwner {
    readonly steamId?: string
    readonly displayName?: string
}

/**
 * Ownership facts, plus the one entity field every channel already has for free at capture
 * time and that's cheap and safe to duplicate: name is practically immutable and doesn't
 * carry the staleness/multi-user-clearing stakes that categories/artwork/genres do (see
 * user-games-cache-entanglement in docs/tech-debt.md — that entanglement was about *those*
 * fields, not a label string). Keeping it here means a reload never depends on AppDetailsCache
 * already having this appid, and there's no write-back path fabricating placeholder cache
 * entries to cover the gap. AppDetailsCache can still resolve a better/canonical name at
 * assembly time (see GamesLoader.buildEnhancedGame) — this is only the floor, never persisted
 * artwork/categories/genres, which stay resolved from AppDetailsCache per-appid, never here.
 * lastPlayed is carried so a restored online library keeps its shelf ordering without waiting
 * on a re-fetch.
 */
export interface LibraryGame {
    readonly appid: number
    readonly name: string
    readonly playtimeForever: number
    readonly lastPlayed?: number
}

export interface LibraryProvenance {
    readonly channel: LibraryChannel
    /** When THIS data is from (SteamUser already carries retrieved_at in this spirit). */
    readonly capturedAt: string
}

export interface Library {
    readonly owner: LibraryOwner
    readonly games: readonly LibraryGame[]
    readonly provenance: LibraryProvenance
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
