/**
 * Shared Interface for Instanced Renderers
 * 
 * Defines common lifecycle and management methods for GPU instanced rendering.
 * Enables consistent patterns across different instanced renderer implementations.
 * 
 * Implementing classes: InstancedLabelRenderer, InstancedArtworkRenderer, InstancedShelfRenderer
 */

import * as THREE from 'three'

export interface InstancedRendererConfig {
    maxInstances?: number
    enablePerformanceLogging?: boolean
}

export const DEFAULT_INSTANCED_RENDERER_CONFIG: InstancedRendererConfig = {
    maxInstances: 500
}

export interface InstancedRendererStats {
    /** Whether the renderer has been initialized */
    isInitialized: boolean
    /** Number of currently active instances */
    activeInstances: number
    /** Maximum instances configured */
    maxInstances: number
    /** Renderer-specific additional stats */
    [key: string]: unknown
}

export interface InstanceData {
    /** World position for this instance */
    position: THREE.Vector3
    /** Optional rotation (defaults to identity) */
    rotation?: THREE.Quaternion
    /** Optional scale (defaults to 1,1,1) */
    scale?: THREE.Vector3
    /** Renderer-specific configuration */
    [key: string]: unknown
}

export interface IInstancedRenderer {
    /**
     * Initialize the renderer - creates geometry, materials, and instanced meshes
     * @param initData Optional initialization data specific to renderer type
     */
    initialize(initData?: unknown): Promise<void> | void
    
    /**
     * Set configuration for a specific instance
     * @param index Instance index (0 to maxInstances-1)
     * @param data Instance configuration data
     */
    setInstance(index: number, data: InstanceData): Promise<boolean> | boolean
    
    reset(): void
    
    isReady(): boolean
    
    getStats(): InstancedRendererStats
    
    dispose(): void
}

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