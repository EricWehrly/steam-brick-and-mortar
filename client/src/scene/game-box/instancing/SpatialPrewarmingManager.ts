/**
 * Spatial Pre-warming Manager - Proactive HIGH texture loading based on player movement
 * 
 * Option C from the LOD memory optimization analysis:
 * - Detect player movement direction
 * - Pre-load HIGH textures in that direction BEFORE the LOD manager asks
 * - Aggressively evict textures behind the player
 * - Throttle loads to prevent lag spikes (max 2-3 concurrent loads)
 * 
 * Flow:
 * 1. Track camera position/velocity over time
 * 2. Identify games in the movement direction
 * 3. Queue those games for HIGH texture loading
 * 4. Process queue gradually (throttled)
 * 5. Evict HIGH textures for games behind player
 */

import * as THREE from 'three'
import { RenderLoopRegistry } from '../../RenderLoopRegistry'
import { DataManager } from '../../../core/data/DataManager'
import { DataKey } from '../../../core/data/DataTypes'
import { Logger } from '../../../utils/Logger'
import { HighTextureCache, HighTextureState } from './HighTextureCache'

export interface PrewarmingConfig {
    /** How far ahead to pre-warm (meters) */
    prewarmDistance: number
    /** Max concurrent texture loads */
    maxConcurrentLoads: number
    /** How often to check player direction (frames) */
    directionUpdateFrequency: number
    /** How often to process the load queue (frames) */
    loadQueueProcessFrequency: number
    /** Angle threshold for "in front" (radians) - 90° = PI/2 */
    frontHalfAngle: number
    /** Enable aggressive eviction of behind-player textures */
    aggressiveEviction: boolean
    /** Distance behind player to evict (meters) */
    evictBehindDistance: number
}

const DEFAULT_CONFIG: PrewarmingConfig = {
    prewarmDistance: 6.0,        // Pre-load 6m ahead
    maxConcurrentLoads: 2,       // Max 2 loads at a time
    directionUpdateFrequency: 30, // Check direction every 30 frames
    loadQueueProcessFrequency: 15, // Process queue every 15 frames
    frontHalfAngle: Math.PI / 2,  // 90° cone in front
    aggressiveEviction: true,
    evictBehindDistance: 4.0      // Evict textures 4m+ behind player
}

interface GamePosition {
    textureIndex: number
    gameName: string
    position: THREE.Vector3
}

interface PrewarmStats {
    totalPrewarmed: number
    totalEvicted: number
    queueLength: number
    currentLoads: number
}

export class SpatialPrewarmingManager {
    public static logger = Logger.createLogFunctions(SpatialPrewarmingManager.name)
    private readonly config: PrewarmingConfig
    private readonly highTextureCache: HighTextureCache
    private readonly renderLoopRegistry: RenderLoopRegistry
    private readonly dataManager: DataManager
    
    // Game position tracking
    private gamePositions: Map<number, GamePosition> = new Map()
    
    // Movement tracking
    private lastCameraPos = new THREE.Vector3()
    private movementDirection = new THREE.Vector3(0, 0, -1) // Default: forward
    private velocitySamples: THREE.Vector3[] = []
    
    // Pre-warm queue
    private prewarmQueue: number[] = []
    private currentlyLoading: Set<number> = new Set()
    
    // Frame counting
    private frameCount = 0
    
    // Stats
    private stats: PrewarmStats = {
        totalPrewarmed: 0,
        totalEvicted: 0,
        queueLength: 0,
        currentLoads: 0
    }
    
    // Reusable vectors
    // TODO: Don't use these, they're brittle and problematic
    private readonly tmpVec = new THREE.Vector3()
    private readonly tmpDir = new THREE.Vector3()
    private readonly tmpCameraWorldPos = new THREE.Vector3()
    
    private isRegistered = false
    
    constructor(highTextureCache: HighTextureCache, config: Partial<PrewarmingConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config }
        this.highTextureCache = highTextureCache
        this.renderLoopRegistry = RenderLoopRegistry.getInstance()
        this.dataManager = DataManager.getInstance()
        
        SpatialPrewarmingManager.logger.lifecycle(`Initialized: prewarm ${this.config.prewarmDistance}m ahead, max ${this.config.maxConcurrentLoads} concurrent loads`)
    }
    
    /**
     * Register a game's position for spatial tracking
     */
    public registerGamePosition(textureIndex: number, gameName: string, position: THREE.Vector3): void {
        this.gamePositions.set(textureIndex, {
            textureIndex,
            gameName,
            position: position.clone()
        })
    }
    
    /**
     * Start the pre-warming system
     */
    public start(): void {
        if (this.isRegistered) return
        
        this.renderLoopRegistry.register('SpatialPrewarming', this.onFrame.bind(this))
        this.isRegistered = true
        
        // Initialize camera position
        const camera = this.dataManager.get<THREE.Camera>(DataKey.MainCamera)
        if (camera) {
            this.lastCameraPos.copy(camera.getWorldPosition(this.tmpCameraWorldPos))
        }
        
        SpatialPrewarmingManager.logger.lifecycle(`Started with ${this.gamePositions.size} registered games`)
    }
    
    /**
     * Stop the pre-warming system
     */
    public stop(): void {
        if (!this.isRegistered) return
        
        this.renderLoopRegistry.unregister('SpatialPrewarming')
        this.isRegistered = false
        SpatialPrewarmingManager.logger.lifecycle('Stopped')
    }
    
    /**
     * Render loop callback
     */
    // TODO: replace with renderer registration for update frequency
    private onFrame(_now: number, _deltaTime: number): void {
        const camera = this.dataManager.get<THREE.Camera>(DataKey.MainCamera)
        if (!camera) return
        
        this.frameCount++
        
        // Update movement direction periodically
        // TODO: This feels like an unnecessarily expensive way to do this
        if (this.frameCount % this.config.directionUpdateFrequency === 0) {
            this.updateMovementDirection(camera)
        }
        
        // Process load queue periodically
        if (this.frameCount % this.config.loadQueueProcessFrequency === 0) {
            this.processLoadQueue()
        }
    }
    
    /**
     * Update the estimated movement direction based on velocity samples
     */
    private updateMovementDirection(camera: THREE.Camera): void {
        const currentPos = camera.getWorldPosition(this.tmpCameraWorldPos)
        
        // Calculate velocity this frame
        this.tmpVec.copy(currentPos).sub(this.lastCameraPos)
        
        // Only track significant movement (> 1cm)
        if (this.tmpVec.lengthSq() > 0.0001) {
            // Add velocity sample
            this.velocitySamples.push(this.tmpVec.clone())
            
            // Keep only last 10 samples
            if (this.velocitySamples.length > 10) {
                this.velocitySamples.shift()
            }
            
            // Average the samples for smooth direction
            if (this.velocitySamples.length >= 3) {
                this.movementDirection.set(0, 0, 0)
                for (const sample of this.velocitySamples) {
                    this.movementDirection.add(sample)
                }
                this.movementDirection.normalize()
                
                // Rebuild pre-warm queue based on new direction
                this.rebuildPrewarmQueue(currentPos)
            }
        }
        
        // Update last position
        this.lastCameraPos.copy(currentPos)
        
        // Handle eviction if enabled
        if (this.config.aggressiveEviction) {
            this.evictBehindPlayer(currentPos)
        }
    }
    
    /**
     * Build the pre-warm queue for games in the movement direction
     */
    private rebuildPrewarmQueue(cameraPos: THREE.Vector3): void {
        const candidates: Array<{ textureIndex: number; score: number }> = []
        
        for (const [textureIndex, game] of this.gamePositions) {
            // Skip if already loaded or loading
            const state = this.highTextureCache.getState(textureIndex)
            if (state === HighTextureState.LOADED || state === HighTextureState.LOADING) {
                continue
            }
            
            // Direction to game
            this.tmpDir.copy(game.position).sub(cameraPos)
            const distance = this.tmpDir.length()
            
            // Skip if too far
            if (distance > this.config.prewarmDistance) {
                continue
            }
            
            // Normalize for dot product
            this.tmpDir.normalize()
            
            // Dot product with movement direction
            // +1 = same direction, 0 = perpendicular, -1 = opposite
            const dot = this.tmpDir.dot(this.movementDirection)
            
            // Only consider games "in front" (positive dot product within cone)
            const minDot = Math.cos(this.config.frontHalfAngle)
            if (dot > minDot) {
                // Score: prioritize closer games in the movement direction
                // Higher dot = more aligned, lower distance = closer
                const score = dot * 10 - distance
                candidates.push({ textureIndex, score })
            }
        }
        
        // Sort by score (highest first)
        candidates.sort((a, b) => b.score - a.score)
        
        // Update queue
        this.prewarmQueue = candidates.map(c => c.textureIndex)
        this.stats.queueLength = this.prewarmQueue.length
        
        if (this.prewarmQueue.length > 0) {
            SpatialPrewarmingManager.logger.runtime(`Pre-warm queue: ${this.prewarmQueue.length} games ahead`)
        }
    }
    
    /**
     * Process the load queue, respecting concurrency limits
     */
    private processLoadQueue(): void {
        // Remove any finished loads from tracking
        for (const textureIndex of this.currentlyLoading) {
            const state = this.highTextureCache.getState(textureIndex)
            if (state !== HighTextureState.LOADING) {
                this.currentlyLoading.delete(textureIndex)
            }
        }
        
        this.stats.currentLoads = this.currentlyLoading.size
        
        // Start new loads up to the limit
        while (
            this.currentlyLoading.size < this.config.maxConcurrentLoads &&
            this.prewarmQueue.length > 0
        ) {
            const textureIndex = this.prewarmQueue.shift()!
            
            // Double-check it's not already loaded
            const state = this.highTextureCache.getState(textureIndex)
            if (state === HighTextureState.LOADED || state === HighTextureState.LOADING) {
                continue
            }
            
            // Request the HIGH texture
            this.highTextureCache.requestHighTexture(textureIndex)
            this.currentlyLoading.add(textureIndex)
            this.stats.totalPrewarmed++
            
            const game = this.gamePositions.get(textureIndex)
            SpatialPrewarmingManager.logger.runtime(`Pre-warming "${game?.gameName?.slice(0, 20)}" (${this.currentlyLoading.size}/${this.config.maxConcurrentLoads})`)
        }
    }
    
    /**
     * Evict HIGH textures for games behind the player
     */
    private evictBehindPlayer(cameraPos: THREE.Vector3): void {
        for (const [textureIndex, game] of this.gamePositions) {
            const state = this.highTextureCache.getState(textureIndex)
            if (state !== HighTextureState.LOADED) continue
            
            // Direction to game
            this.tmpDir.copy(game.position).sub(cameraPos)
            const distance = this.tmpDir.length()
            this.tmpDir.normalize()
            
            // Check if behind player (negative dot product)
            const dot = this.tmpDir.dot(this.movementDirection)
            
            // Evict if behind player AND beyond threshold
            if (dot < -0.3 && distance > this.config.evictBehindDistance) {
                this.highTextureCache.markForEviction(textureIndex)
                this.stats.totalEvicted++
                SpatialPrewarmingManager.logger.runtime(`Marked for eviction: "${game.gameName.slice(0, 20)}" (behind player)`)
            }
        }
    }
    
    /**
     * Get current stats
     */
    public getStats(): PrewarmStats {
        return { ...this.stats }
    }
    
    /**
     * Force a direction update and queue rebuild (e.g., after teleport)
     */
    public forceUpdate(): void {
        const camera = this.dataManager.get<THREE.Camera>(DataKey.MainCamera)
        if (camera) {
            this.updateMovementDirection(camera)
            this.processLoadQueue()
        }
    }
    
    public dispose(): void {
        this.stop()
        this.gamePositions.clear()
        this.prewarmQueue = []
        this.currentlyLoading.clear()
        this.velocitySamples = []
        SpatialPrewarmingManager.logger.lifecycle('Disposed')
    }
}
