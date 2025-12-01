/**
 * GPU Store Props Renderer - Interactive Objects and Props  
 * 
 * GPU-OPTIMIZED VERSION: Uses GPU instanced rendering via InstancedShelfRenderer for optimal performance.
 * 
 * TODO: This file contains the new GPU instanced generation approach.
 * TODO: Eventually integrate with new renderer selection system to choose between
 * TODO: LegacyStorePropsRenderer and this GPU version based on:
 * TODO: - Performance requirements
 * TODO: - Hardware capabilities  
 * TODO: - User preferences
 * TODO: - A/B testing configuration
 * 
 * Handles all interactive objects and props that populate the store:
 * - Shelves and shelf systems (GPU instanced rendering)
 * - Games and game boxes with artwork (instanced where applicable)
 * - Signage and wayfinding elements
 * - Test objects and debugging aids
 * - Atmospheric props and decorative elements
 * 
 * This renderer should be loaded THIRD after environment and lighting
 * to place interactive content in the properly lit environment.
 */

import * as THREE from 'three'
import { StoreLayout } from './StoreLayout'
import { GpuGameBoxRenderer } from './game-box/GpuGameBoxRenderer'
import { SignageRenderer } from './SignageRenderer'
import { InstancedShelfRenderer } from './instancing/InstancedShelfRenderer'
import { ShelfSide } from './props/SharedPropsUtils'
import type { IStorePropsRenderer, PropsConfig } from './IStorePropsRenderer'
import { GameLayoutConstants, VRLayoutUtils, GameBoxUtils, ShelfSurfaceUtils, type ShelfSurface } from './props/SharedPropsUtils'

import { EventManager, EventSource } from '../core/EventManager'
import { RoomEventTypes, GameEventTypes, SteamEventTypes } from '../types/InteractionEvents'
import { StorePropsEventTypes, type StorePropsProgressEvent, type SteamGamesBatchEvent } from '../types/InteractionEvents'
import { DataManager } from '../core/data'
import type { SteamGameData } from './game-box/types/GameData'
import { TestMode, getEnabledTests, isTestEnabled } from '../types/TestMode'
import { ImageManager } from '../steam/images/ImageManager'
import type { SteamGame } from '../steam'

export class GpuStorePropsRenderer implements IStorePropsRenderer {
    private scene: THREE.Scene
    private dataManager: DataManager

    private storeLayout: StoreLayout
    private gameBoxRenderer: GpuGameBoxRenderer
    private signageRenderer: SignageRenderer
    private propsGroup: THREE.Group
    private config: PropsConfig = {}
    private currentStoreGroup: THREE.Group | null = null // Track current store environment

    private instancedShelfRenderer?: InstancedShelfRenderer
    private imageManager: ImageManager
    private globalGameIndex: number = 0 // Track global game position for artwork selection

    // Track objects we create for proper cleanup
    private createdGameBoxes: THREE.Object3D[] = []
    private createdStoreObjects: THREE.Object3D[] = []
    
    // Track actual shelf bounds for room sizing
    private shelfBounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity }
    
    // Track shelf layout for lighting fixture positioning
    private shelfLayout: { rows: number; shelvesPerRow: number } = { rows: 0, shelvesPerRow: 0 }
    
    // Track cumulative shelf count across rows (for correct game assignment)
    private cumulativeShelfCount: number = 0
    
    // Track progressive batch state
    private batchesReceived: number = 0
    private totalExpectedBatches: number = 0
    private allBatchGames: SteamGameData[] = []
    private isFirstBatch: boolean = true
    
    // Batch queue for serialized processing (prevents race conditions)
    private batchQueue: SteamGamesBatchEvent[] = []
    private isProcessingBatch: boolean = false

    constructor(scene: THREE.Scene, dataManager: DataManager) {
        this.scene = scene
        this.dataManager = dataManager

        // Create our own GpuGameBoxRenderer instance with generous max instances
        // Will be re-initialized with actual game count when games are loaded
        this.gameBoxRenderer = new GpuGameBoxRenderer(2000)

        this.propsGroup = new THREE.Group()
        this.propsGroup.name = 'props-instanced'
        this.scene.add(this.propsGroup)
        
        this.imageManager = new ImageManager()
        
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
        // This 3+ second init should happen during app startup, not during game loading
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
    }
    
    /**
     * Handle incoming batch of games - queues for serialized processing
     * Events may arrive faster than we can process, so we queue them and process one at a time
     */
    private handleGamesBatch(event: CustomEvent<SteamGamesBatchEvent>): void {
        const { batchIndex, totalBatches, games } = event.detail
        console.log(`📦 [QUEUE] Received batch ${batchIndex + 1}/${totalBatches} with ${games.length} games`)
        
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
            // Sort queue by batchIndex to ensure correct order
            this.batchQueue.sort((a, b) => a.batchIndex - b.batchIndex)
            const batch = this.batchQueue.shift()!
            
            await this.processOneBatch(batch)
        }
        
        this.isProcessingBatch = false
    }
    
    /**
     * Process a single batch of games
     */
    private async processOneBatch(batchEvent: SteamGamesBatchEvent): Promise<void> {
        const batchStartTime = performance.now()
        const { games, batchIndex, totalBatches, isLastBatch } = batchEvent
        
        console.log(`📦 [PROCESS ${batchIndex + 1}/${totalBatches}] Processing ${games.length} games`)
        
        // Convert SteamGame to SteamGameData and accumulate
        const batchGames = games.map(g => this.steamGameToGameData(g))
        this.allBatchGames.push(...batchGames)
        this.batchesReceived++
        this.totalExpectedBatches = totalBatches
        
        // First batch: initialize renderers
        if (this.isFirstBatch) {
            this.isFirstBatch = false
            await this.initializeForProgressiveLoading(totalBatches)
        }
        
        // Create shelf for this batch
        const shelfStartTime = performance.now()
        await this.createShelfForBatch(batchGames, batchIndex)
        console.log(`📦 [PROCESS ${batchIndex + 1}] Shelf created in ${(performance.now() - shelfStartTime).toFixed(0)}ms`)
        
        // Emit GPU update after each batch
        EventManager.getInstance().emit(GameEventTypes.InstancedBatchComplete)
        
        console.log(`📦 [PROCESS ${batchIndex + 1}] Batch complete in ${(performance.now() - batchStartTime).toFixed(0)}ms, accumulated: ${this.allBatchGames.length} games`)
        
        // Check if ALL batches are now complete
        if (this.batchesReceived === this.totalExpectedBatches) {
            console.log(`📦 [COMPLETE] All ${totalBatches} batches processed, finalizing...`)
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
        const initStartTime = performance.now()
        console.log(`🚀 [INIT] Starting progressive loading init for ${totalBatches} batches`)
        
        // Estimate total games for renderer sizing
        const estimatedGames = totalBatches * 18 // BATCH_SIZE from SteamIntegration
        
        // Dispose old renderer and create new one sized for estimated game count
        this.gameBoxRenderer.dispose()
        this.gameBoxRenderer = new GpuGameBoxRenderer(estimatedGames + 100)
        
        // Wait for shelf renderer if not ready yet (should already be initializing from constructor)
        if (this.instancedShelfRenderer && !this.instancedShelfRenderer.isReady()) {
            console.log(`🚀 [INIT] Waiting for shelf renderer to finish initializing...`)
            const waitStart = performance.now()
            // Poll until ready (init was started in initializeRenderers)
            while (!this.instancedShelfRenderer.isReady()) {
                await new Promise(resolve => setTimeout(resolve, 50))
                if (performance.now() - waitStart > 10000) {
                    console.error('❌ Shelf renderer init timeout after 10s')
                    break
                }
            }
            console.log(`🚀 [INIT] Shelf renderer ready after ${(performance.now() - waitStart).toFixed(0)}ms wait`)
        }
        
        // Reset tracking state
        this.globalGameIndex = 0
        this.shelfBounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity }
        this.cumulativeShelfCount = 0
        this.clearExistingShelves()
        
        console.log(`🚀 [INIT] Progressive loading init complete in ${(performance.now() - initStartTime).toFixed(0)}ms`)
    }
    
    /**
     * Create a shelf unit for a batch of games
     */
    private async createShelfForBatch(games: SteamGameData[], batchIndex: number): Promise<void> {
        if (!this.instancedShelfRenderer?.isReady()) {
            console.error('❌ InstancedShelfRenderer not ready')
            return
        }
        
        // Calculate shelf position (one shelf per batch)
        const maxShelvesPerRow = 4
        const row = Math.floor(batchIndex / maxShelvesPerRow)
        const shelfInRow = batchIndex % maxShelvesPerRow
        
        // VR-optimized spacing calculations
        const shelfSpacing = VRLayoutUtils.calculateOptimalShelfSpacing(maxShelvesPerRow)
        const startX = -(maxShelvesPerRow - 1) * shelfSpacing / 2
        const rowZ = VRLayoutUtils.calculateOptimalRowPosition(row)
        
        const shelfPosition = new THREE.Vector3(
            startX + (shelfInRow * shelfSpacing),
            0,
            rowZ
        )
        
        // Track shelf bounds for room sizing
        const shelfWidth = 2.0
        const shelfDepth = 1.0
        this.shelfBounds.minX = Math.min(this.shelfBounds.minX, shelfPosition.x - shelfWidth / 2)
        this.shelfBounds.maxX = Math.max(this.shelfBounds.maxX, shelfPosition.x + shelfWidth / 2)
        this.shelfBounds.minZ = Math.min(this.shelfBounds.minZ, shelfPosition.z - shelfDepth / 2)
        this.shelfBounds.maxZ = Math.max(this.shelfBounds.maxZ, shelfPosition.z + shelfDepth / 2)
        
        // Update shelf layout tracking
        this.shelfLayout.rows = Math.max(this.shelfLayout.rows, row + 1)
        this.shelfLayout.shelvesPerRow = maxShelvesPerRow
        
        // Emit progress update
        EventManager.getInstance().emit<StorePropsProgressEvent>(StorePropsEventTypes.Progress, {
            step: 'shelves',
            current: batchIndex + 1,
            total: this.totalExpectedBatches,
            detail: `Creating shelf ${batchIndex + 1}/${this.totalExpectedBatches}`,
            timestamp: Date.now(),
            source: EventSource.System
        })
        
        // Create the shelf
        console.log(`🏪 [SHELF ${batchIndex}] Creating at row ${row}, col ${shelfInRow}, pos (${shelfPosition.x.toFixed(1)}, ${shelfPosition.z.toFixed(1)}) with ${games.length} games`)
        await this.createInstancedShelf(shelfPosition, games, row, shelfInRow)
        this.cumulativeShelfCount++
        
        console.log(`🏪 [SHELF ${batchIndex}] Complete. Total shelves: ${this.cumulativeShelfCount}`)
    }
    
    /**
     * Finalize room sizing after all batches received
     */
    private async finalizeProgressiveLoading(): Promise<void> {
        console.debug(`✅ Progressive loading complete: ${this.allBatchGames.length} games on ${this.cumulativeShelfCount} shelves`)
        
        // Calculate and emit final room dimensions
        if (this.shelfBounds.minX !== Infinity) {
            const { RoomConstants } = await import('./RoomManager')
            const roomWidth = (this.shelfBounds.maxX - this.shelfBounds.minX) + (RoomConstants.STORE_WALL_CLEARANCE * 2)
            const roomDepth = Math.abs(this.shelfBounds.minZ) + RoomConstants.STORE_BACK_CLEARANCE
            const roomHeight = RoomConstants.STORE_CEILING_HEIGHT
            const roomCenterZ = (this.shelfBounds.minZ - RoomConstants.STORE_BACK_CLEARANCE) / 2
            
            EventManager.getInstance().emit(RoomEventTypes.Resize, {
                dimensions: {
                    width: roomWidth,
                    depth: roomDepth,
                    height: roomHeight
                },
                centerOffset: { x: 0, y: 0, z: roomCenterZ },
                shelfLayout: this.shelfLayout,
                reason: 'shelves-spawned',
                timestamp: Date.now(),
                source: EventSource.System
            })
        }
        
        // Reset batch state for next load
        this.batchesReceived = 0
        this.totalExpectedBatches = 0
        this.allBatchGames = []
        this.isFirstBatch = true
        this.batchQueue = []
        this.isProcessingBatch = false
    }
    
    /**
     * Handle DataLoaded event (backward compatibility / final sync)
     */
    private async handleDataLoaded(): Promise<void> {
        // If we already received batches, this is just a final sync - skip
        if (this.batchesReceived > 0) {
            console.debug('📦 DataLoaded received after batch processing - skipping duplicate generation')
            return
        }
        
        // Fall back to original behavior if no batches received
        console.debug('📦 DataLoaded with no prior batches - using legacy generation')
        await this.generateShelvesAsync()
    }

    /**
     * Generate shelves asynchronously without blocking the main thread
     * Uses INSTANCED InstancedShelfRenderer for GPU performance
     */
    private async generateShelvesAsync(): Promise<void> {
        const games = this.dataManager.get<SteamGameData[]>('steam.games') || []
        const gameCount = games.length
        
        // Recreate GpuGameBoxRenderer with correct game count if needed
        if (games.length > 0) {
            // Dispose old renderer and create new one sized for actual game count
            // Lazy initialization happens when createGameBox() is called
            this.gameBoxRenderer.dispose()
            this.gameBoxRenderer = new GpuGameBoxRenderer(gameCount + 100) // Add buffer
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
            
            // Reset global game index for artwork assignment
            this.globalGameIndex = 0
            
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
                    detail: `Creating shelf row ${row + 1}/${rows}`,
                    timestamp: Date.now(),
                    source: EventSource.System
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
            
            // Calculate room dimensions based on actual shelf bounds + clearances
            if (this.shelfBounds.minX !== Infinity) {
                const { RoomConstants } = await import('./RoomManager')
                const roomWidth = (this.shelfBounds.maxX - this.shelfBounds.minX) + (RoomConstants.STORE_WALL_CLEARANCE * 2)
                // Room extends from origin (front wall/entrance) to back of shelves + back clearance
                const roomDepth = Math.abs(this.shelfBounds.minZ) + RoomConstants.STORE_BACK_CLEARANCE
                const roomHeight = RoomConstants.STORE_CEILING_HEIGHT
                
                // Calculate room center to position it around shelves
                // Front wall at origin (Z=0) where player and entrance mat are
                // Back wall at shelfMinZ - BACK_CLEARANCE (furthest negative Z)
                // Center is halfway between: 0 and (shelfMinZ - BACK_CLEARANCE)
                const roomCenterZ = (this.shelfBounds.minZ - RoomConstants.STORE_BACK_CLEARANCE) / 2
                
                console.debug(`📐 Shelf bounds: X[${this.shelfBounds.minX.toFixed(1)}, ${this.shelfBounds.maxX.toFixed(1)}], Z[${this.shelfBounds.minZ.toFixed(1)}, ${this.shelfBounds.maxZ.toFixed(1)}]`)
                console.debug(`🏠 Calculated room: ${roomWidth.toFixed(1)}x${roomDepth.toFixed(1)}x${roomHeight.toFixed(1)}, center Z: ${roomCenterZ.toFixed(1)}`)
                console.debug(`💡 Shelf layout: ${this.shelfLayout.rows} rows x ${this.shelfLayout.shelvesPerRow} shelves per row`)
                
                // Emit room resize event so room encapsulates shelves with player/entrance at origin
                EventManager.getInstance().emit(RoomEventTypes.Resize, {
                    dimensions: {
                        width: roomWidth,
                        depth: roomDepth,
                        height: roomHeight
                    },
                    centerOffset: { x: 0, y: 0, z: roomCenterZ },
                    shelfLayout: this.shelfLayout,
                    reason: 'shelves-spawned',
                    timestamp: Date.now(),
                    source: EventSource.System
                })
            }
            
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
        // GPU renderer performance managed by instanced renderers
        // Performance methods removed with GameBoxRenderer bifurcation
        
        // Update instanced renderer performance
        if (this.instancedShelfRenderer?.isReady()) {
            this.instancedShelfRenderer.updateGPU()
        }
    }

    /**
     * Clear all created store objects from the scene
     */
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

    /**
     * Create a row of shelves with VR-optimized spacing and navigation
     * INSTANCED VERSION: Uses InstancedShelfRenderer for GPU performance
     */
    private async createInstancedShelfRow(rowIndex: number, shelfCount: number, totalRows: number, games: SteamGameData[] = []): Promise<void> {
        // Create instanced shelf row with GPU optimized rendering
        
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
            
            // Create shelf using INSTANCED InstancedShelfRenderer ONLY
            await this.createInstancedShelf(shelfPosition, shelfGames, rowIndex, i)
        }
        
        // Update cumulative count after processing this row
        this.cumulativeShelfCount += shelfCount
    }

    private async createInstancedShelf(
        position: THREE.Vector3, 
        games: SteamGameData[], 
        rowIndex: number, 
        shelfIndex: number
    ): Promise<void> {
        try {
            // Add shelf instance at position
            const globalShelfIndex = rowIndex * 4 + shelfIndex
            console.log(`🏪 [SHELF-CREATE] Adding shelf instance ${globalShelfIndex} at (${position.x.toFixed(1)}, ${position.z.toFixed(1)}) with ${games.length} games`)
            
            this.instancedShelfRenderer.setInstance(globalShelfIndex, {
                position: position
            })
            
            // Create game boxes with actual game data if available
            if (games.length > 0) {
                const gamesStartTime = performance.now()
                await this.spawnInstancedGamesOnShelf(position, games, rowIndex, shelfIndex)
                console.log(`🏪 [SHELF-CREATE] Games spawned in ${(performance.now() - gamesStartTime).toFixed(0)}ms`)
            }
            
            console.debug(`🏪 Created instanced shelf ${rowIndex}-${shelfIndex} at position`, position)
        } catch (error) {
            console.error(`❌ Failed to create instanced shelf unit:`, error)
        }
    }

    private async spawnInstancedGamesOnShelf(shelfPosition: THREE.Vector3, games: SteamGameData[], rowIndex: number, shelfIndex: number): Promise<void> {
        // Get shelf surface configuration using shared utility (GPU path: hardcoded surfaces)
        const shelfSurfaces = ShelfSurfaceUtils.findShelfSurfaces(null, true)
        
        if (shelfSurfaces.length === 0) {
            console.warn(`⚠️ No shelf surfaces found for instanced shelf ${rowIndex}-${shelfIndex}`)
            return
        }
        
        let gameIndex = 0
        
        for (const surface of shelfSurfaces) {
            if (gameIndex >= games.length) break
            
            // Spawn games on front side
            const frontGames = games.slice(gameIndex, gameIndex + GameLayoutConstants.GAMES_PER_SURFACE)
            if (frontGames.length > 0) {
                await this.createInstancedGameBoxes(shelfPosition, surface, frontGames, ShelfSide.Front)
                gameIndex += frontGames.length
            }
            
            // Spawn games on back side  
            if (gameIndex < games.length) {
                const backGames = games.slice(gameIndex, gameIndex + GameLayoutConstants.GAMES_PER_SURFACE)
                if (backGames.length > 0) {
                    await this.createInstancedGameBoxes(shelfPosition, surface, backGames, ShelfSide.Back)
                    gameIndex += backGames.length
                }
            }
        }
    }

    private async createInstancedGameBoxes(
        shelfPosition: THREE.Vector3,
        surface: ShelfSurface, 
        games: SteamGameData[], 
        side: ShelfSide
    ): Promise<void> {
        const gamePositions = GameBoxUtils.calculateGamePositions(shelfPosition, surface, games, side)
        
        for (let i = 0; i < games.length; i++) {
            await this.createSingleInstancedGameBox(games[i], gamePositions[i], side, i)
        }
    }

    private async createSingleInstancedGameBox(
        game: SteamGameData, 
        worldPosition: THREE.Vector3, 
        side: ShelfSide,
        index: number
    ): Promise<void> {
        const name = GameBoxUtils.generateGameBoxName(game, side, index, 'gpu')
        const artworkStartTime = performance.now()
        const textureOptions = await GameBoxUtils.loadArtworkIfNeeded(game, this.globalGameIndex, this.imageManager)
        const artworkTime = performance.now() - artworkStartTime
        
        if (artworkTime > 100) {
            console.log(`🎮 [GAME] Slow artwork load for "${game.name}": ${artworkTime.toFixed(0)}ms`)
        }
        
        // Note: createGameBox returns null for instanced rendering (expected)
        // The actual rendering happens via the instanced renderers (artwork/label)
        this.gameBoxRenderer.createGameBox(game, worldPosition, textureOptions, name, side)
        
        this.globalGameIndex++
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
        
        // Clean up dynamic store environment
        if (this.currentStoreGroup) {
            this.scene.remove(this.currentStoreGroup)
            // TODO: Dispose materials and geometries properly
            this.currentStoreGroup = null
        }
        
        // Note: GameBoxRenderer cleanup is handled by SteamGameManager
        this.scene.remove(this.propsGroup)
        
        console.info('GpuStorePropsRenderer disposed')
    }
}