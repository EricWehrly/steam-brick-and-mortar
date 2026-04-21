/**
 * StorePropsCoordinator
 *
 * Registers as an override handler for store props events when the system has the
 * required GPU capabilities (WebGL2 + instanced arrays + hardware renderer).
 *
 * Owns the full GPU-instanced store props lifecycle:
 * - Shelf geometry (InstancedShelfRenderer + ShelfLayoutCoordinator)
 * - Game box spawning (GameBoxSpawner → GpuGameBoxRenderer)
 * - Batch sequencing (BatchCoordinator)
 * - Entrance floor mat (PropRenderer)
 *
 * ## Coordinator lifecycle model
 *
 * Pure coordinators (event wiring + plain data) are singletons with reset():
 *   ShelfLayoutCoordinator, BatchCoordinator, GameBoxSpawner
 *
 * GPU resource owners are disposable - reconstructed when GPU state must be fresh:
 *   InstancedShelfRenderer (owns InstancedMesh allocations)
 *
 * On layout switch: reset pure coordinators, dispose+reconstruct GPU owner.
 * On sort/filter switch: reset pure coordinators only (no GPU teardown needed).
 *
 * Activation is a side-effect of importing this module. No explicit init needed.
 */

import * as THREE from 'three'
import { EventManager, EventSource } from '../../core/EventManager'
import { Logger } from '../../utils/Logger'
import { GameEventTypes, RoomEventTypes, SteamEventTypes, StorePropsEventTypes, UIEventTypes } from '../../types/InteractionEvents'
import type {
    StorePropsSetupRequestEvent,
    StorePropsSetupCompletedEvent,
    StorePropsLayoutClearRequestEvent,
    StorePropsLibraryReloadRequestEvent,
} from './PropsEvents'

import type { RoomResizedEvent } from '../../types/InteractionEvents'
import type { BatchReadyForPlacementEvent } from '../../types/InteractionEvents'
import { type LayoutRequestedEvent } from '../../types/EnvironmentEvents'
import { type LayoutMode } from '../../types/LayoutTypes'
import { DataManager } from '../../core/data'
import { ShelfLayoutCoordinator } from '../shelves/ShelfLayoutCoordinator'
import { InstancedShelfRenderer } from '../instancing/InstancedShelfRenderer'
import { PropRenderer } from '../PropRenderer'

class StorePropsCoordinator {
    private static readonly logger = Logger.createLogFunctions(StorePropsCoordinator.name)

    private readonly eventManager: EventManager

    // Singletons - initialised on first SetupRequest, alive for app lifetime
    private shelfLayoutCoordinator: ShelfLayoutCoordinator | null = null

    // GPU resource owner - disposed and reconstructed on layout switch
    private instancedShelfRenderer: InstancedShelfRenderer | null = null

    private scene: THREE.Scene | null = null
    private entranceMat: THREE.Group | null = null

    // Tracks last-seen batch count to detect library switches
    private lastTotalBatches = 0

    // Active layout mode - drives ShelfLayoutCoordinator on next batch run
    private activeLayoutMode: LayoutMode = 'arc'

    static {
        new StorePropsCoordinator()
    }

    private constructor() {
        this.eventManager = EventManager.getInstance()

        this.eventManager.registerOverrideHandler(
            StorePropsEventTypes.SetupRequest,
            this.handleSetupRequest.bind(this)
        )
        this.eventManager.registerOverrideHandler(
            StorePropsEventTypes.LayoutClearRequest,
            this.handleLayoutClearRequest.bind(this)
        )
        this.eventManager.registerOverrideHandler(
            StorePropsEventTypes.LibraryReloadRequest,
            this.handleLibraryReloadRequest.bind(this)
        )
        this.eventManager.registerEventHandler(
            StorePropsEventTypes.BatchReadyForPlacement,
            this.handleBatchReadyForPlacement.bind(this)
        )
        this.eventManager.registerEventHandler(
            RoomEventTypes.Resized,
            this.handleRoomResized.bind(this)
        )
        this.eventManager.registerEventHandler(
            UIEventTypes.LayoutRequested,
            (event: CustomEvent<LayoutRequestedEvent>) => this.handleLayoutRequested(event.detail)
        )

        StorePropsCoordinator.logger.info('Registered')
    }

    private async handleSetupRequest(_event: CustomEvent<StorePropsSetupRequestEvent>): Promise<void> {
        const startTime = performance.now()

        if (!this.scene) {
            this.scene = DataManager.getInstance().get<THREE.Scene>('core.mainScene')
            if (!this.scene) {
                StorePropsCoordinator.logger.warn('Main scene not available - store props setup aborted')
                return
            }
        }

        // ShelfLayoutCoordinator is a singleton - BatchCoordinator and GameBoxSpawner
        // self-register at import time and need no explicit initialisation here.
        if (!this.shelfLayoutCoordinator) {
            this.shelfLayoutCoordinator = ShelfLayoutCoordinator.getInstance(this.activeLayoutMode)
        }

        // GPU owner: create fresh each setup (disposed on layout switch or clear)
        if (!this.instancedShelfRenderer) {
            this.instancedShelfRenderer = new InstancedShelfRenderer()
            this.instancedShelfRenderer.initialize().catch(error => {
                StorePropsCoordinator.logger.warn('InstancedShelfRenderer initialization failed:', error)
            })
        }

        StorePropsCoordinator.logger.info(`Store props setup completed in ${(performance.now() - startTime).toFixed(2)}ms`)

        this.eventManager.emit<StorePropsSetupCompletedEvent>(StorePropsEventTypes.SetupCompleted, {
            timestamp: Date.now(),
            source: EventSource.System,
        })
    }

    private handleLayoutClearRequest(_event: CustomEvent<StorePropsLayoutClearRequestEvent>): void {
        // BatchCoordinator and GameBoxSpawner handle layout-clear internally.
        // Instanced shelf renderer disposal is orchestrated by handleLayoutRequested.
        this.lastTotalBatches = 0
        StorePropsCoordinator.logger.info('Store props cleared for layout/arrangement change')
    }

    private handleLibraryReloadRequest(_event: CustomEvent<StorePropsLibraryReloadRequestEvent>): void {
        // New library/user profile incoming: reset GPU-owned shelf state.
        this.instancedShelfRenderer?.reset()
        this.lastTotalBatches = 0
        StorePropsCoordinator.logger.info('Store props cleared for library reload')
    }

    private handleBatchReadyForPlacement(event: CustomEvent<BatchReadyForPlacementEvent>): void {
        const { totalBatches } = event.detail

        if (this.lastTotalBatches > 0 && totalBatches !== this.lastTotalBatches) {
            StorePropsCoordinator.logger.debug(
                `Batch count changed (${this.lastTotalBatches} → ${totalBatches}) - resetting shelf renderer`
            )
            this.instancedShelfRenderer?.reset()
        }
        this.lastTotalBatches = totalBatches
    }

    private async handleRoomResized(event: CustomEvent<RoomResizedEvent>): Promise<void> {
        const { dimensions } = event.detail

        if (!this.scene) {
            this.scene = DataManager.getInstance().get<THREE.Scene>('core.mainScene')
        }

        if (!this.scene) {
            StorePropsCoordinator.logger.warn('Cannot place entrance mat - scene not available')
            return
        }

        if (this.entranceMat) {
            this.scene.remove(this.entranceMat)
            this.entranceMat = null
        }

        const propRenderer = new PropRenderer(this.scene)
        this.entranceMat = propRenderer.createEntranceFloorMat(dimensions.width, dimensions.depth)
        this.entranceMat.position.set(0, 0, 0)
        this.scene.add(this.entranceMat)

        StorePropsCoordinator.logger.debug('Entrance mat placed at origin')
    }

    private handleLayoutRequested(detail: LayoutRequestedEvent): void {
        if (detail.layoutMode === this.activeLayoutMode) return
        this.activeLayoutMode = detail.layoutMode
        StorePropsCoordinator.logger.info(`Layout mode → ${detail.layoutMode}; rebuilding scene geometry`)

        if (this.shelfLayoutCoordinator) {
            this.shelfLayoutCoordinator.layoutMode = detail.layoutMode
        }
        this.lastTotalBatches = 0

        // GPU owner must be fully torn down — InstancedMesh slots can’t be partially reused
        this.instancedShelfRenderer?.dispose()
        this.instancedShelfRenderer = null

        // Notify subsystems to clear geometry/placement state only — game data is unchanged.
        // GameBoxSpawner will clear placements but keep its renderer and prefetch cache.
        this.eventManager.emit<StorePropsLayoutClearRequestEvent>(StorePropsEventTypes.LayoutClearRequest, {})

        this.eventManager.emit<StorePropsSetupRequestEvent>(StorePropsEventTypes.SetupRequest, {
            source: EventSource.System,
        })

        // Re-trigger arrangement pipeline from DataManager — no Steam API hit needed.
        // Emit manifest + definitions seams explicitly:
        // - LibraryManifestReady: immutable membership for capacity sizing
        // - GameDataReady: definitions-ready trigger for GameSorter
        // GameSorter will re-emit SectionsReady for the new layout mode.
        const games = DataManager.getInstance().get<unknown[]>('steam.games') ?? []
        const appids = games
            .map((game) => (typeof game === 'object' && game !== null ? Number((game as { appid?: unknown }).appid) : NaN))
            .filter((appid) => Number.isFinite(appid))

        if (games.length > 0) {
            const totalBatches = Math.max(1, Math.ceil(games.length / 18))
            this.eventManager.emit(SteamEventTypes.LibraryManifestReady, {
                totalGames: games.length,
                totalBatches,
                appids,
            })

            this.eventManager.emit(GameEventTypes.GameDataReady, {
                totalGames: games.length,
                totalBatches,
            })
        }
    }

    public dispose(): void {
        this.instancedShelfRenderer?.dispose()

        if (this.entranceMat && this.scene) {
            this.scene.remove(this.entranceMat)
        }

        StorePropsCoordinator.logger.info('Disposed')
    }
}
