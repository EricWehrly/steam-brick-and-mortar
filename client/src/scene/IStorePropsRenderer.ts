/**
 * Store Props Renderer Interface
 * 
 * Common interface for both legacy and instanced StorePropsRenderer implementations.
 * Provides consistent API for rendering interactive store objects and props.
 */

import * as THREE from 'three'
import type { PropsConfig } from './StorePropsRenderer'

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