import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { LightFactory } from '../../../src/lighting/LightFactory';
import { EventManager } from '../../../src/core/EventManager';

describe('LightFactory', () => {
  let scene: THREE.Scene;
  let eventManager: EventManager;
  let factory: LightFactory;

  beforeEach(() => {
    scene = new THREE.Scene();
    eventManager = EventManager.getInstance();
    factory = new LightFactory(scene);
  });

  describe('position parameter', () => {
    it('should set position using Vector3', () => {
      const position = new THREE.Vector3(1, 2, 3);
      const light = factory.createDirectionalLight(undefined, undefined, { position });
      
      expect(light.position.x).toBe(1);
      expect(light.position.y).toBe(2);
      expect(light.position.z).toBe(3);
    });

    it('should set position using tuple', () => {
      const light = factory.createDirectionalLight(undefined, undefined, { 
        position: [5, 10, 15] 
      });
      
      expect(light.position.x).toBe(5);
      expect(light.position.y).toBe(10);
      expect(light.position.z).toBe(15);
    });

    it('should work without position parameter', () => {
      const light = factory.createDirectionalLight();
      
      // DirectionalLight has default position (0, 1, 0) in Three.js
      expect(light.position.x).toBe(0);
      expect(light.position.y).toBe(1);
      expect(light.position.z).toBe(0);
    });

    it('should emit light created event with correct scene', () => {
      let eventEmitted = false;
      let eventScene: THREE.Scene | undefined;

      eventManager.registerEventHandler('lighting:created', (event: any) => {
        eventEmitted = true;
        eventScene = event.detail.scene;
      });

      factory.createDirectionalLight(undefined, undefined, { position: [1, 2, 3] });

      expect(eventEmitted).toBe(true);
      expect(eventScene).toBe(scene);
    });
  });

  describe('light types', () => {
    it('should create different light types with position', () => {
      const position = [1, 2, 3] as [number, number, number];
      
      const directional = factory.createDirectionalLight(undefined, undefined, { position });
      const point = factory.createPointLight(undefined, undefined, undefined, undefined, { position });
      const spot = factory.createSpotLight(undefined, undefined, undefined, undefined, undefined, undefined, { position });

      expect(directional).toBeInstanceOf(THREE.DirectionalLight);
      expect(point).toBeInstanceOf(THREE.PointLight);
      expect(spot).toBeInstanceOf(THREE.SpotLight);

      [directional, point, spot].forEach(light => {
        expect(light.position.x).toBe(1);
        expect(light.position.y).toBe(2);
        expect(light.position.z).toBe(3);
      });
    });
  });
});