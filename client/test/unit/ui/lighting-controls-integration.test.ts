/**
 * Lighting Controls Panel Integration Tests
 * 
 * Tests the integrated lighting controls panel functionality:
 * - Panel header toggle behavior
 * - Button visibility management
 * - Panel show/hide/dispose behavior
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { LightingControlsPanel } from '../../../src/ui/LightingControlsPanel'

// Mock the EventManager
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

describe('Lighting Controls Panel Integration', () => {
    let lightingPanel: LightingControlsPanel
    let separateButton: HTMLButtonElement

    beforeEach(() => {
        // Clear document body
        document.body.innerHTML = ''
        
        // Create the separate lighting controls button like it exists in index.html
        separateButton = document.createElement('button')
        separateButton.id = 'lighting-controls-button'
        separateButton.className = 'settings-button lighting-button'
        separateButton.textContent = '💡 Lights'
        document.body.appendChild(separateButton)
        
        // Create the lighting panel
        lightingPanel = new LightingControlsPanel()
    })

    afterEach(() => {
        if (lightingPanel) {
            lightingPanel.dispose()
        }
        document.body.innerHTML = ''
    })

    it('should hide the separate button when panel is created', () => {
        expect(separateButton.style.display).toBe('none')
    })

    it('should create integrated panel with clickable header', () => {
        const panel = document.getElementById('lighting-controls-panel')
        const header = document.getElementById('lighting-panel-header')
        const content = document.getElementById('lighting-panel-content')
        const indicator = document.getElementById('toggle-indicator')

        expect(panel).toBeTruthy()
        expect(header).toBeTruthy()
        expect(content).toBeTruthy()
        expect(indicator).toBeTruthy()
        expect(header?.classList.contains('clickable-header')).toBe(true)
    })

    it('should toggle panel content when header is clicked', () => {
        const header = document.getElementById('lighting-panel-header')
        const content = document.getElementById('lighting-panel-content')
        const indicator = document.getElementById('toggle-indicator')

        expect(header).toBeTruthy()
        expect(content).toBeTruthy()
        expect(indicator).toBeTruthy()

        // Initially content should be collapsed (new default behavior)
        expect(content!.classList.contains('collapsed')).toBe(true)
        expect(indicator!.textContent).toBe('▶')

        // Click header to expand
        header!.click()
        expect(content!.classList.contains('collapsed')).toBe(false)
        expect(indicator!.textContent).toBe('▼')

        // Click header again to collapse
        header!.click()
        expect(content!.classList.contains('collapsed')).toBe(true)
        expect(indicator!.textContent).toBe('▶')
    })

    it('should not toggle when clicking refresh button', () => {
        const refreshButton = document.getElementById('refresh-lights')
        const content = document.getElementById('lighting-panel-content')

        expect(refreshButton).toBeTruthy()
        expect(content).toBeTruthy()

        // Initially content should be visible
        const initialDisplay = content!.style.display
        
        // Click refresh button - should not toggle content
        refreshButton!.click()
        expect(content!.style.display).toBe(initialDisplay)
    })

    it('should show separate button again on dispose', () => {
        // Verify button is hidden
        expect(separateButton.style.display).toBe('none')

        // Dispose the panel
        lightingPanel.dispose()

        // Verify button is shown again
        expect(separateButton.style.display).toBe('block')
    })

    it('should show separate button again when panel is hidden', () => {
        // Verify button is hidden initially
        expect(separateButton.style.display).toBe('none')

        // Hide the panel
        lightingPanel.hide()

        // Verify button is shown again
        expect(separateButton.style.display).toBe('block')
    })

    it('should properly show panel with expanded content', () => {
        const panel = document.getElementById('lighting-controls-panel')
        const content = document.getElementById('lighting-panel-content')
        const indicator = document.getElementById('toggle-indicator')

        // Hide panel first
        lightingPanel.hide()
        expect(panel!.style.display).toBe('none')

        // Show panel - it should be visible but remain in its collapsed state
        lightingPanel.show()
        expect(panel!.style.display).toBe('flex')
        expect(content!.classList.contains('collapsed')).toBe(true) // Still collapsed
        expect(indicator!.textContent).toBe('▶') // Still showing collapsed indicator
    })
})