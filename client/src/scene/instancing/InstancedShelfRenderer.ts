/**
 * Instanced Shelf Renderer - GPU Instancing for Procedural Shelves
 * 
 * Replaces ProceduralShelfGenerator with GPU instancing for better performance.
 * Each shelf unit consists of multiple geometry types with different materials:
 * 
 * Components per shelf unit:
 * - 2x Angled boards (front/back) - MDF veneer material
 * - 2x Side boards (left/right) - Brand accent material  
 * - Nx Shelf boards - MDF veneer material
 * - Nx Interior surfaces - Shelf interior material
 * 
 * Performance Impact:
 * - Before: N shelf units = ~(6+shelfCount*2) * N draw calls
 * - After: N shelf units = 4 draw calls total (one per geometry/material type)
 * 
 * Architecture:
 * - Multiple InstancedMeshManager instances (one per geometry type)
 * - Shared geometry templates with material assignment
 * - Shelf unit grouping for coordinated positioning
 */

import * as THREE from 'three'
import { InstancedMeshManager } from './InstancedMeshManager'
import { SharedMaterialManager, MaterialType } from '../../utils/SharedMaterialManager'
import { DataManager } from '../../core/data/DataManager'
import { EventManager } from '../../core/EventManager'
import { GameEventTypes } from '../../types/InteractionEvents'
import type { IInstancedRenderer, InstancedRendererConfig, InstancedRendererStats, InstanceData } from './IInstancedRenderer'

export interface ShelfConfig {
    width?: number
    height?: number
    depth?: number
    angle?: number // Angle of slanted boards in degrees
    shelfCount?: number
    boardThickness?: number
    shelfExtensionPerLevel?: number
}

export interface InstancedShelfConfig extends InstancedRendererConfig {
    /** Default shelf configuration */
    defaultShelfConfig?: ShelfConfig
    /** Maximum shelf units that can be rendered */
    maxShelfUnits?: number
}

export interface ShelfInstanceData extends InstanceData {
    /** Configuration for this specific shelf unit */
    shelfConfig?: ShelfConfig
}

/**
 * Geometry types used in shelf construction
 */
enum ShelfGeometryType {
    AngledBoard = 'angledBoard',    // Front and back angled boards
    SideBoard = 'sideBoard',        // Left and right support posts
    ShelfBoard = 'shelfBoard',      // Horizontal shelf surfaces
    InteriorSurface = 'interior'    // White interior shelf surfaces
}

/**
 * Represents a group of related instances forming one shelf unit
 */
interface ShelfUnitInstance {
    /** Position of the shelf unit */
    position: THREE.Vector3
    /** Configuration for this unit */
    config: ShelfConfig
    /** Instance indices for each geometry type */
    instanceIndices: {
        angledBoards: number[]      // Front and back board indices
        sideBoards: number[]        // Left and right board indices  
        shelfBoards: number[]       // Shelf board indices
        interiorSurfaces: number[]  // Interior surface indices
    }
}

export class InstancedShelfRenderer implements IInstancedRenderer {
    // Instanced mesh managers for each geometry type
    private angledBoardManager: InstancedMeshManager
    private sideBoardManager: InstancedMeshManager
    private shelfBoardManager: InstancedMeshManager
    private interiorSurfaceManager: InstancedMeshManager
    
    // Configuration and state
    private readonly config: InstancedShelfConfig
    private readonly defaultShelfConfig: Required<ShelfConfig>
    private isInitialized: boolean = false
    private shelfUnits: Map<number, ShelfUnitInstance> = new Map()
    private nextInstanceIndex: { [K in ShelfGeometryType]: number } = {
        angledBoard: 0,
        sideBoard: 0,
        shelfBoard: 0,
        interior: 0
    }
    
    // Geometry templates (shared across instances)
    private geometryTemplates: { [K in ShelfGeometryType]?: THREE.BufferGeometry } = {}
    
    constructor(config: InstancedShelfConfig = {}) {
        this.config = {
            maxInstances: config.maxInstances || 500,
            maxShelfUnits: config.maxShelfUnits || 100,
            enablePerformanceLogging: config.enablePerformanceLogging ?? false,
            debugName: config.debugName || 'InstancedShelfRenderer',
            ...config
        }
        
        // Default shelf configuration
        this.defaultShelfConfig = {
            width: 2.0,
            height: 2.0,
            depth: 0.34, // Increased depth so horizontal shelves extend beyond angled faces
            angle: 3, // degrees
            shelfCount: 3,
            boardThickness: 0.05,
            shelfExtensionPerLevel: 0.25  // Increased extension for more pronounced shelf depth
        }
        
        // Apply user overrides to defaults
        if (config.defaultShelfConfig) {
            Object.assign(this.defaultShelfConfig, config.defaultShelfConfig)
        }
        
        // Initialize managers
        this.angledBoardManager = new InstancedMeshManager('InstancedShelf-AngledBoards')
        this.sideBoardManager = new InstancedMeshManager('InstancedShelf-SideBoards')
        this.shelfBoardManager = new InstancedMeshManager('InstancedShelf-ShelfBoards')
        this.interiorSurfaceManager = new InstancedMeshManager('InstancedShelf-InteriorSurfaces')
        
        // Subscribe to GPU update events
        EventManager.getInstance().registerEventHandler(GameEventTypes.InstancedBatchComplete, () => this.updateGPU())
        
        console.debug(`🏪 InstancedShelfRenderer created (max units: ${this.config.maxShelfUnits})`)
    }
    
    /**
     * Initialize all instanced mesh managers with geometry and materials
     */
    public async initialize(): Promise<void> {
        if (this.isInitialized) {
            console.warn('InstancedShelfRenderer already initialized')
            return
        }
        
        try {
            // Get materials from SharedMaterialManager
            const materialManager = SharedMaterialManager.getInstance()
            const mdfVeneerMaterial = materialManager.getMaterial(MaterialType.MdfVeneer)
            const shelfInteriorMaterial = materialManager.getMaterial(MaterialType.ShelfInterior)
            const brandAccentMaterial = materialManager.getMaterial(MaterialType.BrandAccent)
            
            
            // Create geometry templates
            this.createGeometryTemplates()
            
            // Calculate max instances needed per geometry type
            const maxShelfUnits = this.config.maxShelfUnits!
            const maxShelvesPerUnit = 5 // Conservative estimate for shelf count
            
            // Initialize angled board manager (2 boards per shelf unit)
            this.angledBoardManager.initialize({
                geometry: this.geometryTemplates[ShelfGeometryType.AngledBoard]!,
                material: mdfVeneerMaterial,
                maxInstances: maxShelfUnits * 2,
                name: 'instanced-shelf-angled-boards'
            })
            
            // Initialize side board manager (2 boards per shelf unit)
            this.sideBoardManager.initialize({
                geometry: this.geometryTemplates[ShelfGeometryType.SideBoard]!,
                material: brandAccentMaterial,
                maxInstances: maxShelfUnits * 2,
                name: 'instanced-shelf-side-boards'
            })
            
            // Initialize shelf board manager (variable count per unit)
            this.shelfBoardManager.initialize({
                geometry: this.geometryTemplates[ShelfGeometryType.ShelfBoard]!,
                material: mdfVeneerMaterial,
                maxInstances: maxShelfUnits * maxShelvesPerUnit,
                name: 'instanced-shelf-boards'
            })
            
            // Initialize interior surface manager (variable count per unit)
            this.interiorSurfaceManager.initialize({
                geometry: this.geometryTemplates[ShelfGeometryType.InteriorSurface]!,
                material: shelfInteriorMaterial,
                maxInstances: maxShelfUnits * maxShelvesPerUnit,
                name: 'instanced-shelf-interior-surfaces'
            })
            
            // Add custom instance attributes for dynamic sizing/positioning
            this.setupInstanceAttributes()
            
            // NOTE: addToMainScene() moved to first shelf creation to avoid premature removal
            
            this.isInitialized = true
            
        } catch (error) {
            console.error('❌ Failed to initialize InstancedShelfRenderer:', error)
            throw error
        }
    }
    
    /**
     * Create geometry templates for each shelf component type
     */
    private createGeometryTemplates(): void {
        const { width, height, depth, boardThickness } = this.defaultShelfConfig
        
        // Angled board geometry (front and back boards)
        this.geometryTemplates[ShelfGeometryType.AngledBoard] = new THREE.BoxGeometry(
            width,
            height,
            boardThickness
        )
        
        // Side board geometry (left and right support posts)
        this.geometryTemplates[ShelfGeometryType.SideBoard] = new THREE.BoxGeometry(
            boardThickness,
            height,
            depth
        )
        
        // Shelf board geometry (horizontal surfaces) - uses default size, scaled per instance
        this.geometryTemplates[ShelfGeometryType.ShelfBoard] = new THREE.BoxGeometry(
            width, // Will be dynamically scaled
            boardThickness,
            depth // Will be dynamically scaled
        )
        
        // Interior surface geometry (white surfaces on top of shelves)
        this.geometryTemplates[ShelfGeometryType.InteriorSurface] = new THREE.BoxGeometry(
            width * 0.98,
            boardThickness * 0.1,
            depth * 0.98
        )
        
        console.debug('📐 Created shelf geometry templates')
    }
    
    /**
     * Setup custom instance attributes for dynamic shelf parameters
     */
    private setupInstanceAttributes(): void {
        // For angled boards: rotation angle attribute
        this.angledBoardManager.addInstanceAttributes([
            { name: 'rotationAngle', itemSize: 1, defaultValue: 0 }
        ])
        
        // For shelf boards: width and depth scaling
        this.shelfBoardManager.addInstanceAttributes([
            { name: 'shelfScale', itemSize: 2, defaultValue: [1, 1] } // [widthScale, depthScale]
        ])
        
        // For interior surfaces: matching scaling
        this.interiorSurfaceManager.addInstanceAttributes([
            { name: 'surfaceScale', itemSize: 2, defaultValue: [1, 1] } // [widthScale, depthScale]
        ])
    }
    
    /**
     * Set a complete shelf unit at the specified position
     */
    public setInstance(index: number, data: ShelfInstanceData): boolean {
        if (!this.isInitialized) {
            console.warn('InstancedShelfRenderer not initialized')
            return false
        }
        
        if (index >= this.config.maxShelfUnits!) {
            console.warn(`Shelf unit index ${index} exceeds max ${this.config.maxShelfUnits}`)
            return false
        }
        
        // Merge with default configuration
        const shelfConfig: Required<ShelfConfig> = {
            ...this.defaultShelfConfig,
            ...data.shelfConfig
        }
        
        try {
            // Add managers to scene on first shelf creation (avoids premature removal during initialization)
            if (this.shelfUnits.size === 0) {
                this.angledBoardManager.addToMainScene()
                this.sideBoardManager.addToMainScene()
                this.shelfBoardManager.addToMainScene()
                this.interiorSurfaceManager.addToMainScene()
            }
            
            const shelfUnit = this.createShelfUnit(index, data.position, shelfConfig)
            this.shelfUnits.set(index, shelfUnit)
            
            console.debug(`🏪 Set shelf unit ${index} at position (${data.position.x.toFixed(2)}, ${data.position.y.toFixed(2)}, ${data.position.z.toFixed(2)})`)
            return true
            
        } catch (error) {
            console.error(`❌ Failed to set shelf unit ${index}:`, error)
            return false
        }
    }
    
    /**
     * Create all instances for a complete shelf unit
     */
    private createShelfUnit(
        unitIndex: number,
        position: THREE.Vector3,
        config: Required<ShelfConfig>
    ): ShelfUnitInstance {
        const instanceIndices = {
            angledBoards: [] as number[],
            sideBoards: [] as number[],
            shelfBoards: [] as number[],
            interiorSurfaces: [] as number[]
        }
        
        const angleRad = (config.angle * Math.PI) / 180
        
        // Create angled boards (front and back)
        const frontBoardIndex = this.nextInstanceIndex.angledBoard++
        const backBoardIndex = this.nextInstanceIndex.angledBoard++
        
        // Reduce gap between front and back boards for better visual appeal  
        const boardSeparation = config.depth * 0.8 // Move angled faces closer together
        
        // Front angled board
        const frontPos = position.clone().add(new THREE.Vector3(0, config.height / 2, boardSeparation / 2))
        const frontRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(-angleRad, 0, 0))
        this.angledBoardManager.setInstanceMatrix(frontBoardIndex, frontPos, frontRotation)
        this.angledBoardManager.setInstanceAttribute('rotationAngle', frontBoardIndex, -config.angle)
        instanceIndices.angledBoards.push(frontBoardIndex)
        
        // Back angled board
        const backPos = position.clone().add(new THREE.Vector3(0, config.height / 2, -boardSeparation / 2))
        const backRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(angleRad, 0, 0))
        this.angledBoardManager.setInstanceMatrix(backBoardIndex, backPos, backRotation)
        this.angledBoardManager.setInstanceAttribute('rotationAngle', backBoardIndex, config.angle)
        instanceIndices.angledBoards.push(backBoardIndex)
        
        // Create side boards (left and right)
        const leftBoardIndex = this.nextInstanceIndex.sideBoard++
        const rightBoardIndex = this.nextInstanceIndex.sideBoard++
        
        // Left side board
        const leftPos = position.clone().add(new THREE.Vector3(
            -config.width / 2 - config.boardThickness * 0.5,
            config.height / 2,
            0
        ))
        this.sideBoardManager.setInstanceMatrix(leftBoardIndex, leftPos)
        instanceIndices.sideBoards.push(leftBoardIndex)
        
        // Right side board
        const rightPos = position.clone().add(new THREE.Vector3(
            config.width / 2 + config.boardThickness * 0.5,
            config.height / 2,
            0
        ))
        this.sideBoardManager.setInstanceMatrix(rightBoardIndex, rightPos)
        instanceIndices.sideBoards.push(rightBoardIndex)
        
        // Create horizontal shelves
        const shelfSpacing = config.height / (config.shelfCount + 1)
        
        for (let i = 1; i <= config.shelfCount; i++) {
            const shelfY = i * shelfSpacing
            
            // Calculate shelf dimensions based on angled sides
            const widthAtHeight = config.width - 2 * (config.height - shelfY) * Math.tan(angleRad)
            
            // Fix shelf extension logic: top shelves (higher i) should extend more
            // i=1 (bottom): no extension
            // i=2 (middle): 1x extension  
            // i=3 (top): 2x extension
            const depthExtension = (i - 1) * config.shelfExtensionPerLevel
            const shelfDepth = config.depth - config.boardThickness * 2 + depthExtension
            
            // Calculate scaling factors
            const widthScale = widthAtHeight / config.width
            const depthScale = shelfDepth / config.depth
            
            // Create shelf board
            const shelfBoardIndex = this.nextInstanceIndex.shelfBoard++
            const shelfPos = position.clone().add(new THREE.Vector3(0, shelfY, 0))
            const shelfScale = new THREE.Vector3(widthScale, 1, depthScale)
            
            this.shelfBoardManager.setInstanceMatrix(shelfBoardIndex, shelfPos, undefined, shelfScale)
            this.shelfBoardManager.setInstanceAttribute('shelfScale', shelfBoardIndex, [widthScale, depthScale])
            instanceIndices.shelfBoards.push(shelfBoardIndex)
            
            // Create interior surface
            const interiorSurfaceIndex = this.nextInstanceIndex.interior++
            const interiorPos = position.clone().add(new THREE.Vector3(0, shelfY + config.boardThickness * 0.55, 0))
            const interiorScale = new THREE.Vector3(widthScale, 1, depthScale)
            
            this.interiorSurfaceManager.setInstanceMatrix(interiorSurfaceIndex, interiorPos, undefined, interiorScale)
            this.interiorSurfaceManager.setInstanceAttribute('surfaceScale', interiorSurfaceIndex, [widthScale, depthScale])
            instanceIndices.interiorSurfaces.push(interiorSurfaceIndex)
        }
        
        return {
            position: position.clone(),
            config,
            instanceIndices
        }
    }
    
    /**
     * Apply all pending updates to GPU across all managers
     */
    public updateGPU(): void {
        if (!this.isInitialized) {
            return
        }
        
        this.angledBoardManager.updateGPU()
        this.sideBoardManager.updateGPU()
        this.shelfBoardManager.updateGPU()
        this.interiorSurfaceManager.updateGPU()
        
        console.debug(`🔄 InstancedShelfRenderer GPU updated: ${this.shelfUnits.size} shelf units`)
    }
    
    /**
     * Reset all shelf instances
     */
    public reset(): void {
        this.angledBoardManager.reset()
        this.sideBoardManager.reset()
        this.shelfBoardManager.reset()
        this.interiorSurfaceManager.reset()
        
        this.shelfUnits.clear()
        this.nextInstanceIndex = {
            angledBoard: 0,
            sideBoard: 0,
            shelfBoard: 0,
            interior: 0
        }
        
        console.debug('🔄 InstancedShelfRenderer reset')
    }
    
    /**
     * Check if renderer is ready for use
     */
    public isReady(): boolean {
        return this.isInitialized &&
               this.angledBoardManager.isReady() &&
               this.sideBoardManager.isReady() &&
               this.shelfBoardManager.isReady() &&
               this.interiorSurfaceManager.isReady()
    }
    
    /**
     * Get comprehensive statistics
     */
    public getStats(): InstancedRendererStats {
        const angledStats = this.angledBoardManager.getStats()
        const sideStats = this.sideBoardManager.getStats()
        const shelfStats = this.shelfBoardManager.getStats()
        const interiorStats = this.interiorSurfaceManager.getStats()
        
        // Count active geometry/material combinations 
        // Note: Each combination typically corresponds to one draw call in the rendering pipeline
        const activeGeometryTypes = [
            this.angledBoardManager.isReady() ? 1 : 0,
            this.sideBoardManager.isReady() ? 1 : 0, 
            this.shelfBoardManager.isReady() ? 1 : 0,
            this.interiorSurfaceManager.isReady() ? 1 : 0
        ].reduce((sum, count) => sum + count, 0)

        return {
            isInitialized: this.isInitialized,
            activeInstances: this.shelfUnits.size,
            maxInstances: this.config.maxShelfUnits!,
            shelfUnits: this.shelfUnits.size,
            geometryStats: {
                angledBoards: angledStats,
                sideBoards: sideStats,
                shelfBoards: shelfStats,
                interiorSurfaces: interiorStats
            },
            // Number of active geometry/material combinations - should correspond to draw calls
            activeGeometryMaterialCombinations: activeGeometryTypes
        }
    }
    
    /**
     * Dispose of all resources
     */
    public dispose(): void {
        console.debug('🧹 Disposing InstancedShelfRenderer')
        
        // Dispose all managers
        this.angledBoardManager.dispose()
        this.sideBoardManager.dispose()
        this.shelfBoardManager.dispose()
        this.interiorSurfaceManager.dispose()
        
        // Dispose geometry templates
        Object.values(this.geometryTemplates).forEach(geometry => {
            geometry?.dispose()
        })
        this.geometryTemplates = {}
        
        // Clear state
        this.shelfUnits.clear()
        this.isInitialized = false
        
        console.debug('✅ InstancedShelfRenderer disposed')
    }
}