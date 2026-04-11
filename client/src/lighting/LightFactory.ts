import * as THREE from 'three'
import {
    ManagedAmbientLight,
    ManagedDirectionalLight,
    ManagedPointLight,
    ManagedSpotLight,
    ManagedRectAreaLight,
    ManagedHemisphereLight
} from './ManagedLights'
import { EventManager } from '../core/EventManager'
import { LightingEventTypes, type PointLightRequestEvent } from '../types/LightingEvents'

export interface LightFactoryOptions {
    name?: string
    addToScene?: boolean
    parent?: THREE.Object3D
    position?: THREE.Vector3 | [number, number, number]
}

type ManagedLight = { 
    addToParent(parent: THREE.Object3D, scene: THREE.Scene, name?: string): void
    addToScene(scene: THREE.Scene, name?: string): void
    position: THREE.Vector3
}

export class LightFactory {
    constructor(private scene: THREE.Scene) {
        // Subscribe to PointLightRequested so any system can safely request a point
        // light without reaching into the scene directly (which would bypass the
        // lighting system and cause uncontrolled shadow map recalculations).
        EventManager.getInstance().registerEventHandler(
            LightingEventTypes.PointLightRequested,
            (event: CustomEvent<PointLightRequestEvent>) => {
                const { color, intensity, distance, position, name, parent } = event.detail
                this.createPointLight(color, intensity, distance, undefined, {
                    name: name ?? 'requested-point-light',
                    addToScene: !parent,
                    parent,
                    position,
                })
            }
        )
    }

    private add<T extends ManagedLight>(light: T, options: LightFactoryOptions): T {
        if (options.position) {
            if (Array.isArray(options.position)) {
                light.position.set(...options.position)
            } else {
                light.position.copy(options.position)
            }
        }
        
        if (options.parent) {
            light.addToParent(options.parent, this.scene, options.name)
        } else if (options.addToScene !== false) {
            light.addToScene(this.scene, options.name)
        }
        return light
    }

    createAmbientLight(color?: THREE.ColorRepresentation, intensity?: number, options: LightFactoryOptions = {}) {
        return this.add(new ManagedAmbientLight(color, intensity), options)
    }

    createDirectionalLight(color?: THREE.ColorRepresentation, intensity?: number, options: LightFactoryOptions = {}) {
        return this.add(new ManagedDirectionalLight(color, intensity), options)
    }

    createPointLight(color?: THREE.ColorRepresentation, intensity?: number, distance?: number, decay?: number, options: LightFactoryOptions = {}) {
        return this.add(new ManagedPointLight(color, intensity, distance, decay), options)
    }

    createSpotLight(color?: THREE.ColorRepresentation, intensity?: number, distance?: number, angle?: number, penumbra?: number, decay?: number, options: LightFactoryOptions = {}) {
        return this.add(new ManagedSpotLight(color, intensity, distance, angle, penumbra, decay), options)
    }

    createRectAreaLight(color?: THREE.ColorRepresentation, intensity?: number, width?: number, height?: number, options: LightFactoryOptions = {}) {
        return this.add(new ManagedRectAreaLight(color, intensity, width, height), options)
    }

    createHemisphereLight(skyColor?: THREE.ColorRepresentation, groundColor?: THREE.ColorRepresentation, intensity?: number, options: LightFactoryOptions = {}) {
        return this.add(new ManagedHemisphereLight(skyColor, groundColor, intensity), options)
    }

    updateScene(scene: THREE.Scene) {
        this.scene = scene
    }
}
