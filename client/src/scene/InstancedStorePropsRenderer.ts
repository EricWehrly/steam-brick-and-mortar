/**
 * Store Props Renderer (Instanced) - Interactive Objects and Props  
 * 
 * INSTANCED VERSION: Uses GPU instanced rendering via InstancedShelfRenderer for optimal performance.
 * 
 * TODO: This file contains the new GPU instanced generation approach.
 * TODO: Eventually integrate with new renderer selection system to choose between
 * TODO: LegacyStorePropsRenderer and this instanced version based on:
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
import { GameBoxRenderer } from './GameBoxRenderer'
import { SignageRenderer } from './SignageRenderer'
import { PropRenderer } from './PropRenderer'
import { InstancedShelfRenderer } from './instancing/InstancedShelfRenderer'
import type { IStorePropsRenderer } from './IStorePropsRenderer'
import type { PropsConfig } from './StorePropsRenderer'

import { RoomConstants } from './RoomManager'
import { EventManager, EventSource } from '../core/EventManager'
import { RoomEventTypes, SteamEventTypes, GameEventTypes, type InstancedBatchCompleteEvent } from '../types/InteractionEvents'
import { DataManager } from '../core/data'
import type { SteamGameData } from './game-box/types/GameData'
import type { GameBoxTextureOptions } from './game-box/types/GameBoxOptions'
import { TestMode, getEnabledTests, isTestEnabled } from '../types/TestMode'
import { LabelTextureArrayManager } from './game-box/instancing/LabelTextureArrayManager'
import { ImageManager } from '../steam/images/ImageManager'

// Configuration constants for game layout - made static and accessible
// TODO: Make these user-configurable in game menus
export class GameLayoutConstants {
    static readonly GAMES_PER_SURFACE = 3 // Games per shelf surface (front/back of each shelf level)
    static readonly SURFACES_PER_SHELF = 6 // 3 shelf levels × 2 sides (front/back) = 6 surfaces per shelf unit
    // TODO: Calculate SURFACES_PER_SHELF dynamically from shelf geometry in future
}

export class InstancedStorePropsRenderer implements IStorePropsRenderer {
    private scene: THREE.Scene
    private dataManager: DataManager

    private storeLayout: StoreLayout
    private gameBoxRenderer: GameBoxRenderer
    private signageRenderer: SignageRenderer
    private propRenderer: PropRenderer
    private propsGroup: THREE.Group
    private config: PropsConfig = {}
    private currentStoreGroup: THREE.Group | null = null // Track current store environment

    private instancedShelfRenderer?: InstancedShelfRenderer
    private labelTextureArrayManager?: LabelTextureArrayManager
    private imageManager: ImageManager
    private globalGameIndex: number = 0 // Track global game position for artwork selection

    constructor(scene: THREE.Scene, dataManager: DataManager, gameBoxRenderer: GameBoxRenderer) {
        this.scene = scene
        this.dataManager = dataManager
        this.gameBoxRenderer = gameBoxRenderer

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
        
        // Initialize GPU instanced shelf renderer
        this.instancedShelfRenderer = new InstancedShelfRenderer({
            maxShelfUnits: 50, // Allow up to 50 shelf units
            enablePerformanceLogging: true,
            debugName: 'StorePropsRenderer'
        })
        
        // Initialize the instanced renderer asynchronously
        this.initializeInstancedRenderer()
    }

    private async initializeInstancedRenderer(): Promise<void> {
        if (!this.instancedShelfRenderer) {
            console.error('❌ InstancedShelfRenderer not available for initialization')
            return
        }
        
        try {
            await this.instancedShelfRenderer.initialize()
        } catch (error) {
            console.error('❌ Failed to initialize InstancedShelfRenderer:', error)
        }
    }

    private setupEventListeners(): void {
        EventManager.getInstance().registerEventHandler(RoomEventTypes.Resized, this.generateShelvesAsync.bind(this));
        
        EventManager.getInstance().registerEventHandler(GameEventTypes.InstancedBatchComplete, this.handleInstancedBatchComplete.bind(this))
    }

    /**
     * Generate shelves asynchronously without blocking the main thread
     * Uses INSTANCED InstancedShelfRenderer for GPU performance
     */
    private async generateShelvesAsync(): Promise<void> {
        const games = this.dataManager.get<SteamGameData[]>('steam.games') || []
        const gameCount = games.length
        
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
            
            // Clear existing shelves first
            this.clearExistingShelves()
            
            // Create shelf rows based on needed shelves  
            const maxShelvesPerRow = 4
            const rows = Math.ceil(shelvesNeeded / maxShelvesPerRow)
            console.log(`🏗️ Creating ${rows} rows with max ${maxShelvesPerRow} shelves per row`)
            
            for (let row = 0; row < rows; row++) {
                const shelvesInThisRow = Math.min(maxShelvesPerRow, shelvesNeeded - (row * maxShelvesPerRow))
                
                // Yield to main thread between rows to keep app responsive
                await new Promise(resolve => setTimeout(resolve, 50)) // Faster than legacy since GPU handles bulk work
                
                try {
                    await this.createInstancedShelfRow(row, shelvesInThisRow, games)
                } catch (error) {
                    console.error(`❌ Failed to create instanced shelf row ${row}:`, error)
                    throw error
                }
            }
            
            console.debug(`Instanced shelf generation completed: ${shelvesNeeded} shelves for ${gameCount} games`)
            
            // Emit InstancedBatchComplete event to trigger GPU updates and validation
            EventManager.getInstance().emit<InstancedBatchCompleteEvent>(GameEventTypes.InstancedBatchComplete, {
                batchType: 'shelf',
                gameCount: games.length,
                timestamp: Date.now(),
                source: EventSource.System
            })
            
            // NOTE: Scene validation moved to handleInstancedBatchComplete to happen AFTER GPU updates
        } catch (error) {
            console.error('❌ Failed to generate instanced shelves asynchronously:', error)
            throw error
        }
    }

    public async setupProps(config: PropsConfig = {}): Promise<void> {
        this.config = { ...this.getDefaultConfig(), ...config }
        
        // Initialize enabled tests
        if (this.config.tests) {
            // Handle both array and object formats for backward compatibility
            const testsConfig = Array.isArray(this.config.tests) ? {} : this.config.tests as Record<string, string>
            const enabledTests = getEnabledTests(testsConfig)
            if (enabledTests.length > 0) {
                // Initialize test renderers based on enabled tests
                this.initializeTests()
            }
        }
        
        try {
            // Set up props in logical order
            // NOTE: Static shelf setup removed - dynamic generation happens via room:resized event
            // This eliminates duplicate environment creation
            
            if (this.config.enableSignage) {
                // this.signageRenderer.createStandardSigns(this.scene);
            }
        } catch (error) {
            console.error('❌ Failed to set up instanced props:', error)
            // Continue with available props
        }
    }
    
    private initializeTests(): void {
        if (!this.config.tests) return
        
        // Test Objects - Simple geometric test objects
        if (this.config.tests) {
            const testsConfig = Array.isArray(this.config.tests) ? {} : this.config.tests as Record<string, string>
            if (isTestEnabled(testsConfig, TestMode.SPAWN_TEST_OBJECTS)) {
                this.setupTestObjects()
            }
        }
    }

    private async setupTestObjects(): Promise<void> {
        // Small test cube for reference
        const geometry = new THREE.BoxGeometry(0.2, 0.2, 0.2)
        const material = new THREE.MeshPhongMaterial({ color: 0x0099ff }) // Blue for instanced version
        const cube = new THREE.Mesh(geometry, material)
        cube.position.set(2, 0, -1) // Move to side so it doesn't interfere with shelf
        cube.castShadow = true
        cube.name = 'test-cube-instanced'
        this.propsGroup.add(cube)
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
     */
    public async addAtmosphericProps(): Promise<void> {
        try {
            // Create wire rack displays for snack/merchandise areas
            const wireRack1 = this.propRenderer.createWireRackDisplay(new THREE.Vector3(-9, 0, 2))
            const wireRack2 = this.propRenderer.createWireRackDisplay(new THREE.Vector3(9, 0, 2))
            this.propsGroup.add(wireRack1)
            this.propsGroup.add(wireRack2)
            
            // Create category dividers between shelf sections
            const divider1 = this.propRenderer.createCategoryDivider(new THREE.Vector3(-3.25, 0, 3), 2.2)
            const divider2 = this.propRenderer.createCategoryDivider(new THREE.Vector3(3.25, 0, 3), 2.2)
            this.propsGroup.add(divider1)
            this.propsGroup.add(divider2)
            
            // Create floor navigation markers
            const floorMarkers = this.propRenderer.createFloorMarkers(22, 16)
            this.propsGroup.add(floorMarkers)
            
        } catch (error) {
            console.error('❌ Failed to add atmospheric props:', error)
        }
    }

    public updatePerformanceData(camera: THREE.Camera): void {
        if (this.gameBoxRenderer) {
            this.gameBoxRenderer.updatePerformanceData(camera, this.scene)
            this.gameBoxRenderer.cleanupOffScreenTextures()
        }
        
        // Update instanced renderer performance
        if (this.instancedShelfRenderer?.isReady()) {
            this.instancedShelfRenderer.updateGPU()
        }
    }

    /**
     * Clear ALL existing store environment from the scene
     * Eliminates duplicate walls/ceiling/floors by removing everything
     */
    private clearExistingShelves(): void {
        // Find and remove ONLY shelf/store objects - DON'T touch lighting or room structure
        const storeObjects = this.scene.children.filter(child => 
            child.name?.includes('StoreLayout') || 
            child.name?.includes('shelf') ||
            child.name?.includes('Shelf') ||
            child.name?.includes('store-environment') ||
            child.name?.includes('dynamic-store-environment') ||
            // REMOVED room-structure filter - RoomManager owns room structure, not StorePropsRenderer
            child.name?.includes('entrance') // Clear entrance areas
            // NOTE: DO NOT clear lighting or room-structure - managed by other systems!
        )
        
        storeObjects.forEach(obj => {
            this.scene.remove(obj)
            if (obj instanceof THREE.Group) {
                obj.clear()
            }
        })

        // Clear instanced shelf renderer state
        if (this.instancedShelfRenderer?.isReady()) {
            this.instancedShelfRenderer.reset()
        }
    }

    /**
     * Create a row of shelves with VR-optimized spacing and navigation
     * INSTANCED VERSION: Uses InstancedShelfRenderer for GPU performance
     */
    private async createInstancedShelfRow(rowIndex: number, shelfCount: number, games: SteamGameData[] = []): Promise<void> {
        // Create instanced shelf row with GPU optimized rendering
        
        if (!this.instancedShelfRenderer?.isReady()) {
            console.error('❌ InstancedShelfRenderer not ready - cannot create instanced shelf row')
            return
        }

        // VR-optimized spacing calculations
        const shelfSpacing = this.calculateOptimalShelfSpacing(shelfCount)
        const startX = -(shelfCount - 1) * shelfSpacing / 2 // Center the row
        const rowZ = this.calculateOptimalRowPosition(rowIndex) // VR-friendly row positioning
        
        for (let i = 0; i < shelfCount; i++) {
            const shelfPosition = new THREE.Vector3(
                startX + (i * shelfSpacing),
                0,
                rowZ
            )
            
            // Calculate which games belong to this shelf (18 games per shelf: 3 rows × 2 sides × 3 games)
            const gamesPerShelf = GameLayoutConstants.GAMES_PER_SURFACE * GameLayoutConstants.SURFACES_PER_SHELF;
            const shelfGlobalIndex = rowIndex * 4 + i // 4 shelves per row max
            const startGameIndex = shelfGlobalIndex * gamesPerShelf
            const shelfGames = games.slice(startGameIndex, startGameIndex + gamesPerShelf)
            
            // Create shelf using INSTANCED InstancedShelfRenderer ONLY
            await this.createInstancedShelfWithGames(shelfPosition, rowIndex, i, shelfGames)
        }
    }

    /**
     * Create a single shelf using INSTANCED InstancedShelfRenderer only
     */
    private async createInstancedShelfWithGames(position: THREE.Vector3, rowIndex: number, shelfIndex: number, games: SteamGameData[] = []): Promise<void> {
        if (!this.instancedShelfRenderer?.isReady()) {
            console.error('❌ InstancedShelfRenderer not ready for shelf creation')
            return
        }
        
        try {
            // Use ONLY GPU instanced generation - no procedural fallbacks
            await this.createInstancedShelf(position, games, rowIndex, shelfIndex)
            
        } catch (error) {
            console.error(`❌ Failed to create instanced shelf unit:`, error)
        }
    }
    
    /**
     * Create shelf using GPU instanced rendering (main path for instanced renderer)
     */
    private async createInstancedShelf(
        position: THREE.Vector3, 
        games: SteamGameData[], 
        rowIndex: number, 
        shelfIndex: number
    ): Promise<void> {
        if (!this.instancedShelfRenderer) {
            console.error('❌ InstancedShelfRenderer not available')
            return
        }

        // Add shelf instance at position
        const globalShelfIndex = rowIndex * 4 + shelfIndex // Calculate global shelf index
        this.instancedShelfRenderer.setInstance(globalShelfIndex, {
            position: position,
            shelfConfig: {} // Use default configuration
        })
        
        // Create game boxes with actual game data if available
        if (games.length > 0) {
            await this.spawnInstancedGamesOnShelf(position, games, rowIndex, shelfIndex)
        }
        
        console.debug(`🏪 Created instanced shelf ${rowIndex}-${shelfIndex} at position`, position)
    }

    /**
     * Spawn actual game boxes using instanced rendering where possible
     */
    private async spawnInstancedGamesOnShelf(shelfPosition: THREE.Vector3, games: SteamGameData[], rowIndex: number, shelfIndex: number): Promise<void> {
        
        // Get shelf surface configuration from InstancedShelfRenderer
        const shelfSurfaces = this.getInstancedShelfSurfaces();
        
        if (shelfSurfaces.length === 0) {
            console.warn(`⚠️ No shelf surfaces found for instanced shelf ${rowIndex}-${shelfIndex}`);
            return;
        }
        
        let gameIndex = 0;
        
        for (let surfaceIdx = 0; surfaceIdx < shelfSurfaces.length && gameIndex < games.length; surfaceIdx++) {
            const surface = shelfSurfaces[surfaceIdx];
            
            // Spawn games on front side
            const frontGames = games.slice(gameIndex, gameIndex + GameLayoutConstants.GAMES_PER_SURFACE);
            if (frontGames.length > 0) {
                await this.createInstancedGameBoxes(shelfPosition, surface, frontGames, 'front', surfaceIdx);
                gameIndex += frontGames.length;
            }
            
            // Spawn games on back side
            const backGames = games.slice(gameIndex, gameIndex + GameLayoutConstants.GAMES_PER_SURFACE);
            if (backGames.length > 0) {
                await this.createInstancedGameBoxes(shelfPosition, surface, backGames, 'back', surfaceIdx);
                gameIndex += backGames.length;
            }
        }
    }

    /**
     * Get shelf surface configuration for instanced shelves (standardized geometry)
     */
    private getInstancedShelfSurfaces(): Array<{topY: number, frontZ: number, backZ: number, centerX: number, width: number}> {
        // Instanced shelves have standardized geometry, so we can use fixed surface configurations
        return [
            { topY: 0.4, frontZ: -0.3, backZ: 0.3, centerX: 0, width: 2.0 },  // Bottom shelf
            { topY: 1.0, frontZ: -0.3, backZ: 0.3, centerX: 0, width: 2.0 },  // Middle shelf
            { topY: 1.6, frontZ: -0.3, backZ: 0.3, centerX: 0, width: 2.0 }   // Top shelf
        ];
    }

    /**
     * Create game boxes using instanced rendering where possible
     */
    private async createInstancedGameBoxes(
        shelfPosition: THREE.Vector3,
        surface: {topY: number, frontZ: number, backZ: number, centerX: number, width: number}, 
        games: SteamGameData[], 
        side: 'front' | 'back', 
        surfaceIndex: number
    ): Promise<void> {
        if (!this.gameBoxRenderer) {
            console.warn('⚠️ GameBoxRenderer not available, cannot create game boxes')
            return
        }

        // StorePropsRenderer handles positioning and delegates to GameBoxRenderer
        const Z_OFFSET = 0.1        // 10cm from shelf surface
        const Y_OFFSET = 0.005      // 5mm above shelf surface  
        const GAME_HEIGHT = 0.4     // 40cm height
        const GAME_SPACING = 0.35   // 35cm spacing between games
        
        // Calculate positioning relative to shelf position
        const gameY = shelfPosition.y + surface.topY + Y_OFFSET + GAME_HEIGHT / 2
        const gameZ = shelfPosition.z + (side === 'front' ? surface.frontZ + Z_OFFSET : surface.backZ - Z_OFFSET)
        
        // Center the games on the shelf
        const totalWidth = (games.length - 1) * GAME_SPACING
        const startX = shelfPosition.x + surface.centerX - totalWidth / 2
        
        let createdCount = 0
        for (let i = 0; i < games.length; i++) {
            const game = games[i]
            const gameX = startX + (i * GAME_SPACING)
            const worldPosition = new THREE.Vector3(gameX, gameY, gameZ)
            const name = `instanced-game-${game.name?.replace(/[^a-zA-Z0-9]/g, '-') || 'unknown'}-${side}-${i}`

            // Use artwork for every 10th game to balance performance and visual interest
            const shouldUseArtwork = (this.globalGameIndex % 10) === 0
            let textureOptions = undefined
            
            if (shouldUseArtwork && game.artwork?.header) {
                // Try to get or download artwork for featured games
                try {
                    const imageBlob = await this.imageManager.downloadImage(game.artwork.header, {
                        timeout: 5000, // 5 second timeout for artwork loading
                        enableFallback: true,
                        onImageLoaded: (url, blob) => {
                            // Successfully loaded artwork
                        },
                        onImageError: (url, error) => {
                            console.error(`❌ Failed to download artwork from ${url} for ${game.name}:`, error.message)
                        }
                    })
                    
                    if (imageBlob) {
                        // Convert blob to texture options for GameBoxRenderer
                        textureOptions = await this.createTextureOptionsFromBlob(imageBlob, game.name)
                    } else {
                        console.warn(`⚠️ No artwork blob received for ${game.name} - falling back to text label`)
                    }
                } catch (error) {
                    console.error(`❌ Exception while loading artwork for ${game.name}:`, error)
                }
            }
            
            // Create game box at world position
            // For instanced rendering, GameBoxRenderer may return null but still process the game
            const gameBox = this.gameBoxRenderer.createGameBox(game, worldPosition, textureOptions, name)
            if (gameBox) {
                // Individual meshes - add to scene directly
                this.scene.add(gameBox)  
                createdCount++
            } else {
                // Instanced rendering returns null but still counts as created
                // Note: Instanced renderers automatically add themselves to scene via DataManager
                createdCount++
            }
            
            this.globalGameIndex++ // Increment global game counter
        }
    }

    /**
     * Create texture options from an image blob for game box artwork
     */
    private async createTextureOptionsFromBlob(blob: Blob, gameName: string): Promise<GameBoxTextureOptions> {
        return new Promise((resolve, reject) => {
            const img = new Image()
            img.onload = () => {
                try {
                    // Create a canvas to convert the image to a texture
                    const canvas = document.createElement('canvas')
                    const ctx = canvas.getContext('2d')
                    
                    if (!ctx) {
                        console.error(`❌ Could not create canvas context for ${gameName}`)
                        reject(new Error('Could not create canvas context'))
                        return
                    }
                    
                    // Set canvas size to image dimensions (with reasonable limits for memory)
                    const maxSize = 512 // Limit texture size for memory management
                    const scale = Math.min(maxSize / img.width, maxSize / img.height, 1)
                    canvas.width = Math.floor(img.width * scale)
                    canvas.height = Math.floor(img.height * scale)
                    
                    // Draw the image onto the canvas
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
                    
                    // Create texture from canvas
                    const texture = new THREE.CanvasTexture(canvas)
                    texture.needsUpdate = true
                    
                    // Return GameBoxTextureOptions with artwork blob
                    resolve({
                        artworkBlobs: {
                            'header': blob
                        },
                        preferredArtworkType: 'header'
                    })
                    
                    // Clean up
                    URL.revokeObjectURL(img.src)
                } catch (error) {
                    console.error(`❌ Error processing image for ${gameName}:`, error)
                    reject(error)
                    URL.revokeObjectURL(img.src)
                }
            }
            
            img.onerror = (event) => {
                console.error(`❌ Failed to load image for ${gameName}:`, event)
                reject(new Error(`Failed to load image for ${gameName}`))
                URL.revokeObjectURL(img.src)
            }
            
            // Convert blob to object URL for image loading
            const objectUrl = URL.createObjectURL(blob)
            img.src = objectUrl
        })
    }

    /**
     * Handle instanced batch completion events
     */
    // TODO: remove after check in
    private handleInstancedBatchComplete(event: InstancedBatchCompleteEvent): void {
        console.debug(`Instanced ${event.batchType} batch completed: ${event.gameCount} items`)
        
        this.validateSceneSetup()
    }

    /**
     * Calculate optimal shelf spacing for VR comfort and navigation
     * Phase 4: VR-optimized layout calculations
     */
    private calculateOptimalShelfSpacing(shelfCount: number): number {
        // Base spacing considerations for VR:
        // - Minimum 2.2m for comfortable navigation (VR_ERGONOMICS.COMFORTABLE_AISLE_WIDTH)
        // - Extra space for larger libraries to avoid crowding
        // - Scale down slightly for very wide stores to fit in reasonable space
        
        const baseSpacing = RoomConstants.SHELF_SPACING_X // 2.5m default
        const minSpacing = 2.0 // Minimum comfortable spacing
        const maxSpacing = 3.5 // Maximum to avoid feeling empty
        
        // For more shelves, use base spacing
        // For fewer shelves, can space them out more for better navigation
        if (shelfCount <= 2) {
            return Math.min(maxSpacing, baseSpacing * 1.2) // More spacious for small stores
        } else if (shelfCount >= 6) {
            return Math.max(minSpacing, baseSpacing * 0.9) // Tighter for large stores
        } else {
            return baseSpacing // Standard spacing for medium stores
        }
    }

    /**
     * Calculate optimal row position for VR navigation and comfort
     * Phase 4: VR depth positioning optimization - positions relative to entrance
     */
    private calculateOptimalRowPosition(rowIndex: number): number {
        // VR depth positioning considerations:
        // - Player starts at entrance (positive Z)
        // - First row should be easily accessible from entrance
        // - Progressive depth moving toward back of store (negative Z)
        // - Avoid rows being too far back (VR discomfort)
        
        const entranceZPosition = 3 // Player/entrance is at positive Z
        const firstRowOffset = -2 // First row is 2m into the store from entrance
        const baseRowSpacing = RoomConstants.SHELF_SPACING_Z // 3m between rows
        const maxDepth = -12 // Don't place shelves beyond this depth from entrance
        
        // Calculate position relative to entrance
        let rowZ = entranceZPosition + firstRowOffset - (rowIndex * baseRowSpacing)
        
        // For very deep stores, compress the spacing slightly to keep everything accessible
        const absoluteMaxDepth = entranceZPosition + maxDepth
        if (rowZ < absoluteMaxDepth) {
            // Compress spacing for deep rows to keep them accessible
            const compressionFactor = 0.8
            rowZ = entranceZPosition + firstRowOffset - (rowIndex * baseRowSpacing * compressionFactor)
        }
        
        return Math.max(rowZ, absoluteMaxDepth) // Never go deeper than maxDepth from entrance
    }

    public clearProps(): void {
        // Remove all children from props group
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
        
        // Clear instanced renderer state
        if (this.instancedShelfRenderer?.isReady()) {
            this.instancedShelfRenderer.reset()
        }
    }

    public dispose(): void {
        this.clearProps()
        this.signageRenderer?.dispose()
        this.storeLayout?.dispose()
        this.propRenderer?.dispose()
        
        // Clean up instanced renderer
        this.instancedShelfRenderer?.dispose()
        
        // Clean up test instances
        this.labelTextureArrayManager?.dispose()
        
        // Clean up dynamic store environment
        if (this.currentStoreGroup) {
            this.scene.remove(this.currentStoreGroup)
            // TODO: Dispose materials and geometries properly
            this.currentStoreGroup = null
        }
        
        // Note: GameBoxRenderer cleanup is handled by SteamGameManager
        this.scene.remove(this.propsGroup)
        
        console.info('InstancedStorePropsRenderer disposed')
    }
    
    /**
     * Validate scene setup after shelf generation
     */
    private validateSceneSetup(): void {
        if (!this.instancedShelfRenderer) return

        // Check for expected shelf InstancedMesh objects in scene
        const expectedShelfNames = [
            'instanced-shelf-angled-boards',
            'instanced-shelf-side-boards', 
            'instanced-shelf-boards',
            'instanced-shelf-interior-surfaces'
        ]
        
        let foundShelfMeshes = 0
        for (const expectedName of expectedShelfNames) {
            const found = this.scene.getObjectByName(expectedName)
            if (found && found instanceof THREE.InstancedMesh && found.count > 0) {
                foundShelfMeshes++
            }
        }
        
        // Validate scene integrity 
        if (foundShelfMeshes === 0) {
            console.error('❌ No shelf InstancedMesh objects found in scene - shelves will not render')
        } else if (foundShelfMeshes < 4) {
            console.warn(`⚠️ Only ${foundShelfMeshes}/4 shelf mesh types found - some shelf components may be missing`)
        } else {
            console.info(`✅ All ${foundShelfMeshes} shelf mesh types successfully added to scene`)
        }
    }
}