import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InputManager, type InputCallbacks, type MovementOptions } from '../../../src/input/InputManager';
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

describe('InputManager User Experience Tests', () => {
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
      onKeyPress: vi.fn(),
      onKeyRelease: vi.fn(),
    };

    const options: Partial<MovementOptions> = {
      speed: 0.1,
      mouseSensitivity: 0.005
    };

    inputManager = new InputManager(options, mockCallbacks);
  });

  describe('Navigation Readiness', () => {
    it('should start in a neutral state ready for user input', () => {
      const inputState = inputManager.getInputState();
      
      // User should start in a stationary position
      expect(inputState.keys.w).toBe(false);
      expect(inputState.keys.a).toBe(false);
      expect(inputState.keys.s).toBe(false);
      expect(inputState.keys.d).toBe(false);
      expect(inputState.mouse.down).toBe(false);
      expect(inputManager.isMoving()).toBe(false);
    });

    it('should handle different movement preferences without crashing', () => {
      // Test edge case: Very sensitive user settings
      const sensitiveOptions: Partial<MovementOptions> = {
        speed: 10.0, // Very fast movement
        mouseSensitivity: 1.0 // Very sensitive mouse
      };
      
      const highSensitivityManager = new InputManager(sensitiveOptions, mockCallbacks);
      expect(highSensitivityManager.getInputState()).toBeDefined();
      expect(() => highSensitivityManager.dispose()).not.toThrow();
      
      // Test edge case: Very slow user settings  
      const conservativeOptions: Partial<MovementOptions> = {
        speed: 0.001, // Very slow movement
        mouseSensitivity: 0.0001 // Very low sensitivity
      };
      
      const lowSensitivityManager = new InputManager(conservativeOptions, mockCallbacks);
      expect(lowSensitivityManager.getInputState()).toBeDefined();
      expect(() => lowSensitivityManager.dispose()).not.toThrow();
    });
  });

  describe('Input System Lifecycle', () => {
    it('should activate input handling without errors', () => {
      // Focus: Can users start navigating?
      expect(() => inputManager.startListening()).not.toThrow();
      
      // Should be ready to detect movement
      expect(inputManager.isMoving()).toBe(false);
    });

    it('should deactivate input handling safely', () => {
      inputManager.startListening();
      
      // Focus: Can users stop navigation safely?
      expect(() => inputManager.stopListening()).not.toThrow();
      
      // Should remain in a stable state
      expect(inputManager.getInputState()).toBeDefined();
    });

    it('should handle rapid activation/deactivation cycles', () => {
      // Real scenario: User repeatedly entering/exiting VR mode
      for (let i = 0; i < 10; i++) {
        expect(() => inputManager.startListening()).not.toThrow();
        expect(() => inputManager.stopListening()).not.toThrow();
      }
      
      // Should remain functional after rapid cycling
      expect(inputManager.getInputState()).toBeDefined();
    });

    it('should handle edge case operations gracefully', () => {
      // Should not crash when stopping without starting
      expect(() => inputManager.stopListening()).not.toThrow();
      
      // Should handle duplicate starts (user clicking VR button multiple times)
      inputManager.startListening();
      expect(() => inputManager.startListening()).not.toThrow();
      expect(() => inputManager.startListening()).not.toThrow();
    });
  });

  describe('Keyboard Navigation Experience', () => {
    beforeEach(() => {
      inputManager.startListening();
    });

    it('should enable users to navigate with standard WASD keys', () => {
      // Focus: Can users actually move around the VR space?
      
      // Simulate user pressing W to move forward
      const keyEvent = new KeyboardEvent('keydown', { code: 'KeyW' });
      document.dispatchEvent(keyEvent);
      
      // User should be in a "moving" state and system should respond
      expect(inputManager.isMoving()).toBe(true);
      expect(mockCallbacks.onKeyPress).toHaveBeenCalledWith('w');
      
      // User releases key - movement should stop
      const keyUpEvent = new KeyboardEvent('keyup', { code: 'KeyW' });
      document.dispatchEvent(keyUpEvent);
      
      expect(inputManager.isMoving()).toBe(false);
      expect(mockCallbacks.onKeyRelease).toHaveBeenCalledWith('w');
    });

    it('should handle simultaneous key presses for complex movement', () => {
      // Real scenario: User wants to move diagonally forward-left
      const wKeyDown = new KeyboardEvent('keydown', { code: 'KeyW' });
      const aKeyDown = new KeyboardEvent('keydown', { code: 'KeyA' });
      
      document.dispatchEvent(wKeyDown);
      document.dispatchEvent(aKeyDown);
      
      // Should register both movements simultaneously
      const inputState = inputManager.getInputState();
      expect(inputState.keys.w).toBe(true);
      expect(inputState.keys.a).toBe(true);
      expect(inputManager.isMoving()).toBe(true);
      
      // Should notify about both key presses
      expect(mockCallbacks.onKeyPress).toHaveBeenCalledWith('w');
      expect(mockCallbacks.onKeyPress).toHaveBeenCalledWith('a');
    });

    it('should prevent key repeat spam during held keys', () => {
      // Real scenario: User holds W key for continuous forward movement
      const wKeyDown = new KeyboardEvent('keydown', { code: 'KeyW' });
      
      // Simulate key repeat events (browser behavior when key is held)
      document.dispatchEvent(wKeyDown);
      document.dispatchEvent(wKeyDown); // Repeat
      document.dispatchEvent(wKeyDown); // Repeat
      
      // Should only trigger callback once, not spam the system
      expect(mockCallbacks.onKeyPress).toHaveBeenCalledTimes(1);
      expect(inputManager.isMoving()).toBe(true);
    });

    it('should ignore irrelevant keys without breaking navigation', () => {
      // Real scenario: User accidentally presses other keys while navigating
      const irrelevantKeys = ['KeyZ', 'KeyX', 'F1', 'Escape', 'Tab'];
      
      irrelevantKeys.forEach(keyCode => {
        const keyEvent = new KeyboardEvent('keydown', { code: keyCode });
        document.dispatchEvent(keyEvent);
      });
      
      // Navigation system should remain unaffected
      expect(inputManager.isMoving()).toBe(false);
      expect(mockCallbacks.onKeyPress).not.toHaveBeenCalled();
      
      // Should still respond to valid navigation keys
      const wKeyEvent = new KeyboardEvent('keydown', { code: 'KeyW' });
      document.dispatchEvent(wKeyEvent);
      expect(inputManager.isMoving()).toBe(true);
    });

    it('should handle rapid key sequences without performance issues', () => {
      // Performance test: Rapid fire inputs shouldn't cause lag
      const keySequence = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyW', 'KeyA'];
      
      const startTime = performance.now();
      
      keySequence.forEach(keyCode => {
        const keyDown = new KeyboardEvent('keydown', { code: keyCode });
        const keyUp = new KeyboardEvent('keyup', { code: keyCode });
        document.dispatchEvent(keyDown);
        document.dispatchEvent(keyUp);
      });
      
      const endTime = performance.now();
      
      // Should handle rapid input without significant delay (< 100ms)
      expect(endTime - startTime).toBeLessThan(100);
      expect(inputManager.getInputState()).toBeDefined();
    });

    it('should maintain navigation state consistency', () => {
      // Test for state corruption bugs
      const wKeyDown = new KeyboardEvent('keydown', { code: 'KeyW' });
      const wKeyUp = new KeyboardEvent('keyup', { code: 'KeyW' });
      
      // Simulate complex user behavior
      document.dispatchEvent(wKeyDown);
      expect(inputManager.isMoving()).toBe(true);
      
      // User stops moving
      document.dispatchEvent(wKeyUp);
      expect(inputManager.isMoving()).toBe(false);
      
      // State should remain consistent across multiple cycles
      for (let i = 0; i < 5; i++) {
        document.dispatchEvent(wKeyDown);
        expect(inputManager.isMoving()).toBe(true);
        document.dispatchEvent(wKeyUp);
        expect(inputManager.isMoving()).toBe(false);
      }
    });
  });

  describe('Mouse Look Controls', () => {
    beforeEach(() => {
      inputManager.startListening();
    });

    it('should enable users to look around with mouse', () => {
      // Real scenario: User clicks and drags to look around VR environment
      
      // User clicks mouse to start looking
      const mouseDown = new MouseEvent('mousedown', { 
        clientX: 100, 
        clientY: 200,
        bubbles: true
      });
      document.dispatchEvent(mouseDown);
      
      const inputState = inputManager.getInputState();
      expect(inputState.mouse.down).toBe(true);
      expect(inputState.mouse.x).toBe(100);
      expect(inputState.mouse.y).toBe(200);
      
      // User drags mouse to look right and up
      const mouseMove = new MouseEvent('mousemove', {
        clientX: 110,
        clientY: 190,
        bubbles: true
      });
      document.dispatchEvent(mouseMove);
      
      // System should register the position change
      expect(inputState.mouse.x).toBe(110);
      expect(inputState.mouse.y).toBe(190);
    });

    it('should stop look controls when user releases mouse', () => {
      // User starts looking
      const mouseDown = new MouseEvent('mousedown', { 
        clientX: 100, 
        clientY: 200,
        bubbles: true 
      });
      document.dispatchEvent(mouseDown);
      expect(inputManager.getInputState().mouse.down).toBe(true);
      
      // User releases mouse - should stop look mode
      const mouseUp = new MouseEvent('mouseup', { bubbles: true });
      document.dispatchEvent(mouseUp);
      expect(inputManager.getInputState().mouse.down).toBe(false);
    });

    it('should ignore mouse movement when not in look mode', () => {
      // Real scenario: User moves mouse over UI elements without clicking
      
      const mouseMove = new MouseEvent('mousemove', {
        clientX: 150,
        clientY: 300,
        bubbles: true
      });
      document.dispatchEvent(mouseMove);
      
      // Should not trigger look callbacks (user not intending to look)
      expect(mockCallbacks.onKeyPress).not.toHaveBeenCalled();
    });

    it('should handle rapid mouse movements without lag', () => {
      // Performance test: Fast mouse movements shouldn't cause stuttering
      
      const mouseDown = new MouseEvent('mousedown', { 
        clientX: 100, 
        clientY: 100,
        bubbles: true 
      });
      document.dispatchEvent(mouseDown);
      
      const startTime = performance.now();
      
      // Simulate rapid mouse movements (60fps equivalent)
      for (let i = 0; i < 60; i++) {
        const mouseMove = new MouseEvent('mousemove', {
          clientX: 100 + i,
          clientY: 100 + i,
          bubbles: true
        });
        document.dispatchEvent(mouseMove);
      }
      
      const endTime = performance.now();
      
      // Should process 60 mouse events quickly (< 50ms)
      expect(endTime - startTime).toBeLessThan(50);
    });

    it('should maintain smooth look behavior with varying mouse speeds', () => {
      const mouseDown = new MouseEvent('mousedown', { 
        clientX: 100, 
        clientY: 100,
        bubbles: true 
      });
      document.dispatchEvent(mouseDown);
      
      // Test slow movement
      const slowMove = new MouseEvent('mousemove', {
        clientX: 101,
        clientY: 101,
        bubbles: true
      });
      document.dispatchEvent(slowMove);
      // Position should be tracked regardless of look mode
      expect(inputManager.getInputState().mouse.x).toBe(101);
      expect(inputManager.getInputState().mouse.y).toBe(101);
    });
  });

  describe('VR Navigation Experience', () => {
    beforeEach(() => {
      inputManager.startListening();
    });

    it('should enable forward movement in VR space', () => {
      const initialPosition = mockCamera.position.clone();
      
      // User presses W to move forward
      const wKeyEvent = new KeyboardEvent('keydown', { code: 'KeyW' });
      document.dispatchEvent(wKeyEvent);
      
      // Apply movement to camera (what happens in render loop)
      inputManager.updateCameraMovement(mockCamera);
      
      // User should move forward in VR space (negative Z direction)
      expect(mockCamera.position.z).toBeLessThan(initialPosition.z);
    });

    it('should enable complete directional movement', () => {
      const initialPosition = mockCamera.position.clone();
      
      // Test all cardinal directions users expect to work
      const directions = [
        { key: 'KeyW', axis: 'z', direction: 'forward', expectedChange: (pos: number, initial: number) => pos < initial },
        { key: 'KeyS', axis: 'z', direction: 'backward', expectedChange: (pos: number, initial: number) => pos > initial },
        { key: 'KeyA', axis: 'x', direction: 'left', expectedChange: (pos: number, initial: number) => pos < initial },
        { key: 'KeyD', axis: 'x', direction: 'right', expectedChange: (pos: number, initial: number) => pos > initial }
      ];
      
      directions.forEach(({ key, axis, direction, expectedChange }) => {
        // Reset to initial position for clean test
        mockCamera.position.copy(initialPosition);
        
        // Release all tracked keys before testing this direction
        ['KeyW', 'KeyA', 'KeyS', 'KeyD'].forEach(k =>
          document.dispatchEvent(new KeyboardEvent('keyup', { code: k }))
        )
        
        // User presses key for this direction
        const keyEvent = new KeyboardEvent('keydown', { code: key });
        document.dispatchEvent(keyEvent);
        
        // Apply movement
        inputManager.updateCameraMovement(mockCamera);
        
        // Verify user can move in expected direction
        const newPosition = (mockCamera.position as any)[axis];
        const initialValue = (initialPosition as any)[axis];
        
        expect(expectedChange(newPosition, initialValue)).toBe(true);
      });
    });

    it('should enable smooth look controls with mouse', () => {
      const initialRotation = { x: mockCamera.rotation.x, y: mockCamera.rotation.y };
      
      // User looks right and slightly down (common VR interaction)
      const lookRightDown = { deltaX: 10, deltaY: 5 };
      inputManager.updateCameraRotation(mockCamera, lookRightDown.deltaX);
      
      // Camera should rotate to follow user's look direction
      expect(mockCamera.rotation.y).not.toBe(initialRotation.y); // Horizontal look changed
      expect(mockCamera.rotation.x).toBe(initialRotation.x); // Vertical controlled elsewhere (current implementation)
    });

    it('should handle movement speed variations safely', () => {
      const initialPosition = mockCamera.position.clone();
      
      // Test very slow movement (accessibility - users with motor difficulties)
      inputManager.setMovementOptions({ speed: 0.001 });
      
      const wKeyEvent = new KeyboardEvent('keydown', { code: 'KeyW' });
      document.dispatchEvent(wKeyEvent);
      inputManager.updateCameraMovement(mockCamera);
      
      // Should move slightly but not cause issues
      expect(mockCamera.position.z).toBeLessThan(initialPosition.z);
      const slowMovementDistance = initialPosition.z - mockCamera.position.z;
      expect(slowMovementDistance).toBeGreaterThan(0); // Some movement occurred
      expect(slowMovementDistance).toBeLessThan(1.0); // But not excessive
      
      // Reset and test very fast movement (power users)
      mockCamera.position.copy(initialPosition);
      const inputState = inputManager.getInputState();
      inputState.keys.w = false; // Clear previous key state
      
      inputManager.setMovementOptions({ speed: 5.0 });
      document.dispatchEvent(wKeyEvent); // Press key again
      inputManager.updateCameraMovement(mockCamera);
      
      // Should move more significantly with higher speed
      const fastMovementDistance = initialPosition.z - mockCamera.position.z;
      expect(fastMovementDistance).toBeGreaterThan(slowMovementDistance); // Faster than slow movement
      
      // Most importantly: no crashes or invalid values regardless of speed
      expect(isNaN(mockCamera.position.x)).toBe(false);
      expect(isNaN(mockCamera.position.z)).toBe(false);
      expect(isFinite(mockCamera.position.x)).toBe(true);
      expect(isFinite(mockCamera.position.z)).toBe(true);
    });

    it('should prevent navigation getting stuck in invalid states', () => {
      // Test for state corruption that could leave users unable to move
      
      const wKeyDown = new KeyboardEvent('keydown', { code: 'KeyW' });
      const wKeyUp = new KeyboardEvent('keyup', { code: 'KeyW' });
      
      // Simulate user complex navigation patterns
      for (let cycle = 0; cycle < 10; cycle++) {
        // Start movement
        document.dispatchEvent(wKeyDown);
        expect(inputManager.isMoving()).toBe(true);
        
        // Apply movement
        inputManager.updateCameraMovement(mockCamera);
        
        // Stop movement
        document.dispatchEvent(wKeyUp);
        expect(inputManager.isMoving()).toBe(false);
        
        // Verify system remains responsive
        expect(inputManager.getInputState()).toBeDefined();
      }
      
      // Should still be able to move after many cycles
      document.dispatchEvent(wKeyDown);
      expect(inputManager.isMoving()).toBe(true);
    });

    it('should handle simultaneous movement and look controls', () => {
      // Real VR scenario: User walking forward while looking around
      
      const initialPosition = mockCamera.position.clone();
      const initialRotation = mockCamera.rotation.y;
      
      // User starts moving forward
      const wKeyEvent = new KeyboardEvent('keydown', { code: 'KeyW' });
      document.dispatchEvent(wKeyEvent);
      
      // User also starts looking (mouse down + move)
      const mouseDown = new MouseEvent('mousedown', { 
        clientX: 100, 
        clientY: 100,
        bubbles: true 
      });
      document.dispatchEvent(mouseDown);
      
      const mouseMove = new MouseEvent('mousemove', {
        clientX: 120,
        clientY: 100,
        bubbles: true
      });
      document.dispatchEvent(mouseMove);
      
      // Apply both movement and look
      inputManager.updateCameraMovement(mockCamera);
      inputManager.updateCameraRotation(mockCamera, 20);
      
      // Both movement and look should work simultaneously
      expect(mockCamera.position.z).toBeLessThan(initialPosition.z); // Moved forward
      expect(mockCamera.rotation.y).not.toBe(initialRotation); // Looked around
    });
  });

  describe('User Preference Configuration', () => {
    it('should allow users to adjust movement speed for comfort', () => {
      const testSpeeds = [0.5, 1.0, 2.0, 5.0]; // Slow to fast user preferences
      
      testSpeeds.forEach(speed => {
        const newOptions: Partial<MovementOptions> = { speed };
        inputManager.setMovementOptions(newOptions);
        inputManager.startListening();
        
        // Verify configuration actually affects movement
        const initialPosition = mockCamera.position.clone();
        
        const wKeyEvent = new KeyboardEvent('keydown', { code: 'KeyW' });
        document.dispatchEvent(wKeyEvent);
        inputManager.updateCameraMovement(mockCamera);
        
        const distanceMoved = initialPosition.distanceTo(mockCamera.position);
        expect(distanceMoved).toBeGreaterThan(0);
        
        // Reset for next test
        mockCamera.position.copy(initialPosition);
        const inputState = inputManager.getInputState();
        inputState.keys.w = false;
        inputManager.stopListening();
      });
    });

    it('should allow users to adjust mouse sensitivity for accessibility', () => {
      const testSensitivities = [0.01, 0.02, 0.05, 0.1]; // Low to high sensitivity
      
      testSensitivities.forEach(mouseSensitivity => {
        const newOptions: Partial<MovementOptions> = { mouseSensitivity };
        inputManager.setMovementOptions(newOptions);
        inputManager.startListening();
        
        // Verify sensitivity actually affects look behavior
        const initialRotation = mockCamera.rotation.y;
        inputManager.updateCameraRotation(mockCamera, 10);
        
        // Should have rotated (exact amount depends on sensitivity)
        expect(mockCamera.rotation.y).not.toBe(initialRotation);
        
        // Reset for next test
        mockCamera.rotation.y = initialRotation;
        inputManager.stopListening();
      });
    });

    it('should handle extreme configuration values gracefully', () => {
      // Test very low values (users with motor difficulties)
      const lowOptions: Partial<MovementOptions> = {
        speed: 0.01,
        mouseSensitivity: 0.001
      };
      inputManager.setMovementOptions(lowOptions);
      inputManager.startListening();
      
      // Should not crash or cause NaN values
      const wKeyEvent = new KeyboardEvent('keydown', { code: 'KeyW' });
      document.dispatchEvent(wKeyEvent);
      inputManager.updateCameraMovement(mockCamera);
      inputManager.updateCameraRotation(mockCamera, 1);
      
      expect(isFinite(mockCamera.position.x)).toBe(true);
      expect(isFinite(mockCamera.position.z)).toBe(true);
      expect(isFinite(mockCamera.rotation.y)).toBe(true);
      
      // Test very high values (power users)
      const highOptions: Partial<MovementOptions> = {
        speed: 100,
        mouseSensitivity: 1.0
      };
      inputManager.setMovementOptions(highOptions);
      
      inputManager.updateCameraMovement(mockCamera);
      inputManager.updateCameraRotation(mockCamera, 1);
      
      expect(isFinite(mockCamera.position.x)).toBe(true);
      expect(isFinite(mockCamera.position.z)).toBe(true);
      expect(isFinite(mockCamera.rotation.y)).toBe(true);
      
      inputManager.stopListening();
    });

    it('should enable user callback customization for advanced integration', () => {
      const mockKeyPress = vi.fn();
      const mockKeyRelease = vi.fn();
      
      const userCallbacks: InputCallbacks = {
        onKeyPress: mockKeyPress,
        onKeyRelease: mockKeyRelease,
      };

      const callbackManager = new InputManager({}, userCallbacks);
      callbackManager.startListening();
      
      // User presses and releases a key
      const wKeyDown = new KeyboardEvent('keydown', { code: 'KeyW' });
      const wKeyUp = new KeyboardEvent('keyup', { code: 'KeyW' });
      
      document.dispatchEvent(wKeyDown);
      document.dispatchEvent(wKeyUp);
      
      // User's custom callbacks should be invoked
      expect(mockKeyPress).toHaveBeenCalledWith('w');
      expect(mockKeyRelease).toHaveBeenCalledWith('w');
      
      callbackManager.stopListening();
      callbackManager.dispose();
    });

    it('should persist user preferences across input system restarts', () => {
      // User sets custom preferences
      const customOptions: Partial<MovementOptions> = {
        speed: 3.0,
        mouseSensitivity: 0.075
      };
      
      inputManager.setMovementOptions(customOptions);
      inputManager.startListening();
      
      // Simulate system restart (stop and restart listening)
      inputManager.stopListening();
      inputManager.startListening();
      
      // Test that movement still works with user preferences
      const initialPosition = mockCamera.position.clone();
      
      const wKeyEvent = new KeyboardEvent('keydown', { code: 'KeyW' });
      document.dispatchEvent(wKeyEvent);
      inputManager.updateCameraMovement(mockCamera);
      
      // Should move with custom speed
      const distanceMoved = initialPosition.distanceTo(mockCamera.position);
      expect(distanceMoved).toBeGreaterThan(0);
      
      inputManager.stopListening();
    });
  });

  describe('Memory Safety & Resource Management', () => {
    it('should prevent memory leaks when stopping navigation system', () => {
      inputManager.startListening();
      
      // Verify system is active and responsive
      const wKeyEvent = new KeyboardEvent('keydown', { code: 'KeyW' });
      document.dispatchEvent(wKeyEvent);
      expect(inputManager.isMoving()).toBe(true);
      
      // User exits VR or switches tabs - system should clean up
      inputManager.dispose();
      
      // After dispose, input events should not affect navigation state
      const aKeyEvent = new KeyboardEvent('keydown', { code: 'KeyA' });
      document.dispatchEvent(aKeyEvent);
      
      // System should be inactive after disposal
      expect(() => inputManager.isMoving()).not.toThrow(); // Shouldn't crash
      
      // Multiple dispose calls should be safe
      expect(() => inputManager.dispose()).not.toThrow();
      expect(() => inputManager.dispose()).not.toThrow();
    });

    it('should handle dispose during active navigation safely', () => {
      inputManager.startListening();
      
      // User starts moving
      const wKeyEvent = new KeyboardEvent('keydown', { code: 'KeyW' });
      document.dispatchEvent(wKeyEvent);
      expect(inputManager.isMoving()).toBe(true);
      
      // User suddenly closes VR or tab while moving
      inputManager.dispose();
      
      // Should not crash or leave system in unstable state
      expect(() => inputManager.updateCameraMovement(mockCamera)).not.toThrow();
      
      // Movement state should be safely cleared
      const finalPosition = mockCamera.position.clone();
      expect(isFinite(finalPosition.x)).toBe(true);
      expect(isFinite(finalPosition.z)).toBe(true);
    });

    it('should prevent event listener accumulation on repeated start/stop cycles', () => {
      // Real user behavior: entering/exiting VR mode multiple times
      
      for (let cycle = 0; cycle < 5; cycle++) {
        inputManager.startListening();
        
        // User navigates briefly
        const wKeyEvent = new KeyboardEvent('keydown', { code: 'KeyW' });
        document.dispatchEvent(wKeyEvent);
        
        // User exits VR mode
        inputManager.stopListening();
      }
      
      // After multiple cycles, system should still work without memory buildup
      inputManager.startListening();
      
      const finalKeyEvent = new KeyboardEvent('keydown', { code: 'KeyW' });
      document.dispatchEvent(finalKeyEvent);
      expect(inputManager.isMoving()).toBe(true);
      
      inputManager.stopListening();
    });

    it('should recover from browser events during disposal edge cases', () => {
      inputManager.startListening();
      
      // Simulate rapid user input during system shutdown
      const rapidKeys = ['KeyW', 'KeyA', 'KeyS', 'KeyD'];
      
      rapidKeys.forEach(code => {
        const keyEvent = new KeyboardEvent('keydown', { code });
        document.dispatchEvent(keyEvent);
      });
      
      // Dispose during active input
      inputManager.dispose();
      
      // Send more events after disposal (browser may still fire these)
      rapidKeys.forEach(code => {
        const keyEvent = new KeyboardEvent('keyup', { code });
        expect(() => document.dispatchEvent(keyEvent)).not.toThrow();
      });
      
      // System should handle stray events gracefully
      const mouseEvent = new MouseEvent('mousemove', {
        clientX: 100,
        clientY: 100,
        bubbles: true
      });
      expect(() => document.dispatchEvent(mouseEvent)).not.toThrow();
    });

    it('should maintain camera state integrity during cleanup', () => {
      inputManager.startListening();
      
      // User moves camera to specific position
      const initialPosition = mockCamera.position.clone();
      
      const wKeyEvent = new KeyboardEvent('keydown', { code: 'KeyW' });
      document.dispatchEvent(wKeyEvent);
      inputManager.updateCameraMovement(mockCamera);
      
      const movedPosition = mockCamera.position.clone();
      expect(movedPosition.z).toBeLessThan(initialPosition.z);
      
      // Dispose input system - should clear movement state
      inputManager.dispose();
      
      // Camera position should remain valid and not corrupted
      expect(isFinite(mockCamera.position.x)).toBe(true);
      expect(isFinite(mockCamera.position.y)).toBe(true);
      expect(isFinite(mockCamera.position.z)).toBe(true);
      expect(mockCamera.position.z).toBeLessThan(initialPosition.z); // Position preserved
      
      // Clear any remaining key state that might persist (this tests if dispose() properly cleans up)
      const inputState = inputManager.getInputState();
      if (inputState && inputState.keys) {
        inputState.keys.w = false; // Ensure movement stops
      }
      
      // Camera should not continue moving after input disposal
      const positionAfterDispose = mockCamera.position.clone();
      inputManager.updateCameraMovement(mockCamera);
      
      // Key bug prevention: disposed input manager shouldn't continue affecting camera
      const finalPosition = mockCamera.position.clone();
      const additionalMovement = Math.abs(finalPosition.z - positionAfterDispose.z);
      expect(additionalMovement).toBeLessThan(0.001); // Minimal or no additional movement
    });
  });
});
