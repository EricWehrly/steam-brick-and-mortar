import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { WebXRManager } from '../../../src/webxr/WebXRManager';
import * as THREE from 'three';

// Mock Three.js WebGLRenderer
const createMockRenderer = () => ({
  xr: {
    enabled: false,
    setSession: vi.fn().mockResolvedValue(undefined),
  }
}) as unknown as THREE.WebGLRenderer;

describe('WebXRManager Unit Tests', () => {
  let manager: WebXRManager;
  let mockRenderer: THREE.WebGLRenderer;
  let originalNavigator: any;

  beforeEach(() => {
    // Save the original navigator
    originalNavigator = (globalThis as any).navigator;
    
    // Reset all mocks
    vi.clearAllMocks();
    
    mockRenderer = createMockRenderer();
    manager = new WebXRManager();
    manager.setRenderer(mockRenderer);
  });

  afterEach(() => {
    // Restore the original navigator
    (globalThis as any).navigator = originalNavigator;
  });

  describe('Initialization', () => {
    it('should initialize with a renderer', () => {
      expect(() => manager.setRenderer(mockRenderer)).not.toThrow();
    });

    it('should handle capabilities check when WebXR is not available', async () => {
      // Mock navigator without xr
      (globalThis as any).navigator = {} as any;
      
      const capabilities = await manager.checkCapabilities();
      
      expect(capabilities.hasNavigatorXR).toBe(false);
      expect(capabilities.isSupported).toBe(false);
      expect(capabilities.supportsImmersiveVR).toBe(false);
    });
  });

  describe('Basic Functionality', () => {
    it('should get initial capabilities', () => {
      const capabilities = manager.getCapabilities();
      
      expect(capabilities).toHaveProperty('isSupported');
      expect(capabilities).toHaveProperty('supportsImmersiveVR');
      expect(capabilities).toHaveProperty('hasNavigatorXR');
    });

    it('should track session state', () => {
      expect(manager.isSessionActive()).toBe(false);
      expect(manager.getCurrentSession()).toBeNull();
    });

    it('should handle VR session start when WebXR is not available', async () => {
      (globalThis as any).navigator = {} as any;
      
      await expect(manager.startVRSession()).rejects.toThrow('WebXR not available');
    });

    it('should handle VR session start when renderer is not set', async () => {
      const managerWithoutRenderer = new WebXRManager();
      
      await expect(managerWithoutRenderer.startVRSession())
        .rejects.toThrow('Renderer not set. Call setRenderer() first.');
    });
  });

  describe('Callback Handling', () => {
    it('should accept and update callbacks', () => {
      const callbacks = {
        onSessionStart: vi.fn(),
        onSessionEnd: vi.fn(),
        onError: vi.fn(),
      };
      
      expect(() => manager.setCallbacks(callbacks)).not.toThrow();
    });

    it('should initialize with callbacks', () => {
      const callbacks = {
        onSessionStart: vi.fn(),
      };
      
      const managerWithCallbacks = new WebXRManager(callbacks);
      expect(managerWithCallbacks).toBeDefined();
    });
  });

  describe('Resource Management', () => {
    it('should dispose resources properly', () => {
      expect(() => manager.dispose()).not.toThrow();
      
      // After dispose, session should be null
      expect(manager.getCurrentSession()).toBeNull();
    });

    it('should handle ending session when none is active', async () => {
      await expect(manager.endVRSession()).resolves.toBeUndefined();
    });
  });

  describe('WebXR API Integration', () => {
    it('should handle capabilities check with mocked WebXR', async () => {
      // Mock navigator with xr
      (globalThis as any).navigator = {
        xr: {
          isSessionSupported: vi.fn().mockResolvedValue(true),
        }
      } as any;
      
      const capabilities = await manager.checkCapabilities();
      
      expect(capabilities.hasNavigatorXR).toBe(true);
      expect(capabilities.isSupported).toBe(true);
      expect(capabilities.supportsImmersiveVR).toBe(true);
    });

    it('should handle capabilities check when VR sessions are not supported', async () => {
      (globalThis as any).navigator = {
        xr: {
          isSessionSupported: vi.fn().mockResolvedValue(false),
        }
      } as any;
      
      const capabilities = await manager.checkCapabilities();
      
      expect(capabilities.hasNavigatorXR).toBe(true);
      expect(capabilities.isSupported).toBe(false);
      expect(capabilities.supportsImmersiveVR).toBe(false);
    });

    it('should handle errors during capability detection', async () => {
      (globalThis as any).navigator = {
        xr: {
          isSessionSupported: vi.fn().mockRejectedValue(new Error('WebXR Error')),
        }
      } as any;
      
      const capabilities = await manager.checkCapabilities();
      
      expect(capabilities.isSupported).toBe(false);
      expect(capabilities.supportsImmersiveVR).toBe(false);
    });
  });
});
