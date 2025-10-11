/**
 * Store Props Renderer - Interactive Objects and Props
 * 
 * Handles all interactive objects and props that populate the store:
 * - Shelves and shelf systems (procedural generation)
 * - Games and game boxes with artwork
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
import { ProceduralShelfGenerator } from './ProceduralShelfGenerator'

import { RoomConstants } from './RoomManager'
import { EventManager, EventSource } from '../core/EventManager'
import { RoomEventTypes, SteamEventTypes, GameEventTypes } from '../types/InteractionEvents'
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

// All other constants moved to RoomManager.RoomConstants - use those instead

export interface PropsConfig {
    /** Enable shelf generation */
    enableShelves?: boolean
    /** Enable game boxes */
    enableGameBoxes?: boolean
    /** Enable signage */
    enableSignage?: boolean
    /** Enable test objects */
    enableTestObjects?: boolean
    /** Performance configuration */
    performance?: {
        maxTextureSize?: number
        nearDistance?: number
        farDistance?: number
        maxActiveTextures?: number
        frustumCullingEnabled?: boolean
    }
    /** Test modes - map of test name to string value */
    tests?: Record<string, string>
}

export class StorePropsRenderer {
    private scene: THREE.Scene
    private dataManager: DataManager

    private storeLayout: StoreLayout
    private gameBoxRenderer: GameBoxRenderer
    private signageRenderer: SignageRenderer
    private propRenderer: PropRenderer
    private propsGroup: THREE.Group
    private config: PropsConfig = {}
    private currentStoreGroup: THREE.Group | null = null // Track current store environment

    private labelTextureArrayManager?: LabelTextureArrayManager
    private imageManager: ImageManager
    private globalGameIndex: number = 0 // Track global game position for artwork selection

    constructor(scene: THREE.Scene, dataManager: DataManager, gameBoxRenderer: GameBoxRenderer) {
        this.scene = scene
        this.dataManager = dataManager
        this.gameBoxRenderer = gameBoxRenderer

        this.propsGroup = new THREE.Group()
        this.propsGroup.name = 'props'
        this.scene.add(this.propsGroup)
        
        this.imageManager = new ImageManager()
        
        this.initializeRenderers()
        
        this.setupEventListeners()
    }

    private initializeRenderers(): void {
        this.storeLayout = new StoreLayout(this.scene)
        
        this.signageRenderer = new SignageRenderer()
    }

    private setupEventListeners(): void {
        EventManager.getInstance().registerEventHandler(RoomEventTypes.Resized, this.generateShelvesAsync.bind(this))
    }

    /**
     * Generate shelves asynchronously without blocking the main thread
     * Shelves will phase in gradually as they're created
     */
    private async generateShelvesAsync(): Promise<void> {

        const games = this.dataManager.get<SteamGameData[]>('steam.games') || []
        const gameCount = games.length
        try {
            
            // Calculate shelves needed based on game count
            const gamesPerShelf = GameLayoutConstants.GAMES_PER_SURFACE * GameLayoutConstants.SURFACES_PER_SHELF
            const shelvesNeeded = Math.ceil(gameCount / gamesPerShelf)
            
            console.debug(`📚 Starting async generation of ${shelvesNeeded} shelves for ${gameCount} games`)
            
            // Reset global game index for artwork assignment
            this.globalGameIndex = 0
            
            // Clear existing shelves first
            this.clearExistingShelves()
            
            // Create shelf rows based on needed shelves  
            const maxShelvesPerRow = 4
            const rows = Math.ceil(shelvesNeeded / maxShelvesPerRow)
            
            for (let row = 0; row < rows; row++) {
                const shelvesInThisRow = Math.min(maxShelvesPerRow, shelvesNeeded - (row * maxShelvesPerRow))
                
                // Yield to main thread between rows to keep app responsive
                await new Promise(resolve => setTimeout(resolve, 10))
                
                await this.createShelfRow(row, shelvesInThisRow, games)
                console.debug(`✅ Completed row ${row + 1}/${rows}`)
            }
            
            console.debug(`✅ Async shelf generation complete: ${shelvesNeeded} shelves in ${rows} row(s)`)
        } catch (error) {
            console.error('❌ Failed to generate shelves asynchronously:', error)
            throw error
        }
    }

    public async setupProps(config: PropsConfig = {}): Promise<void> {
        this.config = { ...this.getDefaultConfig(), ...config }
        
        console.debug('🎁 Setting up store props...')
        
        // Log enabled tests
        if (this.config.tests) {
            const enabledTests = getEnabledTests(this.config.tests)
            if (enabledTests.length > 0) {
                console.log('🧪 Enabled tests:', enabledTests)
                
                // Initialize test renderers based on enabled tests
                this.initializeTests()
            } else {
                console.debug('🧪 No tests enabled')
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
            console.error('❌ Failed to set up props:', error)
            // Continue with available props
        }
    }
    
    /**
     * Initialize test renderers based on enabled tests
     */
    private initializeTests(): void {
        if (!this.config.tests) return
        
        // GPU Instanced Textures Test - Phase 2: Texture arrays
        // NOTE: This test initializes in setupEventListeners() when games are loaded
        
        // Test Objects - Simple geometric test objects
        if (isTestEnabled(this.config.tests, TestMode.SPAWN_TEST_OBJECTS)) {
            console.log('🧪 Initializing SPAWN_TEST_OBJECTS test')
            this.setupTestObjects()
        }
    }

    
    private async setupTestObjects(): Promise<void> {
        console.debug('🧪 Adding test objects...')
        
        // Small test cube for reference
        const geometry = new THREE.BoxGeometry(0.2, 0.2, 0.2)
        const material = new THREE.MeshPhongMaterial({ color: 0x00ff00 })
        const cube = new THREE.Mesh(geometry, material)
        cube.position.set(2, 0, -1) // Move to side so it doesn't interfere with shelf
        cube.castShadow = true
        cube.name = 'test-cube'
        this.propsGroup.add(cube)
        
        console.debug('✅ Test objects added')
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

    // TODO: Try this
    // and look for other unused (and unattempted) methods?
    /**
     * Add atmospheric props (wire racks, dividers, etc.)
     */
    public async addAtmosphericProps(): Promise<void> {
        console.debug('🎪 Adding atmospheric props...')
        
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
            
            console.debug('✅ Atmospheric props added')
        } catch (error) {
            console.error('❌ Failed to add atmospheric props:', error)
        }
    }

    public updatePerformanceData(camera: THREE.Camera): void {
        if (this.gameBoxRenderer) {
            this.gameBoxRenderer.updatePerformanceData(camera, this.scene)
            this.gameBoxRenderer.cleanupOffScreenTextures()
        }
    }

    public getPerformanceStats(): any {
        return this.gameBoxRenderer?.getPerformanceStats() ?? {}
    }

    /**
     * Get access to specific renderers for external use
     */
    public getStoreLayout(): StoreLayout {
        return this.storeLayout
    }

    public getGameBoxRenderer(): GameBoxRenderer {
        return this.gameBoxRenderer
    }

    public getSignageRenderer(): SignageRenderer {
        return this.signageRenderer
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
        
        console.debug(`🗑️ Cleared ${storeObjects.length} existing store environment objects`)
    }

    /**
     * Create a row of shelves with VR-optimized spacing and navigation
     * Phase 4: Layout optimization for better VR experience
     */
    private async createShelfRow(rowIndex: number, shelfCount: number, games: SteamGameData[] = []): Promise<void> {
        const rowGroup = new THREE.Group()
        rowGroup.name = `shelf-row-${rowIndex}`
        
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
            
            // Create shelf using StoreLayout's shelf generator
            const shelfGroup = await this.createSingleShelfWithGames(shelfPosition, rowIndex, i, shelfGames)
            rowGroup.add(shelfGroup)
        }
        
        this.scene.add(rowGroup)
        console.debug(`📚 Created shelf row ${rowIndex} with ${shelfCount} shelves`)
    }

    /**
     * Create a single shelf with game placement capability
     */
    private async createSingleShelfWithGames(position: THREE.Vector3, rowIndex: number, shelfIndex: number, games: any[] = []): Promise<THREE.Group> {
        const shelfGroup = new THREE.Group()
        shelfGroup.name = `dynamic-shelf-${rowIndex}-${shelfIndex}`
        shelfGroup.position.copy(position)
        
        // Create a single shelf unit using ProceduralShelfGenerator directly
        try {
            const shelfGenerator = new ProceduralShelfGenerator()
            const shelfUnit = shelfGenerator.generateShelfUnit(new THREE.Vector3(0, 0, 0))
            shelfGroup.add(shelfUnit)
            
            // Create game boxes with actual game data if available
            if (games.length > 0) {
                await this.spawnActualGamesOnShelf(shelfUnit, shelfGroup, games, rowIndex, shelfIndex)
            } else {
                console.debug(`📦 No game data available for shelf ${rowIndex}-${shelfIndex}, skipping game box creation`)
            }
            
            console.debug(`📚 Created single shelf unit at position:`, position)
        } catch (error) {
            console.error(`❌ Failed to create shelf unit:`, error)
        }
        
        // Update GPU for both instanced renderers after creating the shelf
        this.gameBoxRenderer.getInstancedLabelRenderer()?.updateGPU()
        
        this.gameBoxRenderer.getInstancedArtworkRenderer()?.updateGPU()
        
        return shelfGroup
    }

    /**
     * Spawn actual game boxes with game names on dynamically created shelves
     */
    private async spawnActualGamesOnShelf(shelfUnit: THREE.Group, parentGroup: THREE.Group, games: any[], rowIndex: number, shelfIndex: number): Promise<void> {
        console.debug(`🎮 Spawning ${games.length} actual games on shelf ${rowIndex}-${shelfIndex}`);
        
        // Find shelf surfaces (same logic as StoreLayout but simplified for dynamic shelves)
        const shelfSurfaces = this.findDynamicShelfSurfaces(shelfUnit);
        console.debug(`📚 Found ${shelfSurfaces.length} surfaces on dynamic shelf`);
        
        if (shelfSurfaces.length === 0) {
            console.warn(`⚠️ No shelf surfaces found on dynamic shelf ${rowIndex}-${shelfIndex}`);
            return;
        }
        
        let gameIndex = 0;
        
        for (let surfaceIdx = 0; surfaceIdx < shelfSurfaces.length && gameIndex < games.length; surfaceIdx++) {
            const surface = shelfSurfaces[surfaceIdx];
            
            // Spawn games on front side
            const frontGames = games.slice(gameIndex, gameIndex + GameLayoutConstants.GAMES_PER_SURFACE);
            if (frontGames.length > 0) {
                await this.createGameBoxesWithNames(surface, parentGroup, frontGames, 'front', surfaceIdx);
                gameIndex += frontGames.length;
            }
            
            // Spawn games on back side
            const backGames = games.slice(gameIndex, gameIndex + GameLayoutConstants.GAMES_PER_SURFACE);
            if (backGames.length > 0) {
                await this.createGameBoxesWithNames(surface, parentGroup, backGames, 'back', surfaceIdx);
                gameIndex += backGames.length;
            }
        }
        
        console.debug(`✅ Spawned ${gameIndex} game boxes with names on dynamic shelf`);
    }

    /**
     * Find shelf surfaces on dynamically created shelves (simplified version)
     */
    private findDynamicShelfSurfaces(shelfUnit: THREE.Group): Array<{topY: number, frontZ: number, backZ: number, centerX: number, width: number}> {
        const surfaces: Array<{topY: number, frontZ: number, backZ: number, centerX: number, width: number}> = [];
        
        shelfUnit.traverse((child) => {
            if (child instanceof THREE.Mesh && child.geometry instanceof THREE.BoxGeometry) {
                const box = new THREE.Box3().setFromObject(child);
                const size = box.getSize(new THREE.Vector3());
                
                // Look for horizontal surfaces (wide, thin, reasonable depth)
                if (size.x > 1.5 && size.y < 0.1 && size.z > 0.3) {
                    surfaces.push({
                        topY: box.max.y,
                        frontZ: box.min.z,
                        backZ: box.max.z,
                        centerX: (box.min.x + box.max.x) / 2,
                        width: size.x
                    });
                }
            }
        });
        
        // Simple deduplication and sorting
        const uniqueSurfaces = surfaces.filter((surface, index, array) => {
            return index === 0 || Math.abs(surface.topY - array[index - 1].topY) > 0.02;
        });
        
        return uniqueSurfaces.sort((a, b) => a.topY - b.topY);
    }

    /**
     * Create game boxes on shelf surface (delegated to GameBoxRenderer)
     */
    private async createGameBoxesWithNames(
        surface: {topY: number, frontZ: number, backZ: number, centerX: number, width: number}, 
        parentGroup: THREE.Group, 
        games: any[], 
        side: 'front' | 'back', 
        surfaceIndex: number
    ): Promise<void> {
        if (!this.gameBoxRenderer) {
            console.warn('⚠️ GameBoxRenderer not available, cannot create game boxes')
            return
        }

        // StorePropsRenderer now handles positioning and parenting
        const Z_OFFSET = 0.1        // 10cm from shelf surface
        const Y_OFFSET = 0.005      // 5mm above shelf surface  
        const GAME_HEIGHT = 0.4     // 40cm height
        const GAME_SPACING = 0.35   // 35cm spacing between games
        
        // Calculate positioning
        const gameY = surface.topY + Y_OFFSET + GAME_HEIGHT / 2
        const gameZ = side === 'front' ? surface.frontZ + Z_OFFSET : surface.backZ - Z_OFFSET
        
        // Center the games on the shelf
        const totalWidth = (games.length - 1) * GAME_SPACING
        const startX = surface.centerX - totalWidth / 2
        
        let createdCount = 0
        for (let i = 0; i < games.length; i++) {
            const game = games[i]
            const gameX = startX + (i * GAME_SPACING)
            const localPosition = new THREE.Vector3(gameX, gameY, gameZ)
            // Convert local shelf position to world position by adding parent group's world position
            const worldPosition = localPosition.clone().add(parentGroup.position)
            const name = `game-${game.name?.replace(/[^a-zA-Z0-9]/g, '-') || 'unknown'}-${side}-${i}`
            
            // Use artwork for every 20th game (global index), text labels for others
            const shouldUseArtwork = (this.globalGameIndex % 20) === 0
            let textureOptions = undefined
            
            if (shouldUseArtwork && game.artwork?.header) {
                // Try to get or download artwork for featured games
                try {
                    console.log(`🎨 Attempting to load artwork for featured game: ${game.name} from URL: ${game.artwork.header}`)
                    
                    const imageBlob = await this.imageManager.downloadImage(game.artwork.header, {
                        timeout: 5000, // 5 second timeout for artwork loading
                        enableFallback: true,
                        onImageLoaded: (url, blob) => {
                            console.log(`✅ Successfully loaded artwork for ${game.name} (${blob.size} bytes)`)
                        },
                        onImageError: (url, error) => {
                            console.error(`❌ Failed to download artwork from ${url} for ${game.name}:`, error.message)
                        }
                    })
                    
                    if (imageBlob) {
                        // Convert blob to texture options for GameBoxRenderer
                        textureOptions = await this.createTextureOptionsFromBlob(imageBlob, game.name)
                        console.log(`🎨 Successfully created texture for featured game: ${game.name}`)
                    } else {
                        console.warn(`⚠️ No artwork blob received for ${game.name} - falling back to text label`)
                    }
                } catch (error) {
                    console.error(`❌ Exception while loading artwork for ${game.name}:`, error)
                }
            }
            
            // Create game box at world position (required for InstancedMesh)
            const gameBox = this.gameBoxRenderer.createGameBox(game, worldPosition, textureOptions, name)
            if (gameBox) {
                // Individual meshes use local position since they're parented to the group
                gameBox.position.copy(localPosition)
                parentGroup.add(gameBox)  // Add individual game box to parent group
                createdCount++
            } else {
                // Instanced rendering returns null but still counts as created
                // Check if we need to add InstancedMeshes to scene (happens once per renderer type)
                const labelMesh = this.gameBoxRenderer.getInstancedLabelMeshForScene()
                if (labelMesh) {
                    this.scene.add(labelMesh)
                    console.log('📋 Added instanced label mesh to scene')
                }
                
                const artworkMesh = this.gameBoxRenderer.getInstancedArtworkMeshForScene()
                if (artworkMesh) {
                    this.scene.add(artworkMesh)
                    console.log('🎨 Added instanced artwork mesh to scene')
                }
                createdCount++
            }
            
            this.globalGameIndex++ // Increment global game counter
        }

        console.debug(`✅ Created ${createdCount} game boxes on shelf surface via GameBoxRenderer`)
    }

    /**
     * Create texture options from an image blob for game box artwork
     */
    private async createTextureOptionsFromBlob(blob: Blob, gameName: string): Promise<GameBoxTextureOptions> {
        return new Promise((resolve, reject) => {
            console.debug(`🖼️ Creating texture from blob for ${gameName}: ${blob.size} bytes, type: ${blob.type}`)
            
            const img = new Image()
            img.onload = () => {
                try {
                    console.debug(`📐 Image loaded for ${gameName}: ${img.width}x${img.height}`)
                    
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
                    
                    console.debug(`🎨 Canvas size for ${gameName}: ${canvas.width}x${canvas.height} (scale: ${scale.toFixed(3)})`)
                    
                    // Draw the image onto the canvas
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
                    
                    // Create texture from canvas
                    const texture = new THREE.CanvasTexture(canvas)
                    texture.needsUpdate = true
                    
                    console.debug(`✅ Successfully created THREE.js texture for ${gameName}`)
                    
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
            console.debug(`🔗 Created object URL for ${gameName}: ${objectUrl}`)
            img.src = objectUrl
        })
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
    }

    public dispose(): void {
        this.clearProps()
        this.signageRenderer?.dispose()
        this.storeLayout?.dispose()
        this.propRenderer?.dispose()
        
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
    }
}