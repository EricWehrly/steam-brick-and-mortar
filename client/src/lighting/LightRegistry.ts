/**
 * Light Registry - Central inventory for scene lights
 * 
 * Provides O(1) lookups for lights and attached geometry without scene traversal.
 * Attached geometry is any visual object associated with a light (debug helpers,
 * indicators, etc.) - the registry doesn't care what it's for.
 * 
 * TODO: Consider migrating to light.userData.attachedGeometry pattern
 * to eliminate this registry entirely.
 */

import * as THREE from 'three'
import { Logger } from '../utils/Logger'

interface LightEntry {
    type: string
    attachedGeometry?: THREE.Object3D
}

export class LightRegistry {
    private static instance: LightRegistry | null = null
    public static logger = Logger.createLogFunctions(LightRegistry.name)
    
    private lights: Map<THREE.Light, LightEntry> = new Map()
    private attachedGeometry: Map<THREE.Light, THREE.Object3D> = new Map()
    
    private constructor() {}
    
    public static getInstance(): LightRegistry {
        if (!LightRegistry.instance) {
            LightRegistry.instance = new LightRegistry()
        }
        return LightRegistry.instance
    }
    
    public registerLight(light: THREE.Light, options: { source?: string } = {}): void {
        const lightType = light.constructor.name
        this.lights.set(light, { type: lightType })
        LightRegistry.logger.debug(`💡 Registered ${lightType}: "${light.name}" (source: ${options.source ?? 'unknown'})`)
    }
    
    public attachGeometry(light: THREE.Light, geometry: THREE.Object3D): void {
        const entry = this.lights.get(light)
        if (entry) {
            entry.attachedGeometry = geometry
            this.attachedGeometry.set(light, geometry)
            LightRegistry.logger.debug(`💡 Attached geometry to "${light.name}"`)
        }
    }
    
    public getLightsByType<T extends THREE.Light>(lightClass: new (...args: unknown[]) => T): T[] {
        const results: T[] = []
        for (const [light] of this.lights) {
            if (light instanceof lightClass) results.push(light)
        }
        return results
    }

    public getLightsGroupedByType(): Map<string, THREE.Light[]> {
        const groups = new Map<string, THREE.Light[]>()
        for (const [light, entry] of this.lights) {
            if (!groups.has(entry.type)) {
                groups.set(entry.type, [])
            }
            groups.get(entry.type)!.push(light)
        }
        return groups
    }
    
    public getAttachedGeometry(light: THREE.Light): THREE.Object3D | undefined {
        return this.attachedGeometry.get(light)
    }
    
    public getAllAttachedGeometry(): THREE.Object3D[] {
        return Array.from(this.attachedGeometry.values())
    }
    
    public clear(): void {
        this.lights.clear()
        this.attachedGeometry.clear()
        LightRegistry.logger.debug('💡 Cleared all registrations')
    }
}
