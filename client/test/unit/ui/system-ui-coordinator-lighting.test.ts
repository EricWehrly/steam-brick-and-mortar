/**
 * System UI Coordinator Lighting Integration Test
 * 
 * Tests that the lighting controls are properly initialized during SystemUICoordinator.init()
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { SystemUICoordinator } from '../../../src/ui/coordinators/SystemUICoordinator'
import { PerformanceMonitor } from '../../../src/ui/PerformanceMonitor'
import * as THREE from 'three'

// Mock dependencies
vi.mock('../../../src/core/EventManager', () => ({
    EventManager: {
        getInstance: () => ({
            emit: vi.fn(),
            registerEventHandler: vi.fn(),
            deregisterEventHandler: vi.fn()
        })
    },
    EventSource: {
        UI: 'ui',
        ManagedLight: 'managed-light'
    }
}))

vi.mock('../../../src/ui/pause/PauseMenuManager', () => ({
    PauseMenuManager: class {
        init() {}
        setSystemDependencies() {}
        registerDefaultPanels() {}
        dispose() {}
    }
}))

vi.mock('../../../src/ui/LightingControlsPanel', () => ({
    LightingControlsPanel: class {
        show() {}
        hide() {}
        toggle() {}
        dispose() {}
    }
}))

vi.mock('../../../src/ui/PerformanceMonitor', () => ({
    PerformanceMonitor: class {
        dispose() {}
    }
}))

describe('SystemUICoordinator Lighting Integration', () => {
    let systemCoordinator: SystemUICoordinator
    let performanceMonitor: PerformanceMonitor
    let renderer: THREE.WebGLRenderer
    let consoleSpy: any

    beforeEach(() => {
        // Clear document body and setup DOM elements
        document.body.innerHTML = ''
        
        // Create required DOM elements
        const settingsButton = document.createElement('button')
        settingsButton.id = 'settings-button'
        document.body.appendChild(settingsButton)
        
        const lightingButton = document.createElement('button')
        lightingButton.id = 'lighting-controls-button'
        document.body.appendChild(lightingButton)
        
        // Mock renderer
        renderer = {
            info: { render: { triangles: 0, calls: 0 } }
        } as any
        
        // Create coordinator
        performanceMonitor = new PerformanceMonitor()
        systemCoordinator = new SystemUICoordinator(
            performanceMonitor,
            { getDebugStats: () => ({}) } as any
        )
        
        // Spy on console.warn to check for initialization warnings
        consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    })

    afterEach(() => {
        if (systemCoordinator) {
            systemCoordinator.dispose()
        }
        document.body.innerHTML = ''
        consoleSpy.mockRestore()
    })

    it('should initialize lighting controls during init() without warnings', async () => {
        // Initialize the coordinator
        await systemCoordinator.init(renderer)
        
        // Verify no "panel not yet initialized" warnings were shown
        expect(consoleSpy).not.toHaveBeenCalledWith(
            expect.stringContaining('Lighting controls panel not yet initialized')
        )
    })

    it('should handle lighting button clicks after initialization', async () => {
        // Initialize the coordinator
        await systemCoordinator.init(renderer)
        
        const lightingButton = document.getElementById('lighting-controls-button')
        expect(lightingButton).toBeTruthy()
        
        // Click the button - should not show warnings
        lightingButton!.click()
        
        // Verify no warnings about uninitialized panel
        expect(consoleSpy).not.toHaveBeenCalledWith(
            expect.stringContaining('Lighting controls panel not yet initialized')
        )
    })

    it('should properly dispose lighting controls', async () => {
        // Initialize and then dispose
        await systemCoordinator.init(renderer)
        systemCoordinator.dispose()
        
        // Should not have any lingering warnings or errors
        expect(consoleSpy).not.toHaveBeenCalledWith(
            expect.stringContaining('Lighting controls panel not yet initialized')
        )
    })
})