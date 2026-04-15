import * as THREE from 'three'
import { AppSettings } from '../core/AppSettings'
import { GpuMemoryEstimator } from './GpuMemoryEstimator'
import { RenderLoopRegistry } from '../scene/RenderLoopRegistry'
import { EventManager } from '../core/EventManager'
import { GameEventTypes } from '../types/InteractionEvents'
import { DataManager } from '../core/data/DataManager'
import type { AllBatchesCompleteEvent } from '../types/EnvironmentEvents'

// Sample every N frames. At 60 fps this is ~67 s; naturally pauses with the render loop.
const FRAMES_PER_SAMPLE = 4_000
const GROWTH_THRESHOLD = 5
const REGISTRY_ID = 'GpuMemoryReporter'

interface MemorySample {
    geometries: number
    textures: number
    programs: number
    drawCalls: number
    triangles: number
    registeredMb: number
}

// Dev-mode reporter that samples renderer.info.memory every FRAMES_PER_SAMPLE frames.
// Starts counting from AllBatchesComplete so early-startup churn is excluded from the baseline.
// Naturally pauses with the render loop (no interval to cancel on blur).
// Zero overhead in production — init() is a no-op when developmentMode is false.
export class GpuMemoryReporter {
    private readonly renderer: THREE.WebGLRenderer
    private frameCount = 0
    private lastSample: MemorySample | null = null
    private registered = false

    constructor(renderer: THREE.WebGLRenderer) {
        this.renderer = renderer
    }

    init(): void {
        if (!AppSettings.get('developmentMode')) return

        EventManager.getInstance().registerEventHandler<AllBatchesCompleteEvent>(
            GameEventTypes.AllBatchesComplete,
            () => this.onStoreReady()
        )

        if (typeof window !== 'undefined') {
            (window as unknown as Record<string, unknown>).dumpGpuMemory = () => this.snapshot()
        }

        console.debug('[GpuMemoryReporter] Waiting for AllBatchesComplete to begin sampling.')
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
        this.lastSample = this.takeSample()
        this.frameCount = 0
        this.registered = true

        RenderLoopRegistry.getInstance().register(REGISTRY_ID, () => this.onFrame())

        console.debug(
            `[GpuMemoryReporter] Baseline — geometries: ${this.lastSample.geometries}, textures: ${this.lastSample.textures}, ` +
            `programs: ${this.lastSample.programs}, draw calls: ${this.lastSample.drawCalls}, ` +
            `triangles: ${this.lastSample.triangles.toLocaleString()}, registered VRAM: ${this.lastSample.registeredMb.toFixed(0)} MB. ` +
            `Sampling every ${FRAMES_PER_SAMPLE} frames. window.dumpGpuMemory() for full breakdown.`
        )
    }

    private onFrame(): void {
        this.frameCount++
        if (this.frameCount < FRAMES_PER_SAMPLE) return
        this.frameCount = 0
        this.report()
    }

    private takeSample(): MemorySample {
        const { geometries, textures } = this.renderer.info.memory
        const programs = this.renderer.info.programs?.length ?? 0
        const { calls: drawCalls, triangles } = this.renderer.info.render
        const registeredMb = [...DataManager.getInstance().getMemoryConsumption().values()]
            .reduce((sum, mb) => sum + mb, 0)
        return { geometries, textures, programs, drawCalls, triangles, registeredMb }
    }

    private report(): void {
        const current = this.takeSample()
        const prev = this.lastSample!

        const geometryDelta = current.geometries - prev.geometries
        const textureDelta = current.textures - prev.textures
        const programDelta = current.programs - prev.programs
        const hasGrowth = geometryDelta >= GROWTH_THRESHOLD || textureDelta >= GROWTH_THRESHOLD || programDelta >= 1

        const summary =
            `geometries: ${current.geometries} (${geometryDelta >= 0 ? '+' : ''}${geometryDelta}), ` +
            `textures: ${current.textures} (${textureDelta >= 0 ? '+' : ''}${textureDelta}), ` +
            `programs: ${current.programs} (${programDelta >= 0 ? '+' : ''}${programDelta}), ` +
            `draw calls: ${current.drawCalls}, ` +
            `triangles: ${current.triangles.toLocaleString()}, ` +
            `registered VRAM: ${current.registeredMb.toFixed(0)} MB`

        if (hasGrowth) {
            console.warn(`[GpuMemoryReporter] Growth — ${summary}`)
        } else {
            console.debug(`[GpuMemoryReporter] Stable — ${summary}`)
        }

        this.lastSample = current
    }
}
