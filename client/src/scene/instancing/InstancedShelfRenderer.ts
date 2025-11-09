import * as THREE from 'three'
import { InstancedMeshManager } from './InstancedMeshManager'
import { SharedMaterialManager, MaterialType } from '../../utils/SharedMaterialManager'
import { EventManager } from '../../core/EventManager'
import { GameEventTypes } from '../../types/InteractionEvents'
import type { 
    IInstancedRenderer, 
    InstancedRendererStats, 
    ShelfConfig,
    InstancedShelfConfig,
    ShelfInstanceData
} from './IInstancedRenderer'
import {
    DEFAULT_INSTANCED_SHELF_CONFIG
} from './IInstancedRenderer'

enum ShelfGeometryType {
    AngledBoard = 'angledBoard',
    SideBoard = 'sideBoard',
    ShelfBoard = 'shelfBoard',
    InteriorSurface = 'interior'
}

interface ShelfUnitInstance {
    position: THREE.Vector3
    config: ShelfConfig
    instanceIndices: {
        angledBoards: number[]
        sideBoards: number[]
        shelfBoards: number[]
        interiorSurfaces: number[]
    }
}

export class InstancedShelfRenderer implements IInstancedRenderer {
    private angledBoardManager: InstancedMeshManager
    private sideBoardManager: InstancedMeshManager
    private shelfBoardManager: InstancedMeshManager
    private interiorSurfaceManager: InstancedMeshManager
    
    private readonly maxShelfUnits: number
    private readonly defaultShelfConfig: Required<ShelfConfig>
    private isInitialized: boolean = false
    private shelfUnits: Map<number, ShelfUnitInstance> = new Map()
    private nextInstanceIndex: { [K in ShelfGeometryType]: number } = {
        angledBoard: 0,
        sideBoard: 0,
        shelfBoard: 0,
        interior: 0
    }
    
    private geometryTemplates: { [K in ShelfGeometryType]?: THREE.BufferGeometry } = {}
    
    constructor(config: InstancedShelfConfig = {}) {
        this.maxShelfUnits = config.maxShelfUnits ?? DEFAULT_INSTANCED_SHELF_CONFIG.maxShelfUnits
        
        this.defaultShelfConfig = {
            ...DEFAULT_INSTANCED_SHELF_CONFIG.defaultShelfConfig,
            ...config.defaultShelfConfig
        } as Required<ShelfConfig>
        
        // Initialize managers
        this.angledBoardManager = new InstancedMeshManager('InstancedShelf-AngledBoards')
        this.sideBoardManager = new InstancedMeshManager('InstancedShelf-SideBoards')
        this.shelfBoardManager = new InstancedMeshManager('InstancedShelf-ShelfBoards')
        this.interiorSurfaceManager = new InstancedMeshManager('InstancedShelf-InteriorSurfaces')
        
        // Subscribe to GPU update events
        EventManager.getInstance().registerEventHandler(GameEventTypes.InstancedBatchComplete, () => this.updateGPU())
        
        console.debug(`🏪 InstancedShelfRenderer created (max units: ${this.maxShelfUnits})`)
    }
    
    public async initialize(): Promise<void> {
        if (this.isInitialized) {
            console.warn('InstancedShelfRenderer already initialized')
            return
        }
        
        try {
            const materialManager = SharedMaterialManager.getInstance()
            const mdfVeneerMaterial = materialManager.getMaterial(MaterialType.MdfVeneer)
            const shelfInteriorMaterial = materialManager.getMaterial(MaterialType.ShelfInterior)
            const brandAccentMaterial = materialManager.getMaterial(MaterialType.BrandAccent)
            
            this.createGeometryTemplates()
            
            const maxShelvesPerUnit = 5
            const angledBoardGeometry = this.geometryTemplates[ShelfGeometryType.AngledBoard]
            const sideBoardGeometry = this.geometryTemplates[ShelfGeometryType.SideBoard]
            const shelfBoardGeometry = this.geometryTemplates[ShelfGeometryType.ShelfBoard]
            const interiorSurfaceGeometry = this.geometryTemplates[ShelfGeometryType.InteriorSurface]
            
            if (!angledBoardGeometry || !sideBoardGeometry || !shelfBoardGeometry || !interiorSurfaceGeometry) {
                throw new Error('Failed to create geometry templates')
            }
            
            this.angledBoardManager.initialize({
                geometry: angledBoardGeometry,
                material: mdfVeneerMaterial,
                maxInstances: this.maxShelfUnits * 2,
                name: 'instanced-shelf-angled-boards'
            })
            
            this.sideBoardManager.initialize({
                geometry: sideBoardGeometry,
                material: brandAccentMaterial,
                maxInstances: this.maxShelfUnits * 2,
                name: 'instanced-shelf-side-boards'
            })
            
            this.shelfBoardManager.initialize({
                geometry: shelfBoardGeometry,
                material: mdfVeneerMaterial,
                maxInstances: this.maxShelfUnits * maxShelvesPerUnit,
                name: 'instanced-shelf-boards'
            })
            
            this.interiorSurfaceManager.initialize({
                geometry: interiorSurfaceGeometry,
                material: shelfInteriorMaterial,
                maxInstances: this.maxShelfUnits * maxShelvesPerUnit,
                name: 'instanced-shelf-interior-surfaces'
            })
            
            // Add custom instance attributes for dynamic sizing/positioning
            this.setupInstanceAttributes()
            
            this.isInitialized = true
            
        } catch (error) {
            console.error('❌ Failed to initialize InstancedShelfRenderer:', error)
            throw error
        }
    }
    
    private createGeometryTemplates(): void {
        const { width, height, depth, boardThickness } = this.defaultShelfConfig
        
        this.geometryTemplates[ShelfGeometryType.AngledBoard] = new THREE.BoxGeometry(
            width,
            height,
            boardThickness
        )
        
        this.geometryTemplates[ShelfGeometryType.SideBoard] = new THREE.BoxGeometry(
            boardThickness,
            height,
            depth
        )
        
        this.geometryTemplates[ShelfGeometryType.ShelfBoard] = new THREE.BoxGeometry(
            width,
            boardThickness,
            depth
        )
        
        this.geometryTemplates[ShelfGeometryType.InteriorSurface] = new THREE.BoxGeometry(
            width * 0.98,
            boardThickness * 0.1,
            depth * 0.98
        )
        
        console.debug('📐 Created shelf geometry templates')
    }
    
    private setupInstanceAttributes(): void {
        this.angledBoardManager.addInstanceAttributes([
            { name: 'rotationAngle', itemSize: 1, defaultValue: 0 }
        ])
        
        this.shelfBoardManager.addInstanceAttributes([
            { name: 'shelfScale', itemSize: 2, defaultValue: [1, 1] }
        ])
        
        this.interiorSurfaceManager.addInstanceAttributes([
            { name: 'surfaceScale', itemSize: 2, defaultValue: [1, 1] }
        ])
    }
    
    public setInstance(index: number, data: ShelfInstanceData): boolean {
        if (!this.isInitialized) {
            console.warn('InstancedShelfRenderer not initialized')
            return false
        }
        
        if (index >= this.maxShelfUnits) {
            console.warn(`Shelf unit index ${index} exceeds max ${this.maxShelfUnits}`)
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
            
            const shelfUnit = this.createShelfUnit(data.position, shelfConfig)
            this.shelfUnits.set(index, shelfUnit)
            
            console.debug(`🏪 Set shelf unit ${index} at position (${data.position.x.toFixed(2)}, ${data.position.y.toFixed(2)}, ${data.position.z.toFixed(2)})`)
            return true
            
        } catch (error) {
            console.error(`❌ Failed to set shelf unit ${index}:`, error)
            return false
        }
    }
    
    private createShelfUnit(
        position: THREE.Vector3,
        config: Required<ShelfConfig>
    ): ShelfUnitInstance {
        const instanceIndices = {
            angledBoards: [] as number[],
            sideBoards: [] as number[],
            shelfBoards: [] as number[],
            interiorSurfaces: [] as number[]
        }
        
        this.createAngledBoards(position, config, instanceIndices.angledBoards)
        this.createSideBoards(position, config, instanceIndices.sideBoards)
        this.createHorizontalShelves(position, config, instanceIndices)
        
        return {
            position: position.clone(),
            config,
            instanceIndices
        }
    }
    
    private createAngledBoards(position: THREE.Vector3, config: Required<ShelfConfig>, indices: number[]): void {
        const angleRad = (config.angle * Math.PI) / 180
        const boardSeparation = config.depth * 0.8
        
        const frontBoardIndex = this.nextInstanceIndex.angledBoard++
        const frontPos = position.clone().add(new THREE.Vector3(0, config.height / 2, boardSeparation / 2))
        const frontRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(-angleRad, 0, 0))
        this.angledBoardManager.setInstanceMatrix(frontBoardIndex, frontPos, frontRotation)
        this.angledBoardManager.setInstanceAttribute('rotationAngle', frontBoardIndex, -config.angle)
        indices.push(frontBoardIndex)
        
        const backBoardIndex = this.nextInstanceIndex.angledBoard++
        const backPos = position.clone().add(new THREE.Vector3(0, config.height / 2, -boardSeparation / 2))
        const backRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(angleRad, 0, 0))
        this.angledBoardManager.setInstanceMatrix(backBoardIndex, backPos, backRotation)
        this.angledBoardManager.setInstanceAttribute('rotationAngle', backBoardIndex, config.angle)
        indices.push(backBoardIndex)
    }
    
    private createSideBoards(position: THREE.Vector3, config: Required<ShelfConfig>, indices: number[]): void {
        const leftBoardIndex = this.nextInstanceIndex.sideBoard++
        const leftPos = position.clone().add(new THREE.Vector3(
            -config.width / 2 - config.boardThickness * 0.5,
            config.height / 2,
            0
        ))
        this.sideBoardManager.setInstanceMatrix(leftBoardIndex, leftPos)
        indices.push(leftBoardIndex)
        
        const rightBoardIndex = this.nextInstanceIndex.sideBoard++
        const rightPos = position.clone().add(new THREE.Vector3(
            config.width / 2 + config.boardThickness * 0.5,
            config.height / 2,
            0
        ))
        this.sideBoardManager.setInstanceMatrix(rightBoardIndex, rightPos)
        indices.push(rightBoardIndex)
    }
    
    private createHorizontalShelves(
        position: THREE.Vector3,
        config: Required<ShelfConfig>,
        instanceIndices: ShelfUnitInstance['instanceIndices']
    ): void {
        const angleRad = (config.angle * Math.PI) / 180
        const shelfSpacing = config.height / (config.shelfCount + 1)
        
        for (let i = 1; i <= config.shelfCount; i++) {
            const shelfY = i * shelfSpacing
            const widthAtHeight = config.width - 2 * (config.height - shelfY) * Math.tan(angleRad)
            const depthExtension = (i - 1) * config.shelfExtensionPerLevel
            const shelfDepth = config.depth - config.boardThickness * 2 + depthExtension
            const widthScale = widthAtHeight / config.width
            const depthScale = shelfDepth / config.depth
            
            this.createShelfBoard(position, shelfY, widthScale, depthScale, instanceIndices.shelfBoards)
            this.createInteriorSurface(position, shelfY, config.boardThickness, widthScale, depthScale, instanceIndices.interiorSurfaces)
        }
    }
    
    private createShelfBoard(
        position: THREE.Vector3,
        shelfY: number,
        widthScale: number,
        depthScale: number,
        indices: number[]
    ): void {
        const shelfBoardIndex = this.nextInstanceIndex.shelfBoard++
        const shelfPos = position.clone().add(new THREE.Vector3(0, shelfY, 0))
        const shelfScale = new THREE.Vector3(widthScale, 1, depthScale)
        
        this.shelfBoardManager.setInstanceMatrix(shelfBoardIndex, shelfPos, undefined, shelfScale)
        this.shelfBoardManager.setInstanceAttribute('shelfScale', shelfBoardIndex, [widthScale, depthScale])
        indices.push(shelfBoardIndex)
    }
    
    private createInteriorSurface(
        position: THREE.Vector3,
        shelfY: number,
        boardThickness: number,
        widthScale: number,
        depthScale: number,
        indices: number[]
    ): void {
        const interiorSurfaceIndex = this.nextInstanceIndex.interior++
        const interiorPos = position.clone().add(new THREE.Vector3(0, shelfY + boardThickness * 0.55, 0))
        const interiorScale = new THREE.Vector3(widthScale, 1, depthScale)
        
        this.interiorSurfaceManager.setInstanceMatrix(interiorSurfaceIndex, interiorPos, undefined, interiorScale)
        this.interiorSurfaceManager.setInstanceAttribute('surfaceScale', interiorSurfaceIndex, [widthScale, depthScale])
        indices.push(interiorSurfaceIndex)
    }
    
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
    
    public isReady(): boolean {
        return this.isInitialized &&
               this.angledBoardManager.isReady() &&
               this.sideBoardManager.isReady() &&
               this.shelfBoardManager.isReady() &&
               this.interiorSurfaceManager.isReady()
    }
    
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
            maxInstances: this.maxShelfUnits,
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