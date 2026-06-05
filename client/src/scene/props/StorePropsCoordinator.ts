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
 * Activation is explicit via StorePropsCoordinator.getInstance() from the default
 * bootstrap path, which keeps showcase mode free of store-props side effects.
 */

import * as THREE from 'three'
import { EventManager, EventSource } from '../../core/EventManager'
import { Logger } from '../../utils/Logger'
import { GameEventTypes, RoomEventTypes, SteamEventTypes, StorePropsEventTypes, UIEventTypes } from '../../types/InteractionEvents'
import type {
    StorePropsSetupRequestEvent,
    StorePropsSetupCompletedEvent,
    StorePropsLibraryReloadRequestEvent,
} from './PropsEvents'

import type { RoomResizedEvent } from '../../types/InteractionEvents'
import type { BatchReadyForPlacementEvent } from '../../types/InteractionEvents'
import type { LayoutRequestedEvent, GameDataReadyEvent } from '../../types/EnvironmentEvents'
import type { SteamLibraryManifestReadyEvent } from '../../types/InteractionEvents'
import { type LayoutMode } from '../../types/LayoutTypes'
import { DataManager } from '../../core/data'
import { ShelfLayoutCoordinator } from '../shelves/ShelfLayoutCoordinator'
import { InstancedShelfRenderer } from '../instancing/InstancedShelfRenderer'
import { PropRenderer, type EntranceMatOptions } from '../PropRenderer'
import { AISLE_WIDTH_X } from './shared/LayoutAisleWidths'
import { RoomConstants } from '../RoomManager'

const RUNNER_MIN_DEPTH_METRES = 4.5
const RUNNER_MARGIN_RATIO_PER_SIDE = 0.01
const PERCENT_BASE = 100

export class StorePropsCoordinator {
    private static readonly logger = Logger.createLogFunctions(StorePropsCoordinator.name)
    private static instance: StorePropsCoordinator | null = null

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

    public static getInstance(): StorePropsCoordinator {
        if (!StorePropsCoordinator.instance) {
            StorePropsCoordinator.instance = new StorePropsCoordinator()
        }
        return StorePropsCoordinator.instance
    }

    private constructor() {
        this.eventManager = EventManager.getInstance()

        this.eventManager.registerOverrideHandler(
            StorePropsEventTypes.SetupRequest,
            this.handleSetupRequest.bind(this)
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
            UIEventTypes.ArrangementRequested,
            () => this.handleArrangementRequested()
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

        // ShelfLayoutCoordinator remains lazy and process-wide; the default bootstrap
        // path explicitly activates the adjacent runtime coordinators it depends on.
        if (!this.shelfLayoutCoordinator) {
            this.shelfLayoutCoordinator = ShelfLayoutCoordinator.getInstance(this.activeLayoutMode)
        }

        // GPU owner: create fresh each setup (disposed on layout switch or clear)
        if (!this.instancedShelfRenderer) {
            const games = DataManager.getInstance().get<unknown[]>('steam.games') ?? []
            const estimatedShelves = Math.max(200, Math.ceil(games.length / 9))
            this.instancedShelfRenderer = new InstancedShelfRenderer({ maxShelfUnits: estimatedShelves })
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

    private handleArrangementRequested(): void {
        this.instancedShelfRenderer?.reset()
        this.lastTotalBatches = 0
        StorePropsCoordinator.logger.info('Store props cleared for arrangement change')
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
        const roomWorldOffsetX = event.detail.centerOffset?.x ?? 0
        const roomWorldOffsetY = event.detail.centerOffset?.y ?? 0
        const roomWorldOffsetZ = event.detail.centerOffset
            ? event.detail.centerOffset.z + RoomConstants.STORE_FRONT_OFFSET
            : 0

        if (!this.scene) {
            this.scene = DataManager.getInstance().get<THREE.Scene>('core.mainScene')
        }

        if (!this.scene) {
            StorePropsCoordinator.logger.warn('Cannot place entrance mat - scene not available')
            return
        }

        // Guard: skip if dimensions haven't changed — avoids creating duplicate
        // PropRenderer instances and leaking materials on repeated room:resized events.
        if (this.entranceMat?.scale.x === dimensions.width &&
            this.entranceMat.scale.z === dimensions.depth &&
            this.entranceMat.position.x === roomWorldOffsetX &&
            this.entranceMat.position.y === roomWorldOffsetY &&
            this.entranceMat.position.z === roomWorldOffsetZ) {
            StorePropsCoordinator.logger.debug('Room dimensions unchanged — skipping entrance mat recreation')
            return
        }

        if (this.entranceMat) {
            this.scene.remove(this.entranceMat)
            this.entranceMat = null
        }

        const propRenderer = new PropRenderer(this.scene)
        this.entranceMat = propRenderer.createEntranceFloorMat(
            dimensions.width,
            dimensions.depth,
            this.buildEntranceMatOptions(dimensions)
        )
        this.entranceMat.position.set(roomWorldOffsetX, roomWorldOffsetY, roomWorldOffsetZ)
        this.scene.add(this.entranceMat)

        StorePropsCoordinator.logger.debug('Entrance mat placed at origin')
    }

    private buildEntranceMatOptions(dimensions: { width: number; depth: number }): EntranceMatOptions {
        const runnerWidth = AISLE_WIDTH_X
        const runnerDepth = this.getRunnerDepthMetres(dimensions.depth)

        return {
            width: runnerWidth,
            depth: runnerDepth,
        }
    }

    private getRunnerDepthMetres(roomDepthMetres: number): number {
        const runnerDepthRatio = (PERCENT_BASE - (2 * RUNNER_MARGIN_RATIO_PER_SIDE * PERCENT_BASE)) / PERCENT_BASE
        return Math.max(RUNNER_MIN_DEPTH_METRES, roomDepthMetres * runnerDepthRatio)
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

        this.eventManager.emit<StorePropsSetupRequestEvent>(StorePropsEventTypes.SetupRequest, {
            source: EventSource.System,
        })

        // Re-trigger arrangement pipeline from DataManager — no Steam API hit needed.
        // Emit manifest + definitions seams explicitly:
        // - LibraryManifestReady: immutable membership for capacity sizing
        // - GameDataReady: definitions-ready trigger for GameSorter
        // GameSorter will re-emit SectionsReady for the new layout mode.
        const games = DataManager.getInstance().get<unknown[]>('steam.games') ?? []

        if (games.length > 0) {
            const BATCH_SIZE = 18
            const totalBatches = Math.ceil(games.length / BATCH_SIZE)
            this.eventManager.emit<SteamLibraryManifestReadyEvent>(SteamEventTypes.LibraryManifestReady, {
                totalGames: games.length,
            })

            this.eventManager.emit<GameDataReadyEvent>(GameEventTypes.GameDataReady, {
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
