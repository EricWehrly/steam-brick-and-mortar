// Live test setup — intentionally minimal.
// Network calls are NOT blocked here; live tests hit real external endpoints.
// Do not import network-isolation from this file.

import { installMockWorker, resetMockWorkerMessageHandlers } from './utils/mock-worker'
import { beforeEach } from 'vitest'

installMockWorker()

beforeEach(() => {
    resetMockWorkerMessageHandlers()
})
