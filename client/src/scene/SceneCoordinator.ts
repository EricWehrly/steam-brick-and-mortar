/**
 * Scene Coordinator - High-Level Scene Setup and Management
 * 
 * This coordinator handles complex scene setup operations that require
 * coordination between multiple renderers and managers:
 * - Complete store layout generation
 * - Renderer initialization and coordination  
 * - Test object management
 * - Scene performance monitoring integration
 * 
 * The App should only need to call setupCompleteScene() to get a fully
 * configured 3D environment without managing individual renderers.
 */

import * as THREE from 'three'
import { SceneManager } from './SceneManager'
import { GameBoxRenderer } from './GameBoxRenderer'
import { SignageRenderer } from './SignageRenderer'
import { StoreLayout } from './StoreLayout'

export interface SceneCoordinatorConfig {
    maxGames?: number
    performance?: {
        maxTextureSize?: number
        nearDistance?: number
        farDistance?: number
        highResolutionSize?: number
        mediumResolutionSize?: number
        lowResolutionSize?: number
        maxActiveTextures?: number
        frustumCullingEnabled?: boolean
    }
}

/**
 * Coordinates complex scene setup and renderer management
 */
export class SceneCoordinator {
    private sceneManager: SceneManager
    private gameBoxRenderer: GameBoxRenderer
    private signageRenderer: SignageRenderer
    private storeLayout: StoreLayout

    constructor(sceneManager: SceneManager, config: SceneCoordinatorConfig = {}) {
        this.sceneManager = sceneManager
        
        // Initialize store layout
        this.storeLayout = new StoreLayout(this.sceneManager.getScene())
        
        // Initialize signage renderer
        this.signageRenderer = new SignageRenderer()
        
        // Initialize VR-optimized game box renderer
        this.gameBoxRenderer = new GameBoxRenderer(
            undefined, // Use default dimensions
            { maxGames: config.maxGames ?? 100 },
            { 
                // Performance configuration for large libraries
                maxTextureSize: config.performance?.maxTextureSize ?? 1024,
                nearDistance: config.performance?.nearDistance ?? 2.0,
                farDistance: config.performance?.farDistance ?? 10.0,
                highResolutionSize: config.performance?.highResolutionSize ?? 512,
                mediumResolutionSize: config.performance?.mediumResolutionSize ?? 256,
                lowResolutionSize: config.performance?.lowResolutionSize ?? 128,
                maxActiveTextures: config.performance?.maxActiveTextures ?? Math.min(50, (config.maxGames ?? 100) / 2),
                frustumCullingEnabled: config.performance?.frustumCullingEnabled ?? true
            }
        )
    }

    /**
     * Set up the complete scene with store layout, signage, and test objects
     */
    async setupCompleteScene(): Promise<void> {
        console.log('🏪 Setting up complete VR-optimized store scene...')
        
        try {
            await this.setupStoreLayout()
            this.setupLighting()
            this.setupSignage()
            this.addTestObjects()
            this.logStoreStats()
            
            console.log('✅ Complete scene setup finished!')
        } catch (error) {
            console.error('❌ Failed to set up scene:', error)
            throw error
        }
    }

    /**
     * Update performance data for all renderers
     * Call this from the render loop
     */
    updatePerformanceData(camera: THREE.Camera): void {
        this.gameBoxRenderer.updatePerformanceData(camera, this.sceneManager.getScene())
        this.gameBoxRenderer.cleanupOffScreenTextures()
    }

    /**
     * Get performance statistics from the game box renderer
     */
    getPerformanceStats(): ReturnType<GameBoxRenderer['getPerformanceStats']> {
        return this.gameBoxRenderer.getPerformanceStats()
    }

    /**
     * Get access to the game box renderer for game management
     */
    getGameBoxRenderer(): GameBoxRenderer {
        return this.gameBoxRenderer
    }

    /**
     * Get access to the store layout for debugging
     */
    getStoreLayout(): StoreLayout {
        return this.storeLayout
    }

    /**
     * Clean up all scene resources
     */
    dispose(): void {
        this.signageRenderer.dispose()
        this.storeLayout.dispose()
        // Note: GameBoxRenderer cleanup is handled by SteamGameManager
    }

    // Private setup methods

    private async setupStoreLayout(): Promise<void> {
        // Generate the complete VR-optimized store layout with Steam categories
        await this.storeLayout.generateStore()
    }

    private setupLighting(): void {
        // Create visible fluorescent fixtures (positioned just below ceiling)
        this.sceneManager.createFluorescentFixtures(3.2)
    }

    private setupSignage(): void {
        // Create Blockbuster signage
        this.signageRenderer.createStandardSigns(this.sceneManager.getScene())
    }

    private addTestObjects(): void {
        // Small test cube for reference (can be removed later)
        const geometry = new THREE.BoxGeometry(0.2, 0.2, 0.2)
        const material = new THREE.MeshPhongMaterial({ color: 0x00ff00 })
        const cube = new THREE.Mesh(geometry, material)
        cube.position.set(2, 0, -1) // Move to side so it doesn't interfere with shelf
        cube.castShadow = true
        cube.name = 'cube' // For animation reference
        this.sceneManager.addToScene(cube)
    }

    private logStoreStats(): void {
        const stats = this.storeLayout.getStoreStats()
        console.log('📊 Store Stats:', stats)
    }
}
