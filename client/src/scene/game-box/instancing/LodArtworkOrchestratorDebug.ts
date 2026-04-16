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

        // Side-by-side LOD visual comparison tool
        // Usage: compareLod("Baldur's Gate 3")  or  compareLod("baldur") for fuzzy match
        ;(window as any).compareLod = (nameFragment: string) => this.showLodComparison(nameFragment)

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
     * Visual side-by-side comparison of MID vs HIGH texture for a single game.
     * Opens a floating overlay in the browser window.
     *
     * Usage (from browser console):
     *   compareLod("Baldur's Gate 3")   // exact or prefix match
     *   compareLod("baldur")             // case-insensitive substring match
     */
    private showLodComparison(nameFragment: string): void {
        const nameMap = this.getGameNameToTextureIndex()
        const lowerFragment = nameFragment.toLowerCase()

        // Find best match (exact first, then case-insensitive substring)
        let matchedName: string | undefined
        let textureIndex: number | undefined
        for (const [name, index] of nameMap) {
            if (name.toLowerCase() === lowerFragment) {
                matchedName = name
                textureIndex = index
                break
            }
            if (matchedName === undefined && name.toLowerCase().includes(lowerFragment)) {
                matchedName = name
                textureIndex = index
            }
        }

        if (textureIndex === undefined || matchedName === undefined) {
            console.warn(`compareLod: no game matching "${nameFragment}" found in texture atlas`)
            return
        }

        console.log(`compareLod: found "${matchedName}" at texture index ${textureIndex}`)

        // --- Extract MID pixels ---
        const textureManager = this.getTextureManager()
        const midTexture = textureManager.getTextureArray('mid')
        const midConfig = textureManager.getTierConfig('mid')
        if (!midTexture || !midConfig) {
            console.warn('compareLod: MID texture array not available')
            return
        }
        const midW = midConfig.width
        const midH = midConfig.height
        const midSliceBytes = midW * midH * 4
        const midSrcData = midTexture.image.data as Uint8Array
        const midPixels = new Uint8ClampedArray(midSrcData.buffer, textureIndex * midSliceBytes, midSliceBytes)

        // --- Extract HIGH pixels (if loaded) ---
        const highCache = this.getHighTextureCache()
        const highSlot = highCache?.getHighSlot(textureIndex) ?? -1
        const highTexture = highCache?.getTextureArrayRef() ?? null
        const highConfig = textureManager.getTierConfig('high')  // dimensions live here
        let highPixels: Uint8ClampedArray | null = null
        let highW = 0
        let highH = 0
        let highLabel = 'HIGH (not loaded)'

        if (highSlot >= 0 && highTexture && highConfig) {
            highW = highConfig.width
            highH = highConfig.height
            const highSliceBytes = highW * highH * 4
            const highSrcData = highTexture.image.data as Uint8Array
            highPixels = new Uint8ClampedArray(highSrcData.buffer, highSlot * highSliceBytes, highSliceBytes)
            highLabel = `HIGH (slot ${highSlot}, ${highW}×${highH})`
        } else if (highCache) {
            const state = highCache.getState(textureIndex)
            highLabel = `HIGH (${state})`
        }

        // --- Build overlay ---
        const existingOverlay = document.getElementById('lod-compare-overlay')
        existingOverlay?.remove()

        const overlay = document.createElement('div')
        overlay.id = 'lod-compare-overlay'
        Object.assign(overlay.style, {
            position: 'fixed', top: '10px', right: '10px', zIndex: '99999',
            background: '#111', border: '2px solid #555', borderRadius: '8px',
            padding: '10px', color: '#eee', fontFamily: 'monospace', fontSize: '12px',
            display: 'flex', flexDirection: 'column', gap: '8px', userSelect: 'none'
        })

        const title = document.createElement('div')
        title.textContent = `🔍 ${matchedName} (index ${textureIndex})`
        Object.assign(title.style, { fontWeight: 'bold', marginBottom: '4px' })
        overlay.appendChild(title)

        const row = document.createElement('div')
        Object.assign(row.style, { display: 'flex', gap: '12px', alignItems: 'flex-start' })
        overlay.appendChild(row)

        const makePanel = (label: string, pixels: Uint8ClampedArray | null, w: number, h: number): HTMLElement => {
            const panel = document.createElement('div')
            Object.assign(panel.style, { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' })

            const lbl = document.createElement('div')
            lbl.textContent = label
            panel.appendChild(lbl)

            const canvas = document.createElement('canvas')
            const displayScale = Math.max(1, Math.floor(200 / Math.max(w, 1)))
            canvas.width = w
            canvas.height = h
            Object.assign(canvas.style, {
                width: `${w * displayScale}px`,
                height: `${h * displayScale}px`,
                imageRendering: 'pixelated',
                border: '1px solid #444'
            })

            if (pixels && w > 0 && h > 0) {
                const ctx2d = canvas.getContext('2d')!
                const imgData = new ImageData(new Uint8ClampedArray(pixels), w, h)
                ctx2d.putImageData(imgData, 0, 0)
            } else {
                Object.assign(canvas.style, { background: '#333' })
                const ctx2d = canvas.getContext('2d')!
                ctx2d.fillStyle = '#888'
                ctx2d.font = '10px monospace'
                ctx2d.fillText('N/A', 4, 14)
            }

            panel.appendChild(canvas)
            return panel
        }

        row.appendChild(makePanel(`MID (${midW}×${midH})`, midPixels, midW, midH))
        row.appendChild(makePanel(highLabel, highPixels, highW, highH))

        const closeBtn = document.createElement('button')
        closeBtn.textContent = '× close'
        Object.assign(closeBtn.style, {
            background: '#333', color: '#eee', border: '1px solid #555',
            borderRadius: '4px', cursor: 'pointer', padding: '2px 8px', alignSelf: 'flex-end'
        })
        closeBtn.onclick = () => overlay.remove()
        overlay.appendChild(closeBtn)

        document.body.appendChild(overlay)
        console.log(`compareLod: overlay opened. MID ${midW}×${midH}, ${highLabel}. Run compareLod() again to refresh after HIGH loads.`)
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
