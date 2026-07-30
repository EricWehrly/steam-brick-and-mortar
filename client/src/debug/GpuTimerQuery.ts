/**
 * Real GPU execution timing via EXT_disjoint_timer_query_webgl2 — WebGL2 only.
 *
 * CPU-side performance.now() around a render call measures how long it took to submit
 * GPU commands, not how long the GPU took to execute them (WebGL submission is
 * asynchronous). This wraps a render call in a GPU timer query instead, which measures
 * actual elapsed GPU time for that range of commands.
 *
 * Results are NOT available synchronously — the GPU is pipelined behind CPU submission,
 * so a query's result typically resolves a few frames after it was issued. Call poll()
 * once per frame to drain completed queries in submission order.
 */
export class GpuTimerQuery {
    /** Defensive cap so a poll() drought (e.g. tab backgrounded) can't grow this unboundedly. */
    private static readonly MAX_PENDING = 30

    private readonly gl: WebGL2RenderingContext
    private readonly ext: any
    private readonly pending: Array<{ query: WebGLQuery; onResult: (ms: number) => void }> = []

    constructor(gl: WebGL2RenderingContext) {
        this.gl = gl
        this.ext = gl.getExtension('EXT_disjoint_timer_query_webgl2')
    }

    public get isSupported(): boolean {
        return !!this.ext
    }

    /**
     * Runs `work` (expected to issue GPU draw/compute commands) wrapped in a timer query.
     * onResult fires later, from poll(), with the elapsed GPU time in milliseconds — never
     * called if the driver reported a disjoint event (result invalid, silently dropped).
     * Falls back to plain execution with no callback if the extension isn't supported.
     */
    public measure(work: () => void, onResult: (ms: number) => void): void {
        if (!this.ext) {
            work()
            return
        }

        if (this.pending.length >= GpuTimerQuery.MAX_PENDING) {
            const stale = this.pending.shift()!
            this.gl.deleteQuery(stale.query)
        }

        const query = this.gl.createQuery()!
        this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, query)
        work()
        this.gl.endQuery(this.ext.TIME_ELAPSED_EXT)
        this.pending.push({ query, onResult })
    }

    /** Call once per frame. Drains completed queries in order; stops at the first not-ready one. */
    public poll(): void {
        if (!this.ext) {
            return
        }
        while (this.pending.length > 0) {
            const { query } = this.pending[0]
            if (!this.gl.getQueryParameter(query, this.gl.QUERY_RESULT_AVAILABLE)) {
                break
            }
            const { onResult } = this.pending.shift()!
            const disjoint = this.gl.getParameter(this.ext.GPU_DISJOINT_EXT)
            if (!disjoint) {
                const elapsedNs = this.gl.getQueryParameter(query, this.gl.QUERY_RESULT)
                onResult(elapsedNs / 1e6)
            }
            this.gl.deleteQuery(query)
        }
    }

    /** Discards any in-flight queries without reading results. */
    public dispose(): void {
        for (const { query } of this.pending) {
            this.gl.deleteQuery(query)
        }
        this.pending.length = 0
    }
}
