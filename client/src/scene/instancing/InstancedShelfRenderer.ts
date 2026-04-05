/**
 * InstancedShelfRenderer
 * 
 * ROLE: GPU-instanced rendering of shelf units. Handles geometry, materials,
 * and efficient batch rendering of multiple shelf instances.
 * 
 * OWNS:
 * - Shelf geometry templates (angled boards, side boards, shelf boards, interior surfaces)
 * - InstancedMesh managers for each geometry type
 * - Shelf unit instances (position + config)
 * - GPU buffer updates
 * 
 * RECEIVES:
 * - setInstance(index, data) → Creates/updates shelf at index
 * - updateGPU() → Flushes instance changes to GPU
 * - SomeBatchesComplete event → Triggers coalesced GPU update
 * 
 * EMITS:
 * - RendererReady → When initialize() completes (Phase 3: replaces polling)
 * 
 * DELEGATES TO:
 * - InstancedMeshManager: Per-geometry-type instancing
 * - SharedMaterialManager: Material acquisition
 * - ShelfStickerHandler: Sticker placement on side boards
 * 
 * DOES NOT:
 * - Calculate shelf positions (that's layout's job)
 * - Know about games or batches (pure rendering)
 * - Handle events for shelf creation (receives method calls currently)
 * 
 * INITIALIZATION:
 * - initialize() is async and emits RendererReady event when complete
 * - Callers can await promise OR listen for event (dual-mode for backward compat)
 * - Legacy isReady() polling still available but deprecated
 */

import * as THREE from 'three'
import { InstancedMeshManager } from './InstancedMeshManager'
import { SharedMaterialManager, MaterialType } from '../../utils/SharedMaterialManager'
import { DEFAULT_SHELF_CONFIG, ShelfCalculationUtils, type ShelfConfig } from '../props/SharedPropsUtils'
import { DEFAULT_INSTANCED_RENDERER_CONFIG, type InstancedRendererConfig, type InstanceData } from './IInstancedRenderer'
import type { 
    IInstancedRenderer, 
    InstancedRendererStats
} from './IInstancedRenderer'
import { ShelfStickerHandler } from '../stickers/ShelfStickerHandler'
import { EventManager } from '../../core/EventManager'
import { GameEventTypes, StorePropsEventTypes, type RendererReadyEvent } from '../../types/InteractionEvents'
import { Logger } from '../../utils/Logger'
import { DataManager } from '../../core/data/DataManager'
import { DataKey } from '../../core/data/DataTypes'
import { SystemCapabilitiesDetector } from '../../utils/SystemCapabilities'

export interface InstancedShelfConfig extends InstancedRendererConfig {
    defaultShelfConfig?: ShelfConfig
    maxShelfUnits?: number
}

export const DEFAULT_INSTANCED_SHELF_CONFIG = {
    ...DEFAULT_INSTANCED_RENDERER_CONFIG,
    maxShelfUnits: 100,
    defaultShelfConfig: DEFAULT_SHELF_CONFIG
} as const

export interface ShelfInstanceData extends InstanceData {
    shelfConfig?: ShelfConfig
}

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

interface ShelfPartTemplate {
    type: ShelfGeometryType
    offset: THREE.Vector3
    rotation?: THREE.Quaternion
    scale?: THREE.Vector3
    customAttributes?: { name: string; value: number | number[] }[]
    isSideBoard?: boolean
    sideboardIsLeft?: boolean
}

// TODO: Explore pre-baking shelf geometry as GLTF/FBX for faster load (after dynamic config needs are settled)
export class InstancedShelfRenderer implements IInstancedRenderer {
    private static readonly logger = Logger.createLogFunctions('InstancedShelfRenderer')
    
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
    
    // Pre-calculated shelf data (computed ONCE since all shelves are identical)
    private readonly shelfYPositions: number[]
    private readonly shelfDepthsAndOffsets: Array<{ shelfDepth: number; forwardOffset: number }>
    
    // Shelf unit template (computed ONCE, applied to each shelf position)
    private shelfUnitTemplate: ShelfPartTemplate[] = []
    
    // TODO: Consider making sticker system fully pluggable (dependency injection or optional feature)
    private readonly stickerHandler: ShelfStickerHandler
    
    constructor(config: InstancedShelfConfig = {}) {
        this.maxShelfUnits = config.maxShelfUnits ?? DEFAULT_INSTANCED_SHELF_CONFIG.maxShelfUnits
        
        // TODO: Make sticker system optional/pluggable to reduce coupling
        this.stickerHandler = new ShelfStickerHandler()
        
        this.defaultShelfConfig = {
            ...DEFAULT_INSTANCED_SHELF_CONFIG.defaultShelfConfig,
            ...config.defaultShelfConfig
        } as Required<ShelfConfig>
        
        // PRE-CALCULATE shelf positions once (all shelf units are identical)
        this.shelfYPositions = ShelfCalculationUtils.calculateAllShelfYPositions({
            height: this.defaultShelfConfig.height,
            shelfCount: this.defaultShelfConfig.shelfCount,
            shelfVerticalOffset: this.defaultShelfConfig.shelfVerticalOffset
        })
        
        // PRE-CALCULATE shelf depths once (all shelf units are identical)
        // Use 0-indexed loop to match createHorizontalShelves access pattern
        this.shelfDepthsAndOffsets = []
        for (let i = 0; i < this.defaultShelfConfig.shelfCount; i++) {
            this.shelfDepthsAndOffsets.push(
                ShelfCalculationUtils.calculateShelfDepthAndOffset(i, {
                    depth: this.defaultShelfConfig.depth,
                    boardThickness: this.defaultShelfConfig.boardThickness,
                    shelfCount: this.defaultShelfConfig.shelfCount,
                    shelfExtensionPerLevel: this.defaultShelfConfig.shelfExtensionPerLevel
                })
            )
        }
        
        // Initialize managers
        this.angledBoardManager = new InstancedMeshManager('InstancedShelf-AngledBoards')
        this.sideBoardManager = new InstancedMeshManager('InstancedShelf-SideBoards')
        this.shelfBoardManager = new InstancedMeshManager('InstancedShelf-ShelfBoards')
        this.interiorSurfaceManager = new InstancedMeshManager('InstancedShelf-InteriorSurfaces')
        
        EventManager.getInstance().registerEventHandler(
            GameEventTypes.SomeBatchesComplete,
            this.updateGPU.bind(this)
        )
        
        InstancedShelfRenderer.logger.debug(`🏪 Created (max units: ${this.maxShelfUnits})`)
    }
    
    public async initialize(): Promise<void> {
        if (this.isInitialized) {
            InstancedShelfRenderer.logger.warn('Already initialized')
            return
        }
        
        try {
            const materialManager = SharedMaterialManager.getInstance()
            const mdfVeneerMaterial = materialManager.getMaterial(MaterialType.MdfVeneer)
            const shelfInteriorMaterial = materialManager.getMaterial(MaterialType.ShelfInterior)
            const brandAccentMaterial = materialManager.getMaterial(MaterialType.BrandAccent)
            
            this.createGeometryTemplates()
            
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
            
            // TODO: Consider material decoration pattern to avoid direct material modification here
            // Clone and modify side board material to support stickers (macro texture mode)
            const stickerEnabledMaterial = brandAccentMaterial.clone()
            const stickerIntegration = this.stickerHandler.getStickerIntegration()
            if (stickerIntegration) {
                stickerIntegration.setupStickerMaterial(stickerEnabledMaterial)
            }
            
            this.sideBoardManager.initialize({
                geometry: sideBoardGeometry,
                material: stickerEnabledMaterial,
                maxInstances: this.maxShelfUnits * 2,
                name: 'instanced-shelf-side-boards'
            })
            
            this.shelfBoardManager.initialize({
                geometry: shelfBoardGeometry,
                material: mdfVeneerMaterial,
                maxInstances: this.maxShelfUnits * 5,
                name: 'instanced-shelf-boards'
            })
            
            this.interiorSurfaceManager.initialize({
                geometry: interiorSurfaceGeometry,
                material: shelfInteriorMaterial,
                maxInstances: this.maxShelfUnits * 5,
                name: 'instanced-shelf-interior-surfaces'
            })
            
            // Add custom instance attributes for dynamic sizing/positioning
            this.setupInstanceAttributes()
            
            // Build shelf unit template (stamp pattern for creating shelves)
            this.buildShelfUnitTemplate()
            
            // Pre-warm GPU shader programs before any mesh is added to the main scene.
            // Uses a temporary off-screen scene so no visual artifact occurs.
            // On drivers with KHR_parallel_shader_compile this is non-blocking;
            // on older drivers it still moves the compile cost here rather than on first render.
            await this.prewarmShaders()
            
            this.isInitialized = true
            
            // Emit RendererReady event (Phase 3: replace polling with events)
            EventManager.getInstance().emit<RendererReadyEvent>(
                StorePropsEventTypes.RendererReady,
                { rendererType: 'shelf' }
            )
            InstancedShelfRenderer.logger.debug('✅ Initialized, emitted RendererReady event')
            
        } catch (err) {
            InstancedShelfRenderer.logger.error('❌ Failed to initialize:', err)
            throw err
        }
    }
    
    /**
     * Pre-warm GPU shader programs for all shelf InstancedMeshes.
     *
     * Creates a temporary off-screen scene, adds the four meshes to it, and
     * calls renderer.compileAsync(). When KHR_parallel_shader_compile is
     * available the driver links shaders on a background thread and this
     * resolves without blocking the main thread. Without that extension the
     * compile still happens synchronously here — but that moves the freeze to
     * initialization time (hidden behind async startup) rather than first render.
     *
     * If the renderer or camera aren't in DataManager yet (e.g. in unit tests),
     * the method logs a warning and returns early without throwing.
     */
    private async prewarmShaders(): Promise<void> {
        const renderer = DataManager.getInstance().get<THREE.WebGLRenderer>(DataKey.Renderer)
        const camera   = DataManager.getInstance().get<THREE.Camera>(DataKey.MainCamera)

        if (!renderer || !camera) {
            InstancedShelfRenderer.logger.warn('Skipping shader prewarm — renderer/camera not available (test environment?)')
            return
        }

        const capabilities = SystemCapabilitiesDetector.detect()
        const hasParallelCompile = capabilities.hasParallelShaderCompile

        InstancedShelfRenderer.logger.debug(
            `🔥 Starting shader prewarm (KHR_parallel_shader_compile: ${hasParallelCompile})`
        )
        const startTime = performance.now()

        const prewarmScene = new THREE.Scene()

        const meshes = [
            this.angledBoardManager.getInstancedMesh(),
            this.sideBoardManager.getInstancedMesh(),
            this.shelfBoardManager.getInstancedMesh(),
            this.interiorSurfaceManager.getInstancedMesh(),
        ].filter((mesh): mesh is THREE.InstancedMesh => mesh !== null)

        for (const mesh of meshes) {
            prewarmScene.add(mesh)
        }

        try {
            await renderer.compileAsync(prewarmScene, camera)
            InstancedShelfRenderer.logger.debug(
                `✅ Shader prewarm complete in ${(performance.now() - startTime).toFixed(0)}ms`
            )
        } catch (error) {
            // compileAsync failure is non-fatal — shaders will compile on first render instead
            InstancedShelfRenderer.logger.warn('Shader prewarm failed (non-fatal), shaders will compile on first render:', error)
        } finally {
            // Remove meshes from the temporary scene — they belong to the main scene only
            // after setInstance() calls addToMainScene()
            for (const mesh of meshes) {
                prewarmScene.remove(mesh)
            }
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
        
        const stickerIntegration = this.stickerHandler.getStickerIntegration()
        if (stickerIntegration) {
            stickerIntegration.setupInstanceAttributes(this.sideBoardManager)
        }
        this.stickerHandler.setManagers(this.sideBoardManager, this.shelfUnits)
    }
    
    private buildShelfUnitTemplate(): void {
        const config = this.defaultShelfConfig
        const angleRad = (config.angle * Math.PI) / 180
        const boardSeparation = config.depth * 0.8
        
        this.shelfUnitTemplate = []
        
        // Angled boards (front and back)
        this.shelfUnitTemplate.push({
            type: ShelfGeometryType.AngledBoard,
            offset: new THREE.Vector3(0, config.height / 2, boardSeparation / 2),
            rotation: new THREE.Quaternion().setFromEuler(new THREE.Euler(-angleRad, 0, 0)),
            customAttributes: [{ name: 'rotationAngle', value: -config.angle }]
        })
        
        this.shelfUnitTemplate.push({
            type: ShelfGeometryType.AngledBoard,
            offset: new THREE.Vector3(0, config.height / 2, -boardSeparation / 2),
            rotation: new THREE.Quaternion().setFromEuler(new THREE.Euler(angleRad, 0, 0)),
            customAttributes: [{ name: 'rotationAngle', value: config.angle }]
        })
        
        // Side boards (left and right)
        this.shelfUnitTemplate.push({
            type: ShelfGeometryType.SideBoard,
            offset: new THREE.Vector3(-config.width / 2 - config.boardThickness * 0.5, config.height / 2, 0),
            isSideBoard: true,
            sideboardIsLeft: true
        })
        
        this.shelfUnitTemplate.push({
            type: ShelfGeometryType.SideBoard,
            offset: new THREE.Vector3(config.width / 2 + config.boardThickness * 0.5, config.height / 2, 0),
            isSideBoard: true,
            sideboardIsLeft: false
        })
        
        // Horizontal shelves and interior surfaces
        for (let i = 0; i < config.shelfCount; i++) {
            const shelfY = this.shelfYPositions[i]
            const widthAtHeight = config.width - 2 * (config.height - shelfY) * Math.tan(angleRad)
            const { shelfDepth, forwardOffset } = this.shelfDepthsAndOffsets[i]
            
            const widthScale = widthAtHeight / config.width
            const depthScale = shelfDepth / config.depth
            
            // Shelf board
            this.shelfUnitTemplate.push({
                type: ShelfGeometryType.ShelfBoard,
                offset: new THREE.Vector3(0, shelfY, forwardOffset),
                scale: new THREE.Vector3(widthScale, 1, depthScale),
                customAttributes: [{ name: 'shelfScale', value: [widthScale, depthScale] }]
            })
            
            // Interior surface
            this.shelfUnitTemplate.push({
                type: ShelfGeometryType.InteriorSurface,
                offset: new THREE.Vector3(0, shelfY + config.boardThickness * 0.55, forwardOffset),
                scale: new THREE.Vector3(widthScale, 1, depthScale),
                customAttributes: [{ name: 'surfaceScale', value: [widthScale, depthScale] }]
            })
        }
        
        InstancedShelfRenderer.logger.debug(`📋 Built shelf unit template: ${this.shelfUnitTemplate.length} parts per shelf`)
    }
    
    public setInstance(index: number, data: ShelfInstanceData): boolean {
        if (!this.isInitialized) {
            InstancedShelfRenderer.logger.warn('Not initialized')
            return false
        }
        
        if (index >= this.maxShelfUnits) {
            InstancedShelfRenderer.logger.warn(`Shelf unit index ${index} exceeds max ${this.maxShelfUnits}`)
            return false
        }
        
        // Merge with default configuration
        const shelfConfig: Required<ShelfConfig> = {
            ...this.defaultShelfConfig,
            ...data.shelfConfig
        }
        
        try {
            if (this.shelfUnits.size === 0) {
                this.angledBoardManager.addToMainScene()
                this.sideBoardManager.addToMainScene()
                this.shelfBoardManager.addToMainScene()
                this.interiorSurfaceManager.addToMainScene()
            }
            
            const shelfUnit = this.applyShelfUnitTemplate(index, data.position, shelfConfig)
            this.shelfUnits.set(index, shelfUnit)
            
            InstancedShelfRenderer.logger.debug(`🏪 Set shelf unit ${index} at position (${data.position.x.toFixed(2)}, ${data.position.y.toFixed(2)}, ${data.position.z.toFixed(2)})`)
            return true
            
        } catch (err) {
            InstancedShelfRenderer.logger.error(`❌ Failed to set shelf unit ${index}:`, err)
            return false
        }
    }
    
    private applyShelfUnitTemplate(
        shelfUnitIndex: number,
        position: THREE.Vector3,
        _config: Required<ShelfConfig>
    ): ShelfUnitInstance {
        const instanceIndices = {
            angledBoards: [] as number[],
            sideBoards: [] as number[],
            shelfBoards: [] as number[],
            interiorSurfaces: [] as number[]
        }
        
        for (const part of this.shelfUnitTemplate) {
            const worldPos = position.clone().add(part.offset)
            let instanceIndex: number
            let manager: InstancedMeshManager
            let indicesArray: number[]
            
            switch (part.type) {
                case ShelfGeometryType.AngledBoard:
                    instanceIndex = this.nextInstanceIndex.angledBoard++
                    manager = this.angledBoardManager
                    indicesArray = instanceIndices.angledBoards
                    break
                case ShelfGeometryType.SideBoard:
                    instanceIndex = this.nextInstanceIndex.sideBoard++
                    manager = this.sideBoardManager
                    indicesArray = instanceIndices.sideBoards
                    break
                case ShelfGeometryType.ShelfBoard:
                    instanceIndex = this.nextInstanceIndex.shelfBoard++
                    manager = this.shelfBoardManager
                    indicesArray = instanceIndices.shelfBoards
                    break
                case ShelfGeometryType.InteriorSurface:
                    instanceIndex = this.nextInstanceIndex.interior++
                    manager = this.interiorSurfaceManager
                    indicesArray = instanceIndices.interiorSurfaces
                    break
            }
            
            manager.setInstanceMatrix(instanceIndex, worldPos, part.rotation, part.scale)
            
            if (part.customAttributes) {
                for (const attr of part.customAttributes) {
                    manager.setInstanceAttribute(attr.name, instanceIndex, attr.value)
                }
            }
            
            if (part.isSideBoard) {
                this.stickerHandler.initializeSideboardStickers(
                    this.sideBoardManager,
                    instanceIndex,
                    shelfUnitIndex,
                    part.sideboardIsLeft ?? true
                )
            }
            
            indicesArray.push(instanceIndex)
        }
        
        return {
            position: position.clone(),
            config: _config,
            instanceIndices
        }
    }
    
    public updateGPU(): void {
        if (!this.isInitialized) {
            return
        }
        
        this.angledBoardManager.updateGPU()
        this.sideBoardManager.updateGPU()
        this.shelfBoardManager.updateGPU()
        this.interiorSurfaceManager.updateGPU()
        
        InstancedShelfRenderer.logger.debug(`🔄 GPU updated: ${this.shelfUnits.size} shelf units`)
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
        
        InstancedShelfRenderer.logger.debug('🔄 Reset')
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
            activeGeometryMaterialCombinations: activeGeometryTypes
        }
    }

    public dispose(): void {
        InstancedShelfRenderer.logger.debug('🧹 Disposing')
        
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
        
        this.shelfUnits.clear()
        this.isInitialized = false
        
        InstancedShelfRenderer.logger.debug('✅ Disposed')
    }
}