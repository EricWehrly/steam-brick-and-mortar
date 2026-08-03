/**
 * TextureWorkerPool
 *
 * A small fixed pool of TextureWorker instances so MID-tier prefetch decode work parallelizes
 * across cores instead of serializing on a single Worker's message queue (see
 * docs/plans/startup-artwork-resolution-plan.md, Root Cause B - "One worker, not a pool"). Each
 * call is routed to whichever worker currently has the fewest pending messages
 * (ManagedWorker.pendingCount), a cheap least-busy heuristic that needs no extra bookkeeping.
 *
 * Deliberately separate from HighTextureCache's own TextureWorker: that one already runs
 * independently with its own low concurrency cap (maxConcurrentLoads) and isn't the bottleneck
 * this pool exists to fix.
 */

import { TextureWorker, type FetchAndProcessOptions, type FetchAndProcessResult } from './TextureWorker'

/** Floor and ceiling for pool size when deriving from navigator.hardwareConcurrency. */
const MIN_POOL_SIZE = 2
const MAX_POOL_SIZE = 6

export function resolveDecodeWorkerPoolSize(): number {
    const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : undefined
    return Math.max(MIN_POOL_SIZE, Math.min(cores || MIN_POOL_SIZE, MAX_POOL_SIZE))
}

export class TextureWorkerPool {
    private readonly workers: TextureWorker[]

    constructor(size: number = resolveDecodeWorkerPoolSize()) {
        this.workers = Array.from({ length: Math.max(1, size) }, () => new TextureWorker())
    }

    private leastBusy(): TextureWorker {
        let best = this.workers[0]
        for (let i = 1; i < this.workers.length; i++) {
            if (this.workers[i].pendingCount < best.pendingCount) {
                best = this.workers[i]
            }
        }
        return best
    }

    public fetchAndProcessWithOptions(
        url: string,
        textureIndex: number,
        gameName: string,
        options: FetchAndProcessOptions = {}
    ): Promise<FetchAndProcessResult> {
        return this.leastBusy().fetchAndProcessWithOptions(url, textureIndex, gameName, options)
    }

    public processLocalBytes(
        bytes: Uint8Array<ArrayBuffer>,
        formatHint: string,
        textureIndex: number,
        gameName: string,
        options: FetchAndProcessOptions = {}
    ): Promise<FetchAndProcessResult> {
        return this.leastBusy().processLocalBytes(bytes, formatHint, textureIndex, gameName, options)
    }

    public dispose(): void {
        for (const worker of this.workers) {
            worker.dispose()
        }
    }
}
