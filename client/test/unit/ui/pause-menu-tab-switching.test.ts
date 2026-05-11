/**
 * Pause Menu Tab Switching Test
 * 
 * Tests for tab switching functionality, particularly with the new GameSettingsPanel
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { PauseMenuManager } from '../../../src/ui/pause/PauseMenuManager'
import { GameSettingsPanel } from '../../../src/ui/pause/panels/GameSettingsPanel'
import { CacheManagementPanel } from '../../../src/ui/pause/panels/CacheManagementPanel'
import { ControlsPanel } from '../../../src/ui/pause/panels/ControlsPanel'
import { ApplicationPanel } from '../../../src/ui/pause/panels/ApplicationPanel'
import { DebugPanel } from '../../../src/ui/pause/panels/DebugPanel'
import { EventManager } from '../../../src/core/EventManager'
import { AppSettings } from '../../../src/core/AppSettings'

describe('Pause Menu Tab Switching', () => {
    let pauseMenuManager: PauseMenuManager

    beforeEach(() => {
        // Set up minimal DOM - PauseMenuManager will create its own structure
        document.body.innerHTML = `<div id="app"></div>`

        // Setup mock dependencies
        const mockEventManager = EventManager.getInstance()
        const mockAppSettings = AppSettings.getInstance()
        const mockSystemDependencies = {
            performanceMonitor: null as any,
            renderer: null as any
        }

        // Mock callbacks
        const mockCallbacks = {
            onPauseInput: vi.fn(),
            onResumeInput: vi.fn(),
            onMenuOpen: vi.fn(),
            onMenuClose: vi.fn()
        }

        pauseMenuManager = new PauseMenuManager(
            {},
            mockCallbacks,
            mockSystemDependencies,
            mockEventManager,
            mockAppSettings,
            null as any
        )
        pauseMenuManager.init()

        // Register all panels
        const cachePanel = new CacheManagementPanel()
        pauseMenuManager.registerPanel(cachePanel)

        pauseMenuManager.registerPanel(new ControlsPanel())
        
        const applicationPanel = new ApplicationPanel({}, mockAppSettings, mockEventManager)
        pauseMenuManager.registerPanel(applicationPanel)
        
        pauseMenuManager.registerPanel(new GameSettingsPanel({}, mockAppSettings))
        
        const mockDebugStatsProvider = {
            getDebugStats: vi.fn().mockResolvedValue({
                sceneObjects: { total: 0, meshes: 0, lights: 0, cameras: 0, textures: 0, materials: 0, geometries: 0 },
                performance: { fps: 60, frameTime: 16.67, memoryUsed: 0, memoryTotal: 0, triangles: 0, drawCalls: 0 },
                cache: { imageCount: 0, imageCacheSize: 0, gameDataCount: 0, gameDataSize: 0, quotaUsed: 0, quotaTotal: 0 },
                system: { userAgent: 'test', webxrSupported: false, webglVersion: 'WebGL 2.0', maxTextureSize: 4096, vendor: 'test', renderer: 'test' }
            })
        }
        const debugPanel = new DebugPanel({}, mockDebugStatsProvider as any)
        pauseMenuManager.registerPanel(debugPanel)
    })

    afterEach(() => {
        pauseMenuManager.dispose()
        document.body.innerHTML = ''
    })

    it('should switch between all tabs successfully', async () => {
        // Open pause menu
        pauseMenuManager.open()
        
        // Wait for DOM to be ready
        await new Promise(resolve => setTimeout(resolve, 10))
        
        const tabButtons = document.querySelectorAll('.pause-menu-tab')
        expect(tabButtons.length).toBe(5) // Should have 5 tabs
        
        // Test switching to each tab
        // Use the actual tab IDs that are created by the system
        const tabIds = ['tab-cache-management', 'tab-controls', 'tab-application', 'tab-game-settings', 'tab-debug']
        
        for (const tabId of tabIds) {
            console.log(`Testing switch to tab: ${tabId}`)
            
            // Find the tab button for this panel
            const tabButton = document.getElementById(tabId) as HTMLButtonElement
            
            expect(tabButton, `Tab button ${tabId} should exist`).toBeTruthy()
            
            // Click the tab
            tabButton.click()
            
            // Wait for any async operations
            await new Promise(resolve => setTimeout(resolve, 10))
            
            // Check if tab is active
            expect(tabButton.classList.contains('active'), 
                `Tab button ${tabId} should be active after clicking`).toBe(true)
        }
    })

    it('should switch from game-settings to other panels', async () => {
        // Open pause menu
        pauseMenuManager.open()
        await new Promise(resolve => setTimeout(resolve, 10))
        
        // First switch to game-settings
        const gameSettingsTab = document.getElementById('tab-game-settings') as HTMLButtonElement
        expect(gameSettingsTab).toBeTruthy()
        
        gameSettingsTab.click()
        await new Promise(resolve => setTimeout(resolve, 10))
        
        // Verify game-settings is active
        expect(gameSettingsTab.classList.contains('active')).toBe(true)
        
        // Now try switching to each other panel
        const otherTabIds = ['tab-cache-management', 'tab-controls', 'tab-application', 'tab-debug']
        
        for (const tabId of otherTabIds) {
            console.log(`Testing switch from game-settings to ${tabId}`)
            
            const targetTab = document.getElementById(tabId) as HTMLButtonElement
            expect(targetTab, `Tab ${tabId} should exist`).toBeTruthy()
            
            // Click the target tab
            targetTab.click()
            await new Promise(resolve => setTimeout(resolve, 10))
            
            // Check if the target tab is now active
            expect(targetTab.classList.contains('active'), 
                `Tab ${tabId} should be active after switching from game-settings`).toBe(true)
            
            // Check if game-settings tab is no longer active
            expect(gameSettingsTab.classList.contains('active'), 
                `Game-settings tab should not be active after switching to ${tabId}`).toBe(false)
            
            // Switch back to game-settings for next iteration
            gameSettingsTab.click()
            await new Promise(resolve => setTimeout(resolve, 10))
        }
    })

    it('should handle rapid tab switching without issues', async () => {
        pauseMenuManager.open()
        await new Promise(resolve => setTimeout(resolve, 10))
        
        const tabButtons = document.querySelectorAll('.pause-menu-tab') as NodeListOf<HTMLButtonElement>
        
        // Rapidly switch between tabs
        for (let i = 0; i < 3; i++) {
            for (const button of tabButtons) {
                button.click()
                await new Promise(resolve => setTimeout(resolve, 5))
            }
        }
        
        // Should still be functional - try one final switch
        const gameSettingsTab = document.getElementById('tab-game-settings') as HTMLButtonElement
        gameSettingsTab.click()
        await new Promise(resolve => setTimeout(resolve, 10))
        
        expect(gameSettingsTab.classList.contains('active')).toBe(true)
        
        const cacheTab = document.getElementById('tab-cache-management') as HTMLButtonElement
        cacheTab.click()
        await new Promise(resolve => setTimeout(resolve, 10))
        
        expect(cacheTab.classList.contains('active')).toBe(true)
        expect(gameSettingsTab.classList.contains('active')).toBe(false)
    })
})
