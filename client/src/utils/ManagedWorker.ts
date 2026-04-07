/**
 * ManagedWorker<TIn, TOut>
 *
 * Base class for Web Worker manager objects.
 *
 * Owns the Worker lifecycle, pending-message map, and error handling so
 * individual manager classes don't each re-implement the same boilerplate.
 *
 * TIn:  union of message types sent TO the worker (must have messageId: string)
 * TOut: union of message types received FROM the worker (must have messageId: string)
 *
 * Subclass responsibilities:
 *   - Call super(workerFactory, workerName) in constructor
 *   - Optionally override protected handleMessage(data: TOut): void
 *   - Optionally override protected onWorkerCrash(err: Error): void
 *   - Call this.send<TResponse>(message) to send and await a response
 */

import { makeWorkerErrorHandler } from './WorkerErrorUtils'
import { Logger } from './Logger'

export interface WorkerMessage {
    messageId: string
}

type PendingEntry<TOut> = {
    resolve: (data: TOut) => void
    reject: (err: Error) => void
}

/** Accept either a Vite "?worker" constructable or a plain factory function (useful in tests). */
type WorkerFactory = (() => Worker) | (new () => Worker)

export abstract class ManagedWorker<TIn extends WorkerMessage, TOut extends WorkerMessage> {
    private readonly worker: Worker
    private readonly name: string
    private readonly pending = new Map<string, PendingEntry<TOut>>()
    private disposed = false
    private msgCounter = 0

    constructor(workerFactory: WorkerFactory, workerName: string) {
        this.name = workerName

        // Support both constructable (Vite ?worker imports) and plain factory functions (tests)
        let worker: Worker
        try {
            worker = new (workerFactory as new () => Worker)()
        } catch {
            worker = (workerFactory as () => Worker)()
        }
        this.worker = worker

        this.worker.onmessage = (e: MessageEvent<TOut>) => {
            this.dispatchMessage(e.data)
        }

        const logger = Logger.createLogFunctions(workerName)
        const baseHandler = makeWorkerErrorHandler(workerName, this.pending as never, logger)
        this.worker.onerror = (e: ErrorEvent) => {
            baseHandler(e)
            this.onWorkerCrash(new Error(e.error?.message ?? e.message ?? 'unknown worker error'))
        }
    }

    /** Generate a unique message ID. */
    protected nextId(): string {
        return `${this.name}_${Date.now()}_${this.msgCounter++}`
    }

    /**
     * Send a message to the worker and await the response with matching messageId.
     * Caller must set message.messageId (use this.nextId()).
     */
    protected send<TResponse extends TOut>(message: TIn): Promise<TResponse> {
        if (this.disposed) {
            return Promise.reject(new Error(`${this.name}: already disposed`))
        }
        return new Promise<TResponse>((resolve, reject) => {
            this.pending.set(message.messageId, {
                resolve: (data) => resolve(data as TResponse),
                reject,
            })
            this.worker.postMessage(message)
        })
    }

    /** Post fire-and-forget (no response expected). */
    protected post(message: TIn): void {
        if (!this.disposed) this.worker.postMessage(message)
    }

    private dispatchMessage(data: TOut): void {
        const entry = this.pending.get(data.messageId)
        if (entry) {
            this.pending.delete(data.messageId)
            entry.resolve(data)
        }
        this.handleMessage(data)
    }

    /** Called for every inbound message. Override to observe or handle push-style messages. */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    protected handleMessage(_data: TOut): void { /* no-op */ }

    /** Called after all pending promises are rejected on a worker crash. Override for cleanup. */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    protected onWorkerCrash(_err: Error): void { /* no-op */ }

    public dispose(): void {
        if (this.disposed) return
        this.disposed = true
        const err = new Error(`${this.name}: disposed`)
        for (const [, entry] of this.pending) entry.reject(err)
        this.pending.clear()
        this.worker.terminate()
    }

    public get isDisposed(): boolean { return this.disposed }
    public get pendingCount(): number { return this.pending.size }
}
