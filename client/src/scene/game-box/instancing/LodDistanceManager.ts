/**
 * LOD Distance Manager - Automatic LOD switching based on camera distance
 * 
 * Checks all game instances every N frames and updates their LOD level
 * based on distance from camera. Uses squared distances to avoid sqrt.
 * 
 * Designed to be layout-agnostic - works regardless of shelf arrangement.
 * Self-registers with RenderLoopRegistry for automatic updates.
 * 
 * TEMPORARY: Includes diagnostic logging (~1/sec) to measure performance impact.
 * Remove logging once tuned.
 */

import * as THREE from 'three'
import { LodArtworkRenderer, LOD_LEVEL, type LodLevel } from './LodArtworkRenderer'
import { RenderLoopRegistry } from '../../RenderLoopRegistry'
import { DataManager } from '../../../core/data/DataManager'
import { DataKey } from '../../../core/data/DataTypes'
import { Logger } from '../../../utils/Logger'

const log = Logger.withContext('LodDistanceManager')

export interface LodDistanceConfig {
    /** Distance threshold: closer than this = HIGH LOD */
    highDistance: number
    /** Distance threshold: closer than this = MID LOD, farther = LOW */
    midDistance: number
    /** Hysteresis buffer to prevent thrashing at boundaries */
    hysteresis: number
    /** Frames between LOD update cycles */
    updateFrequency: number
}

const DEFAULT_CONFIG: LodDistanceConfig = {
    highDistance: 3.0,      // Within 3m = HIGH
    midDistance: 8.0,       // Within 8m = MID, beyond = LOW
    hysteresis: 0.5,        // 0.5m buffer at thresholds
    updateFrequency: 60     // Check every 60 frames (~1 sec at 60fps)
}

interface InstanceLodState {
    position: THREE.Vector3
    currentLod: LodLevel
}

// TEMPORARY: Diagnostic tracking
interface DiagnosticStats {
    lastLogTime: number
    updateCount: number
    totalUpdateTimeMs: number
    lodChanges: number
    frameTimeSamples: number[]
}

export class LodDistanceManager {
    private readonly renderer: LodArtworkRenderer
    private readonly config: LodDistanceConfig
    private readonly renderLoopRegistry: RenderLoopRegistry
    private readonly dataManager: DataManager
    private isRegistered: boolean = false
    
    // Pre-computed squared distances for comparison (avoids sqrt)
    private readonly highDistSq: number
    private readonly midDistSq: number
    private readonly highDistSqWithHysteresis: number
    private readonly midDistSqWithHysteresis: number
    
    // Instance tracking
    private instanceStates: Map<number, InstanceLodState> = new Map()
    
    // Frame counting
    private frameCount: number = 0
    
    // Reusable vector to avoid allocation
    private readonly tmpVec = new THREE.Vector3()
    
    // TEMPORARY: Diagnostics
    private diagnostics: DiagnosticStats = {
        lastLogTime: 0,
        updateCount: 0,
        totalUpdateTimeMs: 0,
        lodChanges: 0,
        frameTimeSamples: []
    }
    private lastFrameTime: number = 0

    constructor(renderer: LodArtworkRenderer, config: Partial<LodDistanceConfig> = {}) {
        this.renderer = renderer
        this.config = { ...DEFAULT_CONFIG, ...config }
        this.renderLoopRegistry = RenderLoopRegistry.getInstance()
        this.dataManager = DataManager.getInstance()
        
        // Pre-compute squared distances
        this.highDistSq = this.config.highDistance * this.config.highDistance
        this.midDistSq = this.config.midDistance * this.config.midDistance
        
        // Hysteresis: to go from HIGH→MID, must be beyond highDistance + hysteresis
        // To go from MID→HIGH, must be within highDistance - hysteresis
        const highWithHyst = this.config.highDistance + this.config.hysteresis
        const midWithHyst = this.config.midDistance + this.config.hysteresis
        this.highDistSqWithHysteresis = highWithHyst * highWithHyst
        this.midDistSqWithHysteresis = midWithHyst * midWithHyst
        
        log.lifecycle(`Initialized: HIGH < ${this.config.highDistance}m, MID < ${this.config.midDistance}m, Hysteresis: ${this.config.hysteresis}m, Update every ${this.config.updateFrequency} frames`)
    }
    
    /**
     * Register with render loop for automatic updates
     * Call this after games are loaded
     */
    public startAutoUpdate(): void {
        if (this.isRegistered) return
        
        this.renderLoopRegistry.register('LodDistanceManager', this.onRenderFrame.bind(this))
        this.isRegistered = true
        log.lifecycle('Registered with render loop')
    }
    
    /**
     * Unregister from render loop
     */
    public stopAutoUpdate(): void {
        if (!this.isRegistered) return
        
        this.renderLoopRegistry.unregister('LodDistanceManager')
        this.isRegistered = false
        log.lifecycle('Unregistered from render loop')
    }
    
    /**
     * Render loop callback - gets camera from DataManager
     */
    private onRenderFrame(_now: number, _deltaTime: number): void {
        const camera = this.dataManager.get<THREE.Camera>(DataKey.MainCamera)
        if (camera) {
            this.update(camera)
        }
    }

    /**
     * Sync instance states from renderer metadata
     * Call this after games are loaded
     */
    public syncInstances(): void {
        // Get instance data from renderer via proper getter
        const metadata = this.renderer.getInstanceData()
        
        this.instanceStates.clear()
        
        for (const [index, data] of metadata) {
            this.instanceStates.set(index, {
                position: data.position.clone(),
                currentLod: data.lodLevel
            })
        }
        
        log.lifecycle(`Synced ${this.instanceStates.size} instances`)
    }

    /**
     * Called every frame from render loop
     * Only actually updates LOD every N frames
     */
    public update(camera: THREE.Camera): void {
        // TEMPORARY: Track frame timing
        const now = window.performance.now()
        if (this.lastFrameTime > 0) {
            const frameTime = now - this.lastFrameTime
            this.diagnostics.frameTimeSamples.push(frameTime)
            // Keep only last 60 samples
            if (this.diagnostics.frameTimeSamples.length > 60) {
                this.diagnostics.frameTimeSamples.shift()
            }
        }
        this.lastFrameTime = now
        
        this.frameCount++
        
        // Only update every N frames
        if (this.frameCount % this.config.updateFrequency !== 0) {
            return
        }
        
        // Sync instances if we haven't yet or count changed
        const rendererCount = this.renderer.getInstanceCount()
        if (this.instanceStates.size !== rendererCount && rendererCount > 0) {
            this.syncInstances()
        }
        
        if (this.instanceStates.size === 0) {
            return
        }
        
        // TEMPORARY: Time the LOD update
        const updateStart = window.performance.now()
        
        const cameraPos = camera.position
        let lodChanges = 0
        
        // Check ALL instances (we'll optimize to subset later)
        for (const [instanceIndex, state] of this.instanceStates) {
            // Squared distance (no sqrt needed)
            this.tmpVec.copy(state.position).sub(cameraPos)
            const distSq = this.tmpVec.lengthSq()
            
            const idealLod = this.determineIdealLod(distSq, state.currentLod)
            
            if (idealLod !== state.currentLod) {
                this.renderer.setInstanceLod(instanceIndex, idealLod)
                state.currentLod = idealLod
                lodChanges++
            }
        }
        
        // TEMPORARY: Record timing
        const updateTime = window.performance.now() - updateStart
        this.diagnostics.updateCount++
        this.diagnostics.totalUpdateTimeMs += updateTime
        this.diagnostics.lodChanges += lodChanges
        
        // TEMPORARY: Log diagnostics every ~1 second
        if (now - this.diagnostics.lastLogTime > 1000) {
            this.logDiagnostics()
            this.diagnostics.lastLogTime = now
        }
    }

    /**
     * Determine ideal LOD based on squared distance with hysteresis
     */
    private determineIdealLod(distSq: number, currentLod: LodLevel): LodLevel {
        // Use hysteresis: different thresholds for upgrading vs downgrading
        // This prevents thrashing when player is at a boundary
        
        if (currentLod === LOD_LEVEL.HIGH) {
            // Currently HIGH - need to go beyond threshold + hysteresis to downgrade
            if (distSq > this.highDistSqWithHysteresis) {
                if (distSq > this.midDistSqWithHysteresis) {
                    return LOD_LEVEL.LOW
                }
                return LOD_LEVEL.MID
            }
            return LOD_LEVEL.HIGH
        }
        
        if (currentLod === LOD_LEVEL.MID) {
            // Currently MID
            if (distSq < this.highDistSq) {
                return LOD_LEVEL.HIGH  // Upgrade to HIGH
            }
            if (distSq > this.midDistSqWithHysteresis) {
                return LOD_LEVEL.LOW   // Downgrade to LOW
            }
            return LOD_LEVEL.MID
        }
        
        // Currently LOW
        if (distSq < this.highDistSq) {
            return LOD_LEVEL.HIGH
        }
        if (distSq < this.midDistSq) {
            return LOD_LEVEL.MID
        }
        return LOD_LEVEL.LOW
    }

    // TEMPORARY: Diagnostic logging
    private logDiagnostics(): void {
        const avgUpdateTime = this.diagnostics.updateCount > 0 
            ? this.diagnostics.totalUpdateTimeMs / this.diagnostics.updateCount 
            : 0
        
        const avgFrameTime = this.diagnostics.frameTimeSamples.length > 0
            ? this.diagnostics.frameTimeSamples.reduce((a, b) => a + b, 0) / this.diagnostics.frameTimeSamples.length
            : 0
        
        const lodCounts = this.countLodLevels()
        
        log.runtime(
            `Stats | ` +
            `Update: ${avgUpdateTime.toFixed(2)}ms avg | ` +
            `Frame: ${avgFrameTime.toFixed(1)}ms avg | ` +
            `Changes: ${this.diagnostics.lodChanges} | ` +
            `HIGH: ${lodCounts.high}, MID: ${lodCounts.mid}, LOW: ${lodCounts.low}`
        )
        
        // Reset counters (keep frame samples for rolling average)
        this.diagnostics.updateCount = 0
        this.diagnostics.totalUpdateTimeMs = 0
        this.diagnostics.lodChanges = 0
    }

    private countLodLevels(): { high: number; mid: number; low: number } {
        let high = 0, mid = 0, low = 0
        for (const state of this.instanceStates.values()) {
            if (state.currentLod === LOD_LEVEL.HIGH) high++
            else if (state.currentLod === LOD_LEVEL.MID) mid++
            else low++
        }
        return { high, mid, low }
    }

    /**
     * Force immediate LOD update (useful after teleport)
     */
    public forceUpdate(camera: THREE.Camera): void {
        const savedFrameCount = this.frameCount
        this.frameCount = this.config.updateFrequency - 1
        this.update(camera)
        this.frameCount = savedFrameCount
    }

    public dispose(): void {
        this.stopAutoUpdate()
        this.instanceStates.clear()
        log.lifecycle('Disposed')
    }
}
