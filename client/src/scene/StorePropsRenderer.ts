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

export interface PropsConfig {
    /** Enable shelf generation */
    enableShelves?: boolean
    /** Enable game boxes */
    enableGameBoxes?: boolean
    /** Enable signage */
    enableSignage?: boolean
    /** Enable test objects */
    enableTestObjects?: boolean
    /** Maximum games to render */
    maxGames?: number
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
    private propsGroup: THREE.Group
    private config: PropsConfig = {}

    constructor(scene: THREE.Scene) {
        this.scene = scene
        this.propRenderer = new PropRenderer(scene)
        
        // Create group to hold all props
        this.propsGroup = new THREE.Group()
        this.propsGroup.name = 'props'
        this.scene.add(this.propsGroup)
        
        // Initialize renderers
        this.initializeRenderers()
    }

    private initializeRenderers(): void {
        // Initialize store layout for shelves
        this.storeLayout = new StoreLayout(this.scene)
        
        // Initialize signage renderer
        this.signageRenderer = new SignageRenderer()
    }

    public async setupProps(config: PropsConfig = {}): Promise<void> {
        this.config = { ...this.getDefaultConfig(), ...config }
        
        console.log('🎁 Setting up store props...')
        
        try {
            // Set up props in logical order
            if (this.config.enableShelves) {
                await this.setupShelves()
            }
            
            if (this.config.enableSignage) {
                await this.setupSignage()
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
            maxGames: 100,
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
     * Set up shelf systems with automatic best-method selection and fallback
     */
    private async setupShelves(): Promise<void> {
        console.log('📚 Generating shelves (auto: attempting GPU-optimized with fallbacks)...')
        
        try {
            // Attempt GPU-optimized generation first (best performance)
            await this.storeLayout.generateShelvesGPUOptimized()
            console.log('✅ Shelves generated successfully (GPU-optimized)')
        } catch (error) {
            console.warn('❌ GPU-optimized generation failed, trying chunked method...', error)
            try {
                // Fallback to chunked generation
                await this.storeLayout.generateShelvesChunked()
                console.log('✅ Shelves generated successfully (chunked fallback)')
            } catch (chunkedError) {
                console.warn('❌ Chunked generation failed, using basic method...', chunkedError)
                try {
                    // Final fallback to basic generation
                    await this.storeLayout.generateStore()
                    console.log('✅ Shelves generated successfully (basic fallback)')
                } catch (basicError) {
                    console.error('❌ All shelf generation methods failed:', basicError)
                    // Try at least generating a basic room structure
                    await this.storeLayout.generateBasicRoom()
                    console.log('⚠️ Using minimal room structure (emergency fallback)')
                }
            }
        }
    }

    private async setupSignage(): Promise<void> {
        console.log('🪧 Setting up signage...')
        
        try {
            // Create standard Blockbuster signage
            this.signageRenderer.createStandardSigns(this.scene)
            
            console.log('✅ Signage setup complete')
        } catch (error) {
            console.error('❌ Failed to set up signage:', error)
        }
    }

    private async setupTestObjects(): Promise<void> {
        console.log('🧪 Adding test objects...')
        
        // Small test cube for reference
        const geometry = new THREE.BoxGeometry(0.2, 0.2, 0.2)
        const material = new THREE.MeshPhongMaterial({ color: 0x00ff00 })
        const cube = new THREE.Mesh(geometry, material)
        cube.position.set(2, 0, -1) // Move to side so it doesn't interfere with shelf
        cube.castShadow = true
        cube.name = 'test-cube'
        this.propsGroup.add(cube)
        
        console.log('✅ Test objects added')
    }

    private initializeGameBoxRenderer(): void {
        console.log('🎮 Initializing game box renderer...')
        
        this.gameBoxRenderer = new GameBoxRenderer(
            undefined, // Use default dimensions
            { maxGames: this.config.maxGames ?? 100 },
            { 
                // Performance configuration for large libraries
                maxTextureSize: this.config.performance?.maxTextureSize ?? 1024,
                nearDistance: this.config.performance?.nearDistance ?? 2.0,
                farDistance: this.config.performance?.farDistance ?? 10.0,
                maxActiveTextures: this.config.performance?.maxActiveTextures ?? 50,
                frustumCullingEnabled: this.config.performance?.frustumCullingEnabled ?? true
            }
        )
        
        console.log('✅ Game box renderer initialized')
    }

    /**
     * Add atmospheric props (wire racks, dividers, etc.)
     */
    public async addAtmosphericProps(): Promise<void> {
        console.log('🎪 Adding atmospheric props...')
        
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
            
            console.log('✅ Atmospheric props added')
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

    public updateMaxGames(maxGames: number): void {
        if (this.gameBoxRenderer) {
            this.gameBoxRenderer.updateShelfConfig({ maxGames })
        }
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
        // Note: GameBoxRenderer cleanup is handled by SteamGameManager
        this.scene.remove(this.propsGroup)
    }
}