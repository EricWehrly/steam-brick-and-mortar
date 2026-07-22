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
    /** Unix timestamp, absent if the game has never been played — mirrors SteamGame's field
     *  of the same name so both channels feed LibraryGame.lastPlayed the same way. */
    readonly rtime_last_played?: number
    /** Per-user, like playtime_forever — threaded through to LibraryGame.playtimeDisconnected. */
    readonly playtime_disconnected?: number
    /**
     * The fields below are per-appid, not per-user — capsule_filename, the has_dlc-style flags,
     * content_descriptorids, and img_icon_url describe the game itself, not this owner's
     * relationship to it. They're captured
     * here (validated, present in a saved export file) because the bookmarklet's one-shot mining
     * of a profile page is the only place we currently see them — but they deliberately go no
     * further than this wire type. There's no appid-keyed store for them yet (AppDetailsCache is
     * fed only by the Lambda's Store API batch endpoint, a different source that doesn't return
     * these fields), and duplicating them per-owner inside LibraryGame would recreate the
     * categories/artwork entanglement documented on LibraryGame below. Thread them further only
     * once that store exists. // TD: library-game-appid-metadata-duplication
     *
     * capsule_filename's format is inconsistent (sometimes hash-prefixed, sometimes not — see
     * docs/research/steam-profile-ssr-hydration-research.md "Known quirks"); captured as-is,
     * not reconstructed or used to build a URL.
     */
    readonly capsule_filename?: string
    readonly has_dlc?: boolean
    readonly has_workshop?: boolean
    readonly has_market?: boolean
    readonly has_community_visible_stats?: boolean
    readonly has_leaderboards?: boolean
    readonly content_descriptorids?: readonly number[]
    readonly img_icon_url?: string
}

/**
 * File and bookmarklet imports share a validated payload shape today, but they're genuinely
 * different capture mechanisms (one reads a saved JSON file, the other mines a live Steam
 * page's React Query hydration blob) that could diverge in format later. Keeping the channel
 * as real metadata — not just for the UI, persisted alongside the library itself — means a
 * future format mismatch shows up as "this came from X" instead of a mystery.
 *
 * `local-scan` is a fourth, slightly different case: not an untrusted user-initiated import at
 * all, but the desktop app's own read of the local Steam install (see
 * docs/plans/desktop-local-data-pipeline-plan.md) - one branch of SteamIntegration.handleGameStart's
 * startup waterfall (cache -> local disk -> online -> demo), not a run-every-launch background
 * check. It's grouped here rather than given a separate LibraryChannel/event pair because it
 * produces the exact same trusted LibraryGame[]-shaped payload and goes through the exact same
 * applyLibrary()/persistLibrary() path - a discriminating value on an existing type, not a new
 * mechanism for the same job.
 */
export type ImportChannel = 'bookmarklet' | 'file' | 'local-scan'

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
 * lastPlayed and playtimeDisconnected are carried because they're genuinely per-owner facts
 * (same as playtimeForever) — see ImportedGame for the per-appid fields deliberately kept out.
 */
export interface LibraryGame {
    readonly appid: number
    readonly name: string
    readonly playtimeForever: number
    readonly lastPlayed?: number
    readonly playtimeDisconnected?: number
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

type PrimitiveTypeName = 'number' | 'string' | 'boolean' | 'number[]'

/** Every ImportedGame field beyond the three required ones, and the runtime type it must match
 *  when present. Table-driven so adding a field is a one-line addition, not a new predicate. */
const OPTIONAL_GAME_FIELD_TYPES: Record<string, PrimitiveTypeName> = {
    rtime_last_played: 'number',
    playtime_disconnected: 'number',
    capsule_filename: 'string',
    has_dlc: 'boolean',
    has_workshop: 'boolean',
    has_market: 'boolean',
    has_community_visible_stats: 'boolean',
    has_leaderboards: 'boolean',
    content_descriptorids: 'number[]',
    img_icon_url: 'string'
}

function matchesType(value: unknown, type: PrimitiveTypeName): boolean {
    return type === 'number[]'
        ? Array.isArray(value) && value.every(v => typeof v === 'number')
        : typeof value === type
}

/**
 * Validates an untrusted payload from either capture channel (postMessage or a picked file) —
 * shared so the two entry points can't drift into checking slightly different things. Pure and
 * DOM-free on purpose: easy to unit test without any browser fixtures.
 */
function isValidImportedGame(g: unknown): g is ImportedGame {
    if (typeof g !== 'object' || g === null) return false
    const candidate = g as Record<string, unknown>
    if (typeof candidate.appid !== 'number' || typeof candidate.name !== 'string' || typeof candidate.playtime_forever !== 'number') {
        return false
    }
    return Object.entries(OPTIONAL_GAME_FIELD_TYPES).every(([field, type]) =>
        candidate[field] === undefined || matchesType(candidate[field], type))
}

export function validateLibraryExportPayload(payload: unknown): { games: ImportedGame[], displayName: string | null, steamId: string | null } | null {
    const isObject = (value: unknown): value is Record<string, unknown> =>
        typeof value === 'object' && value !== null

    if (!isObject(payload)) return null
    if ((payload as Partial<LibraryExportPayload>).schema !== 'sbam-library-export/v1') return null
    if (!Array.isArray(payload.games)) return null

    const games = payload.games.filter(isValidImportedGame)
    if (games.length === 0) return null

    const displayName = typeof payload.display_name === 'string' ? payload.display_name.trim() || null : null
    const steamId = typeof payload.steam_id === 'string' ? payload.steam_id.trim() || null : null
    return { games, displayName, steamId }
}

/**
 * The minimal shape diffing needs — ImportedGame, LibraryGame, and SteamGame all satisfy this
 * structurally, so computeLibraryDiff works directly against whichever shape a caller already
 * has (a fresh local scan, a persisted Library, or the currently-rendered game list) with no
 * conversion step.
 */
export interface DiffableGame {
    readonly appid: number
    readonly name: string
}

export interface LibraryDiff {
    /** Present in incoming, absent from current entirely. */
    readonly addedAppids: readonly number[]
    /** Present in current, absent from incoming entirely. */
    readonly removedGames: readonly { readonly appid: number; readonly name: string }[]
    /** Same appid in both, but the name changed - functionally a remove-then-add for anything
     *  keyed by game name (the artwork texture-slot map, notably - see
     *  LodArtworkOrchestrator.reconcileForLibraryReload). */
    readonly renamedGames: readonly { readonly appid: number; readonly oldName: string; readonly newName: string }[]
}

/**
 * Diffs two game lists by appid + name. Channel-agnostic and null-free on purpose - callers
 * decide what "nothing to compare against" means for their own situation (e.g.
 * LocalSteamLibraryLoader only calls this when a persisted library exists AND came from its own
 * channel; SteamIntegration.applyLibrary only calls this when something is already rendered).
 * Deliberately ignores playtime/lastPlayed - those don't change what's on the shelves, only sort
 * order.
 */
export function computeLibraryDiff(incoming: readonly DiffableGame[], current: readonly DiffableGame[]): LibraryDiff {
    const incomingByAppid = new Map(incoming.map(g => [g.appid, g]))
    const currentByAppid = new Map(current.map(g => [g.appid, g]))

    const addedAppids = incoming.filter(g => !currentByAppid.has(g.appid)).map(g => g.appid)
    const removedGames = current
        .filter(g => !incomingByAppid.has(g.appid))
        .map(g => ({ appid: g.appid, name: g.name }))
    const renamedGames = incoming.flatMap(g => {
        const prior = currentByAppid.get(g.appid)
        return prior && prior.name !== g.name
            ? [{ appid: g.appid, oldName: prior.name, newName: g.name }]
            : []
    })

    return { addedAppids, removedGames, renamedGames }
}

export function isDiffEmpty(diff: LibraryDiff): boolean {
    return diff.addedAppids.length === 0 && diff.removedGames.length === 0 && diff.renamedGames.length === 0
}
