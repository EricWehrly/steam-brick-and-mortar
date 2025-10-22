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
import { GameBoxRenderer } from './GameBoxRenderer'
import { SignageRenderer } from './SignageRenderer'
import { InstancedShelfRenderer } from './instancing/InstancedShelfRenderer'
import type { IStorePropsRenderer, PropsConfig } from './IStorePropsRenderer'
import { GameLayoutConstants, VRLayoutUtils, GameBoxUtils, ShelfSurfaceUtils, type ShelfSurface } from './props/SharedPropsUtils'

import { EventManager, EventSource } from '../core/EventManager'
import { RoomEventTypes, GameEventTypes, type InstancedBatchCompleteEvent } from '../types/InteractionEvents'
import { DataManager } from '../core/data'
import type { SteamGameData } from './game-box/types/GameData'
import { TestMode, getEnabledTests, isTestEnabled } from '../types/TestMode'
import { ImageManager } from '../steam/images/ImageManager'

export class GpuStorePropsRenderer implements IStorePropsRenderer {
    private scene: THREE.Scene
    private dataManager: DataManager

    private storeLayout: StoreLayout
    private gameBoxRenderer: GameBoxRenderer
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

    constructor(scene: THREE.Scene, dataManager: DataManager) {
        this.scene = scene
        this.dataManager = dataManager

        // Create our own GameBoxRenderer instance (composition, not injection)
        this.gameBoxRenderer = new GameBoxRenderer()

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
        this.instancedShelfRenderer.initialize()
    }

    private setupEventListeners(): void {
        EventManager.getInstance().registerEventHandler(RoomEventTypes.Resized, this.generateShelvesAsync.bind(this));
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
            
            // Emit InstancedBatchComplete event to trigger GPU updates
            EventManager.getInstance().emit(GameEventTypes.InstancedBatchComplete)
            
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

    public updatePerformanceData(camera: THREE.Camera): void {
        this.gameBoxRenderer.updatePerformanceData(camera, this.scene)
        this.gameBoxRenderer.cleanupOffScreenTextures()
        
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
    private async createInstancedShelfRow(rowIndex: number, shelfCount: number, games: SteamGameData[] = []): Promise<void> {
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
            
            // Calculate which games belong to this shelf (18 games per shelf: 3 rows × 2 sides × 3 games)
            const gamesPerShelf = GameLayoutConstants.GAMES_PER_SURFACE * GameLayoutConstants.SURFACES_PER_SHELF;
            const shelfGlobalIndex = rowIndex * 4 + i // 4 shelves per row max
            const startGameIndex = shelfGlobalIndex * gamesPerShelf
            const shelfGames = games.slice(startGameIndex, startGameIndex + gamesPerShelf)
            
            // Create shelf using INSTANCED InstancedShelfRenderer ONLY
            await this.createInstancedShelf(shelfPosition, shelfGames, rowIndex, i)
        }
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
            this.instancedShelfRenderer.setInstance(globalShelfIndex, {
                position: position,
                shelfConfig: {}
            })
            
            // Create game boxes with actual game data if available
            if (games.length > 0) {
                await this.spawnInstancedGamesOnShelf(position, games, rowIndex, shelfIndex)
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
                await this.createInstancedGameBoxes(shelfPosition, surface, frontGames, 'front')
                gameIndex += frontGames.length
            }
            
            // Spawn games on back side  
            if (gameIndex < games.length) {
                const backGames = games.slice(gameIndex, gameIndex + GameLayoutConstants.GAMES_PER_SURFACE)
                if (backGames.length > 0) {
                    await this.createInstancedGameBoxes(shelfPosition, surface, backGames, 'back')
                    gameIndex += backGames.length
                }
            }
        }
    }

    private async createInstancedGameBoxes(
        shelfPosition: THREE.Vector3,
        surface: ShelfSurface, 
        games: SteamGameData[], 
        side: 'front' | 'back'
    ): Promise<void> {
        const gamePositions = GameBoxUtils.calculateGamePositions(shelfPosition, surface, games, side)
        
        for (let i = 0; i < games.length; i++) {
            await this.createSingleInstancedGameBox(games[i], gamePositions[i], side, i)
        }
    }

    private async createSingleInstancedGameBox(
        game: SteamGameData, 
        worldPosition: THREE.Vector3, 
        side: 'front' | 'back',
        index: number
    ): Promise<void> {
        const name = GameBoxUtils.generateGameBoxName(game, side, index, 'gpu')
        const textureOptions = await GameBoxUtils.loadArtworkIfNeeded(game, this.globalGameIndex, this.imageManager)
        
        const gameBox = this.gameBoxRenderer.createGameBox(game, worldPosition, textureOptions, name)
        if (gameBox) {
            this.scene.add(gameBox)
            this.createdGameBoxes.push(gameBox) // Track for cleanup
        }
        
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