// Test setup file
// Add any global test configuration here

import { beforeEach } from 'vitest'
import { installMockWorker, resetMockWorkerMessageHandlers } from './utils/mock-worker'
import { installNetworkIsolation, resetNetworkIsolation } from './utils/network-isolation'
import { setupIndexedDBMock } from './mocks/indexeddb.mock'

installMockWorker()

// TODO: Test performance impact of global IndexedDB mock.
// This mock initializes for every test, even those that don't use Steam integration.
// Consider scoping to only suites that need it if profiling shows measurable overhead.
setupIndexedDBMock()

// Network isolation blocks all outbound fetch.
// Opt out by setting VITEST_LIVE=true in the vitest config (used for live integration tests
// that intentionally hit real external endpoints).
const isLiveRun = import.meta.env.VITEST_LIVE === 'true'
if (!isLiveRun) {
    installNetworkIsolation()
}

beforeEach(() => {
    resetMockWorkerMessageHandlers()
    if (!isLiveRun) {
        resetNetworkIsolation()
    }
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

