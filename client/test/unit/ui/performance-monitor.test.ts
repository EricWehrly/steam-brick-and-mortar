/**
 * Unit tests for PerformanceMonitor
 * 
 * Tests the performance monitoring functionality including FPS tracking,
 * memory monitoring, and Three.js renderer integration.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { PerformanceMonitor, type PerformanceConfig } from '../../../src/ui/PerformanceMonitor'

// Mock DOM environment
const mockDocument = {
    createElement: vi.fn().mockImplementation((tagName: string) => {
        const element = {
            tagName,
            id: '',
            style: {} as CSSStyleDeclaration,
            innerHTML: '',
            appendChild: vi.fn(),
            parentNode: null
        }
        return element
    }),
    body: {
        appendChild: vi.fn()
    }
}

const mockWindow = {
    performance: {
        now: vi.fn().mockReturnValue(1000),
        memory: {
            usedJSHeapSize: 50 * 1024 * 1024, // 50MB
            totalJSHeapSize: 100 * 1024 * 1024, // 100MB
            jsHeapSizeLimit: 200 * 1024 * 1024 // 200MB
        }
    },
    requestAnimationFrame: vi.fn(),
    cancelAnimationFrame: vi.fn()
}

// Mock Three.js renderer
const mockRenderer = {
    info: {
        render: {
            calls: 42,
            triangles: 1000,
            points: 0,
            lines: 0
        }
    }
}

// Set up global mocks
Object.defineProperty(globalThis, 'document', {
    value: mockDocument,
    writable: true
})

Object.defineProperty(globalThis, 'window', {
    value: mockWindow,
    writable: true
})

describe('PerformanceMonitor', () => {
    let monitor: PerformanceMonitor
    let mockElement: any

    beforeEach(() => {
        // Reset mocks
        vi.clearAllMocks()
        mockWindow.performance.now.mockReturnValue(1000)
        
        // Set up a mock element that gets returned by createElement
        mockElement = {
            id: '',
            style: {} as CSSStyleDeclaration,
            innerHTML: '',
            appendChild: vi.fn(),
            parentNode: null
        }
        mockDocument.createElement.mockReturnValue(mockElement)
    })

    afterEach(() => {
        if (monitor) {
            monitor.dispose()
        }
    })

    describe('Initialization', () => {
        it('should create performance monitor with default config', () => {
            monitor = new PerformanceMonitor()
            
            expect(mockDocument.createElement).toHaveBeenCalledWith('div')
            expect(mockDocument.body.appendChild).toHaveBeenCalled()
        })

        it('should create performance monitor with custom config', () => {
            const config: PerformanceConfig = {
                position: 'bottom-right',
                showMemory: false,
                showDrawCalls: false,
                updateInterval: 200,
                precision: 2
            }
            
            monitor = new PerformanceMonitor(config)
            
            expect(mockDocument.createElement).toHaveBeenCalled()
        })

        it('should set up displays based on config', () => {
            monitor = new PerformanceMonitor({
                showMemory: true,
                showDrawCalls: true
            })
            
            // Should create container + FPS + frame time + memory + draw calls displays
            expect(mockDocument.createElement).toHaveBeenCalledTimes(5)
        })
    })

    describe('Performance Tracking', () => {
        beforeEach(() => {
            monitor = new PerformanceMonitor({
                updateInterval: 50, // Fast updates for testing
                precision: 1
            })
        })

        it('should start monitoring when start() is called', () => {
            monitor.start()
            
            expect(mockWindow.requestAnimationFrame).toHaveBeenCalled()
        })

        it('should stop monitoring when stop() is called', () => {
            const mockAnimationId = 123
            mockWindow.requestAnimationFrame.mockReturnValue(mockAnimationId)
            
            monitor.start()
            monitor.stop()
            
            expect(mockWindow.cancelAnimationFrame).toHaveBeenCalledWith(mockAnimationId)
        })

        it('should not start multiple times', () => {
            monitor.start()
            monitor.start() // Second call should be ignored
            
            expect(mockWindow.requestAnimationFrame).toHaveBeenCalledTimes(1)
        })

        it('should get current performance stats', () => {
            const stats = monitor.getStats()
            
            expect(stats).toHaveProperty('fps')
            expect(stats).toHaveProperty('frameTime')
            expect(typeof stats.fps).toBe('number')
            expect(typeof stats.frameTime).toBe('number')
        })
    })

    describe('Three.js Integration', () => {
        beforeEach(() => {
            monitor = new PerformanceMonitor({
                showDrawCalls: true
            })
        })

        it('should update render stats from Three.js renderer', () => {
            const updateSpy = vi.spyOn(monitor as any, 'updateDisplay')
            
            monitor.updateRenderStats(mockRenderer as any)
            
            expect(updateSpy).toHaveBeenCalledWith(
                expect.anything(),
                'DC',
                '42'
            )
        })

        it('should handle renderer without render info gracefully', () => {
            const badRenderer = { info: {} }
            
            expect(() => {
                monitor.updateRenderStats(badRenderer as any)
            }).not.toThrow()
        })
    })

    describe('Memory Monitoring', () => {
        it('should detect memory API support', () => {
            monitor = new PerformanceMonitor({ showMemory: true })
            
            // Should create memory display since we mocked memory API support
            expect(mockDocument.createElement).toHaveBeenCalledTimes(4) // container + FPS + MS + MB
        })

        it('should handle missing memory API gracefully', () => {
            // Remove memory from performance object
            const originalMemory = mockWindow.performance.memory
            delete (mockWindow.performance as any).memory
            
            monitor = new PerformanceMonitor({ showMemory: true })
            
            // Should not create memory display
            expect(mockDocument.createElement).toHaveBeenCalledTimes(3) // container + FPS + MS only
            
            // Restore memory API
            mockWindow.performance.memory = originalMemory
        })

        it('should include memory stats when supported', () => {
            monitor = new PerformanceMonitor({ showMemory: true })
            
            const stats = monitor.getStats()
            
            expect(stats).toHaveProperty('memoryUsed')
            expect(stats).toHaveProperty('memoryTotal')
            expect(stats.memoryUsed).toBeCloseTo(50, 0) // ~50MB
            expect(stats.memoryTotal).toBeCloseTo(100, 0) // ~100MB
        })
    })

    describe('Visibility Control', () => {
        beforeEach(() => {
            monitor = new PerformanceMonitor()
        })

        it('should hide performance monitor', () => {
            monitor.hide()
            
            expect(mockElement.style.display).toBe('none')
        })

        it('should show performance monitor', () => {
            monitor.show()
            
            expect(mockElement.style.display).toBe('block')
        })

        it('should toggle visibility', () => {
            // Start visible
            expect(mockElement.style.display).not.toBe('none')
            
            // Toggle to hidden
            monitor.toggle()
            expect(mockElement.style.display).toBe('none')
            
            // Toggle back to visible
            monitor.toggle()
            expect(mockElement.style.display).toBe('block')
        })
    })

    describe('Cleanup', () => {
        it('should dispose cleanly', () => {
            monitor = new PerformanceMonitor()
            
            const mockParentNode = {
                removeChild: vi.fn()
            }
            mockElement.parentNode = mockParentNode
            
            monitor.dispose()
            
            expect(mockParentNode.removeChild).toHaveBeenCalledWith(mockElement)
        })

        it('should handle dispose when element has no parent', () => {
            monitor = new PerformanceMonitor()
            
            expect(() => {
                monitor.dispose()
            }).not.toThrow()
        })
    })
})
