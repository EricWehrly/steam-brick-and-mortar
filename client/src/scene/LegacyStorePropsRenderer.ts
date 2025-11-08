/**
 * Store Props Renderer (Legacy) - Interactive Objects and Props
 * 
 * LEGACY VERSION: Uses traditional ProceduralShelfGenerator for shelf rendering.
 * 
 * TODO: This file contains the legacy procedural generation approach.
 * TODO: Eventually integrate with new renderer selection system to choose between
 * TODO: this legacy version and InstancedStorePropsRenderer based on:
 * TODO: - Performance requirements
 * TODO: - Hardware capabilities  
 * TODO: - User preferences
 * TODO: - A/B testing configuration
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
import { ProceduralShelfGenerator } from './ProceduralShelfGenerator'
import { ShelfSide } from './props/SharedPropsUtils'
import type { IStorePropsRenderer, PropsConfig } from './IStorePropsRenderer'
import { GameLayoutConstants, VRLayoutUtils, GameBoxUtils, ShelfSurfaceUtils, type ShelfSurface } from './props/SharedPropsUtils'

import { EventManager } from '../core/EventManager'
import { RoomEventTypes } from '../types/InteractionEvents'
import { DataManager } from '../core/data'
import type { SteamGameData } from './game-box/types/GameData'
import { TestMode, getEnabledTests, isTestEnabled } from '../types/TestMode'
import { ImageManager } from '../steam/images/ImageManager'

// All other constants moved to RoomManager.RoomConstants - use those instead

export class LegacyStorePropsRenderer implements IStorePropsRenderer {
    private scene: THREE.Scene
    private dataManager: DataManager

    private storeLayout: StoreLayout
    private gameBoxRenderer: GameBoxRenderer
    private signageRenderer: SignageRenderer
    private propsGroup: THREE.Group
    private config: PropsConfig = {}
    private currentStoreGroup: THREE.Group | null = null // Track current store environment

    private imageManager: ImageManager
    private globalGameIndex: number = 0 // Track global game position for artwork selection

    constructor(scene: THREE.Scene, dataManager: DataManager) {
        this.scene = scene
        this.dataManager = dataManager

        // Create our own GameBoxRenderer instance (composition, not injection)
        this.gameBoxRenderer = new GameBoxRenderer()

        this.propsGroup = new THREE.Group()
        this.propsGroup.name = 'props-legacy'
        this.scene.add(this.propsGroup)
        
        this.imageManager = new ImageManager()
        
        this.initializeRenderers()
        
        this.setupEventListeners()
        
        console.log('🏪 LegacyStorePropsRenderer initialized - using ProceduralShelfGenerator')
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
     * Uses LEGACY ProceduralShelfGenerator - no instancing
     */
    private async generateShelvesAsync(): Promise<void> {
        const games = this.dataManager.get<SteamGameData[]>('steam.games') || []
        const gameCount = games.length
        
        try {
            // Calculate shelves needed based on game count
            const gamesPerShelf = GameLayoutConstants.GAMES_PER_SURFACE * GameLayoutConstants.SURFACES_PER_SHELF
            const shelvesNeeded = Math.ceil(gameCount / gamesPerShelf)
            
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
                await new Promise(resolve => setTimeout(resolve, 150))
                
                try {
                    await this.createShelfRow(row, shelvesInThisRow, games)
                } catch (error) {
                    console.error(`❌ Failed to create legacy shelf row ${row}:`, error)
                    throw error
                }
            }
            
            console.log('✅ Legacy shelf generation completed')
        } catch (error) {
            console.error('❌ Failed to generate legacy shelves asynchronously:', error)
            throw error
        }
    }

    public async setupProps(config: PropsConfig = {}): Promise<void> {
        this.config = { ...this.getDefaultConfig(), ...config }
        
        // Initialize test objects if requested
        if (this.config.tests) {
            this.initializeTestObjects(this.config.tests)
        }
        
        // Real prop setup now happens via room:resized events
        console.log('✅ Legacy props setup completed (event-driven)')
    }

    private initializeTestObjects(testsConfig: unknown[] | Record<string, string>): void {
        const testsSettings = Array.isArray(testsConfig) ? {} : testsConfig as Record<string, string>
        const enabledTests = getEnabledTests(testsSettings)
        
        if (enabledTests.length > 0 && isTestEnabled(testsSettings, TestMode.SPAWN_TEST_OBJECTS)) {
            // Small test cube for reference
            const geometry = new THREE.BoxGeometry(0.2, 0.2, 0.2)
            const material = new THREE.MeshPhongMaterial({ color: 0x00ff00 }) // Green for Legacy version
            const cube = new THREE.Mesh(geometry, material)
            cube.position.set(2, 0, -1) // Move to side so it doesn't interfere with shelf
            cube.castShadow = true
            cube.name = 'test-cube-legacy'
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
    }

    /**
     * Clear all created store objects from the scene
     */
    private clearExistingShelves(): void {
        // Legacy renderer puts everything in propsGroup, so just clear it
        while (this.propsGroup.children.length > 0) {
            const child = this.propsGroup.children[0]
            this.propsGroup.remove(child)
            
            // Dispose geometry and materials recursively
            if (child instanceof THREE.Group) {
                child.clear()
            } else if (child instanceof THREE.Mesh) {
                child.geometry?.dispose()
                if (child.material instanceof THREE.Material) {
                    child.material.dispose()
                } else if (Array.isArray(child.material)) {
                    child.material.forEach(mat => mat.dispose())
                }
            }
        }
    }

    /**
     * Create a row of shelves with VR-optimized spacing and navigation
     * LEGACY VERSION: Uses ProceduralShelfGenerator only
     */
    private async createShelfRow(rowIndex: number, shelfCount: number, games: SteamGameData[] = []): Promise<void> {
        const rowGroup = new THREE.Group()
        rowGroup.name = `legacy-shelf-row-${rowIndex}`
        
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
            
            // Create shelf using LEGACY ProceduralShelfGenerator ONLY
            const shelfGroup = await this.createProceduralShelf(shelfPosition, shelfGames, rowIndex, i)
            rowGroup.add(shelfGroup)
        }
        
        this.propsGroup.add(rowGroup)
    }

    private async createProceduralShelf(
        position: THREE.Vector3, 
        games: SteamGameData[], 
        rowIndex: number, 
        shelfIndex: number
    ): Promise<THREE.Group> {
        const shelfGroup = new THREE.Group()
        shelfGroup.name = `legacy-shelf-${rowIndex}-${shelfIndex}`
        shelfGroup.position.copy(position)
        
        try {
            const shelfGenerator = new ProceduralShelfGenerator()
            const shelfUnit = shelfGenerator.generateShelfUnit(new THREE.Vector3(0, 0, 0))
            shelfGroup.add(shelfUnit)
            
            // Create game boxes with actual game data if available
            if (games.length > 0) {
                await this.spawnActualGamesOnShelf(shelfUnit, shelfGroup, games, rowIndex, shelfIndex)
            }
            
            console.debug(`🏪 Created legacy procedural shelf ${rowIndex}-${shelfIndex}`)
        } catch (error) {
            console.error(`❌ Failed to create legacy shelf unit:`, error)
        }
        
        return shelfGroup
    }

    private async spawnActualGamesOnShelf(shelfUnit: THREE.Group, parentGroup: THREE.Group, games: SteamGameData[], rowIndex: number, shelfIndex: number): Promise<void> {
        // Find shelf surfaces using shared utility (Legacy path: traverse geometry)
        // Pass parent group position to ensure surfaces use correct coordinate system
        const shelfSurfaces = ShelfSurfaceUtils.findShelfSurfaces(shelfUnit, false, parentGroup.position)
        
        if (shelfSurfaces.length === 0) {
            console.warn(`⚠️ No shelf surfaces found on legacy shelf ${rowIndex}-${shelfIndex}`)
            return
        }
        
        let gameIndex = 0
        
        for (const surface of shelfSurfaces) {
            if (gameIndex >= games.length) break
            
            // Spawn games on front side
            const frontGames = games.slice(gameIndex, gameIndex + GameLayoutConstants.GAMES_PER_SURFACE)
            if (frontGames.length > 0) {
                await this.createGameBoxesWithNames(surface, parentGroup, frontGames, ShelfSide.Front)
                gameIndex += frontGames.length
            }
            
            // Spawn games on back side  
            if (gameIndex < games.length) {
                const backGames = games.slice(gameIndex, gameIndex + GameLayoutConstants.GAMES_PER_SURFACE)
                if (backGames.length > 0) {
                    await this.createGameBoxesWithNames(surface, parentGroup, backGames, ShelfSide.Back)
                    gameIndex += backGames.length
                }
            }
        }
    }

    private async createGameBoxesWithNames(
        surface: ShelfSurface, 
        parentGroup: THREE.Group, 
        games: SteamGameData[], 
        side: ShelfSide
    ): Promise<void> {
        // Use parent group position as shelf position for correct game positioning
        const gamePositions = GameBoxUtils.calculateGamePositions(parentGroup.position, surface, games, side)
        
        for (let i = 0; i < games.length; i++) {
            await this.createSingleGameBox(games[i], gamePositions[i], parentGroup, side, i)
        }
    }

    private async createSingleGameBox(
        game: SteamGameData, 
        localPosition: THREE.Vector3, 
        parentGroup: THREE.Group,
        side: ShelfSide,
        index: number
    ): Promise<void> {
        const worldPosition = localPosition.clone().add(parentGroup.position)
        const name = GameBoxUtils.generateGameBoxName(game, side, index, 'legacy')
        const textureOptions = await GameBoxUtils.loadArtworkIfNeeded(game, this.globalGameIndex, this.imageManager)
        
        const gameBox = this.gameBoxRenderer.createGameBox(game, worldPosition, textureOptions, name)
        if (gameBox) {
            // Use localPosition for positioning within parent group (Y offsets are already in localPosition)
            gameBox.position.copy(localPosition)
            parentGroup.add(gameBox)
        }
        
        this.globalGameIndex++
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
        
        // Clean up dynamic store environment
        if (this.currentStoreGroup) {
            this.scene.remove(this.currentStoreGroup)
            // TODO: Dispose materials and geometries properly
            this.currentStoreGroup = null
        }
        
        // Note: GameBoxRenderer cleanup is handled by SteamGameManager
        this.scene.remove(this.propsGroup)
        
        console.log('🧹 LegacyStorePropsRenderer disposed')
    }
}