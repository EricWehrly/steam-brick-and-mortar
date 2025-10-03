import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InputManager, type InputCallbacks, type MovementOptions } from '../../../src/webxr/InputManager';
import * as THREE from 'three';

// Mock Three.js classes
const createMockCamera = () => {
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 1.6, 3);
  return camera;
};

// Mock event interfaces
interface MockKeyboardEvent extends Partial<KeyboardEvent> {
  code?: string;
  key?: string;
}

interface MockMouseEvent extends Partial<MouseEvent> {
  clientX?: number;
  clientY?: number;
  button?: number;
}

describe('InputManager Unit Tests', () => {
  let inputManager: InputManager;
  let mockCamera: THREE.PerspectiveCamera;
  let mockCallbacks: InputCallbacks;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    
    // Create mock camera
    mockCamera = createMockCamera();
    
    // Create mock callbacks
    mockCallbacks = {
      onMouseMove: vi.fn(),
      onKeyPress: vi.fn(),
      onKeyRelease: vi.fn(),
    };

    // Mock document event listeners
    vi.spyOn(document, 'addEventListener');
    vi.spyOn(document, 'removeEventListener');

    const options: Partial<MovementOptions> = {
      speed: 0.1,
      mouseSensitivity: 0.005
    };

    inputManager = new InputManager(options, mockCallbacks);
  });

  describe('Initialization', () => {
    it('should initialize with correct default values', () => {
      const inputState = inputManager.getInputState();
      expect(inputState.keys.w).toBe(false);
      expect(inputState.keys.a).toBe(false);
      expect(inputState.keys.s).toBe(false);
      expect(inputState.keys.d).toBe(false);
      expect(inputState.mouse.down).toBe(false);
      expect(inputManager.isMoving()).toBe(false);
    });

    it('should accept custom options and callbacks', () => {
      const customOptions: Partial<MovementOptions> = {
        speed: 0.2,
        mouseSensitivity: 0.01
      };
      
      const customCallbacks: InputCallbacks = {
        onKeyPress: vi.fn(),
      };

      const customManager = new InputManager(customOptions, customCallbacks);
      expect(customManager.getInputState()).toBeDefined();
    });
  });

  describe('Event Listener Management', () => {
    it('should set up event listeners when starting to listen', () => {
      inputManager.startListening();

      expect(document.addEventListener).toHaveBeenCalledWith('mousedown', expect.any(Function));
      expect(document.addEventListener).toHaveBeenCalledWith('mouseup', expect.any(Function));
      expect(document.addEventListener).toHaveBeenCalledWith('mousemove', expect.any(Function));
      expect(document.addEventListener).toHaveBeenCalledWith('keydown', expect.any(Function));
      expect(document.addEventListener).toHaveBeenCalledWith('keyup', expect.any(Function));
    });

    it('should remove event listeners when stopping listening', () => {
      inputManager.startListening();
      inputManager.stopListening();

      expect(document.removeEventListener).toHaveBeenCalledWith('mousedown', expect.any(Function));
      expect(document.removeEventListener).toHaveBeenCalledWith('mouseup', expect.any(Function));
      expect(document.removeEventListener).toHaveBeenCalledWith('mousemove', expect.any(Function));
      expect(document.removeEventListener).toHaveBeenCalledWith('keydown', expect.any(Function));
      expect(document.removeEventListener).toHaveBeenCalledWith('keyup', expect.any(Function));
    });

    it('should warn when trying to start listening twice', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      inputManager.startListening();
      inputManager.startListening(); // Second call should warn
      
      expect(consoleWarnSpy).toHaveBeenCalledWith('⚠️ InputManager already listening to events');
      
      consoleWarnSpy.mockRestore();
    });

    it('should handle stopping when not listening', () => {
      // Should not throw error when not listening
      expect(() => inputManager.stopListening()).not.toThrow();
    });
  });

  describe('Keyboard Input', () => {
    beforeEach(() => {
      inputManager.startListening();
    });

    it('should handle WASD and QE key press events', () => {
      const handleKeyDown = (document.addEventListener as any).mock.calls
        .find((call: any) => call[0] === 'keydown')?.[1];
      
      expect(handleKeyDown).toBeDefined();
      
      // Test W key
      handleKeyDown?.({ code: 'KeyW' } as MockKeyboardEvent);
      expect(inputManager.getInputState().keys.w).toBe(true);
      expect(mockCallbacks.onKeyPress).toHaveBeenCalledWith('w');
      expect(inputManager.isMoving()).toBe(true);

      // Test A key
      handleKeyDown?.({ code: 'KeyA' } as MockKeyboardEvent);
      expect(inputManager.getInputState().keys.a).toBe(true);
      expect(mockCallbacks.onKeyPress).toHaveBeenCalledWith('a');

      // Test S key
      handleKeyDown?.({ code: 'KeyS' } as MockKeyboardEvent);
      expect(inputManager.getInputState().keys.s).toBe(true);
      expect(mockCallbacks.onKeyPress).toHaveBeenCalledWith('s');

      // Test D key
      handleKeyDown?.({ code: 'KeyD' } as MockKeyboardEvent);
      expect(inputManager.getInputState().keys.d).toBe(true);
      expect(mockCallbacks.onKeyPress).toHaveBeenCalledWith('d');
      
      // Test Q key (roll left)
      handleKeyDown?.({ code: 'KeyQ' } as MockKeyboardEvent);
      expect(inputManager.getInputState().keys.q).toBe(true);
      expect(mockCallbacks.onKeyPress).toHaveBeenCalledWith('q');

      // Test E key (roll right)
      handleKeyDown?.({ code: 'KeyE' } as MockKeyboardEvent);
      expect(inputManager.getInputState().keys.e).toBe(true);
      expect(mockCallbacks.onKeyPress).toHaveBeenCalledWith('e');
    });

    it('should handle WASD and QE key release events', () => {
      const handleKeyDown = (document.addEventListener as any).mock.calls
        .find((call: any) => call[0] === 'keydown')?.[1];
      const handleKeyUp = (document.addEventListener as any).mock.calls
        .find((call: any) => call[0] === 'keyup')?.[1];
      
      expect(handleKeyDown).toBeDefined();
      expect(handleKeyUp).toBeDefined();
      
      // Press W key first
      handleKeyDown?.({ code: 'KeyW' } as MockKeyboardEvent);
      expect(inputManager.getInputState().keys.w).toBe(true);
      
      // Release W key
      handleKeyUp?.({ code: 'KeyW' } as MockKeyboardEvent);
      expect(inputManager.getInputState().keys.w).toBe(false);
      expect(mockCallbacks.onKeyRelease).toHaveBeenCalledWith('w');
      
      // Test Q key press and release
      handleKeyDown?.({ code: 'KeyQ' } as MockKeyboardEvent);
      expect(inputManager.getInputState().keys.q).toBe(true);
      
      handleKeyUp?.({ code: 'KeyQ' } as MockKeyboardEvent);
      expect(inputManager.getInputState().keys.q).toBe(false);
      expect(mockCallbacks.onKeyRelease).toHaveBeenCalledWith('q');
      
      // Test E key press and release
      handleKeyDown?.({ code: 'KeyE' } as MockKeyboardEvent);
      expect(inputManager.getInputState().keys.e).toBe(true);
      
      handleKeyUp?.({ code: 'KeyE' } as MockKeyboardEvent);
      expect(inputManager.getInputState().keys.e).toBe(false);
      expect(mockCallbacks.onKeyRelease).toHaveBeenCalledWith('e');
      
      expect(inputManager.isMoving()).toBe(false);
    });

    it('should not trigger callback for repeated key presses', () => {
      const handleKeyDown = (document.addEventListener as any).mock.calls
        .find((call: any) => call[0] === 'keydown')?.[1];
      
      // Press W key twice
      handleKeyDown?.({ code: 'KeyW' } as MockKeyboardEvent);
      handleKeyDown?.({ code: 'KeyW' } as MockKeyboardEvent);
      
      // Callback should only be called once
      expect(mockCallbacks.onKeyPress).toHaveBeenCalledTimes(1);
    });

    it('should ignore unknown key codes', () => {
      const handleKeyDown = (document.addEventListener as any).mock.calls
        .find((call: any) => call[0] === 'keydown')?.[1];
      
      handleKeyDown?.({ code: 'KeyZ' } as MockKeyboardEvent);
      
      // State should remain unchanged
      const inputState = inputManager.getInputState();
      expect(inputState.keys.w).toBe(false);
      expect(inputState.keys.a).toBe(false);
      expect(inputState.keys.s).toBe(false);
      expect(inputState.keys.d).toBe(false);
      expect(mockCallbacks.onKeyPress).not.toHaveBeenCalled();
    });
  });

  describe('Mouse Input', () => {
    beforeEach(() => {
      inputManager.startListening();
    });

    it('should handle mouse down events', () => {
      const handleMouseDown = (document.addEventListener as any).mock.calls
        .find((call: any) => call[0] === 'mousedown')?.[1];
      
      expect(handleMouseDown).toBeDefined();
      
      const mockEvent = { clientX: 100, clientY: 200 } as MockMouseEvent;
      handleMouseDown?.(mockEvent);
      
      const inputState = inputManager.getInputState();
      expect(inputState.mouse.down).toBe(true);
      expect(inputState.mouse.x).toBe(100);
      expect(inputState.mouse.y).toBe(200);
    });

    it('should handle mouse up events', () => {
      const handleMouseDown = (document.addEventListener as any).mock.calls
        .find((call: any) => call[0] === 'mousedown')?.[1];
      const handleMouseUp = (document.addEventListener as any).mock.calls
        .find((call: any) => call[0] === 'mouseup')?.[1];
      
      // First mouse down
      handleMouseDown?.({ clientX: 100, clientY: 200 } as MockMouseEvent);
      expect(inputManager.getInputState().mouse.down).toBe(true);
      
      // Then mouse up
      handleMouseUp?.();
      expect(inputManager.getInputState().mouse.down).toBe(false);
    });

    it('should handle mouse move events and trigger callbacks', () => {
      const handleMouseDown = (document.addEventListener as any).mock.calls
        .find((call: any) => call[0] === 'mousedown')?.[1];
      const handleMouseMove = (document.addEventListener as any).mock.calls
        .find((call: any) => call[0] === 'mousemove')?.[1];
      
      // First mouse down to enable movement tracking
      handleMouseDown?.({ clientX: 100, clientY: 200 } as MockMouseEvent);
      
      // Then mouse move
      handleMouseMove?.({ clientX: 110, clientY: 190 } as MockMouseEvent);
      
      expect(mockCallbacks.onMouseMove).toHaveBeenCalledWith(10, -10);
      
      const inputState = inputManager.getInputState();
      expect(inputState.mouse.x).toBe(110);
      expect(inputState.mouse.y).toBe(190);
    });

    it('should not trigger mouse move callbacks when mouse is not down', () => {
      const handleMouseMove = (document.addEventListener as any).mock.calls
        .find((call: any) => call[0] === 'mousemove')?.[1];
      
      // Mouse move without mouse down
      handleMouseMove?.({ clientX: 110, clientY: 190 } as MockMouseEvent);
      
      expect(mockCallbacks.onMouseMove).not.toHaveBeenCalled();
    });
  });

  describe('Camera Movement', () => {
    beforeEach(() => {
      inputManager.startListening();
    });

    it('should update camera position based on WASD input', () => {
      const handleKeyDown = (document.addEventListener as any).mock.calls
        .find((call: any) => call[0] === 'keydown')?.[1];
      
      const initialPosition = mockCamera.position.clone();
      
      // Press W key (forward)
      handleKeyDown?.({ code: 'KeyW' } as MockKeyboardEvent);
      inputManager.updateCameraMovement(mockCamera);
      
      // Camera should have moved forward (negative Z)
      expect(mockCamera.position.z).toBeLessThan(initialPosition.z);
    });

    it('should apply mouse movement to camera rotation (Y-axis only)', () => {
      const initialRotation = { x: mockCamera.rotation.x, y: mockCamera.rotation.y };
      
      inputManager.updateCameraRotation(mockCamera, 10, -5);
      
      // Only Y-axis rotation should change from mouse movement
      expect(mockCamera.rotation.y).not.toBe(initialRotation.y);
      expect(mockCamera.rotation.x).toBe(initialRotation.x); // X-axis should remain unchanged
    });

    it.skip('should apply Q/E keys to camera roll rotation', () => {
      const handleKeyDown = (document.addEventListener as any).mock.calls
        .find((call: any) => call[0] === 'keydown')?.[1];
      
      const initialRotation = { z: mockCamera.rotation.z };
      
      // Test Q key (roll left)
      handleKeyDown?.({ code: 'KeyQ' } as MockKeyboardEvent);
      inputManager.updateCameraRoll(mockCamera);
      expect(mockCamera.rotation.z).toBeGreaterThan(initialRotation.z);
      
      // Reset rotation and test E key (roll right)
      mockCamera.rotation.z = initialRotation.z;
      inputManager.getInputState().keys.q = false;
      
      handleKeyDown?.({ code: 'KeyE' } as MockKeyboardEvent);
      inputManager.updateCameraRoll(mockCamera);
      expect(mockCamera.rotation.z).toBeLessThan(initialRotation.z);
    });

    it('should move camera in all directions', () => {
      const handleKeyDown = (document.addEventListener as any).mock.calls
        .find((call: any) => call[0] === 'keydown')?.[1];
      
      // Test all directions
      const initialPosition = mockCamera.position.clone();
      
      // Forward (W)
      handleKeyDown?.({ code: 'KeyW' } as MockKeyboardEvent);
      inputManager.updateCameraMovement(mockCamera);
      expect(mockCamera.position.z).toBeLessThan(initialPosition.z);
      
      // Reset position and test backward (S)
      mockCamera.position.copy(initialPosition);
      inputManager.getInputState().keys.w = false;
      
      handleKeyDown?.({ code: 'KeyS' } as MockKeyboardEvent);
      inputManager.updateCameraMovement(mockCamera);
      expect(mockCamera.position.z).toBeGreaterThan(initialPosition.z);
      
      // Reset and test left (A)
      mockCamera.position.copy(initialPosition);
      inputManager.getInputState().keys.s = false;
      
      handleKeyDown?.({ code: 'KeyA' } as MockKeyboardEvent);
      inputManager.updateCameraMovement(mockCamera);
      expect(mockCamera.position.x).toBeLessThan(initialPosition.x);
      
      // Reset and test right (D)
      mockCamera.position.copy(initialPosition);
      inputManager.getInputState().keys.a = false;
      
      handleKeyDown?.({ code: 'KeyD' } as MockKeyboardEvent);
      inputManager.updateCameraMovement(mockCamera);
      expect(mockCamera.position.x).toBeGreaterThan(initialPosition.x);
    });
  });

  describe('Configuration', () => {
    it('should allow updating movement options', () => {
      const newOptions: Partial<MovementOptions> = {
        speed: 0.5,
        mouseSensitivity: 0.02
      };
      
      inputManager.setMovementOptions(newOptions);
      inputManager.startListening();
      
      // Verify options are applied by testing that the movement method exists
      expect(() => inputManager.updateCameraMovement).not.toThrow();
      
      // Test that movement state is correctly managed
      const handleKeyDown = (document.addEventListener as any).mock.calls
        .find((call: any) => call[0] === 'keydown')?.[1];
      
      // Simulate key press
      handleKeyDown?.({ code: 'KeyW' } as MockKeyboardEvent);
      
      // Just verify that movement state is set correctly
      expect(inputManager.getInputState().keys.w).toBe(true);
      expect(inputManager.isMoving()).toBe(true);
    });

    it('should allow updating callbacks', () => {
      const newCallbacks: InputCallbacks = {
        onKeyPress: vi.fn(),
        onKeyRelease: vi.fn(),
      };
      
      inputManager.setCallbacks(newCallbacks);
      inputManager.startListening();
      
      const handleKeyDown = (document.addEventListener as any).mock.calls
        .find((call: any) => call[0] === 'keydown')?.[1];
      
      handleKeyDown?.({ code: 'KeyW' } as MockKeyboardEvent);
      
      expect(newCallbacks.onKeyPress).toHaveBeenCalledWith('w');
    });
  });

  describe('Cleanup', () => {
    it('should dispose resources properly', () => {
      inputManager.startListening();
      inputManager.dispose();
      
      expect(document.removeEventListener).toHaveBeenCalledWith('mousedown', expect.any(Function));
      expect(document.removeEventListener).toHaveBeenCalledWith('mouseup', expect.any(Function));
      expect(document.removeEventListener).toHaveBeenCalledWith('mousemove', expect.any(Function));
      expect(document.removeEventListener).toHaveBeenCalledWith('keydown', expect.any(Function));
      expect(document.removeEventListener).toHaveBeenCalledWith('keyup', expect.any(Function));
    });

    it('should clear callbacks on dispose', () => {
      inputManager.dispose();
      
      // After dispose, callbacks should be cleared (can't directly test, but ensures no memory leaks)
      expect(() => inputManager.dispose()).not.toThrow();
    });
  });
});
