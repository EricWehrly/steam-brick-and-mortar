/**
 * WorkerErrorUtils
 *
 * Shared utilities for consistent worker error handling across all Web Worker managers.
 *
 * Problem: Browser ErrorEvents from runtime worker crashes have message/filename/lineno
 * all set to undefined. Logging only e.message produces "[Worker] ERROR Worker error: undefined"
 * with no actionable information.
 *
 * Usage:
 *   this.worker.onerror = makeWorkerErrorHandler('MyWorker', pendingMap)
 */

export interface PendingRequest {
    reject: (err: Error) => void
    [key: string]: unknown
}

/**
 * Extract a meaningful error message from a browser ErrorEvent.
 * Runtime worker crashes set message=undefined; actual error lives in e.error.
 */
export function extractWorkerErrorMessage(e: ErrorEvent): string {
    if (e.error instanceof Error) {
        return e.error.message || e.error.toString()
    }
    if (e.message) return e.message
    if (e.filename) return `Worker error in ${e.filename}:${e.lineno}`
    return 'Unknown worker error (no error detail available - likely a runtime crash inside the worker)'
}

/**
 * Create a standardised onerror handler for a Worker.
 * Logs the full event detail and rejects all pending requests with a meaningful error.
 *
 * @param workerName   - Identifier for log output (e.g. 'TextureWorker')
 * @param pending      - Map of pending promise callbacks to reject on crash
 * @param logger       - Optional logger object with an .error() method
 */
export function makeWorkerErrorHandler(
    workerName: string,
    pending: Map<string, PendingRequest>,
    logger?: { error: (...args: unknown[]) => void }
): (e: ErrorEvent) => void {
    return (e: ErrorEvent) => {
        const msg = extractWorkerErrorMessage(e)
        const log = logger?.error.bind(logger) ?? console.error
        log(`[${workerName}] Worker crashed: ${msg}`, {
            filename: e.filename,
            lineno: e.lineno,
            error: e.error,
        })
        const err = new Error(`${workerName} crashed: ${msg}`)
        for (const [, req] of pending) {
            req.reject(err)
        }
        pending.clear()
    }
}