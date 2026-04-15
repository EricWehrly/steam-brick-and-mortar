import { AppSettings } from '../core/AppSettings'
import { RenderLoopRegistry } from '../scene/RenderLoopRegistry'
import { EventManager } from '../core/EventManager'
import { GameEventTypes } from '../types/InteractionEvents'
import type { AllBatchesCompleteEvent } from '../types/EnvironmentEvents'

// Sample every N frames. At 60 fps this is ~67 s; naturally pauses with the render loop.
const FRAMES_PER_SAMPLE = 4_000
const HEAP_GROWTH_THRESHOLD_MB = 50
const REGISTRY_ID = 'HeapMemoryReporter'

interface PerformanceWithMemory extends Performance {
    memory?: {
        usedJSHeapSize: number
        totalJSHeapSize: number
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

// Samples JS heap every FRAMES_PER_SAMPLE frames starting from AllBatchesComplete.
// Naturally pauses with the render loop. No-op in production or when performance.memory
// is unavailable. Activate via developmentMode setting or diagnostics=1 URL param.
export class HeapMemoryReporter {
    private frameCount = 0
    private lastSample: MemorySample | null = null
    private registered = false

    init(force = false): void {
        if (!force && !AppSettings.get('developmentMode')) return
        if (!readHeap()) return

        EventManager.getInstance().registerEventHandler<AllBatchesCompleteEvent>(
            GameEventTypes.AllBatchesComplete,
            () => this.onStoreReady()
        )
    }

    dispose(): void {
        RenderLoopRegistry.getInstance().unregister(REGISTRY_ID)
        this.registered = false
    }

    private onStoreReady(): void {
        if (this.registered) return
        this.lastSample = readHeap()!
        this.frameCount = 0
        this.registered = true

        RenderLoopRegistry.getInstance().register(REGISTRY_ID, () => this.onFrame())

        console.debug(
            `[HeapMemoryReporter] Baseline — heap: ${this.lastSample.usedHeapMb.toFixed(1)} MB used / ` +
            `${this.lastSample.totalHeapMb.toFixed(1)} MB total. Sampling every ${FRAMES_PER_SAMPLE} frames.`
        )
    }

    private onFrame(): void {
        if (++this.frameCount < FRAMES_PER_SAMPLE) return
        this.frameCount = 0

        const current = readHeap()!
        const deltaMb = current.usedHeapMb - this.lastSample!.usedHeapMb
        const summary =
            `heap: ${current.usedHeapMb.toFixed(1)} MB used / ${current.totalHeapMb.toFixed(1)} MB total ` +
            `(${deltaMb >= 0 ? '+' : ''}${deltaMb.toFixed(1)} MB)`

        if (deltaMb >= HEAP_GROWTH_THRESHOLD_MB) {
            console.warn(`[HeapMemoryReporter] Growth — ${summary}`)
        } else {
            console.debug(`[HeapMemoryReporter] Stable — ${summary}`)
        }

        this.lastSample = current
    }
}
