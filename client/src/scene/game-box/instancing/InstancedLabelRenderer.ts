/**
 * Instanced Label Renderer - Production GPU Instancing for Game Labels
 * 
 * Renders thousands of game box labels with minimal draw calls using:
 * - THREE.InstancedMesh for geometry batching
 * - THREE.DataArrayTexture for texture sampling
 * - Custom shaders for per-instance positioning and texture selection
 * 
 * Performance Impact:
 * - Before: N games = N draw calls for labels
 * - After: N games = 1-2 draw calls total
 * 
 * Usage:
 * 1. Create with maximum expected instances
 * 2. Initialize with game data to build texture array
 * 3. Set individual label positions/textures via setLabelInstance()
 * 4. Call updateGPU() to apply changes
 */

import * as THREE from 'three'
import { LabelTextureArrayManager } from './LabelTextureArrayManager'
import type { SteamGameData } from '../types/GameData'
import { EventManager } from '../../../core/EventManager'
import { GameEventTypes } from '../../../types/InteractionEvents'

export interface InstancedLabelConfig {
    maxInstances?: number
    textureSize?: number
    labelWidth?: number
    labelHeight?: number
}

export class InstancedLabelRenderer {
    private instancedMesh: THREE.InstancedMesh | null = null
    private textureArrayManager: LabelTextureArrayManager
    private geometry: THREE.PlaneGeometry | null = null
    private material: THREE.ShaderMaterial | null = null
    private scene: THREE.Scene
    
    // Configuration
    private readonly maxInstances: number
    
    // State tracking
    private currentCount: number = 0
    private isInitialized: boolean = false
    private gameNameToTextureIndex: Map<string, number> = new Map()
    
    // Constant quaternion for no rotation (performance optimization)
    private static readonly DEFAULT_ROTATION = new THREE.Quaternion() // Identity quaternion (0,0,0,1)
    
    constructor(config: InstancedLabelConfig = {}) {
        this.maxInstances = config.maxInstances || 2000
        
        this.textureArrayManager = new LabelTextureArrayManager(config.textureSize || 512)
        
        console.debug(`📋 InstancedLabelRenderer created (max: ${this.maxInstances} labels)`)
    }
    
    /**
     * Initialize with actual game data - builds texture array and creates instanced mesh
     */
    public async initializeWithGames(games: SteamGameData[]): Promise<void> {
        if (this.isInitialized) {
            console.warn('InstancedLabelRenderer already initialized')
            return
        }
        
        try {
            this.buildGameNameMapping(games)
            
            const gameNames = games.map(g => g.name)
            const textureArray = this.textureArrayManager.buildTextureArrayFromText(gameNames)
            
            this.material = this.createLabelMaterial(textureArray)
            
            // TODO: get dimensions from config
            this.geometry = new THREE.BoxGeometry(0.3, 0.4, 0.1)
            this.instancedMesh = new THREE.InstancedMesh(
                this.geometry,
                this.material,
                this.maxInstances
            )
            
            // Name the mesh for debugging
            this.instancedMesh.name = 'gpu-instanced-game-boxes'
            
            // CRITICAL: Set count to 0 initially (will update as instances are added)
            this.instancedMesh.count = 0
            
            // Enable shadows and visibility
            this.instancedMesh.castShadow = true
            this.instancedMesh.receiveShadow = true
            this.instancedMesh.visible = true
            
            // Disable frustum culling to prevent disappearing when close
            this.instancedMesh.frustumCulled = false
            
            // Ensure InstancedMesh is positioned at world origin (instances handle their own positions)
            this.instancedMesh.position.set(0, 0, 0)
            this.instancedMesh.rotation.set(0, 0, 0)
            this.instancedMesh.scale.set(1, 1, 1)
            
            this.setupInstanceAttributes()
            
            this.isInitialized = true
            
            // Log stats
            const stats = this.textureArrayManager.getStats()
            console.log('📊 InstancedLabelRenderer Stats:', stats)
            
        } catch (error) {
            console.error('❌ Failed to initialize InstancedLabelRenderer:', error)
            throw error
        }
    }
    
    /**
     * Set position, rotation and texture for a specific label instance
     */
    // TODO: Why do callers need to know the index? If they're providing the game name, and we're tracking it internally, they shouldn't provide an index
    public setLabelInstance(
        index: number,
        position: THREE.Vector3,
        gameName: string
    ): boolean {
        if (!this.isInitialized || !this.instancedMesh || !this.geometry) {
            console.warn('InstancedLabelRenderer not initialized')
            return false
        }
        
        if (index >= this.maxInstances) {
            console.warn(`Instance index ${index} exceeds max ${this.maxInstances}`)
            return false
        }
        
        // Get texture index for this game
        const textureIndex = this.gameNameToTextureIndex.get(gameName)
        if (textureIndex === undefined) {
            console.warn(`No texture found for game: ${gameName}`)
            return false
        }
        
        // Update matrix for this instance (position + default rotation)
        const matrix = new THREE.Matrix4()
        matrix.compose(position, InstancedLabelRenderer.DEFAULT_ROTATION, new THREE.Vector3(1, 1, 1))
        this.instancedMesh.setMatrixAt(index, matrix)
        
        // Update texture index attribute
        const textureIndices = this.geometry.getAttribute('textureIndex') as THREE.InstancedBufferAttribute
        textureIndices.setX(index, textureIndex)
        
        // Track highest index used
        this.currentCount = Math.max(this.currentCount, index + 1)
        
        return true
    }
    
    /**
     * Apply all instance updates to GPU
     * Call this after setting multiple instances for efficiency
     */
    public updateGPU(): void {
        if (!this.instancedMesh || !this.geometry) {
            console.warn('❌ updateGPU called but instancedMesh or geometry is null')
            return
        }
        
        this.instancedMesh.instanceMatrix.needsUpdate = true
        
        this.instancedMesh.count = this.currentCount
        
        const textureIndices = this.geometry.getAttribute('textureIndex')
        if (textureIndices) {
            textureIndices.needsUpdate = true
        }
        
        console.debug(`🔄 GPU updated: ${this.currentCount} active label instances`)
    }
    
    /**
     * Reset all instances (clears positions and count)
     */
    public reset(): void {
        this.currentCount = 0
        if (this.instancedMesh) {
            this.instancedMesh.count = 0
        }
    }
    
    /**
     * Get current statistics
     */
    public getStats(): {
        isInitialized: boolean
        activeInstances: number
        maxInstances: number
        textureArrayStats: any
    } {
        return {
            isInitialized: this.isInitialized,
            activeInstances: this.currentCount,
            maxInstances: this.maxInstances,
            textureArrayStats: this.textureArrayManager.getStats()
        }
    }
    
    /**
     * Build mapping from game names to texture array indices
     */
    private buildGameNameMapping(games: SteamGameData[]): void {
        this.gameNameToTextureIndex.clear()
        games.forEach((game, index) => {
            this.gameNameToTextureIndex.set(game.name, index)
        })
        console.debug(`📝 Built game name mapping for ${games.length} games`)
    }
    
    /**
     * Create shader material for instanced labels with texture array support
     */
    private createLabelMaterial(textureArray: THREE.DataArrayTexture): THREE.ShaderMaterial {
        return new THREE.ShaderMaterial({
            uniforms: {
                textureArray: { value: textureArray }
            },
            vertexShader: `
                attribute float textureIndex;
                varying float vTextureIndex;
                varying vec2 vUv;
                
                void main() {
                    vTextureIndex = textureIndex;
                    // Fix upside-down textures by flipping V coordinate
                    vUv = vec2(uv.x, 1.0 - uv.y);
                    
                    // Use instanced matrix for positioning
                    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform sampler2DArray textureArray;
                varying float vTextureIndex;
                varying vec2 vUv;
                
                void main() {
                    // Sample from texture array at specific layer
                    vec4 texColor = texture(textureArray, vec3(vUv, vTextureIndex));
                    
                    // Discard fully transparent pixels (optional optimization)
                    if (texColor.a < 0.01) discard;
                    
                    gl_FragColor = texColor;
                }
            `,
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: false,  // Avoid depth fighting with game boxes
            depthTest: true
        })
    }
    
    /**
     * Set up per-instance buffer attributes
     */
    private setupInstanceAttributes(): void {
        if (!this.geometry) return
        
        // Texture indices (which layer of texture array each instance uses)
        const textureIndices = new Float32Array(this.maxInstances)
        // Initialize with -1 to indicate unused instances
        textureIndices.fill(-1)
        
        this.geometry.setAttribute('textureIndex',
            new THREE.InstancedBufferAttribute(textureIndices, 1)
        )
    }
    
    /**
     * Check if renderer is ready for use
     */
    public isReady(): boolean {
        return this.isInitialized && this.instancedMesh !== null
    }
    
    /**
     * Get the underlying THREE.InstancedMesh for advanced operations
     */
    public getInstancedMesh(): THREE.InstancedMesh | null {
        return this.instancedMesh
    }
    
    /**
     * Clean up resources
     */
    public dispose(): void {
        console.debug('🧹 Disposing InstancedLabelRenderer')
        
        // Remove from scene
        if (this.instancedMesh) {
            this.instancedMesh = null
        }
        
        // Dispose geometry and material
        this.geometry?.dispose()
        this.material?.dispose()
        
        // Dispose texture array manager
        this.textureArrayManager.dispose()
        
        // Clear state
        this.gameNameToTextureIndex.clear()
        this.isInitialized = false
        this.currentCount = 0
        
        console.debug('✅ InstancedLabelRenderer disposed')
    }
}