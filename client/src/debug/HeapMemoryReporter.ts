import { AppSettings } from '../core/AppSettings'
import { GpuMemoryEstimator } from './GpuMemoryEstimator'
import { RenderLoopRegistry } from '../scene/RenderLoopRegistry'
import { EventManager } from '../core/EventManager'
import { GameEventTypes } from '../types/InteractionEvents'
import { DataManager } from '../core/data/DataManager'
import { DataKey } from '../core/data/DataTypes'
import type * as THREE from 'three'
import type { AllBatchesCompleteEvent } from '../types/EnvironmentEvents'

// Sample every N frames. At 60 fps this is ~67 s; naturally pauses with the render loop.
const FRAMES_PER_SAMPLE = 4_000
// Warn if JS heap has grown by more than this many MB since the last sample.
const HEAP_GROWTH_THRESHOLD_MB = 50
const REGISTRY_ID = 'HeapMemoryReporter'

interface PerformanceWithMemory extends Performance {
    memory?: {
        usedJSHeapSize: number
        totalJSHeapSize: number
        jsHeapSizeLimit: number
    }
}

interface MemorySample {
    usedHeapMb: number
    totalHeapMb: number
}

function readHeap(): MemorySample | null {
    const memory = (performance as PerformanceWithMemory).memory
    if (!memory) return null
    return {
        usedHeapMb: memory.usedJSHeapSize / 1048576,
        totalHeapMb: memory.totalJSHeapSize / 1048576,
    }
}

// Dev-mode reporter that samples JS heap size every FRAMES_PER_SAMPLE frames.
// Starts counting from AllBatchesComplete so startup churn is excluded from baseline.
// Naturally pauses with the render loop — no interval to cancel on blur.
// Zero overhead in production — init() is a no-op when developmentMode is false.
export class HeapMemoryReporter {
    private frameCount = 0
    private lastSample: MemorySample | null = null
    private registered = false

    private get renderer(): THREE.WebGLRenderer {
        return DataManager.getInstance().getOrThrow<THREE.WebGLRenderer>(DataKey.Renderer)
    }

    init(force = false): void {
        if (!force && !AppSettings.get('developmentMode')) {
            console.debug('[HeapMemoryReporter] Disabled (developmentMode is off). Toggle in Settings or pass diagnostics=1.')
            return
        }
        if (!(performance as PerformanceWithMemory).memory) {
            console.debug('[HeapMemoryReporter] performance.memory not available (Chrome only). Use window.dumpGpuMemory() for manual snapshots.')
        }

        EventManager.getInstance().registerEventHandler<AllBatchesCompleteEvent>(
            GameEventTypes.AllBatchesComplete,
            () => this.onStoreReady()
        )

        if (typeof window !== 'undefined') {
            (window as unknown as Record<string, unknown>).dumpGpuMemory = () => this.snapshot()
        }

        console.debug('[HeapMemoryReporter] Waiting for AllBatchesComplete to begin heap sampling.')
    }

    dispose(): void {
        RenderLoopRegistry.getInstance().unregister(REGISTRY_ID)
        this.registered = false
    }

    snapshot(): void {
        GpuMemoryEstimator.logReport(this.renderer)
    }

    private onStoreReady(): void {
        if (this.registered) return
        this.lastSample = readHeap()
        this.frameCount = 0
        this.registered = true

        RenderLoopRegistry.getInstance().register(REGISTRY_ID, () => this.onFrame())

        if (this.lastSample) {
            console.debug(
                `[HeapMemoryReporter] Baseline — heap: ${this.lastSample.usedHeapMb.toFixed(1)} MB used / ` +
                `${this.lastSample.totalHeapMb.toFixed(1)} MB total. ` +
                `Sampling every ${FRAMES_PER_SAMPLE} frames. window.dumpGpuMemory() for full VRAM breakdown.`
            )
        } else {
            console.debug(
                `[HeapMemoryReporter] Started (no performance.memory). ` +
                `window.dumpGpuMemory() for full VRAM breakdown.`
            )
        }
    }

    private onFrame(): void {
        this.frameCount++
        if (this.frameCount < FRAMES_PER_SAMPLE) return
        this.frameCount = 0
        this.report()
    }

    private report(): void {
        const current = readHeap()
        const prev = this.lastSample

        if (!current) return

        if (prev) {
            const deltaMb = current.usedHeapMb - prev.usedHeapMb
            const hasGrowth = deltaMb >= HEAP_GROWTH_THRESHOLD_MB

            const summary =
                `heap: ${current.usedHeapMb.toFixed(1)} MB used / ${current.totalHeapMb.toFixed(1)} MB total ` +
                `(${deltaMb >= 0 ? '+' : ''}${deltaMb.toFixed(1)} MB since last sample)`

            if (hasGrowth) {
                console.warn(`[HeapMemoryReporter] Heap growth — ${summary}`)
            } else {
                console.debug(`[HeapMemoryReporter] Stable — ${summary}`)
            }
        }

        this.lastSample = current
    }
}
