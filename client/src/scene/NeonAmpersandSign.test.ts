import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { NeonAmpersandSign } from './NeonAmpersandSign';

// Mock THREE.js components we're using
vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>();
  return {
    ...actual,
    Vector3: class {
      x = 0; y = 0; z = 0;
      constructor(x?: number, y?: number, z?: number) {
        this.x = x || 0;
        this.y = y || 0;
        this.z = z || 0;
      }
      set(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z; return this; }
      copy(v: { x: number, y: number, z: number }) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
    },
    Group: class {
      position = { x: 0, y: 0, z: 0, copy: function(v: any) { this.x = v.x; this.y = v.y; this.z = v.z; } };
      scale = { x: 1, y: 1, z: 1, set: function(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z; } };
      add = vi.fn();
    },
    Mesh: class {
      constructor(geometry: any, material: any) {
        this.geometry = geometry;
        this.material = material;
      }
      geometry: any;
      material: any;
    },
    MeshStandardMaterial: class {
      constructor(params: any) {
        this.color = params.color;
        this.emissive = params.emissive;
        this.emissiveIntensity = params.emissiveIntensity;
      }
      color: number;
      emissive: number;
      emissiveIntensity: number;
    },
    TubeGeometry: vi.fn(),
    CatmullRomCurve3: vi.fn(),
  };
});

describe('NeonAmpersandSign', () => {
  it('should create a mesh with the correct position and color', () => {
    const config = {
      color: 0xff00ff,
      position: new THREE.Vector3(1, 2, 3),
      scale: 2,
    };

    const sign = new NeonAmpersandSign(config);

    expect(sign.mesh).toBeDefined();
    expect(sign.mesh.position.x).toBe(1);
    expect(sign.mesh.position.y).toBe(2);
    expect(sign.mesh.position.z).toBe(3);
    
    expect(sign.mesh.scale.x).toBe(2);
    expect(sign.mesh.scale.y).toBe(2);
    expect(sign.mesh.scale.z).toBe(2);

    // Verify the internal mesh was added
    expect(sign.mesh.add).toHaveBeenCalled();
    
    // Verify the material properties (from the first call to add)
    const addedMesh = vi.mocked(sign.mesh.add).mock.calls[0][0] as any;
    expect(addedMesh.material.color).toBe(0xff00ff);
    expect(addedMesh.material.emissive).toBe(0xff00ff);
  });

  it('should use default scale of 1 if not provided', () => {
    const config = {
      color: 0x00ffff,
      position: new THREE.Vector3(0, 0, 0),
    };

    const sign = new NeonAmpersandSign(config);
    expect(sign.mesh.scale.x).toBe(1);
  });
});
