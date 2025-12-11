import * as THREE from 'three'
import { ShelfUnitBuilder } from './ShelfUnitBuilder'
import { DEFAULT_SHELF_CONFIG, type ShelfConfig } from '../props/SharedPropsUtils'
import { DEFAULT_INSTANCED_RENDERER_CONFIG, type InstancedRendererConfig, type InstanceData } from './IInstancedRenderer'
import type { IInstancedRenderer, InstancedRendererStats } from './IInstancedRenderer'
import { EventManager } from '../../core/EventManager'
import { GameEventTypes } from '../../types/InteractionEvents'
import { DataManager } from '../../core/data/DataManager'
import { DataKey } from '../../core/data/DataTypes'

export interface GroupShelfConfig extends InstancedRendererConfig {
    defaultShelfConfig?: ShelfConfig
    maxShelfUnits?: number
}

export const DEFAULT_GROUP_SHELF_CONFIG = {
    ...DEFAULT_INSTANCED_RENDERER_CONFIG,
    maxShelfUnits: 100,
    defaultShelfConfig: DEFAULT_SHELF_CONFIG
} as const

export interface ShelfInstanceData extends InstanceData {
    shelfConfig?: ShelfConfig
}

/**
 * Simplified shelf renderer using THREE.Group cloning instead of InstancedMesh.
 * 
 * Architecture:
 * - ShelfUnitBuilder creates ONE template shelf group
 * - Each shelf is a clone of that template at a different position
 * - Much simpler than managing 4 separate InstancedMeshManagers
 * 
 * Trade-offs:
 * - Slightly more draw calls (one per material per shelf vs one per material total)
 * - But Three.js batches objects with same geometry/material automatically
 * - Much simpler code, easier to maintain and debug
 * - Geometry and materials are shared via clone(), so memory is similar
 */
export class GroupShelfRenderer implements IInstancedRenderer {
    private readonly maxShelfUnits: number
    private readonly defaultShelfConfig: Required<ShelfConfig>
    private isInitialized: boolean = false
    
    private shelfBuilder: ShelfUnitBuilder | null = null
    private shelfUnits: Map<number, THREE.Group> = new Map()
    private shelfContainer: THREE.Group | null = null
    
    constructor(config: GroupShelfConfig = {}) {
        this.maxShelfUnits = config.maxShelfUnits ?? DEFAULT_GROUP_SHELF_CONFIG.maxShelfUnits
        
        this.defaultShelfConfig = {
            ...DEFAULT_GROUP_SHELF_CONFIG.defaultShelfConfig,
            ...config.defaultShelfConfig
        } as Required<ShelfConfig>
        
        // Register event listener for GPU updates after batch completes
        EventManager.getInstance().registerEventHandler(
            GameEventTypes.InstancedBatchComplete,
            this.updateGPU.bind(this)
        )
        
        console.debug(`🏪 GroupShelfRenderer created (max units: ${this.maxShelfUnits})`)
    }
    
    public async initialize(): Promise<void> {
        if (this.isInitialized) {
            console.warn('GroupShelfRenderer already initialized')
            return
        }
        
        try {
            // Create the shelf builder with our config
            this.shelfBuilder = new ShelfUnitBuilder(this.defaultShelfConfig)
            
            // Build the template (this is the only "expensive" operation)
            this.shelfBuilder.buildTemplate()
            
            // Create container for all shelves
            this.shelfContainer = new THREE.Group()
            this.shelfContainer.name = 'shelf-container'
            
            this.isInitialized = true
            console.debug('✅ GroupShelfRenderer initialized')
            
        } catch (error) {
            console.error('❌ Failed to initialize GroupShelfRenderer:', error)
            throw error
        }
    }
    
    public setInstance(index: number, data: ShelfInstanceData): boolean {
        if (!this.isInitialized || !this.shelfBuilder || !this.shelfContainer) {
            console.warn('GroupShelfRenderer not initialized')
            return false
        }
        
        if (index >= this.maxShelfUnits) {
            console.warn(`Shelf unit index ${index} exceeds max ${this.maxShelfUnits}`)
            return false
        }
        
        try {
            // Add container to scene on first shelf creation
            if (this.shelfUnits.size === 0) {
                const scene = DataManager.getInstance().get<THREE.Scene>(DataKey.MainScene)
                if (scene && this.shelfContainer.parent !== scene) {
                    scene.add(this.shelfContainer)
                }
            }
            
            // Remove existing shelf at this index if any
            const existingShelf = this.shelfUnits.get(index)
            if (existingShelf) {
                this.shelfContainer.remove(existingShelf)
            }
            
            // Create new shelf at position
            const shelf = this.shelfBuilder.createShelfAt(data.position, `shelf-unit-${index}`)
            this.shelfContainer.add(shelf)
            this.shelfUnits.set(index, shelf)
            
            console.debug(`🏪 Set shelf unit ${index} at position (${data.position.x.toFixed(2)}, ${data.position.y.toFixed(2)}, ${data.position.z.toFixed(2)})`)
            return true
            
        } catch (error) {
            console.error(`❌ Failed to set shelf unit ${index}:`, error)
            return false
        }
    }
    
    public updateGPU(): void {
        // No-op for Group-based renderer - Three.js handles updates automatically
        // Just log for consistency with the interface
        if (this.isInitialized) {
            console.debug(`🔄 GroupShelfRenderer: ${this.shelfUnits.size} shelf units`)
        }
    }
    
    public reset(): void {
        if (this.shelfContainer) {
            // Remove all shelves from container
            for (const shelf of this.shelfUnits.values()) {
                this.shelfContainer.remove(shelf)
            }
        }
        this.shelfUnits.clear()
        console.debug('🔄 GroupShelfRenderer reset')
    }
    
    public isReady(): boolean {
        return this.isInitialized && this.shelfBuilder !== null
    }
    
    public getStats(): InstancedRendererStats {
        return {
            isInitialized: this.isInitialized,
            activeInstances: this.shelfUnits.size,
            maxInstances: this.maxShelfUnits,
            shelfUnits: this.shelfUnits.size,
            // Simplified stats - no per-component breakdown needed
            geometryStats: {
                totalShelves: this.shelfUnits.size,
                meshesPerShelf: this.shelfBuilder ? 
                    2 + 2 + (this.defaultShelfConfig.shelfCount * 2) : 0  // angled + side + (shelf + interior) per level
            },
            activeGeometryMaterialCombinations: this.isInitialized ? 3 : 0  // 3 materials used
        }
    }
    
    public dispose(): void {
        console.debug('🧹 Disposing GroupShelfRenderer')
        
        // Remove container from scene
        if (this.shelfContainer?.parent) {
            this.shelfContainer.parent.remove(this.shelfContainer)
        }
        
        // Dispose shelves (geometries in children)
        for (const shelf of this.shelfUnits.values()) {
            shelf.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    child.geometry.dispose()
                }
            })
        }
        this.shelfUnits.clear()
        
        // Dispose builder
        this.shelfBuilder?.dispose()
        this.shelfBuilder = null
        
        this.shelfContainer = null
        this.isInitialized = false
        
        console.debug('✅ GroupShelfRenderer disposed')
    }
}
