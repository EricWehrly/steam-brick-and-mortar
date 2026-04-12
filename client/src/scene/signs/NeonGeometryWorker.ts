/**
 * NeonGeometryWorker
 *
 * Typed ManagedWorker wrapper for neon-geometry.worker.ts.
 * Builds font outline tube vertex data off the main thread.
 *
 * Usage:
 *   const worker = NeonGeometryWorker.instance
 *   const tubes = await worker.buildTubes('steam', { fontSize: 0.3, tubeRadius: 0.015, segments: 12 })
 *   worker.dispose()   // call when done
 */

import NeonGeometryWorkerModule from '../../utils/workers/neon-geometry.worker?worker'
import { ManagedWorker } from '../../utils/ManagedWorker'
import type {
    NeonGeometryRequest,
    NeonGeometryResponse,
    NeonGeometryError,
} from '../../utils/workers/neon-geometry.worker'

type NGWIn  = NeonGeometryRequest
type NGWOut = NeonGeometryResponse | NeonGeometryError

export interface NeonGeometryConfig {
    fontSize: number
    tubeRadius: number
    segments: number
}

export interface NeonGeometryResult {
    tubes: Float32Array[]
    offsetX: number
    offsetY: number
}

export class NeonGeometryWorker extends ManagedWorker<NGWIn, NGWOut> {
    constructor() {
        super(NeonGeometryWorkerModule as unknown as new () => Worker, 'NeonGeometryWorker')
    }

    /**
     * Build tube vertex arrays for the given text.
     * Returns a flat Float32Array per path contour: [x,y,z, x,y,z, ...]
     */
    public async buildTubes(text: string, config: NeonGeometryConfig): Promise<NeonGeometryResult> {
        const messageId = this.nextId()
        const response = await this.send<NGWOut>({
            kind: 'neon-geometry',
            messageId,
            text,
            fontSize:   config.fontSize,
            tubeRadius: config.tubeRadius,
            segments:   config.segments,
        })

        if (response.kind === 'neon-geometry-error') {
            throw new Error(`NeonGeometryWorker: ${response.error}`)
        }

        return {
            tubes:   (response as NeonGeometryResponse).tubes,
            offsetX: (response as NeonGeometryResponse).offsetX,
            offsetY: (response as NeonGeometryResponse).offsetY,
        }
    }
}
