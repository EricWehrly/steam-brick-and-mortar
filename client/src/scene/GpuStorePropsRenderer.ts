/**
 * GpuStorePropsRenderer
 *
 * Lifecycle coordinator for the GPU-instanced store.
 *
 * OWNS:
 * - Props group in scene
 * - Shelf renderer and layout coordinator
 * - GameBoxSpawner (which owns GpuGameBoxRenderer)
 *
 * DOES NOT OWN:
 * - GpuGameBoxRenderer directly (delegated to GameBoxSpawner)
 * - Layout math (→ ShelfLayoutCoordinator)
 * - Sign placement (→ SceneSignManager)
 * - Game sorting (→ GameSorter)
 */

import * as THREE from 'three'
import type { IStorePropsRenderer, PropsConfig } from './IStorePropsRenderer'

import { EventManager } from '../core/EventManager'
import { GameEventTypes } from '../types/InteractionEvents'
import {
    StorePropsEventTypes,
} from '../types/InteractionEvents'
import { Logger } from '../utils/Logger'
import { BatchCoordinator } from './batch/BatchCoordinator'
import { GameBoxSpawner } from './spawning/GameBoxSpawner'
import { ShelfLayoutCoordinator } from './shelves/ShelfLayoutCoordinator'
import { InstancedShelfRenderer } from './instancing/InstancedShelfRenderer'

export class GpuStorePropsRenderer implements IStorePropsRenderer {
    private static readonly logger = Logger.createLogFunctions(GpuStorePropsRenderer.name)

    private scene: THREE.Scene

    private propsGroup: THREE.Group
    private config: PropsConfig = {}

    private static readonly DEFAULT_CONFIG: PropsConfig = Object.freeze({
        enableShelves: true,
        enableGameBoxes: true,
        enableSignage: true,
        performance: Object.freeze({
            maxTextureSize: 1024,
            nearDistance: 2.0,
            farDistance: 10.0,
            frustumCullingEnabled: true,
        })
    })

    private setupPhaseInitialized = false
    private readonly instancedShelfRenderer: InstancedShelfRenderer
    private readonly shelfLayoutCoordinator: ShelfLayoutCoordinator
    private readonly batchCoordinator: BatchCoordinator<unknown>
    private readonly gameBoxSpawner: GameBoxSpawner

    constructor(scene: THREE.Scene) {
        this.scene = scene
        // Owns GamesBatchReady -> BatchReadyForPlacement queueing + completion signaling.
        this.batchCoordinator = new BatchCoordinator()

        this.propsGroup = new THREE.Group()
        this.propsGroup.name = 'props-instanced'
        this.scene.add(this.propsGroup)

        this.instancedShelfRenderer = new InstancedShelfRenderer()
        this.shelfLayoutCoordinator = new ShelfLayoutCoordinator()
        // Construct immediately so it's subscribed to BatchReadyForPlacement
        // before any batches can arrive. Previously constructed in setupProps()
        // which could run after batches had already fired, causing all
        // "No pending games" warnings.
        this.gameBoxSpawner = new GameBoxSpawner()

        this.setupEventListeners()
    }

    private setupEventListeners(): void {
        // Shelf renderer reset: detect batch count change (e.g. anonymous → real user).
        EventManager.getInstance().registerEventHandler(
            StorePropsEventTypes.BatchReadyForPlacement,
            this.handleInitialBatch.bind(this)
        )

        // AllBatchesComplete: finalize
        EventManager.getInstance().registerEventHandler(
            GameEventTypes.AllBatchesComplete,
            this.handleAllBatchesComplete.bind(this)
        )

        GpuStorePropsRenderer.logger.debug('Event listeners registered')
    }

    private lastTotalBatches: number = 0

    private handleInitialBatch(event: CustomEvent<{ totalBatches: number }>): void {
        const { totalBatches } = event.detail

        // Reset shelf renderer when library switches (e.g. anonymous → real user).
        // Without this, shelf 0's pre-existing instance uses the wrong path, leaving
        // horizontal shelf boards in the wrong state.
        if (this.lastTotalBatches > 0 && totalBatches !== this.lastTotalBatches) {
            GpuStorePropsRenderer.logger.debug(
                `Batch count changed (${this.lastTotalBatches} → ${totalBatches}) — resetting shelf renderer`
            )
            this.instancedShelfRenderer.reset()
        }
        this.lastTotalBatches = totalBatches
    }

    private handleAllBatchesComplete(): void {
        GpuStorePropsRenderer.logger.debug('Progressive loading complete')
    }

    public async setupProps(config: PropsConfig = {}): Promise<void> {
        if (this.setupPhaseInitialized) return

        this.instancedShelfRenderer.initialize().catch(error => {
            console.error('❌ Failed to initialize InstancedShelfRenderer:', error)
        })

        this.setupPhaseInitialized = true
        this.config = { ...GpuStorePropsRenderer.DEFAULT_CONFIG, ...config }
    }

    public async addAtmosphericProps(): Promise<void> {
        console.warn('⚠️ addAtmosphericProps not implemented')
    }

    public clearProps(): void {
        // Clear shelf geometry
        this.instancedShelfRenderer.reset()

        // Reset the spawner — disposes the renderer it owns and clears state
        this.gameBoxSpawner.reset()

        this.batchCoordinator.reset()

        while (this.propsGroup.children.length > 0) {
            const child = this.propsGroup.children[0]
            this.propsGroup.remove(child)
            if (child instanceof THREE.Mesh) {
                child.geometry?.dispose()
                if (child.material instanceof THREE.Material) {
                    child.material.dispose()
                } else if (Array.isArray(child.material)) {
                    child.material.forEach(m => m.dispose())
                }
            }
        }

        GpuStorePropsRenderer.logger.info('Store props cleared')
    }

    public dispose(): void {
        this.clearProps()
        this.gameBoxSpawner.dispose()
        this.instancedShelfRenderer.dispose()
        this.shelfLayoutCoordinator.dispose()
        this.scene.remove(this.propsGroup)
        GpuStorePropsRenderer.logger.info('GpuStorePropsRenderer disposed')
    }
}
