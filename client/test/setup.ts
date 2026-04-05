// Test setup file
// Add any global test configuration here

import { beforeEach } from 'vitest'
import { installMockWorker, resetMockWorkerMessageHandlers } from './utils/mock-worker'
import { installNetworkIsolation, resetNetworkIsolation } from './utils/network-isolation'

installMockWorker()
installNetworkIsolation()

beforeEach(() => {
    resetMockWorkerMessageHandlers()
    resetNetworkIsolation()
})

// Mock WebXR API for testing
Object.defineProperty(navigator, 'xr', {
  value: {
    isSessionSupported: () => Promise.resolve(false),
    requestSession: () => Promise.reject(new Error('WebXR not available in test environment'))
  },
  writable: true
})

// TODO: second-guess this. Should methods calling these be called during testing?
// is it a good idea to replace performance.now like that?
// We should probably mock the desired return value in the test, not this weird switcheroo.
// Mock window.performance for testing
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'performance', {
    value: {
      now: () => Date.now(),
      mark: () => {},
      measure: () => {},
      getEntriesByType: () => [],
      getEntriesByName: () => [],
      clearMarks: () => {},
      clearMeasures: () => {}
    },
    writable: true
  })
}

