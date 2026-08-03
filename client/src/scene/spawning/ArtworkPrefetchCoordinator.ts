import * as THREE from 'three'
import { Logger } from '../../utils/Logger'
import { EventManager } from '../../core/EventManager'
import { DataManager } from '../../core/data/DataManager'
import { DataKey } from '../../core/data/DataTypes'
import { GameArtworkProvider } from '../game-box/instancing/GameArtworkProvider'
import {
    GameEventTypes,
    GameRenderEventTypes,
    StorePropsEventTypes,
    type ArtworkIntentSettledEvent,
    type BatchReadyForPlacementEvent,
    type PlacementIntentReadyEvent,
} from '../../types/InteractionEvents'
import type { SteamGameData } from '../game-box/types/GameData'

interface IArtworkPrewarmer {
    prefetchArtwork(
        appid: number,
        artworkHints: { library?: string; header?: string } | undefined,
        name: string
    ): Promise<PrefetchResult>
}

export type PrefetchResult = 'prefetched' | 'cached' | 'skipped' | 'error'

interface ArtworkPrefetchCoordinatorOptions {
    renderer?: IArtworkPrewarmer | null
    /** Overrides MAX_CONCURRENT_PREFETCH — test-only knob for deterministic small-batch assertions. */
    maxConcurrentPrefetch?: number
}

interface PendingPrefetch {
    appid: number
    name: string
    artworkHints: { library?: string; header?: string } | undefined
}

/** Which priority tier (see class doc) actually picked a given dispatch - drives both the scheduling and latency summaries. */
type DispatchTier = 'distance' | 'local-disk' | 'background'

interface DispatchPick {
    pending: PendingPrefetch
    tier: DispatchTier
}

interface LatencyStats {
    count: number
    totalMs: number
    maxMs: number
}

function createLatencyStats(): LatencyStats {
    return { count: 0, totalMs: 0, maxMs: 0 }
}

/**
 * Concurrency cap for in-flight prefetchArtwork calls, independent of the decode worker pool
 * (see GameArtworkProvider) — Tauri IPC round-trips and network fetches both carry per-call
 * overhead that unbounded concurrency still strains even once decode itself is parallelized.
 * The original investigation observed 972 simultaneous in-flight CDN fetches with no cap at all
 * (docs/plans/startup-artwork-resolution-plan.md, grounding data) — this keeps the real-library
 * case (~1400 games) well below that regardless of pool size.
 */
const MAX_CONCURRENT_PREFETCH = 24

/**
 * Owns batch-time artwork prefetch state independently from shelf placement state.
 * A single artwork prefetch result can later satisfy one or more placement intents.
 *
 * Dispatch is queued and capped (MAX_CONCURRENT_PREFETCH), not fire-and-forget: with the
 * placement gate in RenderIntentCoordinator (no game box exists until its artwork settles),
 * decode/fetch order directly determines what the player sees fill in first. Three-tier pick
 * order per slot (see takeNextPrefetch): nearest known position first (what the player will
 * actually see soonest), then - among games without a position yet - local-disk-backed games
 * first (GameArtworkProvider already knows this synchronously; a disk read is cheap and keeps
 * the queue moving without occupying a slot on a slow CDN round trip), then plain FIFO/library
 * order as the last resort so dispatch never idles. PlacementIntentReady carries a world position
 * per appid, independent of prefetch — when it arrives for a still-queued game, that game jumps
 * the queue ahead of anything without a known position yet. This assumes the camera is already at
 * its intended spawn position by the time distance is measured — true today (no startup camera
 * animation), but a future one would need to either delay this scheduler's distance reads or feed
 * it the camera's final target instead of its live position.
 */
export class ArtworkPrefetchCoordinator {
    private readonly logger = Logger.createLogFunctions(ArtworkPrefetchCoordinator.name)
    private readonly dataManager = DataManager.getInstance()
    private readonly artworkProvider = GameArtworkProvider.getInstance()
    private readonly maxConcurrentPrefetch: number
    private renderer: IArtworkPrewarmer | null
    private readonly boundHandleArtworkSettled: () => void
    private readonly boundHandleBatchReadyForPlacement: (event: CustomEvent<BatchReadyForPlacementEvent>) => void
    private readonly boundHandlePlacementIntentReady: (event: CustomEvent<PlacementIntentReadyEvent>) => void

    private readonly prefetchResults: Map<number, PrefetchResult> = new Map()
    private readonly appNamesByAppId: Map<number, string> = new Map()
    private hasLoggedExpectedFallbackSummary = false

    private readonly pendingQueue: PendingPrefetch[] = []
    private readonly knownPositions: Map<number, THREE.Vector3> = new Map()
    private inFlightCount = 0
    private readonly tmpVec = new THREE.Vector3()

    /** Scheduling counters (see logSchedulingSummary) - confirms the priority tiers are actually engaging. */
    private dispatchedByDistance = 0
    private dispatchedByLocalDisk = 0
    private dispatchedByBackground = 0

    /** Dispatch-to-settle latency, bucketed by the tier that picked it (see logLatencySummary). */
    private readonly latencyByTier: Record<DispatchTier, LatencyStats> = {
        distance: createLatencyStats(),
        'local-disk': createLatencyStats(),
        background: createLatencyStats(),
    }

    public constructor(options: ArtworkPrefetchCoordinatorOptions = {}) {
        this.renderer = options.renderer ?? null
        this.maxConcurrentPrefetch = options.maxConcurrentPrefetch ?? MAX_CONCURRENT_PREFETCH
        this.boundHandleArtworkSettled = this.handleArtworkSettled.bind(this)
        this.boundHandleBatchReadyForPlacement = this.handleBatchReadyForPlacement.bind(this)
        this.boundHandlePlacementIntentReady = this.handlePlacementIntentReady.bind(this)

        EventManager.getInstance().registerEventHandler(
            GameEventTypes.ArtworkSettled,
            this.boundHandleArtworkSettled
        )
        EventManager.getInstance().registerEventHandler(
            StorePropsEventTypes.BatchReadyForPlacement,
            this.boundHandleBatchReadyForPlacement
        )
        EventManager.getInstance().registerEventHandler(
            GameRenderEventTypes.PlacementIntentReady,
            this.boundHandlePlacementIntentReady
        )
    }

    public reset(): void {
        this.prefetchResults.clear()
        this.appNamesByAppId.clear()
        this.hasLoggedExpectedFallbackSummary = false
        this.pendingQueue.length = 0
        this.knownPositions.clear()
        this.dispatchedByDistance = 0
        this.dispatchedByLocalDisk = 0
        this.dispatchedByBackground = 0
        for (const tier of Object.keys(this.latencyByTier) as DispatchTier[]) {
            this.latencyByTier[tier] = createLatencyStats()
        }
    }

    public dispose(): void {
        EventManager.getInstance().deregisterEventHandler(
            GameEventTypes.ArtworkSettled,
            this.boundHandleArtworkSettled
        )
        EventManager.getInstance().deregisterEventHandler(
            StorePropsEventTypes.BatchReadyForPlacement,
            this.boundHandleBatchReadyForPlacement
        )
        EventManager.getInstance().deregisterEventHandler(
            GameRenderEventTypes.PlacementIntentReady,
            this.boundHandlePlacementIntentReady
        )
        this.reset()
    }

    public prefetchBatch(
        games: ReadonlyArray<SteamGameData>,
        renderer: IArtworkPrewarmer
    ): void {
        this.renderer = renderer

        for (const game of games) {
            const appid = typeof game.appid === 'number' ? game.appid : 0
            this.appNamesByAppId.set(appid, game.name)
            this.pendingQueue.push({ appid, name: game.name, artworkHints: game.artwork })
        }

        this.fillSlots()
    }

    /**
     * Records a game's world position as soon as placement knows it — independent of, and
     * usually well before, this game's own prefetch dispatch. Only affects queue order (an
     * already-dispatched game is unaffected); a fresh call to fillSlots() lets a newly-positioned
     * game claim a slot it wouldn't otherwise have raced for yet.
     */
    private handlePlacementIntentReady(event: CustomEvent<PlacementIntentReadyEvent>): void {
        const { appid, position } = event.detail
        this.knownPositions.set(appid, position.clone())
    }

    private fillSlots(): void {
        if (!this.renderer) {
            return
        }

        while (this.inFlightCount < this.maxConcurrentPrefetch && this.pendingQueue.length > 0) {
            const next = this.takeNextPrefetch()
            this.dispatchPrefetch(next)
        }
    }

    /**
     * Removes and returns the best queued candidate (see class doc for the three-tier order):
     * nearest known position, then local-disk-backed among the unpositioned, then plain FIFO.
     */
    private takeNextPrefetch(): DispatchPick {
        const byDistance = this.takeNearestKnownPosition()
        if (byDistance) return byDistance

        const byLocalDisk = this.takeLocalDiskBacked()
        if (byLocalDisk) return byLocalDisk

        const picked = this.pendingQueue.shift()!
        this.dispatchedByBackground++
        this.logger.debug(
            `dispatch "${picked.name}" (appid ${picked.appid}) via FIFO/background - no known position or ` +
            `local art (${this.pendingQueue.length} still queued)`
        )
        return { pending: picked, tier: 'background' }
    }

    private takeNearestKnownPosition(): DispatchPick | null {
        const camera = this.dataManager.get<THREE.Camera>(DataKey.MainCamera)
        if (!camera || this.knownPositions.size === 0) {
            return null
        }

        let bestIndex = -1
        let bestDistSq = Infinity
        for (let i = 0; i < this.pendingQueue.length; i++) {
            const position = this.knownPositions.get(this.pendingQueue[i].appid)
            if (!position) continue
            this.tmpVec.copy(position).sub(camera.position)
            const distSq = this.tmpVec.lengthSq()
            if (distSq < bestDistSq) {
                bestDistSq = distSq
                bestIndex = i
            }
        }
        if (bestIndex < 0) {
            return null
        }

        const picked = this.pendingQueue.splice(bestIndex, 1)[0]
        this.dispatchedByDistance++
        this.logger.debug(
            `dispatch "${picked.name}" (appid ${picked.appid}) via distance=${Math.sqrt(bestDistSq).toFixed(1)}m ` +
            `(${this.pendingQueue.length} still queued)`
        )
        return { pending: picked, tier: 'distance' }
    }

    /**
     * Among games with no known position yet, prefers one GameArtworkProvider's local-art index
     * (populated before placement starts - see registerLocalArtIndex) already knows is on disk.
     * A disk read is cheap and synchronous-ish compared to a CDN round trip, so burning a
     * concurrency slot on it keeps the queue moving instead of tying that slot up in a slow
     * network fetch while cheap wins sit queued behind it.
     */
    private takeLocalDiskBacked(): DispatchPick | null {
        const index = this.pendingQueue.findIndex(
            pending => this.artworkProvider.hasLocalArt(pending.appid, 'library')
        )
        if (index < 0) {
            return null
        }

        const picked = this.pendingQueue.splice(index, 1)[0]
        this.dispatchedByLocalDisk++
        this.logger.debug(
            `dispatch "${picked.name}" (appid ${picked.appid}) via local-disk - no known position yet ` +
            `(${this.pendingQueue.length} still queued)`
        )
        return { pending: picked, tier: 'local-disk' }
    }

    private dispatchPrefetch(pick: DispatchPick): void {
        const { appid, name, artworkHints } = pick.pending
        const dispatchedAt = performance.now()
        this.inFlightCount++

        this.renderer!.prefetchArtwork(appid, artworkHints, name).then((result) => {
            this.prefetchResults.set(appid, result)
            this.emitArtworkIntentSettled(appid, name)
        }).catch((error) => {
            this.logger.warn(`prefetchArtwork failed for "${name}": ${error}`)
            this.prefetchResults.set(appid, 'error')
            this.emitArtworkIntentSettled(appid, name)
        }).finally(() => {
            this.recordLatency(pick.tier, performance.now() - dispatchedAt)
            this.inFlightCount--
            this.fillSlots()
        })
    }

    private recordLatency(tier: DispatchTier, elapsedMs: number): void {
        const stats = this.latencyByTier[tier]
        stats.count++
        stats.totalMs += elapsedMs
        stats.maxMs = Math.max(stats.maxMs, elapsedMs)
    }

    private handleBatchReadyForPlacement(event: CustomEvent<BatchReadyForPlacementEvent>): void {
        const { games, batchIndex, totalBatches } = event.detail

        this.logger.debug(
            `BatchReadyForPlacement: batch ${batchIndex + 1}/${totalBatches}, ${games.length} games — prewarming artwork`
        )

        if (!this.renderer) {
            this.logger.warn(
                'BatchReadyForPlacement received before GameDataReady initialized renderer — dropping batch prewarm to enforce event ordering'
            )
            return
        }

        this.prefetchBatch(games as SteamGameData[], this.renderer)
    }

    private emitArtworkIntentSettled(appid: number, gameName: string): void {
        EventManager.getInstance().emit<ArtworkIntentSettledEvent>(
            GameRenderEventTypes.ArtworkIntentSettled,
            { appid, gameName }
        )
    }

    private handleArtworkSettled(): void {
        this.logSchedulingSummary()
        this.logLatencySummary()
        this.logExpectedFallbackSummary()
    }

    /**
     * Confirms the priority tiers (see class doc) actually engaged, rather than silently
     * degrading to plain FIFO for the whole run - e.g. if PlacementIntentReady positions
     * consistently arrive after a game's own dispatch, every pick would fall through past the
     * distance tier and this ratio would read close to 0% despite the mechanism being "on".
     * Logged once the queue fully drains (see handleArtworkSettled).
     */
    private logSchedulingSummary(): void {
        const total = this.dispatchedByDistance + this.dispatchedByLocalDisk + this.dispatchedByBackground
        if (total === 0) return

        this.logger.info(
            `📊 Prefetch scheduling: ${this.dispatchedByDistance}/${total} by distance-priority, ` +
            `${this.dispatchedByLocalDisk}/${total} by local-disk (no known position yet), ` +
            `${this.dispatchedByBackground}/${total} by plain FIFO (no known position or local art)`
        )
    }

    /**
     * Dispatch-to-settle latency per tier - answers whether the background/FIFO tier (the games
     * with no known position and no local art, so likely network-bound) actually comes back
     * quickly enough to not be worth a separate concurrency cap, or whether it's meaningfully
     * slower than the distance/local-disk tiers. Logged once the queue fully drains (see
     * handleArtworkSettled), same as the scheduling summary this pairs with.
     */
    private logLatencySummary(): void {
        const parts: string[] = []
        for (const tier of ['distance', 'local-disk', 'background'] as DispatchTier[]) {
            const stats = this.latencyByTier[tier]
            if (stats.count === 0) continue
            const avgMs = Math.round(stats.totalMs / stats.count)
            parts.push(`${tier} avg=${avgMs}ms max=${Math.round(stats.maxMs)}ms (n=${stats.count})`)
        }
        if (parts.length === 0) return

        this.logger.info(`📊 Prefetch latency by tier: ${parts.join(', ')}`)
    }

    public logExpectedFallbackSummary(): void {
        if (this.hasLoggedExpectedFallbackSummary) {
            return
        }

        const fallbackTitles: string[] = []
        for (const [appid, result] of this.prefetchResults) {
            if (result !== 'skipped' && result !== 'error') {
                continue
            }
            const title = this.appNamesByAppId.get(appid)
            if (title) {
                fallbackTitles.push(title)
            }
        }

        if (fallbackTitles.length > 0) {
            fallbackTitles.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
            const previewLimit = 3
            const preview = fallbackTitles.slice(0, previewLimit)
            const remaining = fallbackTitles.length - preview.length
            const overflowSuffix = remaining > 0 ? ` (+${remaining} more)` : ''

            this.logger.info(
                `Artwork fallback summary: ${fallbackTitles.length} game(s) will use labels this run - ` +
                `e.g. ${preview.join(', ')}${overflowSuffix}`
            )
        }

        this.hasLoggedExpectedFallbackSummary = true
    }

}