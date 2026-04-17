/**
 * LOD Artwork Orchestrator Debug - Debug version with console commands and stats
 * 
 * Extends LodArtworkOrchestrator with debug functionality including:
 * - Console commands for diagnosis and experiments
 * - Memory statistics logging
 * - Failure tracking and auditing
 */

import { LodArtworkOrchestrator, type LodArtworkConfig, type LodConfig } from './LodArtworkOrchestrator'
import { HighTextureCacheDebug } from './HighTextureCacheDebug'
import { EventManager } from '../../../core/EventManager'
import { GameEventTypes } from '../../../types/InteractionEvents'
import { GameArtworkProvider } from './GameArtworkProvider'
import { DataManager } from '../../../core/data/DataManager'

/** Result of queryLodState() — structured pixel data for both LOD tiers */
export interface LodTierData {
    pixels: Uint8ClampedArray | null  // null if not yet loaded
    width: number
    height: number
}

export interface LodQueryResult {
    gameName: string
    textureIndex: number
    mid: LodTierData
    high: LodTierData & { slot: number; state: string | null }
}
import { GpuMemoryEstimator } from '../../../debug/GpuMemoryEstimator'
import { DataKey } from '../../../core/data/DataTypes'
import * as THREE from 'three'
import type { HighTextureCache } from './HighTextureCache'
/* eslint-disable @typescript-eslint/no-explicit-any */

// Re-export for consumers
export type { LodConfig }

export interface LodArtworkOrchestratorDebugConfig extends LodArtworkConfig {
    maxGames?: number
}

export class LodArtworkOrchestratorDebug extends LodArtworkOrchestrator {
    private readonly maxGames: number
    
    constructor(config: LodArtworkOrchestratorDebugConfig = {}) {
        super(config)
        this.maxGames = config.maxGames ?? 2000
        this.registerConsoleCommands()
        this.registerEventListeners()
    }

    private registerEventListeners(): void {
        EventManager.getInstance().registerEventHandler(GameEventTypes.AllBatchesComplete, () => {
            this.logMemoryStats()
            this.logSkipSummary()
        })
    }

    private registerConsoleCommands(): void {
        ;(window as any).lodArtworkRenderer = this
        
        // Renderer stats
        ;(window as any).lodCacheStats = () => this.logHighTextureCacheStats()
        ;(window as any).memorySnapshot = () => {
            const perf = window.performance as any
            const heap = perf?.memory ? {
                mainHeapMB: perf.memory.usedJSHeapSize / 1e6,
                notes: []
            } : { mainHeapMB: undefined, notes: ['window.performance.memory not available'] }
            const renderer = DataManager.getInstance().get<THREE.WebGLRenderer>(DataKey.Renderer)
            const gpu = GpuMemoryEstimator.estimate(renderer ?? undefined)
            return { ...heap, gpuEstimateMB: gpu.totalEstimatedMB }
        }
        ;(window as any).diagnosePending = () => this.diagnosePendingState()
        
        // Artwork failure tracking
        ;(window as any).diagnoseArtworkFailures = () => {
            this.logFailureDiagnostics()
            return this.getFailureDiagnostics()
        }
        ;(window as any).clearArtworkFailures = () => {
            this.clearFailureCache()
            console.log('✅ Artwork failure cache cleared - failures will be retried on next load')
        }
        ;(window as any).auditArtworkFailures = () => this.auditFailedArtwork()
        ;(window as any).artworkFailureStats = () => {
            const stats = GameArtworkProvider.getInstance().getFailureStats()
            console.log('📊 Artwork Failure Statistics:', stats)
            return stats
        }
        ;(window as any).artworkSkipStats = () => {
            const stats = GameArtworkProvider.getInstance().getSkipStats()
            console.log('📊 Artwork Skip Statistics (this session):', stats)
            return stats
        }

        // Frame Budget Scheduler
        ;(window as any).diagnoseScheduler = async () => {
            const { FrameBudgetScheduler } = await import('../../../utils/FrameBudgetScheduler')
            FrameBudgetScheduler.getInstance().diagnose()
        }
        ;(window as any).schedulerStats = async () => {
            const { FrameBudgetScheduler } = await import('../../../utils/FrameBudgetScheduler')
            const stats = FrameBudgetScheduler.getInstance().getStats()
            console.log('📊 Scheduler Stats:', stats)
            return stats
        }
        ;(window as any).schedulerTune = async (maxTasksPerFrame: number) => {
            const { FrameBudgetScheduler } = await import('../../../utils/FrameBudgetScheduler')
            FrameBudgetScheduler.getInstance().setMaxTasksPerFrame(maxTasksPerFrame)
            console.log(`✅ Scheduler max tasks per frame set to ${maxTasksPerFrame}`)
        }

        // Pixel Data Cache
        ;(window as any).diagnosePixelCache = async () => {
            const { PixelDataCache } = await import('./PixelDataCache')
            await PixelDataCache.getInstance().diagnose()
        }
        ;(window as any).clearPixelCache = async () => {
            const { PixelDataCache } = await import('./PixelDataCache')
            await PixelDataCache.getInstance().clear()
            console.log('✅ Pixel cache cleared')
        }

        // Side-by-side LOD visual comparison is now integrated into window.inspectGameArtwork()
        // No separate compareLod() command needed.

        console.log('🔧 LOD debug exports registered. Try: lodCacheStats(), diagnoseArtworkFailures()')
    }

    private getHighTextureCache(): HighTextureCache | null {
        return this.renderer.getHighTextureCache()
    }

    public getMemoryStats(): {
        lods: Record<string, { allocated: number; textureWidth: number; textureHeight: number; arrayDepth: number }>
        totalAllocated: number
        textureCount: number
        instanceCount: number
        failedArtworkCount: number
        failedArtwork: Map<string, { reason: string; url: string; timestamp: number }>
    } {
        const lods: Record<string, { allocated: number; textureWidth: number; textureHeight: number; arrayDepth: number }> = {}
        let totalAllocated = 0
        
        const textureManager = this.getTextureManager()
        for (const tierName of textureManager.getTierNames()) {
            const config = textureManager.getTierConfig(tierName)
            if (config) {
                const allocated = config.width * config.height * config.maxDepth * 4
                lods[tierName] = {
                    allocated,
                    textureWidth: config.width,
                    textureHeight: config.height,
                    arrayDepth: config.maxDepth
                }
                totalAllocated += allocated
            }
        }
        
        const failedArtwork = this.getFailedArtwork()
        
        return {
            lods,
            totalAllocated,
            textureCount: textureManager.getSlotCount(),
            instanceCount: this.getInstanceCount(),
            failedArtworkCount: failedArtwork.size,
            failedArtwork: new Map(
                Array.from(failedArtwork.entries()).map(([k, v]) => [k, { reason: v.reason, url: v.url, timestamp: v.timestamp }])
            )
        }
    }

    public logMemoryStats(): void {
        const stats = this.getMemoryStats()
        const mb = (bytes: number) => (bytes / (1024 * 1024)).toFixed(1)
        
        console.group('📊 Memory Stats')

        let totalMB = 0

        for (const [name, lod] of Object.entries(stats.lods)) {
            const lodMB = lod.allocated / (1024 * 1024)
            totalMB += lodMB
            console.log(`  ${name}: ${lod.textureWidth}×${lod.textureHeight}×${lod.arrayDepth} = ~${mb(lod.allocated)} MB (est.)`)
        }

        const consumers = DataManager.getInstance().getMemoryConsumption()
        for (const [name, megabytes] of consumers) {
            if (name.startsWith('LOD/')) continue  // Already shown above with dimension detail
            totalMB += megabytes
            console.log(`  ${name}: ${megabytes} MB (est.)`)
        }

        console.log(`  ────────────────────────`)
        console.log(`  Textures: ${stats.textureCount}, Instances: ${stats.instanceCount}, Failed artwork: ${stats.failedArtworkCount}`)
        console.log(`  Total tracked VRAM: ~${totalMB.toFixed(1)} MB (est. — actual GPU usage typically higher due to driver overhead)`)

        const perf = window.performance as unknown as { memory?: { usedJSHeapSize: number; totalJSHeapSize: number } }
        if (perf.memory) {
            const heapUsed = Math.round(perf.memory.usedJSHeapSize / (1024 * 1024))
            const heapTotal = Math.round(perf.memory.totalJSHeapSize / (1024 * 1024))
            console.log(`  JS Heap: ${heapUsed} / ${heapTotal} MB`)
        }

        console.groupEnd()
    }
    
    public logSkipSummary(): void {
        GameArtworkProvider.getInstance().logSkipSummary()
    }

    public logHighTextureCacheStats(): void {
        const cache = this.getHighTextureCache() as HighTextureCacheDebug | null
        if (!cache) {
            console.log('❌ HIGH texture cache not enabled (lazyHighTextures=false)')
            return
        }
        
        const stats = cache.getStats()
        console.group('🎨 HIGH Texture Cache Stats')
        console.log(`Loaded: ${stats.loaded}/${stats.totalSlots} (${((stats.loaded/stats.totalSlots)*100).toFixed(0)}%)`)
        console.log(`Loading: ${stats.loading}, Queued: ${stats.queueLength}`)
        console.log(`Failed: ${stats.failed}, Permanent Failures: ${stats.permanentFailures}`)
        console.groupEnd()
        
        // Also log MID tier info
        const textureManager = this.getTextureManager()
        const midConfig = textureManager.getTierConfig('mid')
        if (midConfig) {
            const midSlotCount = textureManager.getSlotCount()
            console.group('🎨 MID Texture Atlas Info')
            console.log(`Total Slots: ${midConfig.maxDepth}`)
            console.log(`Filled Slots: ${midSlotCount}`)
            console.log(`Dimensions: ${midConfig.width}×${midConfig.height}`)
            console.groupEnd()
        }
    }

    public diagnosePendingState(): void {
        console.group('🔍 Pending State Diagnosis')
        
        const textureManager = this.getTextureManager()
        console.log(`Pending GPU updates: ${textureManager.hasPendingUpdates() ? 'Yes' : 'No'}`)
        
        const renderer = this.getInternalRenderer()
        console.log(`Instance count: ${renderer.getInstanceCount()}`)
        console.log(`Ready: ${renderer.isReady()}`)
        
        const cache = this.getHighTextureCache()
        if (cache) {
            const stats = (cache as HighTextureCacheDebug).getStats()
            console.log(`HIGH cache - Loading: ${stats.loading}, Queued: ${stats.queueLength}`)
        }
        
        console.groupEnd()
    }

    public getFailureDiagnostics(): {
        totalFailed: number
        byReason: Record<string, number>
        recentFailures: Array<{ game: string; reason: string; url: string }>
    } {
        const failedArtwork = this.getFailedArtwork()
        const byReason: Record<string, number> = {}
        const recentFailures: Array<{ game: string; reason: string; url: string }> = []
        
        const now = Date.now()
        const recentThreshold = 5 * 60 * 1000 // 5 minutes
        
        for (const [gameName, failure] of failedArtwork) {
            byReason[failure.reason] = (byReason[failure.reason] || 0) + 1
            
            if (now - failure.timestamp < recentThreshold) {
                recentFailures.push({ game: gameName, reason: failure.reason, url: failure.url })
            }
        }
        
        return {
            totalFailed: failedArtwork.size,
            byReason,
            recentFailures: recentFailures.slice(0, 10)
        }
    }

    public logFailureDiagnostics(): void {
        const diag = this.getFailureDiagnostics()
        
        console.group('🚨 Artwork Failure Diagnostics')
        console.log(`Total failed: ${diag.totalFailed}`)
        console.log('By reason:', diag.byReason)
        
        if (diag.recentFailures.length > 0) {
            console.log('Recent failures:')
            for (const f of diag.recentFailures) {
                console.log(`  - "${f.game}": ${f.reason}`)
            }
        }
        console.groupEnd()
    }

    public async auditFailedArtwork(): Promise<void> {
        const failedArtwork = this.getFailedArtwork()
        console.group('🔍 Auditing failed artwork URLs...')
        
        let retryable = 0
        let permanent = 0
        const permanentReasons: Record<string, number> = {}
        const retryableReasons: Record<string, number> = {}
        
        for (const [_gameName, failure] of failedArtwork) {
            const isPermanent = 
                failure.reason === 'CORS' || 
                failure.reason === '404' || 
                failure.reason === 'NO_ARTWORK' ||
                failure.reason === 'DECODE'
            
            if (isPermanent) {
                permanent++
                permanentReasons[failure.reason] = (permanentReasons[failure.reason] || 0) + 1
            } else {
                retryable++
                retryableReasons[failure.reason] = (retryableReasons[failure.reason] || 0) + 1
            }
        }
        
        console.log(`✅ Retryable (NETWORK/TIMEOUT/UNKNOWN): ${retryable}`)
        if (Object.keys(retryableReasons).length > 0) {
            console.log('   Breakdown:', retryableReasons)
        }
        
        console.log(`🚫 Permanent dead-ends (CORS/404/NO_ARTWORK/DECODE): ${permanent}`)
        if (Object.keys(permanentReasons).length > 0) {
            console.log('   Breakdown:', permanentReasons)
        }
        
        console.log(`Use clearArtworkFailures() to retry all (including ${permanent} permanent failures)`)
        console.groupEnd()
    }

 
    /**
     * Query LOD state for a game by name (case-insensitive substring match).
     * Returns structured pixel data and tier state for use by debug UIs.
     * Returns null if the game is not in the texture atlas.
     */
    public queryLodState(nameFragment: string): LodQueryResult | null {
        const nameMap = this.getGameNameToTextureIndex()
        const lowerFragment = nameFragment.toLowerCase()

        let matchedName: string | undefined
        let textureIndex: number | undefined
        for (const [name, index] of nameMap) {
            if (name.toLowerCase() === lowerFragment) { matchedName = name; textureIndex = index; break }
            if (!matchedName && name.toLowerCase().includes(lowerFragment)) { matchedName = name; textureIndex = index }
        }
        if (textureIndex === undefined || !matchedName) return null

        const textureManager = this.getTextureManager()
        const midTexture = textureManager.getTextureArray('mid')
        const midConfig = textureManager.getTierConfig('mid')
        const highConfig = textureManager.getTierConfig('high')

        let midPixels: Uint8ClampedArray | null = null
        let midWidth = 0, midHeight = 0
        if (midTexture && midConfig) {
            midWidth = midConfig.width; midHeight = midConfig.height
            const sliceBytes = midWidth * midHeight * 4
            const src = midTexture.image.data as Uint8Array
            midPixels = new Uint8ClampedArray(src.buffer, textureIndex * sliceBytes, sliceBytes)
        }

        const highCache = this.getHighTextureCache()
        const highSlot = highCache?.getHighSlot(textureIndex) ?? -1
        const highTexture = highCache?.getTextureArrayRef() ?? null
        const highState = highCache?.getState(textureIndex) ?? null

        let highPixels: Uint8ClampedArray | null = null
        let highWidth = 0, highHeight = 0
        if (highSlot >= 0 && highTexture && highConfig) {
            highWidth = highConfig.width; highHeight = highConfig.height
            const sliceBytes = highWidth * highHeight * 4
            const src = highTexture.image.data as Uint8Array
            highPixels = new Uint8ClampedArray(src.buffer, highSlot * sliceBytes, sliceBytes)
        } else if (highConfig) {
            highWidth = highConfig.width; highHeight = highConfig.height
        }

        return {
            gameName: matchedName,
            textureIndex,
            mid: { pixels: midPixels, width: midWidth, height: midHeight },
            high: { pixels: highPixels, width: highWidth, height: highHeight, slot: highSlot, state: highState }
        }
    }

    public override dispose(): void {
        // Clear global references
        ;(window as any).lodArtworkRenderer = null
        ;(window as any).lodCacheStats = null
        ;(window as any).diagnosePending = null
        ;(window as any).diagnoseArtworkFailures = null
        ;(window as any).clearArtworkFailures = null
        ;(window as any).auditArtworkFailures = null
        
        super.dispose()
    }
}
