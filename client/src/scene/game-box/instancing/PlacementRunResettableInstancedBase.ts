import * as THREE from 'three'

/**
 * Shared base for instanced renderers that need deterministic slot reuse across
 * placement runs.
 *
 * This base deliberately owns only local instance bookkeeping and GPU invalidation
 * helpers. Event subscription stays in concrete owner classes.
 */
export abstract class PlacementRunResettableInstancedBase {
    protected readonly maxInstances: number
    protected currentInstanceCount = 0

    protected constructor(maxInstances: number) {
        this.maxInstances = Math.max(1, maxInstances)
    }

    protected hasCapacity(): boolean {
        return this.currentInstanceCount < this.maxInstances
    }

    protected allocateInstanceIndex(): number {
        if (!this.hasCapacity()) {
            return -1
        }
        const index = this.currentInstanceCount
        this.currentInstanceCount += 1
        return index
    }

    /**
     * Resets slot counters for a new placement run.
     * Subclasses should override onPlacementRunReset() for additional state.
     */
    public resetForPlacementRun(): void {
        this.currentInstanceCount = 0
        this.onPlacementRunReset()
    }

    /**
     * Override to clear renderer-specific run state such as caches/maps.
     */
    protected onPlacementRunReset(): void {
        // No-op by default.
    }

    protected getCurrentInstanceCount(): number {
        return this.currentInstanceCount
    }

    protected invalidateInstancedMesh(mesh: THREE.InstancedMesh | null): void {
        if (!mesh) {
            return
        }
        mesh.count = this.currentInstanceCount
        mesh.instanceMatrix.needsUpdate = true
        mesh.boundingSphere = null
    }

    protected invalidateInstanceAttribute(
        geometry: THREE.BufferGeometry | null,
        attributeName: string
    ): void {
        if (!geometry) {
            return
        }
        const attr = geometry.getAttribute(attributeName)
        if (attr) {
            attr.needsUpdate = true
        }
    }
}
