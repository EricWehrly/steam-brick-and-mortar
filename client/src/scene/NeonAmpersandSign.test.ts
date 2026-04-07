import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createNeonAmpersandSign, NeonAmpersandSign } from './NeonAmpersandSign';

describe('NeonAmpersandSign', () => {
    it('factory function returns a THREE.Group', () => {
        const group = createNeonAmpersandSign();
        expect(group).toBeInstanceOf(THREE.Group);
    });

    it('class instance creates a group with at least one Mesh child', () => {
        const sign = new NeonAmpersandSign();
        const group = sign.getGroup();
        
        const meshCount = group.children.filter(child => child instanceof THREE.Mesh).length;
        expect(meshCount).toBeGreaterThanOrEqual(1);
    });

    it('has a specific name identifying it as the neon sign', () => {
        const group = createNeonAmpersandSign();
        expect(group.name).toBe('NeonAmpersandSign');
    });

    it('contains a neon tube mesh with emissive material properties', () => {
        const group = createNeonAmpersandSign();
        const mesh = group.getObjectByName('NeonTube') as THREE.Mesh;
        expect(mesh).toBeDefined();
        
        const material = mesh.material as THREE.MeshStandardMaterial;
        expect(material.emissive).toBeDefined();
        expect(material.emissiveIntensity).toBeGreaterThan(0);
    });
});
