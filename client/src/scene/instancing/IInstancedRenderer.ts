/**
 * Shared Interface for Instanced Renderers
 * 
 * Defines common lifecycle and management methods for GPU instanced rendering.
 * Enables consistent patterns across different instanced renderer implementations.
 * 
 * Implementing classes: InstancedLabelRenderer, InstancedArtworkRenderer, InstancedShelfRenderer
 */

import * as THREE from 'three'

/**
 * Configuration interface for instanced renderers
 */
export interface InstancedRendererConfig {
    /** Maximum number of instances this renderer can handle */
    maxInstances?: number
    /** Enable performance logging */
    enablePerformanceLogging?: boolean
    /** Custom name for debugging */
    debugName?: string
}

/**
 * Statistics returned by instanced renderers
 */
export interface InstancedRendererStats {
    /** Whether the renderer has been initialized */
    isInitialized: boolean
    /** Number of currently active instances */
    activeInstances: number
    /** Maximum instances configured */
    maxInstances: number
    /** Renderer-specific additional stats */
    [key: string]: any
}

/**
 * Instance data for setting individual instances
 */
export interface InstanceData {
    /** World position for this instance */
    position: THREE.Vector3
    /** Optional rotation (defaults to identity) */
    rotation?: THREE.Quaternion
    /** Optional scale (defaults to 1,1,1) */
    scale?: THREE.Vector3
    /** Renderer-specific configuration */
    [key: string]: any
}

/**
 * Common interface for all instanced renderers
 */
export interface IInstancedRenderer {
    /**
     * Initialize the renderer - creates geometry, materials, and instanced meshes
     * @param initData Optional initialization data specific to renderer type
     */
    initialize(initData?: any): Promise<void> | void
    
    /**
     * Set configuration for a specific instance
     * @param index Instance index (0 to maxInstances-1)
     * @param data Instance configuration data
     */
    setInstance(index: number, data: InstanceData): Promise<boolean> | boolean
    
    /**
     * Apply all pending instance updates to GPU
     * Call after setting multiple instances for efficiency
     */
    updateGPU(): void
    
    /**
     * Reset all instances (clears positions and count)
     */
    reset(): void
    
    /**
     * Check if renderer is ready for use
     */
    isReady(): boolean
    
    /**
     * Get current statistics and status
     */
    getStats(): InstancedRendererStats
    
    /**
     * Dispose of all resources and cleanup
     */
    dispose(): void
}

/**
 * Base configuration for instanced mesh components
 */
export interface InstancedMeshConfig {
    /** Geometry for the instanced mesh */
    geometry: THREE.BufferGeometry
    /** Material for the instanced mesh */
    material: THREE.Material
    /** Maximum instances for this mesh */
    maxInstances: number
    /** Optional name for debugging */
    name?: string
}

/**
 * Instance attribute configuration
 */
export interface InstanceAttribute {
    /** Attribute name */
    name: string
    /** Values per instance (1 for float, 3 for Vector3, etc.) */
    itemSize: number
    /** Default value for new instances */
    defaultValue?: number | number[]
    /** Usage hint for GPU optimization */
    usage?: THREE.Usage
}