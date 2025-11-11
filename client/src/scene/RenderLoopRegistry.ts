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

export class RenderLoopRegistry {
    private static instance: RenderLoopRegistry | null = null
    private callbacks: Map<string, RenderLoopCallback> = new Map()

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
     * Execute all registered callbacks (called by SceneManager)
     * @param now Current time in milliseconds (from performance.now())
     * @param deltaTime Time elapsed since last frame in milliseconds
     */
    public executeAll(now: number, deltaTime: number): void {
        for (const callback of this.callbacks.values()) {
            try {
                callback(now, deltaTime)
            } catch (error) {
                console.error('RenderLoopRegistry: Error executing callback:', error)
            }
        }
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
