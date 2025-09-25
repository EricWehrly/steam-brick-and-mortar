import * as THREE from 'three'
import {
    ManagedAmbientLight,
    ManagedDirectionalLight,
    ManagedPointLight,
    ManagedSpotLight,
    ManagedRectAreaLight,
    ManagedHemisphereLight
} from './ManagedLights'

export interface LightFactoryOptions {
    name?: string
    addToScene?: boolean
    parent?: THREE.Object3D
    position?: THREE.Vector3 | [number, number, number]
}

type ManagedLight = { 
    addToParent(parent: THREE.Object3D, scene: THREE.Scene, name?: string): any
    addToScene(scene: THREE.Scene, name?: string): any
    position: THREE.Vector3
}

export class LightFactory {
    constructor(private scene: THREE.Scene) {}

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