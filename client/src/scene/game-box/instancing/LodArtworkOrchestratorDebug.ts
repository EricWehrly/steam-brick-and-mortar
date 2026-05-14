/**
 * LOD Artwork Orchestrator Debug - Debug version with console commands and stats
 * 
 * Extends LodArtworkOrchestrator with debug functionality including:
 * - Console commands for diagnosis and experiments
 * - Memory statistics logging
 * - Failure tracking and auditing
 */

import { LodArtworkOrchestrator, type LodArtworkConfig } from './LodArtworkOrchestrator'
import { HighTextureCacheDebug } from './HighTextureCacheDebug'
import { EventManager } from '../../../core/EventManager'
import { GameEventTypes, GameRenderEventTypes } from '../../../types/InteractionEvents'
import { GameArtworkProvider } from './GameArtworkProvider'
import { DataManager } from '../../../core/data/DataManager'
import { LodDistanceManagerDebug } from './LodDistanceManagerDebug'
import { LOD_TIER_NAME } from './IGameArtworkPipeline'

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

interface SaturationScenarioOptions {
    targetCount?: number
    textureVariantCount?: number
    textureSize?: number
}

interface SyntheticTextureEntry {
    appid: number
    gameName: string
    textureIndex: number
}

const SYNTHETIC_APP_ID_BASE = 910000
import { GpuMemoryEstimator } from '../../../debug/GpuMemoryEstimator'
import { DataKey } from '../../../core/data/DataTypes'
import * as THREE from 'three'
import type { HighTextureCache } from './HighTextureCache'
/* eslint-disable @typescript-eslint/no-explicit-any */

export class LodArtworkOrchestratorDebug extends LodArtworkOrchestrator {
    private readonly lodDistanceManager: LodDistanceManagerDebug

    public static override fromAppSettings(maxTextures: number, maxInstances: number = maxTextures): LodArtworkOrchestratorDebug {
        return new LodArtworkOrchestratorDebug(LodArtworkOrchestrator.buildAppSettingsConfig(maxTextures, maxInstances))
    }

    constructor(config: LodArtworkConfig = {}) {
        super(config)
        this.lodDistanceManager = new LodDistanceManagerDebug(this)
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
        ;(window as any).instancingSnapshot = () => {
            const renderer = this.getInternalRenderer()
            const artworkMetadata = DataManager.getInstance().get<Map<number, unknown>>(DataKey.InstancedArtworkMetadata)
            const labelMetadata = DataManager.getInstance().get<Map<number, unknown>>(DataKey.InstancedLabelMetadata)
            return {
                artworkRendererReady: renderer.isReady(),
                artworkInstanceCount: renderer.getInstanceCount(),
                artworkMetadataCount: artworkMetadata?.size ?? 0,
                labelMetadataCount: labelMetadata?.size ?? 0,
            }
        }
        ;(window as any).__sbmRunInstanceSaturationScenario = async (options: SaturationScenarioOptions = {}) => {
            return this.runInstanceSaturationScenario(options)
        }
        ;(window as any).diagnosePending = () => this.diagnosePendingState()
        
        // Artwork failure tracking
        ;(window as any).clearArtworkFailures = () => {
            this.clearFailureCache()
            console.log('✅ Artwork failure cache cleared - failures will be retried on next load')
        }
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

    private async runInstanceSaturationScenario(options: SaturationScenarioOptions = {}): Promise<{
        placedCount: number
        attemptedCount: number
        textureVariantCount: number
        prefetchFailures: number
        textureWritesSucceeded: number
        reusableSlotCount: number
        midTierDepth: number
    }> {
        const attemptedCount = Math.max(0, Math.floor(options.targetCount ?? 0))
        const textureVariantCount = Math.max(1, Math.min(64, Math.floor(options.textureVariantCount ?? 12)))
        const textureSize = Math.max(16, Math.min(256, Math.floor(options.textureSize ?? 64)))

        EventManager.getInstance().emit(GameRenderEventTypes.PlacementRunResetRequested, {})

        const { entries, prefetchFailures, textureWritesSucceeded, reusableSlotCount, midTierDepth } =
            this.ensureSyntheticTextures(textureVariantCount, textureSize)
        if (entries.length === 0) {
            return {
                placedCount: 0,
                attemptedCount,
                textureVariantCount,
                prefetchFailures,
                textureWritesSucceeded,
                reusableSlotCount,
                midTierDepth,
            }
        }

        let placedCount = 0
        const rowWidth = 100
        const spacing = 0.26
        const renderer = this.getInternalRenderer()
        const internalState = this as unknown as {
            instanceMetadata: Map<number, { name: string; appid?: number; position: THREE.Vector3 }>
        }
        for (let i = 0; i < attemptedCount; i++) {
            const entry = entries[i % entries.length]
            const position = new THREE.Vector3((i % rowWidth) * spacing, 1.25, -Math.floor(i / rowWidth) * spacing)
            const instanceIndex = renderer.addInstance({
                position,
                textureIndex: entry.textureIndex,
                gameName: entry.gameName,
            })
            if (instanceIndex < 0) {
                break
            }
            internalState.instanceMetadata.set(instanceIndex, {
                name: entry.gameName,
                appid: entry.appid,
                position: position.clone(),
            })
            placedCount++
        }

        this.getInternalRenderer().flushToGpu()
        return {
            placedCount,
            attemptedCount,
            textureVariantCount,
            prefetchFailures,
            textureWritesSucceeded,
            reusableSlotCount,
            midTierDepth,
        }
    }

    private ensureSyntheticTextures(
        textureVariantCount: number,
        textureSize: number
    ): {
        entries: SyntheticTextureEntry[]
        prefetchFailures: number
        textureWritesSucceeded: number
        reusableSlotCount: number
        midTierDepth: number
    } {
        const textureManager = this.getTextureManager()
        const midConfig = textureManager.getTierConfig(LOD_TIER_NAME.MID)
        const highConfig = textureManager.getTierConfig(LOD_TIER_NAME.HIGH)
        if (!midConfig) {
            return {
                entries: [],
                prefetchFailures: textureVariantCount,
                textureWritesSucceeded: 0,
                reusableSlotCount: 0,
                midTierDepth: 0,
            }
        }

        const gameNameToTextureIndex = this.getGameNameToTextureIndex() as Map<string, number>
        const internalState = this as unknown as { textureIndexToGameName: Map<number, string> }

        const entries: SyntheticTextureEntry[] = []
        let prefetchFailures = 0
        const reusableSlotCount = Math.min(textureVariantCount, midConfig.maxDepth)
        let textureWritesSucceeded = 0

        for (let i = 0; i < reusableSlotCount; i++) {
            const appid = SYNTHETIC_APP_ID_BASE + i
            const gameName = `SyntheticTexture${i}`
            const slot = i

            const midPixels = this.buildNoisePixels(i, midConfig.width, midConfig.height, textureSize)
            const acceptedMid = textureManager.setSlotPixels(
                LOD_TIER_NAME.MID,
                slot,
                midPixels,
                midConfig.width,
                midConfig.height
            )
            if (!acceptedMid) {
                prefetchFailures++
                continue
            }

            if (highConfig) {
                const highPixels = this.buildNoisePixels(i + 1000, highConfig.width, highConfig.height, textureSize)
                textureManager.setSlotPixels(
                    LOD_TIER_NAME.HIGH,
                    slot,
                    highPixels,
                    highConfig.width,
                    highConfig.height
                )
            }

            textureWritesSucceeded++
            gameNameToTextureIndex.set(gameName, slot)
            internalState.textureIndexToGameName.set(slot, gameName)
            entries.push({ appid, gameName, textureIndex: slot })
        }

        prefetchFailures += textureVariantCount - reusableSlotCount

        textureManager.flushToGpu()
        this.getInternalRenderer().flushToGpu()

        return {
            entries,
            prefetchFailures,
            textureWritesSucceeded,
            reusableSlotCount,
            midTierDepth: midConfig.maxDepth,
        }
    }

    private buildNoisePixels(seed: number, width: number, height: number, coarseGrain: number): Uint8ClampedArray {
        const pixels = new Uint8ClampedArray(width * height * 4)
        let state = ((seed + 1) * 2654435761) >>> 0

        const grain = Math.max(2, Math.min(32, coarseGrain >> 2))
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const blockX = Math.floor(x / grain)
                const blockY = Math.floor(y / grain)
                state = (1664525 * (state + blockX * 131 + blockY * 911) + 1013904223) >>> 0
                const r = state & 0xff
                state = (1664525 * state + 1013904223) >>> 0
                const g = state & 0xff
                state = (1664525 * state + 1013904223) >>> 0
                const b = state & 0xff

                const index = (y * width + x) * 4
                pixels[index] = r
                pixels[index + 1] = g
                pixels[index + 2] = b
                pixels[index + 3] = 0xff
            }
        }

        return pixels
    }

    public getMemoryStats(): {
        lods: Record<string, { allocated: number; textureWidth: number; textureHeight: number; arrayDepth: number }>
        totalAllocated: number
        textureCount: number
        instanceCount: number
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
        
        return {
            lods,
            totalAllocated,
            textureCount: textureManager.getSlotCount(),
            instanceCount: this.getInstanceCount(),
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
        console.log(`  Textures: ${stats.textureCount}, Instances: ${stats.instanceCount}`)
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
        const highTexture = highCache?.getTexture() ?? null
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
        this.lodDistanceManager.dispose()
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
