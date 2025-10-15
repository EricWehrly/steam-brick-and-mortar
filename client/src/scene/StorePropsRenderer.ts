/**
 * Store Props Renderer - Interactive Objects and Props (MAIN ENTRY POINT)
 * 
 * This is the main entry point for store props rendering. As of the bifurcation refactor,
 * this now delegates to the InstancedStorePropsRenderer by default for optimal performance.
 * 
 * TODO: Future integration with renderer selection system:
 * TODO: - Hardware capability detection
 * TODO: - Performance-based automatic selection  
 * TODO: - A/B testing configuration
 * TODO: - User preference settings
 * TODO: - Fallback to LegacyStorePropsRenderer when needed
 * 
 * For now, hardcoded to use InstancedStorePropsRenderer (new GPU instanced system)
 * for best performance and to eliminate mixed legacy/new code paths.
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
import { InstancedStorePropsRenderer } from './InstancedStorePropsRenderer'
import type { IStorePropsRenderer } from './IStorePropsRenderer'
import { DataManager } from '../core/data'
import { GameBoxRenderer } from './GameBoxRenderer'

// Export PropsConfig interface for backward compatibility 
export interface PropsConfig {
    /** Enable shelf generation */
    enableShelves?: boolean
    /** Enable game boxes */
    enableGameBoxes?: boolean
    /** Enable signage */
    enableSignage?: boolean
    /** Enable test objects */
    enableTestObjects?: boolean
    /** Enable debugging aids */
    enableDebugObjects?: boolean
    /** Enable atmospheric props */
    enableAtmosphericProps?: boolean
    /** Enable performance optimizations */
    enablePerformanceOptimizations?: boolean
    /** Test configuration */
    tests?: Record<string, string> | any[] // Flexible type for backward compatibility
    /** Performance settings */
    performance?: {
        /** Maximum texture resolution */
        maxTextureSize?: number
        /** Near distance for texture loading */
        nearDistance?: number
        /** Far distance for texture cleanup */
        farDistance?: number
        /** Maximum number of active textures */
        maxActiveTextures?: number
        /** Enable frustum culling */
        frustumCullingEnabled?: boolean
    }
}

// Configuration constants for game layout - made static and accessible
// TODO: Make these user-configurable in game menus
export class GameLayoutConstants {
    static readonly GAMES_PER_SURFACE = 3 // Games per shelf surface (front/back of each shelf level)
    static readonly SURFACES_PER_SHELF = 6 // 3 shelf levels × 2 sides (front/back) = 6 surfaces per shelf unit
    // TODO: Calculate SURFACES_PER_SHELF dynamically from shelf geometry in future
}

/**
 * StorePropsRenderer - Main Entry Point (Delegating Implementation)
 * 
 * This class now delegates to InstancedStorePropsRenderer for optimal performance
 * while maintaining the same API for backward compatibility.
 * 
 * TODO: Future renderer selection system will be implemented here:
 * TODO: - Hardware capability detection
 * TODO: - Performance-based selection logic
 * TODO: - A/B testing framework integration
 * TODO: - User preference handling
 * TODO: - Automatic fallback to LegacyStorePropsRenderer when needed
 */
export class StorePropsRenderer implements IStorePropsRenderer {
    private actualRenderer: IStorePropsRenderer

    constructor(scene: THREE.Scene, dataManager: DataManager, gameBoxRenderer: GameBoxRenderer) {
        // TODO: Replace this hardcoded selection with intelligent renderer selection
        // TODO: Based on hardware capabilities, performance requirements, user settings
        
        this.actualRenderer = new InstancedStorePropsRenderer(scene, dataManager, gameBoxRenderer)
        
        // TODO: Add renderer selection logic here:
        // const rendererType = this.selectOptimalRenderer(scene, dataManager, gameBoxRenderer)
        // if (rendererType === 'legacy') {
        //     this.actualRenderer = new LegacyStorePropsRenderer(scene, dataManager, gameBoxRenderer)
        // } else {
        //     this.actualRenderer = new InstancedStorePropsRenderer(scene, dataManager, gameBoxRenderer)  
        // }
    }

    // TODO: Future renderer selection method
    // private selectOptimalRenderer(scene: THREE.Scene, dataManager: DataManager, gameBoxRenderer: GameBoxRenderer): 'legacy' | 'instanced' {
    //     // Hardware capability detection
    //     const hasInstancedArrays = this.checkInstancedArraySupport()
    //     const hasGoodGPU = this.checkGPUPerformance()
    //     
    //     // Performance requirements
    //     const gameCount = dataManager.get<any[]>('steam.games')?.length || 0
    //     const needsHighPerformance = gameCount > 100
    //     
    //     // User preferences
    //     const userPreference = dataManager.get<string>('settings.graphics.rendererType', 'auto')
    //     
    //     // A/B testing
    //     const abTestConfig = dataManager.get<any>('testing.rendererABTest')
    //     
    //     // Selection logic
    //     if (userPreference === 'legacy') return 'legacy'
    //     if (userPreference === 'instanced') return 'instanced'
    //     
    //     // Automatic selection based on capabilities and performance needs
    //     if (hasInstancedArrays && hasGoodGPU && needsHighPerformance) {
    //         return 'instanced'
    //     } else {
    //         return 'legacy' 
    //     }
    // }

    // Delegate all IStorePropsRenderer methods to the actual implementation
    public async setupProps(config?: PropsConfig): Promise<void> {
        return this.actualRenderer.setupProps(config)
    }

    public async addAtmosphericProps(): Promise<void> {
        return this.actualRenderer.addAtmosphericProps()
    }

    public updatePerformanceData(camera: THREE.Camera): void {
        return this.actualRenderer.updatePerformanceData(camera)
    }

    public clearProps(): void {
        return this.actualRenderer.clearProps()
    }

    public dispose(): void {
        return this.actualRenderer.dispose()
    }
}