import * as THREE from 'three'
import { AppSettings } from '../core/AppSettings'
import { GpuMemoryEstimator } from './GpuMemoryEstimator'

const SAMPLE_INTERVAL_MS = 60_000
const GROWTH_THRESHOLD = 5

interface MemorySample {
    geometries: number
    textures: number
    timestamp: number
}

// Periodic dev-mode reporter that samples renderer.info.memory every 60 s and
// logs a line when geometry or texture count has grown since the last sample.
// Zero overhead in production — start() is a no-op when developmentMode is false.
export class GpuMemoryReporter {
    private readonly renderer: THREE.WebGLRenderer
    private intervalId: ReturnType<typeof setInterval> | null = null
    private lastSample: MemorySample | null = null

    constructor(renderer: THREE.WebGLRenderer) {
        this.renderer = renderer
    }

    start(): void {
        if (!AppSettings.get('developmentMode')) return
        if (this.intervalId !== null) return

        this.lastSample = this.takeSample()
        console.debug('[GpuMemoryReporter] Started — sampling every 60 s. window.dumpGpuMemory() for on-demand snapshot.')

        this.intervalId = setInterval(() => this.report(), SAMPLE_INTERVAL_MS)
    }

    stop(): void {
        if (this.intervalId === null) return
        clearInterval(this.intervalId)
        this.intervalId = null
    }

    snapshot(): void {
        GpuMemoryEstimator.logReport(this.renderer)
    }

    private takeSample(): MemorySample {
        const { geometries, textures } = this.renderer.info.memory
        return { geometries, textures, timestamp: Date.now() }
    }

    private report(): void {
        const current = this.takeSample()
        const prev = this.lastSample

        if (!prev) {
            this.lastSample = current
            return
        }

        const geometryDelta = current.geometries - prev.geometries
        const textureDelta = current.textures - prev.textures
        const hasGrowth = geometryDelta >= GROWTH_THRESHOLD || textureDelta >= GROWTH_THRESHOLD

        if (hasGrowth) {
            console.warn(
                `[GpuMemoryReporter] Growth detected — geometries: ${prev.geometries} → ${current.geometries} (+${geometryDelta}), ` +
                `textures: ${prev.textures} → ${current.textures} (+${textureDelta})`
            )
        } else {
            console.debug(
                `[GpuMemoryReporter] Stable — geometries: ${current.geometries}, textures: ${current.textures}`
            )
        }

        this.lastSample = current
    }
}
