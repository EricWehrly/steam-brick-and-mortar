/**
 * GpuStorePropsRenderer
 *
 * Lifecycle coordinator for the GPU-instanced store.
 *
 * OWNS:
 * - GpuGameBoxRenderer allocation (deferred until game count is known)
 * - GameBoxSpawner wiring (GameBoxSpawned → createGameBoxAuto)
 * - ShelfCreated emission (translates ShelfReady into full placement metadata)
 * - Progress reporting
 * - Props group in scene
 *
 * DOES NOT OWN:
 * - Layout math (→ ShelfLayoutCoordinator)
 * - Sign placement (→ SceneSignManager)
 * - Game sorting (→ GameSorter)
 */

import * as THREE from 'three'
import { GpuGameBoxRenderer } from './game-box/GpuGameBoxRenderer'
import type { IStorePropsRenderer, PropsConfig } from './IStorePropsRenderer'
import { ShelfSide } from './props/SharedPropsUtils'

import { EventManager } from '../core/EventManager'
import { GameEventTypes } from '../types/InteractionEvents'
import {
    BatchProcessingStatus,
    StorePropsEventTypes,
    type StorePropsProgressEvent,
    type SteamGamesBatchEvent,
    type ShelfLayoutDeterminedEvent,
    type BatchReadyForPlacementEvent,
    type ShelfCreatedEvent,
    type ShelfReadyEvent,
    type GameBoxSpawnedEvent,
} from '../types/InteractionEvents'
import { Logger } from '../utils/Logger'
import { PerformanceMonitor, ASYNC_CONTEXT } from '../utils/PerformanceMonitor'
import { BatchCoordinator } from './batch/BatchCoordinator'
import { GameBoxSpawner } from './spawning/GameBoxSpawner'
import type { SteamGameData } from './game-box/types/GameData'
import { ShelfLayoutCoordinator } from './shelves/ShelfLayoutCoordinator'
import { InstancedShelfRenderer } from './instancing/InstancedShelfRenderer'

export class GpuStorePropsRenderer implements IStorePropsRenderer {
    private static readonly logger = Logger.createLogFunctions(GpuStorePropsRenderer.name)

    private scene: THREE.Scene

    private gameBoxRenderer: GpuGameBoxRenderer | null = null
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

    private shelfBounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity }
    private shelfLayout: { rows: number; shelvesPerRow: number } = { rows: 0, shelvesPerRow: 0 }
    private cumulativeShelfCount = 0
    private totalShelves = 0

    private progressiveInitializationPromise: Promise<void> | null = null
    private setupPhaseInitialized = false
    private batchCoordinator: BatchCoordinator<SteamGamesBatchEvent>
    private readonly gameBoxSpawner: GameBoxSpawner

    private readonly instancedShelfRenderer: InstancedShelfRenderer
    private readonly shelfLayoutCoordinator: ShelfLayoutCoordinator

    constructor(scene: THREE.Scene) {
        this.scene = scene
        this.batchCoordinator = new BatchCoordinator<SteamGamesBatchEvent>()

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
        // First batch: allocate game box renderer sized to the library
        EventManager.getInstance().registerEventHandler(
            StorePropsEventTypes.BatchReadyForPlacement,
            this.handleInitialBatch.bind(this)
        )

        // Layout computed: cache bounds/layout for progress reporting and downstream use
        EventManager.getInstance().registerEventHandler(
            GameEventTypes.ShelfLayoutDetermined,
            (event: CustomEvent<ShelfLayoutDeterminedEvent>) => {
                this.shelfBounds = { ...event.detail.shelfBounds }
                this.shelfLayout = { ...event.detail.shelfLayout }
            }
        )

        // ShelfReady: GPU write done — emit ShelfCreated for GameBoxSpawner + SceneSignManager
        EventManager.getInstance().registerEventHandler(
            StorePropsEventTypes.ShelfReady,
            (event: CustomEvent<ShelfReadyEvent>) => this.handleShelfReady(event.detail)
        )

        // AllBatchesComplete: finalize
        EventManager.getInstance().registerEventHandler(
            GameEventTypes.AllBatchesComplete,
            this.handleAllBatchesComplete.bind(this)
        )

        GpuStorePropsRenderer.logger.debug('Event listeners registered')
    }

    private async handleInitialBatch(event: CustomEvent<BatchReadyForPlacementEvent>): Promise<void> {
        const { totalBatches } = event.detail
        this.totalShelves = totalBatches

        if (!this.batchCoordinator.isFirstBatchProcessing()) {
            return
        }

        if (!this.progressiveInitializationPromise) {
            this.progressiveInitializationPromise = (async () => {
                const monitor = PerformanceMonitor.start('renderer-initialization', GpuStorePropsRenderer.logger, ASYNC_CONTEXT)
                await this.initializeGameBoxRenderer(totalBatches)
                monitor.end({ totalBatches })
            })()
        }

        await this.progressiveInitializationPromise
    }

    private async initializeGameBoxRenderer(totalBatches: number): Promise<void> {
        const estimatedGames = totalBatches * 18
        this.gameBoxRenderer?.dispose()
        this.gameBoxRenderer = new GpuGameBoxRenderer(estimatedGames + 100)
        this.cumulativeShelfCount = 0
    }

    private handleShelfReady(detail: ShelfReadyEvent): void {
        const shelfId = detail.shelfId

        const progress = this.batchCoordinator.getProgress()
        EventManager.getInstance().emit<StorePropsProgressEvent>(StorePropsEventTypes.Progress, {
            step: 'shelves',
            current: shelfId + 1,
            total: this.totalShelves || progress.total,
            detail: `Placing shelf ${shelfId + 1}`,
        })

        this.cumulativeShelfCount++

        // Defer ShelfCreated emission to the next microtask.
        // ShelfReady fires synchronously inside the BatchReadyForPlacement dispatch;
        // GameBoxSpawner's BatchReadyForPlacement handler hasn't run yet at that point.
        // queueMicrotask lets all BatchReadyForPlacement handlers complete first,
        // so GameBoxSpawner has stored the pending games before ShelfCreated arrives.
        queueMicrotask(() => {
            EventManager.getInstance().emit<ShelfCreatedEvent>(
                StorePropsEventTypes.ShelfCreated,
                {
                    position: detail.position.clone(),
                    batchIndex: shelfId,
                    rowIndex: 0,   // not used downstream — consumers use batchIndex
                    shelfIndex: shelfId,
                    shelfRotationY: detail.rotationY,
                    bounds: { ...this.shelfBounds },
                    status: BatchProcessingStatus.ShelfCreated,
                    lastModified: Date.now(),
                }
            )
            GpuStorePropsRenderer.logger.debug(`ShelfCreated for shelf ${shelfId + 1}`)
        })
    }

    private handleAllBatchesComplete(): void {
        GpuStorePropsRenderer.logger.debug(`Progressive loading complete: ${this.cumulativeShelfCount} shelves`)
        this.batchCoordinator.reset()
        this.progressiveInitializationPromise = null
    }

    public async setupProps(config: PropsConfig = {}): Promise<void> {
        if (this.setupPhaseInitialized) return

        this.instancedShelfRenderer.initialize().catch(error => {
            console.error('❌ Failed to initialize InstancedShelfRenderer:', error)
        })

        EventManager.getInstance().registerEventHandler(
            StorePropsEventTypes.GameBoxSpawned,
            (event: CustomEvent<GameBoxSpawnedEvent>) => {
                if (!this.gameBoxRenderer) {
                    GpuStorePropsRenderer.logger.warn('GameBoxSpawned before gameBoxRenderer initialized')
                    return
                }
                const { game, position, side, rotation } = event.detail
                this.gameBoxRenderer.createGameBoxAuto(
                    game as SteamGameData,
                    position as THREE.Vector3,
                    side as ShelfSide,
                    rotation as THREE.Quaternion
                )
            }
        )

        this.setupPhaseInitialized = true
        this.config = { ...GpuStorePropsRenderer.DEFAULT_CONFIG, ...config }
    }

    public async addAtmosphericProps(): Promise<void> {
        console.warn('⚠️ addAtmosphericProps not implemented')
    }

    public clearProps(): void {
        this.instancedShelfRenderer.reset()

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
    }

    public dispose(): void {
        this.clearProps()
        this.gameBoxSpawner = undefined
        this.gameBoxRenderer?.dispose()
        this.gameBoxRenderer = null
        this.instancedShelfRenderer.dispose()
        this.shelfLayoutCoordinator.dispose()
        this.scene.remove(this.propsGroup)
        GpuStorePropsRenderer.logger.info('GpuStorePropsRenderer disposed')
    }

    public logMemoryStats(): void {
        this.gameBoxRenderer?.logMemoryStats()
    }
}
