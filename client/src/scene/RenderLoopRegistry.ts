/**
 * Render Loop Registry - Manages callbacks for the animation loop
 * 
 * Allows any component to register update callbacks that will be called
 * every frame during the render loop. Components can self-register without
 * the SceneManager needing to know about them.
 */

export interface RenderLoopCallback {
    (now: number, deltaTime: number): void
}

/**
 * Instrumentation hooks for diagnostics
 * All hooks are optional - only set what you need
 */
export interface InstrumentationHooks {
    /** Called before executing any callbacks. now/deltaTime are the same values passed to
     *  executeAll() — deltaTime is the real wall-clock gap since the previous frame's
     *  executeAll() call, i.e. actual frame cadence including GPU/vsync time, not just the
     *  CPU work done inside this callback. */
    onBeforeFrame?: (now: number, deltaTime: number) => void
    /** Called after all callbacks have executed */
    onAfterFrame?: () => void
    /** Called after renderer.render() — full frame cost including GPU submission */
    onAfterRender?: () => void
    /** Wraps each callback execution for individual timing */
    wrapCallback?: (
        id: string,
        callback: RenderLoopCallback,
        now: number,
        deltaTime: number
    ) => void
}

export class RenderLoopRegistry {
    private static instance: RenderLoopRegistry | null = null
    private callbacks: Map<string, RenderLoopCallback> = new Map()
    private instrumentation: InstrumentationHooks | null = null

    private constructor() {}

    public static getInstance(): RenderLoopRegistry {
        if (!RenderLoopRegistry.instance) {
            RenderLoopRegistry.instance = new RenderLoopRegistry()
        }
        return RenderLoopRegistry.instance
    }

    /**
     * Register a callback to be called every frame
     * @param id Unique identifier for this callback (typically class name + instance id)
     * @param callback Function to call each frame
     */
    public register(id: string, callback: RenderLoopCallback): void {
        if (this.callbacks.has(id)) {
            console.warn(`RenderLoopRegistry: Callback with id '${id}' already registered, replacing`)
        }
        this.callbacks.set(id, callback)
    }

    /**
     * Unregister a callback
     * @param id Unique identifier for the callback to remove
     */
    public unregister(id: string): void {
        this.callbacks.delete(id)
    }

    /**
     * Set instrumentation hooks for diagnostics
     * Pass null to remove instrumentation and return to zero-overhead mode
     */
    public setInstrumentation(hooks: InstrumentationHooks | null): void {
        this.instrumentation = hooks
    }

    /**
     * Execute all registered callbacks (called by SceneManager)
     * @param now Current time in milliseconds (from performance.now())
     * @param deltaTime Time elapsed since last frame in milliseconds
     */
    public executeAll(now: number, deltaTime: number): void {
        // Call frame begin hook if set
        this.instrumentation?.onBeforeFrame?.(now, deltaTime)
        
        if (this.instrumentation?.wrapCallback) {
            // Instrumented path - wrapper handles execution and timing
            for (const [id, callback] of this.callbacks.entries()) {
                this.instrumentation.wrapCallback(id, callback, now, deltaTime)
            }
        } else {
            // Fast path - direct execution
            for (const callback of this.callbacks.values()) {
                try {
                    callback(now, deltaTime)
                } catch (error) {
                    console.error('RenderLoopRegistry: Error executing callback:', error)
                }
            }
        }
        
        // Call frame end hook if set
        this.instrumentation?.onAfterFrame?.()
    }

    /**
     * Called by SceneManager after renderer.render().
     * Allows diagnostics to measure the full frame including GPU submission.
     */
    public afterRender(): void {
        this.instrumentation?.onAfterRender?.()
    }

    /**
     * Clear all registered callbacks (for cleanup/testing)
     */
    public clear(): void {
        this.callbacks.clear()
    }

    /**
     * Get count of registered callbacks (for debugging)
     */
    public getCount(): number {
        return this.callbacks.size
    }

    /**
     * Dispose of the registry (for testing)
     */
    public static dispose(): void {
        if (RenderLoopRegistry.instance) {
            RenderLoopRegistry.instance.clear()
            RenderLoopRegistry.instance = null
        }
    }
}
