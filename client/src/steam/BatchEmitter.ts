import { EventManager } from '../core/EventManager'
import { SteamEventTypes } from '../types/InteractionEvents'
import type { SteamGamesBatchEvent } from '../types/InteractionEvents'
import type { SteamGame } from './SteamApiClient'

/**
 * Accumulates games and emits `GamesBatchReady` events in shelf-sized batches.
 *
 * `push(game)` adds a game; if the buffer hits `batchSize`, a batch is emitted
 * and the main thread yielded before returning.
 * `flush()` drains any remainder as a final partial batch.
 *
 * Both are async only because of the yield-to-main-thread between batches —
 * not because emission itself is async.
 *
 * Shared by GamesLoader (network-progressive delivery) and SteamIntegration
 * (demo/imported libraries, already fully known in memory) — the batching
 * contract is identical either way, only how games arrive differs.
 */
export class BatchEmitter {
    private readonly buffer: SteamGame[] = []
    private readonly batchSize: number
    private readonly totalBatches: number
    private _batchIndex: number = 0

    constructor(batchSize: number, totalBatches: number) {
        this.batchSize = batchSize
        this.totalBatches = totalBatches
    }

    /** Add a game. Emits a batch and yields the main thread if the buffer is full. */
    async push(game: SteamGame): Promise<void> {
        this.buffer.push(game)
        if (this.buffer.length >= this.batchSize) {
            await this.emitBatch()
        }
    }

    /** Drain any remaining games as a partial batch. No-op if buffer is empty. */
    async flush(): Promise<void> {
        if (this.buffer.length > 0) {
            await this.emitBatch()
        }
    }

    private async emitBatch(): Promise<void> {
        const batch = this.buffer.splice(0, this.batchSize)
        EventManager.getInstance().emit<SteamGamesBatchEvent>(SteamEventTypes.GamesBatchReady, {
            games: batch as ReadonlyArray<Readonly<SteamGame>>,
            batchIndex: this._batchIndex,
            totalBatches: this.totalBatches
        })
        this._batchIndex++
        // Yield the main thread between batches so rendering isn't starved.
        await new Promise(resolve => setTimeout(resolve, 0))
    }
}
