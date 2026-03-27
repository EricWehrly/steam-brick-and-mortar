/**
 * GpuStorePropsRenderer
 * 
 * ROLE: High-level coordinator for GPU-instanced store rendering.
 * Creates and wires up rendering components, provides public API for scene lifecycle.
 * 
 * OWNS:
 * - Component instantiation (BatchCoordinator, GameBoxSpawner, InstancedShelfRenderer)
 * - Props group in scene
 * - Store layout reference
 * 
 * RECEIVES (Events):
 * - BatchReadyForPlacement → Triggers renderer initialization on first batch
 * - ShelfSpaceRequested → Creates shelf and emits ShelfCreated
 * 
 * CURRENT ISSUES (see gpustoreprops-event-untangling.md):
 * - Still acts as middleman for some flows
 * - Owns shelf position calculation (should be in layout utility)
 * - Phase 3 refactoring in progress to remove remaining coordination
 * 
 * TODO: Eventually integrate with renderer selection system to choose between
 * LegacyStorePropsRenderer and this GPU version based on:
 * - Hardware capabilities (WebGL2 support)
 * - User preferences
 * - Performance requirements
 */

import * as THREE from 'three'
import { GpuGameBoxRenderer } from './game-box/GpuGameBoxRenderer'
import { InstancedShelfRenderer } from './instancing/InstancedShelfRenderer'
import type { IStorePropsRenderer, PropsConfig } from './IStorePropsRenderer'
import { VRLayoutUtils } from './props/SharedPropsUtils'

import { EventManager } from '../core/EventManager'
import { GameEventTypes } from '../types/InteractionEvents'
import { 
    BatchProcessingStatus,
    StorePropsEventTypes, 
    type InstancedBatchCompleteEvent,
    type StorePropsProgressEvent, 
    type SteamGamesBatchEvent,
    type ShelfLayoutDeterminedEvent,
    type BatchReadyForPlacementEvent,
    type ShelfSpaceRequestedEvent,
    type ShelfCreatedEvent,
    type RendererReadyEvent
} from '../types/InteractionEvents'
import { TestMode, getEnabledTests, isTestEnabled } from '../types/TestMode'
import { Logger } from '../utils/Logger'
import { PerformanceMonitor, ASYNC_CONTEXT } from '../utils/PerformanceMonitor'
import { BatchCoordinator } from './batch/BatchCoordinator'
import { GameBoxSpawner } from './spawning/GameBoxSpawner'

export class GpuStorePropsRenderer implements IStorePropsRenderer {
    private static readonly logger = Logger.createLogFunctions(GpuStorePropsRenderer.name)
    
    private scene: THREE.Scene

    private gameBoxRenderer: GpuGameBoxRenderer | null = null
    private propsGroup: THREE.Group
    private config: PropsConfig = {}

    private instancedShelfRenderer?: InstancedShelfRenderer
    private isShelfRendererReady: boolean = false
    private initializationQueue: Array<() => void> = []

    // Track actual shelf bounds for room sizing
    private shelfBounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity }
    
    // Track shelf layout for lighting fixture positioning
    private shelfLayout: { rows: number; shelvesPerRow: number } = { rows: 0, shelvesPerRow: 0 }
    
    // Track cumulative shelf count across rows (for correct game assignment)
    private cumulativeShelfCount: number = 0
    
    // Pre-calculated shelf positions (computed once when total shelf count known)
    private shelfPositions: THREE.Vector3[] = []
    private readonly maxShelvesPerRow: number = 4

    private progressiveInitializationPromise: Promise<void> | null = null
    private setupPhaseInitialized: boolean = false
    private batchCoordinator: BatchCoordinator<SteamGamesBatchEvent>
    private gameBoxSpawner?: GameBoxSpawner

    constructor(scene: THREE.Scene) {
        this.scene = scene

        // BatchCoordinator handles event-driven batch processing
        this.batchCoordinator = new BatchCoordinator<SteamGamesBatchEvent>()

        // GpuGameBoxRenderer allocation deferred until we know actual game count
        // Texture arrays are expensive - don't allocate VRAM until needed

        this.propsGroup = new THREE.Group()
        this.propsGroup.name = 'props-instanced'
        this.scene.add(this.propsGroup)

        this.setupEventListeners()
    }

    private initializeSetupPhase(): void {
        if (this.setupPhaseInitialized) {
            return
        }
        
        // Create GPU instanced shelf renderer
        this.instancedShelfRenderer = new InstancedShelfRenderer({
            maxShelfUnits: 100 // Allow up to 100 shelf units (47+ batches need this)
        })
        
        // Initialize eagerly - emits RendererReady event when complete
        this.instancedShelfRenderer.initialize().catch(error => {
            console.error('❌ Failed to initialize InstancedShelfRenderer:', error)
            throw error
        })

        // Bootstrap placement listeners before any batch data can enter the flow.
        this.gameBoxSpawner = new GameBoxSpawner()
        this.setupPhaseInitialized = true
    }
    
    private handleRendererReady(event: CustomEvent<RendererReadyEvent>): void {
        if (event.detail.rendererType !== 'shelf') return
        
        this.isShelfRendererReady = true
        console.log('✅ Shelf renderer ready via event')
        
        // Process any queued initialization callbacks
        while (this.initializationQueue.length > 0) {
            const callback = this.initializationQueue.shift()
            callback?.()
        }
    }

    private setupEventListeners(): void {
        // Listen for renderer ready events (Phase 3: replace polling)
        EventManager.getInstance().registerEventHandler(
            StorePropsEventTypes.RendererReady,
            this.handleRendererReady.bind(this)
        )
        
        // Listen for first batch to trigger initialization (creates GameBoxSpawner)
        EventManager.getInstance().registerEventHandler(
            StorePropsEventTypes.BatchReadyForPlacement,
            this.handleInitialBatch.bind(this)
        )
        
        // Listen for shelf space requests from GameBoxSpawner
        EventManager.getInstance().registerEventHandler(
            StorePropsEventTypes.ShelfSpaceRequested,
            this.handleShelfSpaceRequested.bind(this)
        )

        // Completion now comes from BatchCoordinator after GamesPlaced events
        EventManager.getInstance().registerEventHandler(
            GameEventTypes.AllBatchesComplete,
            this.handleAllBatchesComplete.bind(this)
        )
        
        GpuStorePropsRenderer.logger.debug('Registered listeners for batch processing and renderer ready events')
    }
    
    private async handleInitialBatch(event: CustomEvent<BatchReadyForPlacementEvent>): Promise<void> {
        const { totalBatches } = event.detail
        
        // Only handle the first batch for initialization
        if (!this.batchCoordinator.isFirstBatchProcessing()) {
            return
        }
        
        if (!this.progressiveInitializationPromise) {
            this.progressiveInitializationPromise = (async () => {
                // Initialize deferred GPU resources on first real data batch.
                const initMonitor = PerformanceMonitor.start('renderer-initialization', GpuStorePropsRenderer.logger, ASYNC_CONTEXT)
                await this.initializeForProgressiveLoading(totalBatches)
                initMonitor.end({ totalBatches })
            })()
        }

        await this.progressiveInitializationPromise
    }
    
    private async handleShelfSpaceRequested(event: CustomEvent<ShelfSpaceRequestedEvent>): Promise<void> {
        const { gamesCount, batchIndex } = event.detail

        // Guard against same-tick event races: placement work starts only after init is complete.
        if (this.progressiveInitializationPromise) {
            await this.progressiveInitializationPromise
        }
        
        // Create shelf for the requested batch
        const shelfMonitor = PerformanceMonitor.start('shelf-creation', GpuStorePropsRenderer.logger)
        await this.createShelfForBatchIndex(batchIndex)
        shelfMonitor.end({ batchIndex })
        
        EventManager.getInstance().emit<InstancedBatchCompleteEvent>(GameEventTypes.InstancedBatchComplete, {
            batchType: 'shelf',
            gameCount: gamesCount,
            batchIndex,
            status: BatchProcessingStatus.ShelfCreated,
            lastModified: Date.now()
        })
    }

    private handleAllBatchesComplete(): void {
        this.finalizeProgressiveLoading()
    }
    
    private async initializeForProgressiveLoading(totalBatches: number): Promise<void> {
        const estimatedGames = totalBatches * 18 // BATCH_SIZE from SteamIntegration

        this.gameBoxRenderer?.dispose()
        this.gameBoxRenderer = new GpuGameBoxRenderer(estimatedGames + 100)
        this.gameBoxSpawner?.setGameBoxRenderer(this.gameBoxRenderer)
        
        await this.waitForShelfRendererReady()
        
        this.shelfBounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity }
        this.cumulativeShelfCount = 0
        this.clearExistingShelves()
        
        this.preallocateShelfPositions(totalBatches)
    }
    
    private async waitForShelfRendererReady(): Promise<void> {
        if (!this.instancedShelfRenderer) {
            console.error('❌ No shelf renderer instance')
            return
        }
        
        // Fast path: Already ready
        if (this.isShelfRendererReady || this.instancedShelfRenderer.isReady()) {
            this.isShelfRendererReady = true
            return
        }
        
        // Wait for RendererReady event
        console.log('⏳ Waiting for RendererReady event...')
        return new Promise<void>((resolve) => {
            this.initializationQueue.push(resolve)
        })
    }
    
    private preallocateShelfPositions(totalShelves: number): void {
        this.shelfPositions = []
        
        for (let shelfIndex = 0; shelfIndex < totalShelves; shelfIndex++) {
            const row = Math.floor(shelfIndex / this.maxShelvesPerRow)
            const shelfInRow = shelfIndex % this.maxShelvesPerRow
            
            const shelfSpacing = VRLayoutUtils.calculateOptimalShelfSpacing(this.maxShelvesPerRow)
            const startX = -(this.maxShelvesPerRow - 1) * shelfSpacing / 2
            const rowZ = VRLayoutUtils.calculateOptimalRowPosition(row)
            
            const position = new THREE.Vector3(
                startX + (shelfInRow * shelfSpacing),
                0,
                rowZ
            )
            
            this.shelfPositions.push(position)
        }
        
        this.calculateShelfBoundsAndLayout(totalShelves)
    }
    
    private calculateShelfBoundsAndLayout(totalShelves: number): void {
        const shelfWidth = 2.0
        const shelfDepth = 1.0
        
        for (const position of this.shelfPositions) {
            this.shelfBounds.minX = Math.min(this.shelfBounds.minX, position.x - shelfWidth / 2)
            this.shelfBounds.maxX = Math.max(this.shelfBounds.maxX, position.x + shelfWidth / 2)
            this.shelfBounds.minZ = Math.min(this.shelfBounds.minZ, position.z - shelfDepth / 2)
            this.shelfBounds.maxZ = Math.max(this.shelfBounds.maxZ, position.z + shelfDepth / 2)
        }
        
        this.shelfLayout.rows = Math.ceil(totalShelves / this.maxShelvesPerRow)
        this.shelfLayout.shelvesPerRow = this.maxShelvesPerRow
        
        // Emit layout as soon as we know it (no need to wait for batches to finish loading)
        EventManager.getInstance().emit<ShelfLayoutDeterminedEvent>(
            GameEventTypes.ShelfLayoutDetermined,
            {
                shelfBounds: { ...this.shelfBounds },
                shelfLayout: { ...this.shelfLayout }
            }
        )
        GpuStorePropsRenderer.logger.debug(
            `Shelf layout determined: ${this.shelfLayout.rows} rows × ${this.shelfLayout.shelvesPerRow} shelves`
        )
    }
    
    private ensureShelfPositionAllocated(batchIndex: number): void {
        if (batchIndex < this.shelfPositions.length) {
            return
        }
        
        const oldLength = this.shelfPositions.length
        const progress = this.batchCoordinator.getProgress()
        console.warn(`⚠️ BATCH COUNT MISMATCH: Received batch ${batchIndex + 1} but only allocated ${oldLength} positions`)
        console.warn(`   Expected: ${progress.total}, Actual: >${batchIndex + 1}. Expanding...`)
        this.preallocateShelfPositions(batchIndex + 1)
    }
    
    private async createShelfForBatchIndex(batchIndex: number): Promise<void> {
        const isReady = this.instancedShelfRenderer?.isReady()
        if (!isReady) {
            console.error(`❌ InstancedShelfRenderer not ready for batch ${batchIndex + 1}!`)
            console.error('   Renderer state:', {
                exists: !!this.instancedShelfRenderer,
                isReady: isReady,
                stats: this.instancedShelfRenderer?.getStats()
            })
            return
        }
        
        this.ensureShelfPositionAllocated(batchIndex)
        const shelfPosition = this.shelfPositions[batchIndex]
        
        if (!shelfPosition) {
            console.error(`❌ CRITICAL: Shelf position ${batchIndex} is undefined even after allocation!`)
            return
        }
        
        const progress = this.batchCoordinator.getProgress()
        EventManager.getInstance().emit<StorePropsProgressEvent>(StorePropsEventTypes.Progress, {
            step: 'shelves',
            current: batchIndex + 1,
            total: progress.total,
            detail: `Creating shelf ${batchIndex + 1}/${progress.total}`
        })
        
        // Create shelf without games (GameBoxSpawner will place them)
        this.createInstancedShelf(shelfPosition, Math.floor(batchIndex / this.maxShelvesPerRow), batchIndex % this.maxShelvesPerRow)
        this.cumulativeShelfCount++
        
        // Emit ShelfCreated event for GameBoxSpawner to place games
        EventManager.getInstance().emit<ShelfCreatedEvent>(
            StorePropsEventTypes.ShelfCreated,
            {
                position: shelfPosition.clone(),
                batchIndex: batchIndex,
                bounds: { ...this.shelfBounds },
                status: BatchProcessingStatus.ShelfCreated,
                lastModified: Date.now()
            }
        )
        GpuStorePropsRenderer.logger.debug(`Emitted ShelfCreated for batch ${batchIndex + 1}`)
    }
    
    private finalizeProgressiveLoading(): void {
        console.debug(`✅ Progressive loading complete: ${this.cumulativeShelfCount} shelves created`)

        this.resetBatchState()
    }
    
    private resetBatchState(): void {
        this.batchCoordinator.reset()
        this.progressiveInitializationPromise = null
    }

    public async setupProps(config: PropsConfig = {}): Promise<void> {
        this.initializeSetupPhase()
        this.config = { ...this.getDefaultConfig(), ...config }
        
        // Initialize test objects if requested
        if (this.config.tests) {
            this.initializeTestObjects(this.config.tests)
        }
    }

    private initializeTestObjects(testsConfig: unknown[] | Record<string, string>): void {
        const testsSettings = Array.isArray(testsConfig) ? {} : testsConfig as Record<string, string>
        const enabledTests = getEnabledTests(testsSettings)
        
        if (enabledTests.length > 0 && isTestEnabled(testsSettings, TestMode.SPAWN_TEST_OBJECTS)) {
            const geometry = new THREE.BoxGeometry(0.2, 0.2, 0.2)
            const material = new THREE.MeshPhongMaterial({ color: 0x0099ff })
            const cube = new THREE.Mesh(geometry, material)
            cube.position.set(2, 0, -1)
            cube.castShadow = true
            cube.name = 'test-cube-gpu'
            this.propsGroup.add(cube)
        }
    }

    private getDefaultConfig(): PropsConfig {
        return {
            enableShelves: true,
            enableGameBoxes: true,
            enableSignage: true,
            performance: {
                maxTextureSize: 1024,
                nearDistance: 2.0,
                farDistance: 10.0,
                maxActiveTextures: 50,
                frustumCullingEnabled: true
            }
        }
    }

    public async addAtmosphericProps(): Promise<void> {
        // TODO: PropRenderer not instantiated - this method is currently non-functional
        console.warn('⚠️ addAtmosphericProps not implemented - PropRenderer not instantiated')
    }

    public updatePerformanceData(_camera: THREE.Camera): void {
        if (this.instancedShelfRenderer?.isReady()) {
            this.instancedShelfRenderer.updateGPU()
        }
    }

    private clearExistingShelves(): void {
        // Clear instanced shelf renderer state
        if (this.instancedShelfRenderer?.isReady()) {
            this.instancedShelfRenderer.reset()
        }
    }

    private createInstancedShelf(
        position: THREE.Vector3, 
        rowIndex: number, 
        shelfIndex: number
    ): void {
        // Add shelf instance at position
        const globalShelfIndex = rowIndex * 4 + shelfIndex
        
        this.instancedShelfRenderer.setInstance(globalShelfIndex, {
            position: position
        })
    }



    public clearProps(): void {
        this.clearExistingShelves()
        
        while (this.propsGroup.children.length > 0) {
            const child = this.propsGroup.children[0]
            this.propsGroup.remove(child)
            
            if (child instanceof THREE.Mesh) {
                child.geometry?.dispose()
                if (child.material instanceof THREE.Material) {
                    child.material.dispose()
                } else if (Array.isArray(child.material)) {
                    child.material.forEach(mat => mat.dispose())
                }
            }
        }
    }

    public dispose(): void {
        this.clearProps()
        this.gameBoxSpawner = undefined
        
        // Dispose game box renderer and its GPU resources
        this.gameBoxRenderer?.dispose()
        this.gameBoxRenderer = null
        
        this.instancedShelfRenderer?.dispose()
        
        this.scene.remove(this.propsGroup)
        
        console.info('GpuStorePropsRenderer disposed')
    }
    
    public getArtworkMemoryStats() {
        return this.gameBoxRenderer?.getMemoryStats() ?? null
    }
    
    public logMemoryStats(): void {
        this.gameBoxRenderer?.logMemoryStats()
    }
}