/**
 * Mock for PerformanceMonitor
 */

import { vi } from 'vitest'

export const PerformanceMonitorMock = vi.fn().mockImplementation(() => ({
    start: vi.fn(),
    stop: vi.fn(),
    getStats: vi.fn().mockReturnValue({
        fps: 60,
        frameTime: 16.67,
        memory: '50MB',
        triangles: 1000,
        calls: 50
    }),
    updateRendererStats: vi.fn(),
    show: vi.fn(),
    hide: vi.fn(),
    toggle: vi.fn(),
    dispose: vi.fn(),
    isVisible: vi.fn().mockReturnValue(true),
    isRunning: vi.fn().mockReturnValue(false)
}))

export async function performanceMonitorMockFactory() {
    return {
        PerformanceMonitor: PerformanceMonitorMock
    }
}
