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
import { type ILodArtworkRenderer, LOD_LEVEL, type LodLevel } from './ILodArtworkRenderer'
import { RenderLoopRegistry } from '../../RenderLoopRegistry'
import { DataManager } from '../../../core/data/DataManager'
import { DataKey } from '../../../core/data/DataTypes'
import { AppSettings, Setting, type SettingChangedEvent } from '../../../core/AppSettings'
import { EventManager } from '../../../core/EventManager'
import { AppSettingsEventTypes, GameEventTypes } from '../../../types/InteractionEvents'
import { Logger } from '../../../utils/Logger'

export interface LodDistanceConfig {
    /** Distance threshold: closer than this = HIGH LOD */
    highDistance: number
    /** Distance threshold: closer than this = MED LOD, farther = LOW */
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
    public static logger = Logger.createLogFunctions(LodDistanceManager.name)
    private readonly renderer: ILodArtworkRenderer
    private config: LodDistanceConfig
    private readonly renderLoopRegistry: RenderLoopRegistry
    private readonly dataManager: DataManager
    private isRegistered: boolean = false
    
    // Pre-computed squared distances for comparison (avoids sqrt)
    private highDistSq: number = 0
    private midDistSq: number = 0
    private highDistSqWithHysteresis: number = 0
    private midDistSqWithHysteresis: number = 0
    
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

    constructor(renderer: ILodArtworkRenderer, config: Partial<LodDistanceConfig> = {}) {
        this.renderer = renderer
        
        // Initialize config from AppSettings with fallback to provided config/defaults
        const savedHighDistance = AppSettings.get(Setting.LodHighDistance)
        const savedMedDistance = AppSettings.get(Setting.LodMedDistance)
        
        this.config = { 
            ...DEFAULT_CONFIG, 
            ...config,
            highDistance: savedHighDistance ?? config.highDistance ?? DEFAULT_CONFIG.highDistance,
            midDistance: savedMedDistance ?? config.midDistance ?? DEFAULT_CONFIG.midDistance
        }
        
        this.renderLoopRegistry = RenderLoopRegistry.getInstance()
        this.dataManager = DataManager.getInstance()
        
        // Pre-compute squared distances
        this.updateSquaredDistances()
        
        // Subscribe to settings changes via EventManager
        EventManager.getInstance().registerEventHandler(
            AppSettingsEventTypes.Changed,
            this.onSettingChanged.bind(this)
        )

        // Start LOD distance checks once all batches have loaded.
        // Subscribing here rather than in the caller enforces that this class
        // owns its own lifecycle — callers should not drive syncInstances/startAutoUpdate.
        EventManager.getInstance().registerEventHandler(
            GameEventTypes.AllBatchesComplete,
            this.onAllBatchesComplete.bind(this)
        )
        
        LodDistanceManager.logger.lifecycle(`Initialized: HIGH < ${this.config.highDistance}m, MED < ${this.config.midDistance}m, Hysteresis: ${this.config.hysteresis}m, Update every ${this.config.updateFrequency} frames`)
    }
    
    private onAllBatchesComplete(): void {
        this.syncInstances()
        this.startAutoUpdate()
        LodDistanceManager.logger.lifecycle('Started after AllBatchesComplete')
    }

    private onSettingChanged(event: SettingChangedEvent): void {
        if (event.key === 'lodHighDistance' && typeof event.value === 'number') {
            this.config.highDistance = event.value
            this.updateSquaredDistances()
            LodDistanceManager.logger.info(`HIGH distance updated to ${event.value}m`)
        } else if (event.key === 'lodMedDistance' && typeof event.value === 'number') {
            this.config.midDistance = event.value
            this.updateSquaredDistances()
            LodDistanceManager.logger.info(`MED distance updated to ${event.value}m`)
        }
    }
    
    private updateSquaredDistances(): void {
        this.highDistSq = this.config.highDistance * this.config.highDistance
        this.midDistSq = this.config.midDistance * this.config.midDistance
        
        // Hysteresis: to go from HIGH→MID, must be beyond highDistance + hysteresis
        // To go from MID→HIGH, must be within highDistance - hysteresis
        const highWithHyst = this.config.highDistance + this.config.hysteresis
        const midWithHyst = this.config.midDistance + this.config.hysteresis
        this.highDistSqWithHysteresis = highWithHyst * highWithHyst
        this.midDistSqWithHysteresis = midWithHyst * midWithHyst
    }
    
    /**
     * Register with render loop for automatic updates
     * Call this after games are loaded
     */
    public startAutoUpdate(): void {
        if (this.isRegistered) return
        
        this.renderLoopRegistry.register('LodDistanceManager', this.onRenderFrame.bind(this))
        this.isRegistered = true
        LodDistanceManager.logger.lifecycle('Registered with render loop')
    }
    
    /**
     * Unregister from render loop
     */
    public stopAutoUpdate(): void {
        if (!this.isRegistered) return
        
        this.renderLoopRegistry.unregister('LodDistanceManager')
        this.isRegistered = false
        LodDistanceManager.logger.lifecycle('Unregistered from render loop')
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
        
        LodDistanceManager.logger.lifecycle(`Synced ${this.instanceStates.size} instances`)
    }

    /**
     * Called every frame from render loop
     * Only actually updates LOD every N frames
     */
    // TODO: implement some render hook method for updateFrequency instead
    // maybe only update if the player has moved
    // TODO: We don't need the camera, just its position
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
     * Two-tier system: HIGH (nearby) or MID (everything else)
     */
    private determineIdealLod(distSq: number, currentLod: LodLevel): LodLevel {
        // Use hysteresis: different thresholds for upgrading vs downgrading
        // This prevents thrashing when player is at a boundary
        
        if (currentLod === LOD_LEVEL.HIGH) {
            // Currently HIGH - need to go beyond threshold + hysteresis to downgrade to MID
            if (distSq > this.highDistSqWithHysteresis) {
                return LOD_LEVEL.MID
            }
            return LOD_LEVEL.HIGH
        }
        
        // Currently MID - upgrade to HIGH if within high distance threshold
        if (distSq < this.highDistSq) {
            return LOD_LEVEL.HIGH
        }
        return LOD_LEVEL.MID
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
        
        LodDistanceManager.logger.runtime(
            `Stats | ` +
            `Update: ${avgUpdateTime.toFixed(2)}ms avg | ` +
            `Frame: ${avgFrameTime.toFixed(1)}ms avg | ` +
            `Changes: ${this.diagnostics.lodChanges} | ` +
            `HIGH: ${lodCounts.high}, MID: ${lodCounts.mid}`
        )
        
        // Reset counters (keep frame samples for rolling average)
        this.diagnostics.updateCount = 0
        this.diagnostics.totalUpdateTimeMs = 0
        this.diagnostics.lodChanges = 0
    }

    private countLodLevels(): { high: number; mid: number } {
        let high = 0, mid = 0
        for (const state of this.instanceStates.values()) {
            if (state.currentLod === LOD_LEVEL.HIGH) high++
            else mid++  // Everything else is MID in two-tier system
        }
        return { high, mid }
    }

    // TODO: Remove debug functions
    /**
     * Get current LOD distribution - useful for tuning texture array sizes
     * Two-tier system: HIGH (nearby) + MID (everything else)
     */
    public getLodDistribution(): {
        counts: { high: number; mid: number; total: number }
        estimatedVRAM: { current: string; optimal: string }
    } {
        const counts = this.countLodLevels()
        const total = counts.high + counts.mid
        
        // Current: HIGH at 64 depth (native 600x900 portrait), MID at full (maxTextures, 128x128)
        // Assumes maxTextures = 512 for estimation
        const maxTextures = 512
        const currentVRAM = (600 * 900 * 64 * 4) + (128 * 128 * maxTextures * 4)
        
        // Optimal: Size each array to actual usage + buffer
        const highBuffer = Math.max(counts.high * 2, 50) // 2x current or min 50
        const midBuffer = total // MID covers everything
        
        const optimalVRAM = 
            (600 * 900 * highBuffer * 4) + 
            (128 * 128 * midBuffer * 4)
        
        return {
            counts: { ...counts, total },
            estimatedVRAM: {
                current: `${(currentVRAM / 1024 / 1024).toFixed(0)}MB`,
                optimal: `${(optimalVRAM / 1024 / 1024).toFixed(0)}MB (${highBuffer} HIGH, ${midBuffer} MID slots)`
            }
        }
    }

    /**
     * Preload HIGH textures for the N nearest games
     * Useful for proactive loading before player moves closer
     */
    public preloadNearestGames(count: number = 20): void {
        const camera = this.dataManager.get<THREE.Camera>(DataKey.MainCamera)
        if (!camera) {
            LodDistanceManager.logger.runtime('Cannot preload: no camera')
            return
        }

        if (this.instanceStates.size === 0) {
            LodDistanceManager.logger.runtime('Cannot preload: no instances')
            return
        }

        const cameraPos = camera.position

        // Calculate distances for all instances
        const distances: Array<{ index: number; distSq: number }> = []
        for (const [index, state] of this.instanceStates) {
            this.tmpVec.copy(state.position).sub(cameraPos)
            distances.push({ index, distSq: this.tmpVec.lengthSq() })
        }

        // Sort by distance (nearest first)
        distances.sort((a, b) => a.distSq - b.distSq)

        // Request HIGH for nearest N games
        const toPreload = distances.slice(0, count)
        let requested = 0
        for (const { index } of toPreload) {
            // setInstanceLod to HIGH will trigger the HIGH texture request
            const state = this.instanceStates.get(index)
            if (state && state.currentLod !== LOD_LEVEL.HIGH) {
                this.renderer.setInstanceLod(index, LOD_LEVEL.HIGH)
                state.currentLod = LOD_LEVEL.HIGH
                requested++
            }
        }

        LodDistanceManager.logger.runtime(`Preloaded ${requested} nearest games to HIGH (${count} requested, ${toPreload.length} in range)`)
    }

    /**
     * Diagnostic: Show nearest N games with their indices, distances, and LOD states
     */
    public diagnoseNearestGames(count: number = 30): void {
        const camera = this.dataManager.get<THREE.Camera>(DataKey.MainCamera)
        if (!camera) {
            console.log('❌ Cannot diagnose: no camera')
            return
        }

        const cameraPos = camera.position
        console.group(`📍 Nearest ${count} games (camera at ${cameraPos.x.toFixed(1)}, ${cameraPos.y.toFixed(1)}, ${cameraPos.z.toFixed(1)})`)

        // Calculate distances for all instances
        const distances: Array<{ index: number; dist: number; state: InstanceLodState }> = []
        for (const [index, state] of this.instanceStates) {
            this.tmpVec.copy(state.position).sub(cameraPos)
            distances.push({ index, dist: this.tmpVec.length(), state })
        }

        // Sort by distance (nearest first)
        distances.sort((a, b) => a.dist - b.dist)

        const nearest = distances.slice(0, count)
        const lodNames = ['HIGH', 'MID', 'LOW']
        
        console.log('Index | Distance | LOD  | Position')
        console.log('------|----------|------|----------')
        for (const { index, dist, state } of nearest) {
            const lod = lodNames[state.currentLod] ?? '?'
            const pos = `(${state.position.x.toFixed(1)}, ${state.position.y.toFixed(1)}, ${state.position.z.toFixed(1)})`
            const inRange = dist <= this.config.highDistance ? '✓' : ''
            console.log(`${String(index).padStart(5)} | ${dist.toFixed(2).padStart(8)}m | ${lod.padEnd(4)} | ${pos} ${inRange}`)
        }

        console.log(`\nHIGH distance threshold: ${this.config.highDistance}m`)
        console.groupEnd()
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
        LodDistanceManager.logger.lifecycle('Disposed')
    }
}
