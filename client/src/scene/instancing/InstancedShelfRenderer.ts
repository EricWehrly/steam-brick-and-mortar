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
 *
 * DELEGATES TO:
 * - InstancedMeshManager: Per-geometry-type instancing
 * - SharedMaterialManager: Material acquisition
 * - ShelfStickerHandler: Sticker placement on side boards
 *
 * DOES NOT:
 * - Calculate shelf positions (that's layout's job)
 * - Know about games or batches (pure rendering)
 *
 * INITIALIZATION:
 * - initialize() is async; callers should await the returned promise.
 * - isReady() polling is still available but discouraged.
 *
 * TD: no-gpu-fallback
 * There is no CPU / non-instanced fallback for any of the GPU-instanced
 * rendering systems (shelves, game box artwork, labels, shelf stickers).
 * StorePropsCoordinator registers unconditionally; if the runtime lacks
 * WebGL2 or ANGLE_instanced_arrays the store will silently produce nothing.
 *
 * A proper fallback would need to cover:
 *   - InstancedShelfRenderer → individual Mesh objects per shelf unit
 *   - LodGameArtworkRenderer → one PlaneGeometry + canvas texture per box
 *   - InstancedLabelRenderer → individual Sprite or canvas label per box
 *   - ShelfStickerHandler   → individual Mesh per sticker
 *
 * Given that Steam / WebXR is effectively a WebGL2-required platform this
 * is low priority, but the gap should be explicit.
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
import { buildShelfGeometryTemplates, buildShelfUnitTemplate, ShelfGeometryType, type ShelfPartTemplate } from './ShelfGeometryBuilder'
import { EventManager } from '../../core/EventManager'
import {
    StorePropsEventTypes,
    type ShelfReadyEvent,
    type ShelfUnitRepositionRequestedEvent,
} from '../../types/InteractionEvents'
import { Logger } from '../../utils/Logger'
import { MeshPrewarmer } from '../../utils/MeshPrewarmer'
import { SystemCapabilitiesDetector } from '../../utils/SystemCapabilities'
import { FrameBudgetScheduler } from '../../utils/FrameBudgetScheduler'

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

interface ShelfUnitInstance {
    position: THREE.Vector3
    instanceIndices: {
        angledBoards: number[]
        sideBoards: number[]
        shelfBoards: number[]
        interiorSurfaces: number[]
    }
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
    private hasParallelShaderCompile = false
    private pendingShelfReady = new Map<number, ShelfReadyEvent>()
    private meshesAddedToScene = false
    private sceneInsertCancelled = false

    private readonly boundHandleShelfReady: (event: CustomEvent<ShelfReadyEvent>) => void
    private readonly boundHandleShelfUnitRepositionRequested: (event: CustomEvent<ShelfUnitRepositionRequestedEvent>) => void

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
        
        this.boundHandleShelfReady = (event: CustomEvent<ShelfReadyEvent>) =>
            this.handleShelfReady(event.detail)
        this.boundHandleShelfUnitRepositionRequested = (event: CustomEvent<ShelfUnitRepositionRequestedEvent>) =>
            this.handleShelfUnitRepositionRequested(event.detail)

        EventManager.getInstance().registerEventHandler(
            StorePropsEventTypes.ShelfReady,
            this.boundHandleShelfReady
        )
        EventManager.getInstance().registerEventHandler(
            StorePropsEventTypes.ShelfUnitRepositionRequested,
            this.boundHandleShelfUnitRepositionRequested
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
            
            this.geometryTemplates = buildShelfGeometryTemplates(this.defaultShelfConfig)
            
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
            this.shelfUnitTemplate = buildShelfUnitTemplate(this.defaultShelfConfig, this.shelfYPositions, this.shelfDepthsAndOffsets)

            // Register meshes with MeshPrewarmer — it batches all registrations
            // across a debounce window and calls compileAsync once, non-blocking.
            // We detect KHR here for future use: if we later need to stagger mesh registration
            // *into* the prewarm scene on capable hardware, this flag drives that gate.
            // It does NOT control how we insert into the main scene (always staggered).
            this.hasParallelShaderCompile = SystemCapabilitiesDetector.detect().hasParallelShaderCompile
            for (const manager of [this.angledBoardManager, this.sideBoardManager, this.shelfBoardManager, this.interiorSurfaceManager]) {
                const mesh = manager.getInstancedMesh()
                if (mesh) MeshPrewarmer.register(mesh)
            }
            
            this.isInitialized = true
            this.flushPendingShelfReady()
            InstancedShelfRenderer.logger.debug('✅ Initialized')
            
        } catch (err) {
            InstancedShelfRenderer.logger.error('❌ Failed to initialize:', err)
            throw err
        }
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
        this.stickerHandler.setManagers(this.sideBoardManager, this.shelfUnits.size)
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
                this.ensureMeshesAddedToScene()
            }

            // Idempotent: if this shelfId already exists, reuse its instance slots.
            // This lets runtime relayout update positions without allocating new GPU slots.
            const existing = this.shelfUnits.get(index)
            if (existing) {
                this.updateShelfUnitTransform(index, existing, data.position, data.rotation)
                InstancedShelfRenderer.logger.debug(`🔄 Updated shelf unit ${index} at (${data.position.x.toFixed(2)}, ${data.position.y.toFixed(2)}, ${data.position.z.toFixed(2)})`)
                return true
            }

            const shelfUnit = this.applyShelfUnitTemplate(index, data.position, data.rotation)
            this.shelfUnits.set(index, shelfUnit)

            InstancedShelfRenderer.logger.debug(`🏪 Set shelf unit ${index} at position (${data.position.x.toFixed(2)}, ${data.position.y.toFixed(2)}, ${data.position.z.toFixed(2)})`)
            return true
            
        } catch (err) {
            InstancedShelfRenderer.logger.error(`❌ Failed to set shelf unit ${index}:`, err)
            return false
        }
    }
    
    private ensureMeshesAddedToScene(): void {
        if (this.meshesAddedToScene) {
            return
        }
        this.meshesAddedToScene = true
        this.sceneInsertCancelled = false

        // Schedule one mesh per frame via FrameBudgetScheduler.
        // The scheduler runs at most one task per frame by default, so the 4 inserts
        // spread across 4 consecutive frames naturally — keeping any residual GPU compile
        // work from landing in a single frame regardless of whether compileAsync ran.
        // (hasParallelShaderCompile is retained for a future gate: staggering registration
        // *into* the prewarm scene on capable hardware — not yet needed.)
        const scheduler = FrameBudgetScheduler.getInstance()
        for (const manager of [this.angledBoardManager, this.sideBoardManager,
                                this.shelfBoardManager, this.interiorSurfaceManager]) {
            scheduler.schedule(() => {
                if (!this.sceneInsertCancelled) manager.addToMainScene()
            }, { priority: 'high', maxDeferMs: 0 })
        }

        InstancedShelfRenderer.logger.debug('Scheduled 4 instanced shelf mesh insertions (one per frame, never forced)')
    }

    private applyShelfUnitTemplate(
        shelfUnitIndex: number,
        position: THREE.Vector3,
        unitRotation?: THREE.Quaternion
    ): ShelfUnitInstance {
        const instanceIndices = {
            angledBoards: [] as number[],
            sideBoards: [] as number[],
            shelfBoards: [] as number[],
            interiorSurfaces: [] as number[]
        }
        
        for (const part of this.shelfUnitTemplate) {
            // Rotate the part offset around the unit origin if a Y rotation is provided
            const rotatedOffset = unitRotation
                ? part.offset.clone().applyQuaternion(unitRotation)
                : part.offset.clone()
            const worldPos = position.clone().add(rotatedOffset)
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
            
            // Combine unit-level Y rotation with part's own rotation (e.g. shelf board tilt)
            const finalRotation = unitRotation
                ? (part.rotation ? unitRotation.clone().multiply(part.rotation) : unitRotation.clone())
                : part.rotation
            manager.setInstanceMatrix(instanceIndex, worldPos, finalRotation, part.scale)
            
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
            instanceIndices
        }
    }
    
    /**
     * Update the world-space matrices of an already-instanced shelf unit.
     * Reuses the existing GPU instance slots rather than allocating new ones.
     * Called by setInstance when the shelfId already exists.
     */
    private updateShelfUnitTransform(
        _shelfUnitIndex: number,
        existing: ShelfUnitInstance,
        position: THREE.Vector3,
        unitRotation?: THREE.Quaternion
    ): void {
        existing.position.copy(position)

        const partsWithIndices = [
            { type: ShelfGeometryType.AngledBoard,       indices: existing.instanceIndices.angledBoards,    manager: this.angledBoardManager },
            { type: ShelfGeometryType.SideBoard,         indices: existing.instanceIndices.sideBoards,      manager: this.sideBoardManager },
            { type: ShelfGeometryType.ShelfBoard,        indices: existing.instanceIndices.shelfBoards,     manager: this.shelfBoardManager },
            { type: ShelfGeometryType.InteriorSurface,   indices: existing.instanceIndices.interiorSurfaces, manager: this.interiorSurfaceManager },
        ]

        let partIdx = 0
        for (const part of this.shelfUnitTemplate) {
            const rotatedOffset = unitRotation
                ? part.offset.clone().applyQuaternion(unitRotation)
                : part.offset.clone()
            const worldPos = position.clone().add(rotatedOffset)

            const entry = partsWithIndices.find(p => p.type === part.type)
            if (!entry || partIdx >= entry.indices.length) continue

            // Each geometry type has its own index cursor; use partIdx relative to type group
            const typeIdx = partsWithIndices
                .filter(p => p.type === part.type)
                .indexOf(entry)
            const instanceIndex = entry.indices[typeIdx] ?? entry.indices[0]

            const finalRotation = unitRotation
                ? (part.rotation ? unitRotation.clone().multiply(part.rotation) : unitRotation.clone())
                : part.rotation
            entry.manager.setInstanceMatrix(instanceIndex, worldPos, finalRotation, part.scale)

            partIdx++
        }
    }

    private handleShelfReady(detail: ShelfReadyEvent): void {
        if (!this.isReady()) {
            this.pendingShelfReady.set(detail.shelfIndex, detail)
            return
        }

        // Idempotent: if a shelf with this shelfId already exists, treat as a position update.
        // This allows runtime relayout to reuse the same shelfId without re-instancing churn.
        // Full matrix rewrite is safe because setInstance overwrites the instance slot.
        const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, detail.rotationY, 0))
        this.setInstance(detail.shelfIndex, {
            position: detail.position as THREE.Vector3,
            rotation,
        })
    }

    /**
     * Reposition an already-instanced shelf unit — liminal mode's treadmill
     * recycling a unit into a new corridor slot. setInstance is idempotent
     * for an existing index, so this is just a direct pass-through; the
     * dedicated event (rather than reusing ShelfReady) exists purely because
     * GameBoxSpawner treats ShelfReady's shelfIndex === 0 as "new layout wave,
     * clear my anchor cache" — see ShelfUnitRepositionRequestedEvent's doc.
     */
    private handleShelfUnitRepositionRequested(detail: ShelfUnitRepositionRequestedEvent): void {
        const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, detail.rotationY, 0))
        this.setInstance(detail.shelfIndex, {
            position: detail.position as THREE.Vector3,
            rotation,
        })
    }

    private flushPendingShelfReady(): void {
        if (!this.isReady() || this.pendingShelfReady.size === 0) {
            return
        }

        const pending = Array.from(this.pendingShelfReady.values()).sort((a, b) => a.shelfIndex - b.shelfIndex)
        this.pendingShelfReady.clear()

        for (const detail of pending) {
            this.handleShelfReady(detail)
        }
    }
    
    public reset(): void {
        this.angledBoardManager.reset()
        this.sideBoardManager.reset()
        this.shelfBoardManager.reset()
        this.interiorSurfaceManager.reset()
        
        this.shelfUnits.clear()
        this.stickerHandler.setManagers(this.sideBoardManager, 0)
        this.nextInstanceIndex = {
            angledBoard: 0,
            sideBoard: 0,
            shelfBoard: 0,
            interior: 0
        }
        this.meshesAddedToScene = false
        this.sceneInsertCancelled = true
        this.pendingShelfReady.clear()
        
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

        EventManager.getInstance().deregisterEventHandler(
            StorePropsEventTypes.ShelfReady,
            this.boundHandleShelfReady
        )
        EventManager.getInstance().deregisterEventHandler(
            StorePropsEventTypes.ShelfUnitRepositionRequested,
            this.boundHandleShelfUnitRepositionRequested
        )

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
        this.meshesAddedToScene = false
        this.sceneInsertCancelled = true
        this.hasParallelShaderCompile = false
        this.pendingShelfReady.clear()
        
        InstancedShelfRenderer.logger.debug('✅ Disposed')
    }
}
