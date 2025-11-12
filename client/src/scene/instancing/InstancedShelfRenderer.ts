import * as THREE from 'three'
import { InstancedMeshManager } from './InstancedMeshManager'
import { SharedMaterialManager, MaterialType } from '../../utils/SharedMaterialManager'
import { EventManager } from '../../core/EventManager'
import { GameEventTypes } from '../../types/InteractionEvents'
import { DEFAULT_SHELF_CONFIG, ShelfCalculationUtils, type ShelfConfig } from '../props/SharedPropsUtils'
import { DEFAULT_INSTANCED_RENDERER_CONFIG, type InstancedRendererConfig, type InstanceData } from './IInstancedRenderer'
import type { 
    IInstancedRenderer, 
    InstancedRendererStats
} from './IInstancedRenderer'
import { StickerManager } from '../stickers/StickerManager'
import { ShelfStickerIntegration } from '../stickers/ShelfStickerIntegration'
import { ShelfUnitIndexSystem } from '../stickers/ShelfUnitIndexSystem'

export interface InstancedShelfConfig extends InstancedRendererConfig {
    defaultShelfConfig?: ShelfConfig
    maxShelfUnits?: number
    maxStickersPerSideboard?: number
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
    
    // Pre-calculated shelf data (computed ONCE since all shelves are identical)
    private readonly shelfYPositions: number[]
    private readonly shelfDepthsAndOffsets: Array<{ shelfDepth: number; forwardOffset: number }>
    
    // Sticker system
    private stickerManager: StickerManager
    private stickerIntegration: ShelfStickerIntegration
    private indexSystem: ShelfUnitIndexSystem
    private readonly maxStickersPerSideboard: number
    
    constructor(config: InstancedShelfConfig = {}) {
        // Reduced to 3 to stay within WebGL attribute limits
        // 3 stickers * 2 vec4 attributes = 6 custom attributes
        // Combined with Three.js MeshStandardMaterial built-ins (~10 attributes) = 16 total
        this.maxStickersPerSideboard = config.maxStickersPerSideboard ?? 3
        this.maxShelfUnits = config.maxShelfUnits ?? DEFAULT_INSTANCED_SHELF_CONFIG.maxShelfUnits
        
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
        this.shelfDepthsAndOffsets = []
        for (let i = 1; i <= this.defaultShelfConfig.shelfCount; i++) {
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
        
        // Initialize sticker system
        this.stickerManager = new StickerManager()
        this.stickerIntegration = new ShelfStickerIntegration({
            stickerManager: this.stickerManager,
            maxStickersPerSurface: this.maxStickersPerSideboard
        })
        this.indexSystem = new ShelfUnitIndexSystem(this.stickerManager)
        
        // Subscribe to GPU update events
        EventManager.getInstance().registerEventHandler(GameEventTypes.InstancedBatchComplete, () => {
            this.updateGPU()
            this.populateStickersAfterGeneration()
        })
        
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
            
            // Clone and modify side board material to support stickers
            const stickerEnabledMaterial = brandAccentMaterial.clone()
            this.stickerIntegration.setupStickerMaterial(stickerEnabledMaterial)
            
            this.sideBoardManager.initialize({
                geometry: sideBoardGeometry,
                material: stickerEnabledMaterial,
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
        
        // Add sticker attributes to side boards (left board gets stickers)
        this.stickerIntegration.setupInstanceAttributes(this.sideBoardManager)
    }
    
    // TODO: Is this definitely how we want to write this?
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
            
            const shelfUnit = this.createShelfUnit(index, data.position, shelfConfig)
            this.shelfUnits.set(index, shelfUnit)
            
            console.debug(`🏪 Set shelf unit ${index} at position (${data.position.x.toFixed(2)}, ${data.position.y.toFixed(2)}, ${data.position.z.toFixed(2)})`)
            return true
            
        } catch (error) {
            console.error(`❌ Failed to set shelf unit ${index}:`, error)
            return false
        }
    }
    
    private createShelfUnit(
        shelfUnitIndex: number,
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
        this.createSideBoards(shelfUnitIndex, position, config, instanceIndices.sideBoards)
        this.createHorizontalShelves(shelfUnitIndex, position, config, instanceIndices)
        
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
    
    private createSideBoards(shelfUnitIndex: number, position: THREE.Vector3, config: Required<ShelfConfig>, indices: number[]): void {
        const leftBoardIndex = this.nextInstanceIndex.sideBoard++
        const leftPos = position.clone().add(new THREE.Vector3(
            -config.width / 2 - config.boardThickness * 0.5,
            config.height / 2,
            0
        ))
        this.sideBoardManager.setInstanceMatrix(leftBoardIndex, leftPos)
        
        // Initialize sticker data for left side board (which will receive stickers)
        const leftSurfaceId = shelfUnitIndex * 1000  // Unique ID for left sideboard
        this.stickerIntegration.updateSurfaceStickers(this.sideBoardManager, leftBoardIndex, leftSurfaceId)
        
        // Add shelf unit index if index system is enabled
        if (this.indexSystem.isEnabled()) {
            this.indexSystem.addIndexToSideboard(shelfUnitIndex, leftSurfaceId)
            // Refresh sticker attributes after adding index
            this.stickerIntegration.updateSurfaceStickers(this.sideBoardManager, leftBoardIndex, leftSurfaceId)
        }
        
        indices.push(leftBoardIndex)
        
        const rightBoardIndex = this.nextInstanceIndex.sideBoard++
        const rightPos = position.clone().add(new THREE.Vector3(
            config.width / 2 + config.boardThickness * 0.5,
            config.height / 2,
            0
        ))
        this.sideBoardManager.setInstanceMatrix(rightBoardIndex, rightPos)
        
        // Initialize sticker data for right side board (empty, no stickers)
        const rightSurfaceId = shelfUnitIndex * 1000 + 1
        this.stickerIntegration.updateSurfaceStickers(this.sideBoardManager, rightBoardIndex, rightSurfaceId)
        
        indices.push(rightBoardIndex)
    }
    
    private createHorizontalShelves(
        shelfUnitIndex: number,
        position: THREE.Vector3,
        config: Required<ShelfConfig>,
        instanceIndices: ShelfUnitInstance['instanceIndices']
    ): void {
        const angleRad = (config.angle * Math.PI) / 180
        
        // Use PRE-CALCULATED positions (computed once in constructor, not per shelf unit)
        for (let i = 0; i < config.shelfCount; i++) {
            const shelfY = this.shelfYPositions[i]
            const widthAtHeight = config.width - 2 * (config.height - shelfY) * Math.tan(angleRad)
            
            // Use PRE-CALCULATED depths (computed once in constructor)
            const { shelfDepth, forwardOffset } = this.shelfDepthsAndOffsets[i]
            
            const widthScale = widthAtHeight / config.width
            const depthScale = shelfDepth / config.depth
            
            this.createShelfBoard(position, shelfY, forwardOffset, widthScale, depthScale, instanceIndices.shelfBoards)
            this.createInteriorSurface(shelfUnitIndex, i, position, shelfY, forwardOffset, config.boardThickness, widthScale, depthScale, instanceIndices.interiorSurfaces)
        }
    }
    
    private createShelfBoard(
        position: THREE.Vector3,
        shelfY: number,
        forwardOffset: number,
        widthScale: number,
        depthScale: number,
        indices: number[]
    ): void {
        const shelfBoardIndex = this.nextInstanceIndex.shelfBoard++
        const shelfPos = position.clone().add(new THREE.Vector3(0, shelfY, forwardOffset))
        const shelfScale = new THREE.Vector3(widthScale, 1, depthScale)
        
        this.shelfBoardManager.setInstanceMatrix(shelfBoardIndex, shelfPos, undefined, shelfScale)
        this.shelfBoardManager.setInstanceAttribute('shelfScale', shelfBoardIndex, [widthScale, depthScale])
        indices.push(shelfBoardIndex)
    }
    
    private createInteriorSurface(
        shelfUnitIndex: number,
        shelfLevel: number,
        position: THREE.Vector3,
        shelfY: number,
        forwardOffset: number,
        boardThickness: number,
        widthScale: number,
        depthScale: number,
        indices: number[]
    ): void {
        const interiorSurfaceIndex = this.nextInstanceIndex.interior++
        const interiorPos = position.clone().add(new THREE.Vector3(0, shelfY + boardThickness * 0.55, forwardOffset))
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
    
    /**
     * Get the sticker manager for runtime sticker operations
     */
    public getStickerManager(): StickerManager {
        return this.stickerManager
    }
    
    /**
     * Populate stickers after shelf generation completes
     * Called via event handler after GPU update
     */
    private populateStickersAfterGeneration(): void {
        // Count left side boards (one per shelf unit)
        const totalLeftSideboards = this.shelfUnits.size
        
        console.log(`🎨 [STICKER DEBUG] populateStickersAfterGeneration: shelfUnits.size=${this.shelfUnits.size}, totalLeftSideboards=${totalLeftSideboards}`)
        
        // Populate with random stickers on left side boards (30% density)
        this.stickerIntegration.populateAndRefresh(
            this.sideBoardManager,
            totalLeftSideboards,
            (index: number) => index * 1000,  // Left sideboard surface IDs: 0, 1000, 2000, etc.
            0.3
        )
        
        console.log(`🎨 [STICKER DEBUG] Updated GPU with sticker data`)
    }
    
    /**
     * Enable shelf unit index display (using sticker system)
     */
    public enableShelfIndices(): void {
        this.indexSystem.enable()
        // Re-populate side boards to add indices
        this.refreshSideboardIndices()
        console.debug('🔍 Shelf unit indices enabled')
    }
    
    /**
     * Disable shelf unit index display
     */
    public disableShelfIndices(): void {
        this.indexSystem.disable()
        // Clear indices from side boards
        this.refreshSideboardIndices()
        console.debug('🔍 Shelf unit indices disabled')
    }
    
    /**
     * Toggle shelf unit index display
     */
    public toggleShelfIndices(): void {
        this.indexSystem.toggle()
        this.refreshSideboardIndices()
    }
    
    /**
     * Refresh side board indices for all shelf units
     */
    private refreshSideboardIndices(): void {
        let sideboardIndex = 0
        this.shelfUnits.forEach((_unit, shelfUnitIndex) => {
            const leftBoardIndex = sideboardIndex
            const leftSurfaceId = shelfUnitIndex * 1000
            
            // Clear and re-add stickers (including index if enabled)
            if (this.indexSystem.isEnabled()) {
                this.indexSystem.addIndexToSideboard(shelfUnitIndex, leftSurfaceId)
            }
            this.stickerIntegration.updateSurfaceStickers(this.sideBoardManager, leftBoardIndex, leftSurfaceId)
            
            sideboardIndex += 2  // Skip right board
        })
        
        this.sideBoardManager.updateGPU()
        console.debug(`🔍 Refreshed indices for ${this.shelfUnits.size} shelf units`)
    }
    
    /**
     * Old method removed - now handled by ShelfStickerIntegration
     */
    private setupStickerMaterial(material: THREE.MeshStandardMaterial): void {
        const stickerTexture = this.stickerManager.getEmojiAtlas().getTexture()
        const atlasInfo = this.stickerManager.getAtlasInfo()
        const emojiUVSize = atlasInfo.uvScale  // Size of one emoji in UV space
        
        console.log(`🎨 [SHADER DEBUG] Setting up sticker material with atlas:`, {
            atlasSize: atlasInfo.atlasSize,
            totalEmojis: atlasInfo.totalEmojis,
            uvScale: emojiUVSize,
            texture: stickerTexture,
            textureImage: stickerTexture.image
        })
        
        material.onBeforeCompile = (shader) => {
            console.log(`🎨 [SHADER DEBUG] onBeforeCompile called`)
            
            // Add uniforms
            shader.uniforms.stickerAtlas = { value: stickerTexture }
            shader.uniforms.emojiUVSize = { value: emojiUVSize }
            
            console.log(`🎨 [SHADER DEBUG] Added uniforms:`, {
                stickerAtlas: shader.uniforms.stickerAtlas,
                emojiUVSize: shader.uniforms.emojiUVSize
            })
            
            // Add packed attributes and varyings for 3 stickers
            shader.vertexShader = shader.vertexShader.replace(
                '#include <common>',
                `
                #include <common>
                // Packed sticker attributes (vec4s)
                attribute vec4 sticker0Data1;  // uvOffset.xy, position.xy
                attribute vec4 sticker0Data2;  // rotation, scale, enabled, padding
                attribute vec4 sticker1Data1;
                attribute vec4 sticker1Data2;
                attribute vec4 sticker2Data1;
                attribute vec4 sticker2Data2;
                
                varying vec2 vUV;
                varying vec4 vSticker0Data1;
                varying vec4 vSticker0Data2;
                varying vec4 vSticker1Data1;
                varying vec4 vSticker1Data2;
                varying vec4 vSticker2Data1;
                varying vec4 vSticker2Data2;
                `
            )
            
            // Pass sticker data to fragment shader
            shader.vertexShader = shader.vertexShader.replace(
                '#include <begin_vertex>',
                `
                #include <begin_vertex>
                vUV = uv;
                vSticker0Data1 = sticker0Data1;
                vSticker0Data2 = sticker0Data2;
                vSticker1Data1 = sticker1Data1;
                vSticker1Data2 = sticker1Data2;
                vSticker2Data1 = sticker2Data1;
                vSticker2Data2 = sticker2Data2;
                `
            )
            
            // Add sticker blending in fragment shader
            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <common>',
                `
                #include <common>
                uniform sampler2D stickerAtlas;
                uniform float emojiUVSize;
                varying vec2 vUV;
                varying vec4 vSticker0Data1;
                varying vec4 vSticker0Data2;
                varying vec4 vSticker1Data1;
                varying vec4 vSticker1Data2;
                varying vec4 vSticker2Data1;
                varying vec4 vSticker2Data2;
                
                vec4 getStickerColor(vec4 data1, vec4 data2) {
                    vec2 uvOffset = data1.xy;
                    vec2 stickerPos = data1.zw;
                    float rotation = data2.x;
                    float scale = data2.y;
                    float enabled = data2.z;
                    
                    if (enabled < 0.5) return vec4(0.0);
                    
                    // Transform UV to sticker-local space
                    vec2 localUV = vUV - stickerPos;
                    
                    // Apply rotation
                    float rad = radians(rotation);
                    float cosA = cos(rad);
                    float sinA = sin(rad);
                    vec2 rotatedUV = vec2(
                        localUV.x * cosA - localUV.y * sinA,
                        localUV.x * sinA + localUV.y * cosA
                    );
                    
                    // Apply scale and center
                    rotatedUV /= (scale * 0.15);  // Scale factor for reasonable size
                    rotatedUV += vec2(0.5);  // Center in 0-1 range
                    
                    // Check if UV is within sticker bounds
                    if (rotatedUV.x < 0.0 || rotatedUV.x > 1.0 || rotatedUV.y < 0.0 || rotatedUV.y > 1.0) {
                        return vec4(0.0);
                    }
                    
                    // Sample from atlas
                    vec2 atlasUV = uvOffset + rotatedUV * emojiUVSize;
                    return texture2D(stickerAtlas, atlasUV);
                }
                `
            )
            
            // Blend all stickers onto base color
            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <color_fragment>',
                `
                #include <color_fragment>
                
                // Get sticker colors
                vec4 sticker0 = getStickerColor(vSticker0Data1, vSticker0Data2);
                vec4 sticker1 = getStickerColor(vSticker1Data1, vSticker1Data2);
                vec4 sticker2 = getStickerColor(vSticker2Data1, vSticker2Data2);
                
                // Blend stickers onto base color (back to front)
                diffuseColor.rgb = mix(diffuseColor.rgb, sticker0.rgb, sticker0.a);
                diffuseColor.rgb = mix(diffuseColor.rgb, sticker1.rgb, sticker1.a);
                diffuseColor.rgb = mix(diffuseColor.rgb, sticker2.rgb, sticker2.a);
                `
            )
        }
        
        material.needsUpdate = true
        console.debug('🎨 [DEPRECATED] Old setupStickerMaterial called - this should not happen')
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