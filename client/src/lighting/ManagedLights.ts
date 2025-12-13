import * as THREE from 'three'
import { EventManager, EventSource } from '../core/EventManager'
import { LightingEventTypes } from '../types/InteractionEvents'
import { LightRegistry } from './LightRegistry'

interface IManagedLight {
    addToScene(scene: THREE.Scene, name?: string): this
    addToParent(parent: THREE.Object3D, scene: THREE.Scene, name?: string): this
}

function managedLightMixin<T extends new (...args: any[]) => THREE.Light>(Base: T, lightType: string) {
    return class extends Base implements IManagedLight {
        private eventManager = EventManager.getInstance()

        addToScene(scene: THREE.Scene, name?: string): this {
            if (name) this.name = name
            scene.add(this)
            this.registerAndEmit(scene, this.name)
            return this
        }

        addToParent(parent: THREE.Object3D, scene: THREE.Scene, name?: string): this {
            if (name) this.name = name
            parent.add(this)
            this.registerAndEmit(scene, this.name)
            return this
        }

        private registerAndEmit(scene: THREE.Scene, name?: string): void {
            // Register with central registry (enables O(1) lookups)
            LightRegistry.getInstance().registerLight(this, { source: 'ManagedLight' })
            
            // Emit event for UI updates
            this.eventManager.emit(LightingEventTypes.Created, {
                light: this,
                scene,
                lightType,
                lightName: name,
                timestamp: Date.now(),
                source: EventSource.ManagedLight
            })
        }
    }
}

export class ManagedAmbientLight extends managedLightMixin(THREE.AmbientLight, 'AmbientLight') {}
export class ManagedDirectionalLight extends managedLightMixin(THREE.DirectionalLight, 'DirectionalLight') {}
export class ManagedPointLight extends managedLightMixin(THREE.PointLight, 'PointLight') {}
export class ManagedSpotLight extends managedLightMixin(THREE.SpotLight, 'SpotLight') {}
export class ManagedRectAreaLight extends managedLightMixin(THREE.RectAreaLight, 'RectAreaLight') {}
export class ManagedHemisphereLight extends managedLightMixin(THREE.HemisphereLight, 'HemisphereLight') {}