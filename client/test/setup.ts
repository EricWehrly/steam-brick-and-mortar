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
  
  getContext(contextType: string) {
    if (contextType === '2d') {
      return {
        fillRect: () => {},
        clearRect: () => {},
        drawImage: () => {},
        fillText: () => {},
        measureText: () => ({ width: 100 }),
        font: '',
        fillStyle: '',
        textAlign: 'left',
        textBaseline: 'top'
      }
    }
    // Return null for WebGL contexts in test environment
    return null
  }
  
  toDataURL() {
    return 'data:image/png;base64,mock'
  }
  
  getBoundingClientRect() {
    return {
      x: 0,
      y: 0,
      width: this.width,
      height: this.height,
      top: 0,
      left: 0,
      bottom: this.height,
      right: this.width,
      toJSON: () => ({})
    }
  }
  
  addEventListener() {}
  removeEventListener() {}
}

// Use globalThis instead of global for better compatibility
if (typeof globalThis !== 'undefined') {
  // Override HTMLCanvasElement constructor
  (globalThis as any).HTMLCanvasElement = MockCanvas
  
  // Mock document.createElement for canvas creation
  const originalCreateElement = document.createElement.bind(document)
  document.createElement = ((tagName: string) => {
    if (tagName.toLowerCase() === 'canvas') {
      return new MockCanvas() as any
    }
    return originalCreateElement(tagName)
  }) as any
  
  // Override HTMLCanvasElement.prototype.getContext to always return our mock
  if (typeof HTMLCanvasElement !== 'undefined') {
    (HTMLCanvasElement.prototype as any).getContext = function(contextType: string) {
      if (contextType === '2d') {
        return {
          fillRect: () => {},
          clearRect: () => {},
          drawImage: () => {},
          fillText: () => {},
          measureText: () => ({ width: 100 }),
          font: '',
          fillStyle: '',
          textAlign: 'left',
          textBaseline: 'top'
        }
      }
      // Return null for WebGL contexts in test environment
      return null
    }
  }
}
