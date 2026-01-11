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
import { ShelfSide } from './props/SharedPropsUtils'
import type { IStorePropsRenderer, PropsConfig } from './IStorePropsRenderer'
import { GameLayoutConstants, VRLayoutUtils, GameBoxUtils, ShelfSurfaceUtils, type ShelfSurface } from './props/SharedPropsUtils'

import { EventManager } from '../core/EventManager'
import { GameEventTypes, SteamEventTypes } from '../types/InteractionEvents'
import { StorePropsEventTypes, type StorePropsProgressEvent, type SteamGamesBatchEvent, type AllBatchesCompleteEvent } from '../types/InteractionEvents'
import { DataManager } from '../core/data'
import type { SteamGameData } from './game-box/types/GameData'
import { TestMode, getEnabledTests, isTestEnabled } from '../types/TestMode'
import type { SteamGame } from '../steam'
import { Logger } from '../utils/Logger'

export class GpuStorePropsRenderer implements IStorePropsRenderer {
    private static readonly logger = Logger.createLogFunctions(GpuStorePropsRenderer.name)
    
    private scene: THREE.Scene
    private dataManager: DataManager

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
    
    // Track progressive batch state
    private batchesReceived: number = 0
    private totalExpectedBatches: number = 0
    private allBatchGames: SteamGameData[] = []
    private isFirstBatch: boolean = true
    
    // Track whether progressive loading completed for this load cycle
    // This flag prevents DataLoaded from triggering duplicate generation after AllBatchesComplete
    // It stays true until explicitly cleared by the next load request
    private progressiveLoadingCompleted: boolean = false
    
    // Batch queue for serialized processing (prevents race conditions)
    private batchQueue: SteamGamesBatchEvent[] = []
    private isProcessingBatch: boolean = false
    
    // Timing tracking for debug logging
    private batchTimings: { batchIndex: number; duration: number; mainThreadTime: number }[] = []
    private progressiveLoadStartTime: number = 0
    private totalMainThreadTime: number = 0

    constructor(scene: THREE.Scene, dataManager: DataManager) {
        this.scene = scene
        this.dataManager = dataManager

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
            maxShelfUnits: 50 // Allow up to 50 shelf units
        })
        
        // Initialize shelf renderer eagerly to avoid blocking when batches arrive
        this.instancedShelfRenderer.initialize().catch(error => {
            console.error('❌ Failed to initialize InstancedShelfRenderer:', error)
        })
    }

    private setupEventListeners(): void {
        // Listen for game batches for progressive rendering
        EventManager.getInstance().registerEventHandler(
            SteamEventTypes.GamesBatchReady, 
            this.handleGamesBatch.bind(this)
        );
        // Keep DataLoaded listener for backward compatibility and final room sizing
        EventManager.getInstance().registerEventHandler(
            SteamEventTypes.DataLoaded, 
            this.handleDataLoaded.bind(this)
        );
        // Reset our batch state when all batches complete
        EventManager.getInstance().registerEventHandler(
            GameEventTypes.AllBatchesComplete,
            this.resetBatchState.bind(this)
        );
    }
    
    /**
     * Handle incoming batch of games - queues for serialized processing
     * Events may arrive faster than we can process, so we queue them and process one at a time
     */
    private handleGamesBatch(event: CustomEvent<SteamGamesBatchEvent>): void {
        // Add to queue
        this.batchQueue.push(event.detail)
        
        // Start processing if not already processing
        if (!this.isProcessingBatch) {
            this.processBatchQueue()
        }
    }
    
    /**
     * Process batches from queue one at a time (serialized)
     */
    private async processBatchQueue(): Promise<void> {
        if (this.isProcessingBatch || this.batchQueue.length === 0) return
        
        this.isProcessingBatch = true
        
        while (this.batchQueue.length > 0) {
            this.batchQueue.sort((a, b) => a.batchIndex - b.batchIndex)
            const batch = this.batchQueue.shift()
            if (!batch) break
            
            await this.processOneBatch(batch)
        }
        
        this.isProcessingBatch = false
    }
    
    /**
     * Process a single batch of games
     */
    private async processOneBatch(batchEvent: SteamGamesBatchEvent): Promise<void> {
        const batchStartTime = performance.now()
        const { games, batchIndex, totalBatches } = batchEvent
        
        const mainThreadStart = performance.now()
        const batchGames = games.map(g => this.steamGameToGameData(g))
        this.allBatchGames.push(...batchGames)
        this.batchesReceived++
        this.totalExpectedBatches = totalBatches
        
        // First batch: initialize renderers
        if (this.isFirstBatch) {
            this.isFirstBatch = false
            this.progressiveLoadStartTime = batchStartTime
            const initStart = performance.now()
            await this.initializeForProgressiveLoading(totalBatches)
            const initTime = performance.now() - initStart
            if (initTime > 100) {
                GpuStorePropsRenderer.logger.debug(`[ASYNC] Renderer initialization: ${initTime.toFixed(1)}ms (mostly async waits)`)
            }
        }
        
        // Tell multi-atlas renderer which batch we're processing (for tier assignment)
        this.gameBoxRenderer?.setBatchIndex(batchIndex)
        
        const shelfCreationStart = performance.now()
        await this.createShelfForBatch(batchGames, batchIndex)
        const shelfCreationTime = performance.now() - shelfCreationStart
        
        const batchDuration = performance.now() - batchStartTime
        const mainThreadTime = performance.now() - mainThreadStart
        this.batchTimings.push({ batchIndex, duration: batchDuration, mainThreadTime })
        this.totalMainThreadTime += mainThreadTime
        
        const batchMsg = `[MAIN THREAD] Batch ${batchIndex + 1}/${totalBatches}: ${mainThreadTime.toFixed(1)}ms main thread (${batchGames.length} games, shelf creation: ${shelfCreationTime.toFixed(1)}ms)`
        if (mainThreadTime > 200) {
            GpuStorePropsRenderer.logger.warn(`${batchMsg} ⚠️ Blocking!`)
        } else {
            GpuStorePropsRenderer.logger.debug(`${batchMsg}`)
        }
        
        // Emit GPU update after each batch
        EventManager.getInstance().emit(GameEventTypes.InstancedBatchComplete)
        
        console.log(`📊 Batches received: ${this.batchesReceived}/${this.totalExpectedBatches}`)
        if (this.batchesReceived === this.totalExpectedBatches) {
            const totalLoadTime = performance.now() - this.progressiveLoadStartTime
            const avgMainThreadTime = this.totalMainThreadTime / this.batchTimings.length
            const asyncTime = totalLoadTime - this.totalMainThreadTime
            
            const summaryMsg = `[MAIN THREAD] All ${this.batchTimings.length} batches: ${this.totalMainThreadTime.toFixed(1)}ms main thread, ${asyncTime.toFixed(1)}ms async (total ${totalLoadTime.toFixed(1)}ms, avg ${avgMainThreadTime.toFixed(1)}ms/batch main thread)`
            if (this.totalMainThreadTime > 500) {
                GpuStorePropsRenderer.logger.warn(`${summaryMsg} ⚠️ Consider optimization!`)
            } else {
                GpuStorePropsRenderer.logger.debug(`${summaryMsg}`)
            }
            
            console.debug(`📦 [COMPLETE] All ${totalBatches} batches processed, finalizing...`)
            await this.finalizeProgressiveLoading()
        }
    }
    
    /**
     * Convert SteamGame to SteamGameData format
     */
    private steamGameToGameData(game: Readonly<SteamGame>): SteamGameData {
        return {
            appid: game.appid,
            name: game.name,
            playtime_forever: game.playtime_forever || 0,
            artwork: game.artwork
        }
    }
    
    /**
     * Initialize renderers for progressive loading
     */
    private async initializeForProgressiveLoading(totalBatches: number): Promise<void> {
        // Reset the completion flag - a new progressive load is starting
        this.progressiveLoadingCompleted = false
        
        const estimatedGames = totalBatches * 18 // BATCH_SIZE from SteamIntegration
        
        this.gameBoxRenderer?.dispose()
        this.gameBoxRenderer = new GpuGameBoxRenderer(estimatedGames + 100)
        
        if (this.instancedShelfRenderer && !this.instancedShelfRenderer.isReady()) {
            console.warn('⏳ Waiting for InstancedShelfRenderer to be ready...')
            const waitStart = Date.now()
            let attempts = 0
            while (!this.instancedShelfRenderer.isReady()) {
                await new Promise(resolve => setTimeout(resolve, 50))
                attempts++
                if (attempts % 20 === 0) { // Log every second
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
        
        this.shelfBounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity }
        this.cumulativeShelfCount = 0
        this.clearExistingShelves()
        
        this.preallocateShelfPositions(totalBatches)
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
    
    private async createShelfForBatch(games: SteamGameData[], batchIndex: number): Promise<void> {
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
        
        // Expand shelf positions array if batch index exceeds current allocation
        // This handles dynamic batch count increases from background fetches
        if (batchIndex >= this.shelfPositions.length) {
            const oldLength = this.shelfPositions.length
            console.warn(`⚠️ BATCH COUNT MISMATCH: Received batch ${batchIndex + 1} but only allocated ${oldLength} positions. Expanding array...`)
            console.warn(`   This indicates totalBatches estimate was incorrect. Expected: ${this.totalExpectedBatches}, Actual: >${batchIndex + 1}`)
            this.preallocateShelfPositions(batchIndex + 1)
        }
        
        const shelfPosition = this.shelfPositions[batchIndex]
        
        // Defensive check: ensure position was allocated
        if (!shelfPosition) {
            console.error(`❌ CRITICAL: Shelf position ${batchIndex} is undefined even after allocation check!`)
            console.error(`   Array length: ${this.shelfPositions.length}, Index: ${batchIndex}`)
            return
        }
        
        EventManager.getInstance().emit<StorePropsProgressEvent>(StorePropsEventTypes.Progress, {
            step: 'shelves',
            current: batchIndex + 1,
            total: this.totalExpectedBatches,
            detail: `Creating shelf ${batchIndex + 1}/${this.totalExpectedBatches}`
        })
        
        this.createInstancedShelf(shelfPosition, games, Math.floor(batchIndex / this.maxShelvesPerRow), batchIndex % this.maxShelvesPerRow)
        this.cumulativeShelfCount++
    }
    
    private finalizeProgressiveLoading(): void {
        console.debug(`✅ Progressive loading complete: ${this.allBatchGames.length} games on ${this.cumulativeShelfCount} shelves`)
        
        // Mark progressive loading as complete BEFORE emitting event
        // This ensures subsequent DataLoaded events don't trigger duplicate generation
        this.progressiveLoadingCompleted = true
        
        EventManager.getInstance().emit<AllBatchesCompleteEvent>(GameEventTypes.AllBatchesComplete, {
            shelfBounds: { ...this.shelfBounds },
            shelfLayout: { ...this.shelfLayout }
        })
    }
    
    private resetBatchState(): void {
        this.batchesReceived = 0
        this.totalExpectedBatches = 0
        this.allBatchGames = []
        this.isFirstBatch = true
        this.batchQueue = []
        this.isProcessingBatch = false
        this.batchTimings = []
        this.progressiveLoadStartTime = 0
        this.totalMainThreadTime = 0
    }
    
    private async handleDataLoaded(): Promise<void> {
        // If progressive loading already completed, this is just a final sync - skip
        // NOTE: We use progressiveLoadingCompleted instead of batchesReceived because
        // resetBatchState() clears batchesReceived when AllBatchesComplete fires,
        // but DataLoaded may arrive after that due to event timing
        if (this.progressiveLoadingCompleted) {
            console.debug('📦 DataLoaded received after progressive loading complete - skipping duplicate generation')
            return
        }
        
        // If we're currently receiving batches, skip duplicate generation
        if (this.batchesReceived > 0) {
            console.debug('📦 DataLoaded received during batch processing - skipping duplicate generation')
            return
        }
        
        // Fall back to original behavior if no batches received (legacy path)
        console.debug('📦 DataLoaded with no prior batches - using legacy generation')
        await this.generateShelvesAsync()
    }

    private async generateShelvesAsync(): Promise<void> {
        const games = this.dataManager.get<SteamGameData[]>('steam.games') || []
        const gameCount = games.length
        
        if (games.length > 0) {
            this.gameBoxRenderer?.dispose()
            this.gameBoxRenderer = new GpuGameBoxRenderer(gameCount + 100)
        }
        
        if (!this.instancedShelfRenderer) {
            console.error('❌ InstancedShelfRenderer not available - cannot generate instanced shelves')
            return
        }

        if (!this.instancedShelfRenderer.isReady()) {
            // Initialize it now when we need it, then proceed
            try {
                await this.instancedShelfRenderer.initialize()
            } catch (error) {
                console.error('❌ Failed to initialize InstancedShelfRenderer on-demand:', error)
                return
            }
        }
        
        try {
            // Calculate shelves needed based on game count
            const gamesPerShelf = GameLayoutConstants.GAMES_PER_SURFACE * GameLayoutConstants.SURFACES_PER_SHELF
            const shelvesNeeded = Math.ceil(gameCount / gamesPerShelf)
            if (shelvesNeeded === 0) {
                console.warn('No shelves needed - no games found')
                return
            }
            
            // Reset shelf bounds tracking
            this.shelfBounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity }
            
            // Reset cumulative shelf count
            this.cumulativeShelfCount = 0
            
            // Clear existing shelves first
            this.clearExistingShelves()
            
            // Create shelf rows based on needed shelves  
            const maxShelvesPerRow = 4
            const rows = Math.ceil(shelvesNeeded / maxShelvesPerRow)
            const fullRows = Math.floor(shelvesNeeded / maxShelvesPerRow)
            const partialRowCount = shelvesNeeded % maxShelvesPerRow
            console.debug(`🏗️ Creating ${rows} rows: ${fullRows} full rows + ${partialRowCount > 0 ? '1 partial' : '0 partial'}`)
            
            // Store for use in room resize event
            this.shelfLayout = { rows, shelvesPerRow: maxShelvesPerRow }
            
            for (let row = 0; row < rows; row++) {
                // Put partial row at the back (row 0), full rows toward front
                const isPartialRow = partialRowCount > 0 && row === 0
                const shelvesInThisRow = isPartialRow ? partialRowCount : maxShelvesPerRow
                
                // Emit progress update for startup UI
                EventManager.getInstance().emit<StorePropsProgressEvent>(StorePropsEventTypes.Progress, {
                    step: 'shelves',
                    current: row + 1,
                    total: rows,
                    detail: `Creating shelf row ${row + 1}/${rows}`
                })
                
                // Yield to main thread between rows to keep app responsive
                await new Promise(resolve => setTimeout(resolve, 50)) // Faster than legacy since GPU handles bulk work
                
                try {
                    await this.createInstancedShelfRow(row, shelvesInThisRow, rows, games)
                } catch (error) {
                    console.error(`❌ Failed to create instanced shelf row ${row}:`, error)
                    throw error
                }
            }
            
            console.debug(`Instanced shelf generation completed: ${shelvesNeeded} shelves for ${gameCount} games`)
            
            // Emit InstancedBatchComplete event to trigger GPU updates
            EventManager.getInstance().emit(GameEventTypes.InstancedBatchComplete)
            
            // Mark as complete (legacy path equivalent of progressive loading completing)
            this.progressiveLoadingCompleted = true
            
            EventManager.getInstance().emit<AllBatchesCompleteEvent>(GameEventTypes.AllBatchesComplete, {
                shelfBounds: { ...this.shelfBounds },
                shelfLayout: { ...this.shelfLayout }
            })
            
            // NOTE: Scene validation moved to handleInstancedBatchComplete to happen AFTER GPU updates
        } catch (error) {
            console.error('❌ Failed to generate instanced shelves asynchronously:', error)
            throw error
        }
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
            // Small test cube for reference
            const geometry = new THREE.BoxGeometry(0.2, 0.2, 0.2)
            const material = new THREE.MeshPhongMaterial({ color: 0x0099ff }) // Blue for GPU version
            const cube = new THREE.Mesh(geometry, material)
            cube.position.set(2, 0, -1) // Move to side so it doesn't interfere with shelf
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

    /**
     * Add atmospheric props (wire racks, dividers, etc.)
     * TODO: PropRenderer not instantiated - this method is currently non-functional
     */
    public async addAtmosphericProps(): Promise<void> {
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
        
        for (let i = 0; i < shelfCount; i++) {
            const shelfPosition = new THREE.Vector3(
                startX + (i * shelfSpacing),
                0,
                rowZ
            )
            
            // Track shelf bounds for room sizing (approximate shelf width is ~2m)
            const shelfWidth = 2.0
            const shelfDepth = 1.0
            this.shelfBounds.minX = Math.min(this.shelfBounds.minX, shelfPosition.x - shelfWidth / 2)
            this.shelfBounds.maxX = Math.max(this.shelfBounds.maxX, shelfPosition.x + shelfWidth / 2)
            this.shelfBounds.minZ = Math.min(this.shelfBounds.minZ, shelfPosition.z - shelfDepth / 2)
            this.shelfBounds.maxZ = Math.max(this.shelfBounds.maxZ, shelfPosition.z + shelfDepth / 2)
            
            // Calculate which games belong to this shelf (18 games per shelf: 3 rows × 2 sides × 3 games)
            const gamesPerShelf = GameLayoutConstants.GAMES_PER_SURFACE * GameLayoutConstants.SURFACES_PER_SHELF;
            const shelfGlobalIndex = this.cumulativeShelfCount + i // Use cumulative count, not rowIndex * 4
            const startGameIndex = shelfGlobalIndex * gamesPerShelf
            const shelfGames = games.slice(startGameIndex, startGameIndex + gamesPerShelf)
            
            // Create shelf (fire-and-forget - game box worker calls run async)
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
        
        // Create game boxes - fire-and-forget, worker handles async work
        if (games.length > 0) {
            this.spawnInstancedGamesOnShelf(position, games, rowIndex, shelfIndex)
        }
    }

    private spawnInstancedGamesOnShelf(shelfPosition: THREE.Vector3, games: SteamGameData[], _rowIndex: number, _shelfIndex: number): void {
        // Get shelf surface configuration using shared utility (GPU path: hardcoded surfaces)
        const shelfSurfaces = ShelfSurfaceUtils.findShelfSurfaces(null, true)
        
        if (shelfSurfaces.length === 0) {
            return
        }
        
        let gameIndex = 0
        
        for (const surface of shelfSurfaces) {
            if (gameIndex >= games.length) break
            
            // Spawn games on front side (fire-and-forget)
            const frontGames = games.slice(gameIndex, gameIndex + GameLayoutConstants.GAMES_PER_SURFACE)
            if (frontGames.length > 0) {
                this.createInstancedGameBoxes(shelfPosition, surface, frontGames, ShelfSide.Front)
                gameIndex += frontGames.length
            }
            
            // Spawn games on back side (fire-and-forget)
            if (gameIndex < games.length) {
                const backGames = games.slice(gameIndex, gameIndex + GameLayoutConstants.GAMES_PER_SURFACE)
                if (backGames.length > 0) {
                    this.createInstancedGameBoxes(shelfPosition, surface, backGames, ShelfSide.Back)
                    gameIndex += backGames.length
                }
            }
        }
    }

    private createInstancedGameBoxes(
        shelfPosition: THREE.Vector3,
        surface: ShelfSurface, 
        games: SteamGameData[], 
        side: ShelfSide
    ): void {
        const boxDimensions = this.gameBoxRenderer?.getDimensions()
        const gamePositions = GameBoxUtils.calculateGamePositions(shelfPosition, surface, games, side, boxDimensions)
        
        // Fire-and-forget - worker handles these in parallel
        // GPU update happens via InstancedBatchComplete event
        for (let i = 0; i < games.length; i++) {
            this.createSingleInstancedGameBox(games[i], gamePositions[i], side, i)
        }
    }

    private createSingleInstancedGameBox(
        game: SteamGameData, 
        worldPosition: THREE.Vector3, 
        side: ShelfSide,
        _index: number
    ): void {
        if (!this.gameBoxRenderer) {
            console.warn('⚠️ GpuGameBoxRenderer not initialized - cannot create game box')
            return
        }
        this.gameBoxRenderer.createGameBoxAuto(game, worldPosition, side)
    }

    public clearProps(): void {
        // Clear all tracked objects first
        this.clearExistingShelves()
        
        // Remove all children from props group (test objects, etc.)
        while (this.propsGroup.children.length > 0) {
            const child = this.propsGroup.children[0]
            this.propsGroup.remove(child)
            
            // Dispose geometry and materials
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
        
        // Clean up instanced renderer
        this.instancedShelfRenderer?.dispose()
        
        if (this.currentStoreGroup) {
            this.scene.remove(this.currentStoreGroup)
            // TODO: Dispose materials and geometries properly
            this.currentStoreGroup = null
        }
        
        this.scene.remove(this.propsGroup)
        
        console.info('GpuStorePropsRenderer disposed')
    }
    
    /**
     * Get memory stats from the game box renderer (multi-atlas only)
     */
    public getArtworkMemoryStats() {
        return this.gameBoxRenderer?.getMemoryStats() ?? null
    }
    
    /**
     * Log memory stats to console
     */
    public logMemoryStats(): void {
        this.gameBoxRenderer?.logMemoryStats()
    }
}