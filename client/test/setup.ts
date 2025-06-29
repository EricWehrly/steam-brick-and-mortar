// Test setup file
// Add any global test configuration here

// Mock WebXR API for testing
Object.defineProperty(navigator, 'xr', {
  value: {
    isSessionSupported: () => Promise.resolve(false),
    requestSession: () => Promise.reject(new Error('WebXR not available in test environment'))
  },
  writable: true
})

// Mock Canvas for Three.js in test environment
class MockCanvas {
  width = 800
  height = 600
  
  getContext() {
    return {
      fillRect: () => {},
      clearRect: () => {},
      drawImage: () => {},
    }
  }
  
  toDataURL() {
    return 'data:image/png;base64,mock'
  }
}

// Use globalThis instead of global for better compatibility
if (typeof globalThis !== 'undefined') {
  (globalThis as any).HTMLCanvasElement = MockCanvas
}
