/**
 * Lighting Debug Helper - Visual debugging for light coverage areas
 * 
 * Creates visual indicators showing where lights should be affecting the scene:
 * - Red spheres for point lights
 * - Red cones for spot lights  
 * - Red rectangles for rect area lights
 * - Semi-transparent to see through them
 */

import * as THREE from 'three'

export class LightingDebugHelper {
    private debugGroup: THREE.Group
    private scene: THREE.Scene

    constructor(scene: THREE.Scene) {
        this.scene = scene
        this.debugGroup = new THREE.Group()
        this.debugGroup.name = 'lighting-debug'
        this.scene.add(this.debugGroup)
    }

    /**
     * Add visual debug helper for a point light
     */
    addPointLightHelper(light: THREE.PointLight): void {
        const geometry = new THREE.SphereGeometry(light.distance || 10, 16, 12)
        const material = new THREE.MeshBasicMaterial({
            color: 0xff0000,
            transparent: true,
            opacity: 0.15,
            wireframe: true
        })
        
        const helper = new THREE.Mesh(geometry, material)
        helper.position.copy(light.position)
        helper.name = `debug-point-${light.name || 'unnamed'}`
        this.debugGroup.add(helper)

        console.log(`🔴 Added point light debug sphere at (${light.position.x.toFixed(1)}, ${light.position.y.toFixed(1)}, ${light.position.z.toFixed(1)}) radius: ${light.distance || 10}`)
    }

    /**
     * Add visual debug helper for a spot light
     */
    addSpotLightHelper(light: THREE.SpotLight): void {
        const distance = light.distance || 15
        const angle = light.angle
        
        // Create cone geometry for spot light coverage
        const radius = Math.tan(angle) * distance
        const geometry = new THREE.ConeGeometry(radius, distance, 16, 1, true)
        const material = new THREE.MeshBasicMaterial({
            color: 0xff0000,
            transparent: true,
            opacity: 0.15,
            wireframe: true,
            side: THREE.DoubleSide
        })
        
        const helper = new THREE.Mesh(geometry, material)
        helper.position.copy(light.position)
        helper.lookAt(light.target.position)
        helper.rotateX(-Math.PI / 2) // Align cone with light direction
        helper.name = `debug-spot-${light.name || 'unnamed'}`
        this.debugGroup.add(helper)

        console.log(`🔴 Added spot light debug cone at (${light.position.x.toFixed(1)}, ${light.position.y.toFixed(1)}, ${light.position.z.toFixed(1)}) angle: ${(angle * 180 / Math.PI).toFixed(1)}°`)
    }

    /**
     * Add visual debug helper for a RectArea light
     */
    addRectAreaLightHelper(light: THREE.RectAreaLight): void {
        const geometry = new THREE.PlaneGeometry(light.width, light.height)
        const material = new THREE.MeshBasicMaterial({
            color: 0xff0000,
            transparent: true,
            opacity: 0.2,
            side: THREE.DoubleSide
        })
        
        const helper = new THREE.Mesh(geometry, material)
        helper.position.copy(light.position)
        helper.rotation.copy(light.rotation)
        helper.name = `debug-rectarea-${light.name || 'unnamed'}`
        this.debugGroup.add(helper)

        console.log(`🔴 Added RectArea light debug plane at (${light.position.x.toFixed(1)}, ${light.position.y.toFixed(1)}, ${light.position.z.toFixed(1)}) size: ${light.width}x${light.height}`)
    }

    /**
     * Add visual debug helper for a directional light
     */
    addDirectionalLightHelper(light: THREE.DirectionalLight): void {
        // Create arrow showing light direction
        const origin = light.position.clone()
        const direction = new THREE.Vector3(0, -1, 0) // Directional lights point down
        if (light.target) {
            direction.subVectors(light.target.position, light.position).normalize()
        }
        
        const arrowHelper = new THREE.ArrowHelper(direction, origin, 5, 0xff0000, 1, 1)
        arrowHelper.name = `debug-directional-${light.name || 'unnamed'}`
        this.debugGroup.add(arrowHelper)

        console.log(`🔴 Added directional light debug arrow at (${light.position.x.toFixed(1)}, ${light.position.y.toFixed(1)}, ${light.position.z.toFixed(1)})`)
    }

    /**
     * Automatically add debug helpers for all lights in a group
     */
    addHelpersForLightGroup(lightGroup: THREE.Group): void {
        console.log(`🔍 Analyzing light group "${lightGroup.name}" for debug helpers...`)
        
        lightGroup.traverse((child) => {
            if (child instanceof THREE.PointLight) {
                this.addPointLightHelper(child)
            } else if (child instanceof THREE.SpotLight) {
                this.addSpotLightHelper(child)
            } else if (child instanceof THREE.RectAreaLight) {
                this.addRectAreaLightHelper(child)
            } else if (child instanceof THREE.DirectionalLight) {
                this.addDirectionalLightHelper(child)
            }
        })
    }

    /**
     * Clear all debug helpers
     */
    clearHelpers(): void {
        while (this.debugGroup.children.length > 0) {
            const child = this.debugGroup.children[0]
            this.debugGroup.remove(child)
            
            // Dispose geometry and materials
            if (child instanceof THREE.Mesh) {
                child.geometry.dispose()
                if (child.material instanceof THREE.Material) {
                    child.material.dispose()
                }
            }
        }
        console.log('🔴 Cleared all lighting debug helpers')
    }

    /**
     * Toggle debug helper visibility
     */
    setVisible(visible: boolean): void {
        this.debugGroup.visible = visible
        console.log(`🔴 Debug helpers ${visible ? 'shown' : 'hidden'}`)
    }

    /**
     * Dispose of all resources
     */
    dispose(): void {
        this.clearHelpers()
        this.scene.remove(this.debugGroup)
    }
}