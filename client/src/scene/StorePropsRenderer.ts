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
import { RoomStructureBuilder } from './RoomStructureBuilder'
import { EnvironmentRenderer } from './EnvironmentRenderer'
import { RoomManager, RoomConstants } from './RoomManager'
import { EventManager } from '../core/EventManager'
import { RoomEventTypes } from '../types/InteractionEvents'
import type { StoreLayoutConfig } from './StoreLayoutConfig'

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
}

export class StorePropsRenderer {
    private scene: THREE.Scene
    private storeLayout: StoreLayout
    private gameBoxRenderer: GameBoxRenderer
    private signageRenderer: SignageRenderer
    private propRenderer: PropRenderer
    private roomStructureBuilder: RoomStructureBuilder
    private propsGroup: THREE.Group
    private config: PropsConfig = {}
    private currentStoreGroup: THREE.Group | null = null // Track current store environment
    private environmentRenderer?: EnvironmentRenderer

    constructor(scene: THREE.Scene, environmentRenderer?: EnvironmentRenderer) {
        this.scene = scene
        this.propRenderer = new PropRenderer(scene)
        this.roomStructureBuilder = new RoomStructureBuilder()
        this.environmentRenderer = environmentRenderer
        
        // Create group to hold all props
        this.propsGroup = new THREE.Group()
        this.propsGroup.name = 'props'
        this.scene.add(this.propsGroup)
        
        // Initialize renderers
        this.initializeRenderers()
        
        // Set up event listeners for room events
        this.setupEventListeners()
    }

    private initializeRenderers(): void {
        // Initialize store layout for shelves
        this.storeLayout = new StoreLayout(this.scene)
        
        // Initialize signage renderer
        this.signageRenderer = new SignageRenderer()
    }

    /**
     * Set up event listeners for room management events
     */
    private setupEventListeners(): void {
        EventManager.getInstance().registerEventHandler(RoomEventTypes.Resized, this.onRoomResized.bind(this))
    }

    /**
     * Handle room resized event by spawning shelves for the new room size
     */
    private async onRoomResized(event: CustomEvent): Promise<void> {
        const eventData = event.detail
        console.debug(`🏗️ StorePropsRenderer received room:resized event:`, eventData)
        
        if (eventData.gameCount && eventData.games) {
            try {
                // Calculate shelves needed based on game count
                const gamesPerShelf = GameLayoutConstants.GAMES_PER_SURFACE * GameLayoutConstants.SURFACES_PER_SHELF
                const shelvesNeeded = Math.ceil(eventData.gameCount / gamesPerShelf)
                
                console.debug(`📚 Spawning ${shelvesNeeded} shelves for ${eventData.gameCount} games in resized room`)
                
                // Clear existing shelves first
                this.clearExistingShelves()
                
                // Create shelf rows based on needed shelves  
                const maxShelvesPerRow = 4
                const rows = Math.ceil(shelvesNeeded / maxShelvesPerRow)
                
                for (let row = 0; row < rows; row++) {
                    const shelvesInThisRow = Math.min(maxShelvesPerRow, shelvesNeeded - (row * maxShelvesPerRow))
                    await this.createShelfRow(row, shelvesInThisRow, eventData.games)
                }
                
                console.debug(`✅ Dynamic shelves spawned via room:resized event: ${shelvesNeeded} shelves in ${rows} row(s)`)
                
            } catch (error) {
                console.error('❌ Failed to spawn shelves from room:resized event:', error)
            }
        }
    }

    public async setupProps(config: PropsConfig = {}): Promise<void> {
        this.config = { ...this.getDefaultConfig(), ...config }
        
        console.debug('🎁 Setting up store props...')
        
        try {
            // Set up props in logical order
            // NOTE: Static shelf setup removed - only dynamic generation via spawnDynamicShelvesWithGames()
            // This eliminates duplicate environment creation
            
            if (this.config.enableSignage) {
                // this.signageRenderer.createStandardSigns(this.scene);
            }
            
            if (this.config.enableTestObjects) {
                await this.setupTestObjects()
            }
            
            // Initialize game box renderer (games are populated later via Steam API)
            if (this.config.enableGameBoxes) {
                this.initializeGameBoxRenderer()
            }
            
            console.log('✅ Store props setup complete!')
        } catch (error) {
            console.error('❌ Failed to set up props:', error)
            // Continue with available props
        }
    }

    private getDefaultConfig(): PropsConfig {
        return {
            enableShelves: true,
            enableGameBoxes: true,
            enableSignage: true,
            enableTestObjects: false, // Disabled by default for production
            performance: {
                maxTextureSize: 1024,
                nearDistance: 2.0,
                farDistance: 10.0,
                maxActiveTextures: 50,
                frustumCullingEnabled: true
            }
        }
    }

    // REMOVED: setupShelves() method - was creating duplicate static environment
    // Only dynamic generation via spawnDynamicShelvesWithGames() should be used

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

    // TODO: I don't think this is useful
    private initializeGameBoxRenderer(): void {
        console.debug('🎮 Initializing game box renderer...')
        
        this.gameBoxRenderer = new GameBoxRenderer(
            undefined, // Use default dimensions
            undefined  // Use default shelf configuration
        )
        
        console.debug('✅ Game box renderer initialized')
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
     * Get props statistics for debugging
     */
    public getPropsStats(): {
        totalProps: number
        shelvesGenerated: boolean
        signageCount: number
        testObjectsEnabled: boolean
        gameBoxesEnabled: boolean
        storeStats?: any
    } {
        return {
            totalProps: this.propsGroup.children.length,
            shelvesGenerated: this.storeLayout !== undefined,
            signageCount: this.scene.children.filter(child => 
                child.name?.includes('signage') || child.name?.includes('sign')
            ).length,
            testObjectsEnabled: this.config.enableTestObjects ?? false,
            gameBoxesEnabled: this.config.enableGameBoxes ?? true,
            storeStats: this.storeLayout?.getStoreStats()
        }
    }

    /**
     * Spawn dynamic shelves based on game count and populate with loaded games
     */
    public async spawnDynamicShelvesWithGames(shelvesNeeded: number, gameCount: number, games: any[] = []): Promise<void> {
        console.debug(`📚 Spawning ${shelvesNeeded} dynamic shelves for ${gameCount} games with ${games.length} game data objects`)
        
        try {
            // Direct shelf spawning (for backward compatibility with tests and legacy callers)
            // The event-driven flow should use: SceneCoordinator → room:resize → RoomManager → room:resized → onRoomResized
            const gamesPerShelf = GameLayoutConstants.GAMES_PER_SURFACE * GameLayoutConstants.SURFACES_PER_SHELF
            const calculatedShelvesNeeded = Math.ceil(gameCount / gamesPerShelf)
            const actualShelvesNeeded = calculatedShelvesNeeded // Use calculated value for consistency
            
            console.debug(`📊 Calculation: ${gameCount} games ÷ (${GameLayoutConstants.GAMES_PER_SURFACE} games/surface × ${GameLayoutConstants.SURFACES_PER_SHELF} surfaces/shelf) = ${actualShelvesNeeded} shelves`)
            
            // Clear existing shelves first
            this.clearExistingShelves()
            
            // Create shelf rows based on needed shelves
            const maxShelvesPerRow = 4
            const rows = Math.ceil(actualShelvesNeeded / maxShelvesPerRow)
            
            for (let row = 0; row < rows; row++) {
                const shelvesInThisRow = Math.min(maxShelvesPerRow, actualShelvesNeeded - (row * maxShelvesPerRow))
                await this.createShelfRow(row, shelvesInThisRow, games)
            }
            
            console.debug(`✅ Dynamic shelves spawned directly: ${actualShelvesNeeded} shelves in ${rows} row(s)`)
            
        } catch (error) {
            console.error('❌ Failed to spawn dynamic shelves:', error)
            throw error
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
            child.name?.includes('entrance') || // Clear entrance areas
            child.name?.includes('TheShelf') // Clear test shelves
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
    private async createShelfRow(rowIndex: number, shelfCount: number, games: any[] = []): Promise<void> {
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
     * Create game boxes with text materials showing game names
     */
    private async createGameBoxesWithNames(
        surface: {topY: number, frontZ: number, backZ: number, centerX: number, width: number}, 
        parentGroup: THREE.Group, 
        games: any[], 
        side: 'front' | 'back', 
        surfaceIndex: number
    ): Promise<void> {
        // TODO: Extract these to easier configuration locations
        const Z_OFFSET = 0.025;
        const Y_OFFSET = 0.11;
        const GAME_HEIGHT = 0.24;  // 1.2x larger: 0.2 * 1.2 = 0.24
        const GAME_WIDTH = 0.18;   // 1.2x larger: 0.15 * 1.2 = 0.18
        const GAME_DEPTH = 0.05;   // Keep Z the same
        const GAME_SPACING = 0.3;
        
        // Calculate positioning
        const gameY = surface.topY + Y_OFFSET + GAME_HEIGHT / 2;
        const gameZ = side === 'front' ? surface.frontZ + Z_OFFSET : surface.backZ - Z_OFFSET;
        
        // Center the games on the shelf
        const totalWidth = (games.length - 1) * GAME_SPACING;
        const startX = surface.centerX - totalWidth / 2;
        
        for (let i = 0; i < games.length; i++) {
            const game = games[i];
            const gameX = startX + (i * GAME_SPACING);
            
            // Create game box geometry
            const gameGeometry = new THREE.BoxGeometry(GAME_WIDTH, GAME_HEIGHT, GAME_DEPTH);
            
            // Create material with game name
            const gameMaterial = await this.createGameNameMaterial(game);
            
            // Create game box mesh
            const gameBox = new THREE.Mesh(gameGeometry, gameMaterial);
            gameBox.position.set(gameX, gameY, gameZ);
            gameBox.name = `game-${game.name?.replace(/[^a-zA-Z0-9]/g, '-') || 'unknown'}-${side}-${i}`;
            
            parentGroup.add(gameBox);
            
            console.debug(`📦 Created game box for "${game.name}" at position (${gameX.toFixed(2)}, ${gameY.toFixed(2)}, ${gameZ.toFixed(2)})`);
        }
    }

    /**
     * Create a material with the game name written on it
     */
    private async createGameNameMaterial(game: any): Promise<THREE.Material> {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
            // Fallback to basic material if canvas fails
            return new THREE.MeshPhongMaterial({ color: 0x8B4513 }); // Brown color
        }
        
        // Background (game box color)
        ctx.fillStyle = '#2c3e50'; // Dark blue-gray
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Game name text - larger font and better contrast
        ctx.fillStyle = '#f8f9fa';  // Almost pure white for better contrast
        ctx.font = 'bold 48px Arial';  // Double the size: 24px * 2 = 48px
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Wrap text if it's too long
        const gameName = game.name || 'Unknown Game';
        const maxWidth = canvas.width - 20; // Leave some padding
        const words = gameName.split(' ');
        let lines: string[] = [];
        let currentLine = '';
        
        for (const word of words) {
            const testLine = currentLine ? `${currentLine} ${word}` : word;
            const metrics = ctx.measureText(testLine);
            
            if (metrics.width > maxWidth && currentLine) {
                lines.push(currentLine);
                currentLine = word;
            } else {
                currentLine = testLine;
            }
        }
        if (currentLine) lines.push(currentLine);
        
        // Limit to 3 lines max
        lines = lines.slice(0, 3);
        
        // Draw the text lines - adjust line height for larger font
        const lineHeight = 60;  // Double the line height for larger font
        const startY = canvas.height / 2 - ((lines.length - 1) * lineHeight) / 2;
        
        lines.forEach((line, index) => {
            ctx.fillText(line, canvas.width / 2, startY + (index * lineHeight));
        });
        
        // Create texture and material
        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;
        
        return new THREE.MeshPhongMaterial({ 
            map: texture,
            transparent: false
        });
    }


    // expandStoreEnvironment method removed - RoomManager now handles all room structure creation
    // Shelf spawning happens via room:resized event in onRoomResized() method

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