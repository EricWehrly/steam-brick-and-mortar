/**
 * Store Props Renderer Interface
 * 
 * Common interface for both legacy and GPU StorePropsRenderer implementations.
 * Provides consistent API for rendering interactive store objects and props.
 */

import * as THREE from 'three'

export interface PropsConfig {
    enableShelves?: boolean
    enableGameBoxes?: boolean
    enableSignage?: boolean
    /* TODO: If we're not supporting something (like frustumCullingEnabled),
        we should warn if we find it in a non-default state */
    performance?: {
        maxTextureSize?: number
        nearDistance?: number
        farDistance?: number
        maxActiveTextures?: number
        frustumCullingEnabled?: boolean
    }
    tests?: Record<string, string>
}

export interface IStorePropsRenderer {
    /**
     * Set up props with configuration
     */
    setupProps(config?: PropsConfig): Promise<void>

    /**
     * Add atmospheric props (wire racks, dividers, etc.)
     */
    addAtmosphericProps(): Promise<void>

    /**
     * Update performance data for camera-based optimizations
     */
    updatePerformanceData(camera: THREE.Camera): void

    /**
     * Clear all props from the scene
     */
    clearProps(): void

    /**
     * Dispose of all resources and clean up
     */
    dispose(): void
}