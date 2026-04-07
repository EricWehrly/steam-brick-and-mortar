import * as THREE from 'three';

/**
 * NeonAmpersandSign (SPIKE / PROTOTYPE)
 * 
 * This is an isolated spike for a neon sign implementation using CatmullRomCurve3 and TubeGeometry.
 * It is NOT yet wired into the main scene flow.
 */
export class NeonAmpersandSign {
    private group: THREE.Group;

    constructor() {
        this.group = new THREE.Group();
        this.group.name = 'NeonAmpersandSign';
        this.createSign();
    }

    private createSign(): void {
        // Ampersand-like curve points
        const points = [
            new THREE.Vector3(0.5, -0.5, 0),
            new THREE.Vector3(0.8, -0.2, 0),
            new THREE.Vector3(0.4, 0.2, 0),
            new THREE.Vector3(-0.4, -0.6, 0),
            new THREE.Vector3(-0.6, -0.2, 0),
            new THREE.Vector3(0, 0.4, 0),
            new THREE.Vector3(-0.2, 0.7, 0),
            new THREE.Vector3(0.2, 0.7, 0),
            new THREE.Vector3(0, 0.4, 0),
            new THREE.Vector3(0.6, -0.4, 0),
            new THREE.Vector3(0.8, -0.6, 0)
        ];

        const curve = new THREE.CatmullRomCurve3(points);
        const geometry = new THREE.TubeGeometry(curve, 64, 0.05, 8, false);
        
        // Bloom-friendly emissive material
        const material = new THREE.MeshStandardMaterial({
            color: 0xff00ff,
            emissive: 0xff00ff,
            emissiveIntensity: 5.0,
            roughness: 0.2,
            metalness: 0.5
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = 'NeonTube';
        this.group.add(mesh);

        // Add a point light for local glow effect (optional, but helps spike visualization)
        const light = new THREE.PointLight(0xff00ff, 1, 3);
        light.position.set(0, 0, 0.2);
        this.group.add(light);
    }

    public getGroup(): THREE.Group {
        return this.group;
    }
}

/**
 * Factory function for easier consumption
 */
export function createNeonAmpersandSign(): THREE.Group {
    return new NeonAmpersandSign().getGroup();
}
