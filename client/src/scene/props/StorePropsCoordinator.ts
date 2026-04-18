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
 * Activation is a side-effect of importing this module. No explicit init needed.
 */

import * as THREE from 'three'
import { EventManager, EventSource } from '../../core/EventManager'
import { Logger } from '../../utils/Logger'
import { hasWebGL2, hasInstancedArrays, hasHardwareRenderer, supportsLargeTextures } from '../../utils/SystemCapabilities'
import { GameEventTypes, RoomEventTypes, StorePropsEventTypes } from '../../types/InteractionEvents'
import type {
    StorePropsSetupRequestEvent,
    StorePropsSetupCompletedEvent,
    StorePropsClearRequestEvent,
} from './PropsEvents'
import type { RoomResizedEvent } from '../../types/InteractionEvents'
import type { BatchReadyForPlacementEvent } from '../../types/InteractionEvents'
import { BatchCoordinator } from '../batch/BatchCoordinator'
import { GameBoxSpawner } from '../spawning/GameBoxSpawner'
import { ShelfLayoutCoordinator } from '../shelves/ShelfLayoutCoordinator'
import { InstancedShelfRenderer } from '../instancing/InstancedShelfRenderer'
import { PropRenderer } from '../PropRenderer'

class StorePropsCoordinator {
    private static readonly logger = Logger.createLogFunctions(StorePropsCoordinator.name)

    private readonly eventManager: EventManager

    // Owned subsystems — null until SetupRequest fires
    private batchCoordinator: BatchCoordinator<unknown> | null = null
    private gameBoxSpawner: GameBoxSpawner | null = null
    private shelfLayoutCoordinator: ShelfLayoutCoordinator | null = null
    private instancedShelfRenderer: InstancedShelfRenderer | null = null
    private scene: THREE.Scene | null = null

    // Entrance mat — recreated on each RoomResized
    private entranceMat: THREE.Group | null = null

    // Tracks last-seen batch count to detect library switches
    private lastTotalBatches = 0

    static {
        new StorePropsCoordinator()
    }

    private constructor() {
        this.eventManager = EventManager.getInstance()

        const capable = this.checkCapabilities()
        if (!capable) {
            StorePropsCoordinator.logger.info('System lacks required GPU capabilities — store props coordinator not registered')
            return
        }

        this.eventManager.registerOverrideHandler(
            StorePropsEventTypes.SetupRequest,
            this.handleSetupRequest.bind(this)
        )
        this.eventManager.registerOverrideHandler(
            StorePropsEventTypes.ClearRequest,
            this.handleClearRequest.bind(this)
        )

        this.eventManager.registerEventHandler(
            StorePropsEventTypes.BatchReadyForPlacement,
            this.handleBatchReadyForPlacement.bind(this)
        )
        this.eventManager.registerEventHandler(
            RoomEventTypes.Resized,
            this.handleRoomResized.bind(this)
        )

        StorePropsCoordinator.logger.info('Registered — system is GPU capable')
    }

    private checkCapabilities(): boolean {
        const capable = hasWebGL2() && hasInstancedArrays() && hasHardwareRenderer()

        StorePropsCoordinator.logger.debug('Capability check:', {
            hasWebGL2: hasWebGL2(),
            hasInstancedArrays: hasInstancedArrays(),
            hasHardwareRenderer: hasHardwareRenderer(),
            supportsLargeTextures: supportsLargeTextures(),
        })

        if (capable && !supportsLargeTextures()) {
            StorePropsCoordinator.logger.warn('Large texture support missing — proceeding with potential performance impact')
        }

        return capable
    }

    private async handleSetupRequest(_event: CustomEvent<StorePropsSetupRequestEvent>): Promise<void> {
        const startTime = performance.now()

        // Resolve scene on first setup; reuse on subsequent calls (re-sort, etc.)
        if (!this.scene) {
            const { DataManager } = await import('../../core/data')
            this.scene = DataManager.getInstance().get<THREE.Scene>('core.mainScene')
            if (!this.scene) {
                StorePropsCoordinator.logger.warn('Main scene not available — store props setup aborted')
                return
            }
        }

        // Initialise subsystems exactly once. GameBoxSpawner is constructed early so it is
        // subscribed to BatchReadyForPlacement before any batches can arrive.
        if (!this.gameBoxSpawner) {
            this.batchCoordinator = new BatchCoordinator()
            this.gameBoxSpawner = new GameBoxSpawner()
            this.shelfLayoutCoordinator = new ShelfLayoutCoordinator()
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

    private handleClearRequest(_event: CustomEvent<StorePropsClearRequestEvent>): void {
        this.instancedShelfRenderer?.reset()
        this.gameBoxSpawner?.reset()
        this.batchCoordinator?.reset()
        this.lastTotalBatches = 0

        StorePropsCoordinator.logger.info('Store props cleared')
    }

    private handleBatchReadyForPlacement(event: CustomEvent<BatchReadyForPlacementEvent>): void {
        const { totalBatches } = event.detail

        // Detect library switch (e.g. anonymous → real user) and reset shelf geometry.
        if (this.lastTotalBatches > 0 && totalBatches !== this.lastTotalBatches) {
            StorePropsCoordinator.logger.debug(
                `Batch count changed (${this.lastTotalBatches} → ${totalBatches}) — resetting shelf renderer`
            )
            this.instancedShelfRenderer?.reset()
        }
        this.lastTotalBatches = totalBatches
    }

    private async handleRoomResized(event: CustomEvent<RoomResizedEvent>): Promise<void> {
        const { dimensions } = event.detail

        if (!this.scene) {
            // Scene may not be ready yet if room resizes before first SetupRequest
            const { DataManager } = await import('../../core/data')
            this.scene = DataManager.getInstance().get<THREE.Scene>('core.mainScene')
        }

        if (!this.scene) {
            StorePropsCoordinator.logger.warn('Cannot place entrance mat — scene not available')
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

    public dispose(): void {
        this.gameBoxSpawner?.dispose()
        this.instancedShelfRenderer?.dispose()
        this.shelfLayoutCoordinator?.dispose()

        if (this.entranceMat && this.scene) {
            this.scene.remove(this.entranceMat)
        }

        StorePropsCoordinator.logger.info('Disposed')
    }
}
