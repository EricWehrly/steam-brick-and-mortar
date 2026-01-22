/**
 * GPU Store Props Renderer - GPU-instanced shelves and game boxes
 * 
 * Uses InstancedShelfRenderer and GpuGameBoxRenderer for minimal draw calls.
 * Handles progressive batch loading of Steam games.
 * 
 * TODO: Eventually integrate with renderer selection system to choose between
 * LegacyStorePropsRenderer and this GPU version based on:
 * - Hardware capabilities (WebGL2 support)
 * - User preferences
 * - Performance requirements
 */

import * as THREE from 'three'
import { StoreLayout } from './StoreLayout'
import { GpuGameBoxRenderer } from './game-box/GpuGameBoxRenderer'
import { SignageRenderer } from './SignageRenderer'
import { InstancedShelfRenderer } from './instancing/InstancedShelfRenderer'
import type { IStorePropsRenderer, PropsConfig } from './IStorePropsRenderer'
import { GameLayoutConstants, VRLayoutUtils } from './props/SharedPropsUtils'

import { EventManager } from '../core/EventManager'
import { GameEventTypes } from '../types/InteractionEvents'
import { 
    StorePropsEventTypes, 
    type StorePropsProgressEvent, 
    type SteamGamesBatchEvent, 
    type AllBatchesCompleteEvent,
    type BatchReadyForPlacementEvent,
    type ShelfSpaceRequestedEvent,
    type ShelfCreatedEvent
} from '../types/InteractionEvents'
import type { SteamGameData } from './game-box/types/GameData'
import { TestMode, getEnabledTests, isTestEnabled } from '../types/TestMode'
import type { SteamGame } from '../steam'
import { Logger } from '../utils/Logger'
import { PerformanceMonitor, ASYNC_CONTEXT } from '../utils/PerformanceMonitor'
import { BatchCoordinator } from './batch/BatchCoordinator'
import { GameBoxSpawner } from './spawning/GameBoxSpawner'

export class GpuStorePropsRenderer implements IStorePropsRenderer {
    private static readonly logger = Logger.createLogFunctions(GpuStorePropsRenderer.name)
    
    private scene: THREE.Scene

    private storeLayout: StoreLayout
    private gameBoxRenderer: GpuGameBoxRenderer | null = null
    private signageRenderer: SignageRenderer
    private propsGroup: THREE.Group
    private config: PropsConfig = {}
    private currentStoreGroup: THREE.Group | null = null // Track current store environment

    private instancedShelfRenderer?: InstancedShelfRenderer

    // Track objects we create for proper cleanup
    private createdGameBoxes: THREE.Object3D[] = []
    private createdStoreObjects: THREE.Object3D[] = []
    
    // Track actual shelf bounds for room sizing
    private shelfBounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity }
    
    // Track shelf layout for lighting fixture positioning
    private shelfLayout: { rows: number; shelvesPerRow: number } = { rows: 0, shelvesPerRow: 0 }
    
    // Track cumulative shelf count across rows (for correct game assignment)
    private cumulativeShelfCount: number = 0
    
    // Pre-calculated shelf positions (computed once when total shelf count known)
    private shelfPositions: THREE.Vector3[] = []
    private readonly maxShelvesPerRow: number = 4
    
    private progressiveLoadingCompleted: boolean = false
    private games: SteamGameData[] = []
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
        
        this.initializeRenderers()
        
        this.setupEventListeners()
    }

    private initializeRenderers(): void {
        this.storeLayout = new StoreLayout(this.scene)
        this.signageRenderer = new SignageRenderer()
        
        // Create GPU instanced shelf renderer
        this.instancedShelfRenderer = new InstancedShelfRenderer({
            maxShelfUnits: 100 // Allow up to 100 shelf units (47+ batches need this)
        })
        
        // Initialize shelf renderer eagerly to avoid blocking when batches arrive
        this.instancedShelfRenderer.initialize().catch(error => {
            console.error('❌ Failed to initialize InstancedShelfRenderer:', error)
        })
    }

    private setupEventListeners(): void {
        // Listen for first batch to trigger initialization (creates GameBoxSpawner)
        EventManager.getInstance().registerEventHandler(
            StorePropsEventTypes.BatchReadyForPlacement,
            this.handleInitialBatch.bind(this)
        );
        
        // Listen for shelf space requests from GameBoxSpawner
        EventManager.getInstance().registerEventHandler(
            StorePropsEventTypes.ShelfSpaceRequested,
            this.handleShelfSpaceRequested.bind(this)
        );
        
        GpuStorePropsRenderer.logger.debug('Registered listeners for batch processing events');
    }
    
    /**
     * Handle first BatchReadyForPlacement to initialize renderers
     * After initialization, GameBoxSpawner takes over handling these events
     */
    private async handleInitialBatch(event: CustomEvent<BatchReadyForPlacementEvent>): Promise<void> {
        const { totalBatches, batchIndex, games } = event.detail
        
        // Only handle the first batch for initialization
        if (!this.batchCoordinator.isFirstBatchProcessing()) {
            return
        }
        
        // Initialize renderers (creates GameBoxSpawner which will handle subsequent batches)
        const initMonitor = PerformanceMonitor.start('renderer-initialization', GpuStorePropsRenderer.logger, ASYNC_CONTEXT)
        await this.initializeForProgressiveLoading(totalBatches)
        initMonitor.end({ totalBatches })
        
        // Re-emit the first batch event so newly-created GameBoxSpawner can process it
        // GameBoxSpawner was just created, so it missed this event
        EventManager.getInstance().emit<BatchReadyForPlacementEvent>(
            StorePropsEventTypes.BatchReadyForPlacement,
            { games, batchIndex, totalBatches }
        )
        GpuStorePropsRenderer.logger.debug(`Re-emitted first batch (${batchIndex}) for GameBoxSpawner`)
    }
    
    /**
     * Handle ShelfSpaceRequested event from GameBoxSpawner
     * Creates shelf in response to request, then emits ShelfCreated event
     */
    private async handleShelfSpaceRequested(event: CustomEvent<ShelfSpaceRequestedEvent>): Promise<void> {
        const { gamesCount: _gamesCount, batchIndex } = event.detail
        
        // Create shelf for the requested batch
        const shelfMonitor = PerformanceMonitor.start('shelf-creation', GpuStorePropsRenderer.logger)
        await this.createShelfForBatchIndex(batchIndex)
        shelfMonitor.end({ batchIndex })
        
        EventManager.getInstance().emit(GameEventTypes.InstancedBatchComplete)
        
        // Check if all batches complete - if so, finalize and emit AllBatchesComplete
        const progress = this.batchCoordinator.getProgress()
        if (progress.isComplete) {
            this.finalizeProgressiveLoading()
        }
    }
    
    private steamGameToGameData(game: Readonly<SteamGame>): SteamGameData {
        return {
            appid: game.appid,
            name: game.name,
            playtime_forever: game.playtime_forever || 0,
            artwork: game.artwork
        }
    }
    
    private async initializeForProgressiveLoading(totalBatches: number): Promise<void> {
        this.progressiveLoadingCompleted = false
        
        const estimatedGames = totalBatches * 18 // BATCH_SIZE from SteamIntegration
        
        this.gameBoxRenderer?.dispose()
        this.gameBoxRenderer = new GpuGameBoxRenderer(estimatedGames + 100)
        this.gameBoxSpawner = new GameBoxSpawner(this.gameBoxRenderer)
        
        await this.waitForShelfRendererReady()
        
        this.shelfBounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity }
        this.cumulativeShelfCount = 0
        this.clearExistingShelves()
        
        this.preallocateShelfPositions(totalBatches)
    }
    
    private async waitForShelfRendererReady(): Promise<void> {
        if (!this.instancedShelfRenderer || this.instancedShelfRenderer.isReady()) {
            return
        }
        
        console.warn('⏳ Waiting for InstancedShelfRenderer to be ready...')
        const waitStart = Date.now()
        let attempts = 0
        
        while (!this.instancedShelfRenderer.isReady()) {
            await new Promise(resolve => setTimeout(resolve, 50))
            attempts++
            
            if (attempts % 20 === 0) {
                console.warn(`⏳ Still waiting for renderer... (${attempts * 50}ms)`)
            }
            
            if (Date.now() - waitStart > 10000) {
                console.error('❌ Shelf renderer init timeout after 10s')
                break
            }
        }
        
        if (this.instancedShelfRenderer.isReady()) {
            console.log(`✅ Renderer ready after ${Date.now() - waitStart}ms`)
        }
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
    
    /**
     * Create shelf for a specific batch index (called in response to ShelfSpaceRequested)
     */
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
        this.createInstancedShelf(shelfPosition, [], Math.floor(batchIndex / this.maxShelvesPerRow), batchIndex % this.maxShelvesPerRow)
        this.cumulativeShelfCount++
        
        // Emit ShelfCreated event for GameBoxSpawner to place games
        EventManager.getInstance().emit<ShelfCreatedEvent>(
            StorePropsEventTypes.ShelfCreated,
            {
                position: shelfPosition.clone(),
                batchIndex: batchIndex,
                bounds: { ...this.shelfBounds }
            }
        )
        GpuStorePropsRenderer.logger.debug(`Emitted ShelfCreated for batch ${batchIndex + 1}`)
    }
    
    private finalizeProgressiveLoading(): void {
        console.debug(`✅ Progressive loading complete: ${this.games.length} games on ${this.cumulativeShelfCount} shelves`)
        
        this.progressiveLoadingCompleted = true
        
        EventManager.getInstance().emit<AllBatchesCompleteEvent>(GameEventTypes.AllBatchesComplete, {
            shelfBounds: { ...this.shelfBounds },
            shelfLayout: { ...this.shelfLayout }
        })
        
        this.resetBatchState()
    }
    
    private resetBatchState(): void {
        this.games = []
        this.batchCoordinator.reset()
    }

    public async setupProps(config: PropsConfig = {}): Promise<void> {
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
        // Remove all tracked game boxes
        this.createdGameBoxes.forEach(gameBox => {
            this.scene.remove(gameBox)
            // Dispose geometry and materials
            if (gameBox instanceof THREE.Mesh) {
                gameBox.geometry?.dispose()
                if (gameBox.material instanceof THREE.Material) {
                    gameBox.material.dispose()
                } else if (Array.isArray(gameBox.material)) {
                    gameBox.material.forEach(mat => mat.dispose())
                }
            }
        })
        this.createdGameBoxes = []

        // Remove all tracked store objects
        this.createdStoreObjects.forEach(obj => {
            this.scene.remove(obj)
            if (obj instanceof THREE.Group) {
                obj.clear()
            }
        })
        this.createdStoreObjects = []

        // Clear instanced shelf renderer state
        if (this.instancedShelfRenderer?.isReady()) {
            this.instancedShelfRenderer.reset()
        }
    }

    private async createInstancedShelfRow(rowIndex: number, shelfCount: number, _totalRows: number, games: SteamGameData[] = []): Promise<void> {
        if (!this.instancedShelfRenderer?.isReady()) {
            console.error('❌ InstancedShelfRenderer not ready - cannot create instanced shelf row')
            return
        }

        // VR-optimized spacing calculations
        const shelfSpacing = VRLayoutUtils.calculateOptimalShelfSpacing(shelfCount)
        const startX = -(shelfCount - 1) * shelfSpacing / 2 // Center the row
        const rowZ = VRLayoutUtils.calculateOptimalRowPosition(rowIndex) // VR-friendly row positioning
        
        const shelfWidth = 2.0
        const shelfDepth = 1.0
        
        for (let i = 0; i < shelfCount; i++) {
            const shelfPosition = new THREE.Vector3(
                startX + (i * shelfSpacing),
                0,
                rowZ
            )
            
            this.shelfBounds.minX = Math.min(this.shelfBounds.minX, shelfPosition.x - shelfWidth / 2)
            this.shelfBounds.maxX = Math.max(this.shelfBounds.maxX, shelfPosition.x + shelfWidth / 2)
            this.shelfBounds.minZ = Math.min(this.shelfBounds.minZ, shelfPosition.z - shelfDepth / 2)
            this.shelfBounds.maxZ = Math.max(this.shelfBounds.maxZ, shelfPosition.z + shelfDepth / 2)
            
            // Calculate which games belong to this shelf
            const gamesPerShelf = GameLayoutConstants.GAMES_PER_SURFACE * GameLayoutConstants.SURFACES_PER_SHELF;
            const shelfGlobalIndex = this.cumulativeShelfCount + i // Use cumulative count, not rowIndex * 4
            const startGameIndex = shelfGlobalIndex * gamesPerShelf
            const shelfGames = games.slice(startGameIndex, startGameIndex + gamesPerShelf)
            
            this.createInstancedShelf(shelfPosition, shelfGames, rowIndex, i)
        }
        
        // Update cumulative count after processing this row
        this.cumulativeShelfCount += shelfCount
    }

    private createInstancedShelf(
        position: THREE.Vector3, 
        games: SteamGameData[], 
        rowIndex: number, 
        shelfIndex: number
    ): void {
        // Add shelf instance at position
        const globalShelfIndex = rowIndex * 4 + shelfIndex
        
        this.instancedShelfRenderer.setInstance(globalShelfIndex, {
            position: position
        })
        
        if (games.length > 0) {
            this.gameBoxSpawner?.spawnGamesOnShelf(position, games, rowIndex, shelfIndex)
        }
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
        this.signageRenderer?.dispose()
        this.storeLayout?.dispose()
        
        this.instancedShelfRenderer?.dispose()
        
        if (this.currentStoreGroup) {
            this.scene.remove(this.currentStoreGroup)
            // TODO: Dispose materials and geometries properly
            this.currentStoreGroup = null
        }
        
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