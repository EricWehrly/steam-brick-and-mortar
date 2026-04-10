import * as THREE from 'three'
import { EventManager } from '../../core/EventManager'
import { Logger } from '../../utils/Logger'
import {
    StorePropsEventTypes,
    type ShelfReadyEvent,
    type RendererReadyEvent,
} from '../../types/InteractionEvents'
import { InstancedShelfRenderer } from '../instancing/InstancedShelfRenderer'

/**
 * ShelfRenderer
 *
 * Owns the GPU-instanced shelf mesh lifecycle.
 *
 * Responsibilities:
 * - Instantiate and initialize InstancedShelfRenderer
 * - Write per-shelf transforms via createShelf()
 * - Emit ShelfReady after each shelf is placed
 * - Emit RendererReady once the GPU backing is initialized
 * - dispose() / reset() for scene teardown / reload
 *
 * GpuStorePropsRenderer retains layout position calculation and event
 * coordination (ShelfSpaceRequested → ShelfCreated); it delegates the
 * actual GPU write and readiness tracking here.
 */
export class ShelfRenderer {
    private static readonly logger = Logger.createLogFunctions(ShelfRenderer.name)

    private readonly instancedShelfRenderer: InstancedShelfRenderer
    private _isReady = false
    /** Callbacks waiting for RendererReady to fire. */
    private readonly readyQueue: Array<() => void> = []

    constructor(maxShelfUnits = 100) {
        this.instancedShelfRenderer = new InstancedShelfRenderer({ maxShelfUnits })
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    /**
     * Kick off async GPU initialization.
     * Emits RendererReady once done so GpuStorePropsRenderer (or any listener)
     * can start placing shelves.
     */
    public initialize(): void {
        this.instancedShelfRenderer.initialize().then(() => {
            this._isReady = true

            // Drain queued waiters before emitting the event so any synchronous
            // handlers in the queue see isReady === true immediately.
            while (this.readyQueue.length > 0) {
                this.readyQueue.shift()?.()
            }

            EventManager.getInstance().emit<RendererReadyEvent>(
                StorePropsEventTypes.RendererReady,
                { rendererType: 'shelf' }
            )
            ShelfRenderer.logger.debug('InstancedShelfRenderer ready — RendererReady emitted')
        }).catch(error => {
            ShelfRenderer.logger.error('Failed to initialize InstancedShelfRenderer:', error)
            throw error
        })
    }

    /** Returns true once GPU backing is ready for instance writes. */
    public isReady(): boolean {
        return this._isReady || this.instancedShelfRenderer.isReady()
    }

    /**
     * Resolves when the renderer is ready.
     * Resolves immediately if already ready.
     */
    public waitUntilReady(): Promise<void> {
        if (this.isReady()) return Promise.resolve()
        return new Promise<void>(resolve => this.readyQueue.push(resolve))
    }

    // ── Shelf placement ───────────────────────────────────────────────────────

    /**
     * Write a shelf instance transform and emit ShelfReady.
     * Must not be called before isReady() returns true.
     */
    public createShelf(shelfId: number, position: THREE.Vector3, rotationY: number): void {
        if (!this.isReady()) {
            ShelfRenderer.logger.error(`createShelf(${shelfId}) called before renderer was ready — skipping`)
            return
        }

        const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotationY, 0))
        this.instancedShelfRenderer.setInstance(shelfId, { position, rotation })

        EventManager.getInstance().emit<ShelfReadyEvent>(
            StorePropsEventTypes.ShelfReady,
            {
                shelfId,
                position: position.clone(),
                rotationY,
            }
        )
    }

    // ── Scene management ──────────────────────────────────────────────────────

    /** Clear all instance state (e.g. on scene reload). Does not re-initialize GPU. */
    public reset(): void {
        if (this.instancedShelfRenderer.isReady()) {
            this.instancedShelfRenderer.reset()
        }
    }

    public dispose(): void {
        this.instancedShelfRenderer.dispose()
        this._isReady = false
    }

    // ── Debug ─────────────────────────────────────────────────────────────────

    public getStats() {
        return this.instancedShelfRenderer.getStats()
    }
}
