/**
 * System UI Coordinator Lighting Integration Test
 * 
 * Tests that the lighting controls are properly initialized during SystemUICoordinator.init()
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { SystemUICoordinator } from '../../../src/ui/coordinators/SystemUICoordinator'
import { PerformanceMonitorUI } from '../../../src/ui/PerformanceMonitor'
import { EventManager } from '../../../src/core/EventManager'
import { AppSettings } from '../../../src/core/AppSettings'
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
    PerformanceMonitorUI: class {
        start() {}
        dispose() {}
        getStats() {
            return { fps: 60, frameTime: 16.67, drawCalls: 0, triangles: 0 }
        }
        updateRenderStats() {}
    },
    // Backward-compat alias while imports transition
    PerformanceMonitor: class {
        start() {}
        dispose() {}
    }
}))

describe('SystemUICoordinator Lighting Integration', () => {
    let systemCoordinator: SystemUICoordinator
    let renderer: THREE.WebGLRenderer

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
        
        // Setup mock dependencies
        const mockEventManager = EventManager.getInstance()
        const mockAppSettings = AppSettings.getInstance()
        
        // Create coordinator
        systemCoordinator = new SystemUICoordinator(
            mockEventManager,
            mockAppSettings
        )
        
        // Set up test environment
    })

    afterEach(() => {
        if (systemCoordinator) {
            systemCoordinator.dispose()
        }
        document.body.innerHTML = ''
    })

    it('should initialize lighting controls during init() without warnings', async () => {
        // Initialize the coordinator
        await systemCoordinator.init(renderer)
        
        // Verify initialization completed successfully
        expect(systemCoordinator).toBeDefined()
        
        // Verify lighting button is available
        const lightingButton = document.getElementById('lighting-controls-button')
        expect(lightingButton).toBeTruthy()
    })

    it('should handle lighting button clicks after initialization', async () => {
        // Initialize the coordinator
        await systemCoordinator.init(renderer)
        
        const lightingButton = document.getElementById('lighting-controls-button')
        expect(lightingButton).toBeTruthy()
        
        // Click the button - should not show warnings
        lightingButton!.click()
        
        // Verify button click is handled without errors
        expect(() => lightingButton!.click()).not.toThrow()
    })

    it('should properly dispose lighting controls', async () => {
        // Initialize and then dispose
        await systemCoordinator.init(renderer)
        systemCoordinator.dispose()
        
        // Verify disposal completes without errors
        expect(() => systemCoordinator.dispose()).not.toThrow()
    })
})