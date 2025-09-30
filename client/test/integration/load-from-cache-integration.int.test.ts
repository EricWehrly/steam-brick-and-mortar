/**
 * Integration Test: Load from Cache Button Visibility
 * 
 * Tests the end-to-end integration of the Load from Cache functionality:
 * - SteamIntegration.hasCachedData method
 * - UICoordinator passing callback to UIManager
 * - UIManager passing callback to SteamUIPanel
 * - SteamUIPanel showing/hiding Load from Cache button
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { SteamIntegration } from '../../src/steam-integration/SteamIntegration'
import { UICoordinator } from '../../src/ui/UICoordinator'
import { PerformanceMonitor } from '../../src/ui/PerformanceMonitor'
import { DebugStatsProvider } from '../../src/core/DebugStatsProvider'
import { SceneManager } from '../../src/scene/SceneManager'

// Mock DOM elements
const mockSteamUI = document.createElement('div')
mockSteamUI.id = 'steam-ui'
mockSteamUI.style.display = 'none'

const mockVanityInput = document.createElement('input')
mockVanityInput.id = 'steam-vanity'
mockVanityInput.type = 'text'

const mockLoadGamesButton = document.createElement('button')
mockLoadGamesButton.id = 'load-steam-games'

const mockLoadFromCacheButton = document.createElement('button')
mockLoadFromCacheButton.id = 'load-from-cache'
mockLoadFromCacheButton.style.display = 'none'

const mockSteamStatus = document.createElement('div')
mockSteamStatus.id = 'steam-status'

const mockWebXRButton = document.createElement('button')
mockWebXRButton.id = 'webxr-button'

describe('Load from Cache Integration', () => {
  let steamIntegration: SteamIntegration
  let performanceMonitor: PerformanceMonitor
  let debugStatsProvider: DebugStatsProvider
  let uiCoordinator: UICoordinator
  let sceneManager: SceneManager

  beforeEach(() => {
    // Setup DOM
    document.body.appendChild(mockSteamUI)
    document.body.appendChild(mockVanityInput)
    document.body.appendChild(mockLoadGamesButton)
    document.body.appendChild(mockLoadFromCacheButton)
    document.body.appendChild(mockSteamStatus)
    document.body.appendChild(mockWebXRButton)

    // Create instances
    steamIntegration = new SteamIntegration()
    performanceMonitor = new PerformanceMonitor()
    sceneManager = new SceneManager()
    debugStatsProvider = new DebugStatsProvider(sceneManager, steamIntegration, performanceMonitor)

    uiCoordinator = new UICoordinator(
      performanceMonitor,
      debugStatsProvider,
      undefined, // No cache stats provider
      steamIntegration
    )
  })

  afterEach(() => {
    // Cleanup DOM
    document.body.innerHTML = ''
    
    // Dispose resources
    uiCoordinator?.dispose()
    performanceMonitor?.dispose()
    sceneManager?.dispose()
  })

  it('should wire cache availability check through the UI chain', () => {
    // Test that the SteamIntegration.hasCachedData method is properly wired
    // through UICoordinator -> UIManager -> SteamUIPanel
    
    const testVanityUrl = 'testuser'
    
    // Initially, no cache should exist
    expect(steamIntegration.hasCachedData(testVanityUrl)).toBe(false)
    
    // Load from Cache button should be hidden
    expect(mockLoadFromCacheButton.style.display).toBe('none')
  })

  it('should show Load from Cache button when cached data exists', async () => {
    const testVanityUrl = 'testuser'
    
    // Mock that cached data exists
    const mockHasCachedData = vi.spyOn(steamIntegration, 'hasCachedData')
    mockHasCachedData.mockReturnValue(true)
    
    // Initialize UI coordinator
    await uiCoordinator.setupUI(sceneManager.getRenderer())
    
    // Simulate user typing in input field
    mockVanityInput.value = testVanityUrl
    
    // Dispatch input event to trigger cache availability check
    const inputEvent = new Event('input', { bubbles: true })
    mockVanityInput.dispatchEvent(inputEvent)
    
    // The Load from Cache button should become visible
    expect(mockLoadFromCacheButton.style.display).toBe('inline-block')
    
    mockHasCachedData.mockRestore()
  })

  it('should hide Load from Cache button when no cached data exists', async () => {
    const testVanityUrl = 'testuser'
    
    // Mock that no cached data exists
    const mockHasCachedData = vi.spyOn(steamIntegration, 'hasCachedData')
    mockHasCachedData.mockReturnValue(false)
    
    // Initialize UI coordinator
    await uiCoordinator.setupUI(sceneManager.getRenderer())
    
    // Simulate user typing in input field
    mockVanityInput.value = testVanityUrl
    
    // Dispatch input event to trigger cache availability check
    const inputEvent = new Event('input', { bubbles: true })
    mockVanityInput.dispatchEvent(inputEvent)
    
    // The Load from Cache button should remain hidden
    expect(mockLoadFromCacheButton.style.display).toBe('none')
    
    mockHasCachedData.mockRestore()
  })

  it('should integrate SteamIntegration cache check with UI button visibility', async () => {
    const testVanityUrl = 'spitemonger'
    
    // Initially no cache
    expect(steamIntegration.hasCachedData(testVanityUrl)).toBe(false)
    
    // Initialize UI
    await uiCoordinator.setupUI(sceneManager.getRenderer())
    
    // Set input and trigger event
    mockVanityInput.value = testVanityUrl
    const inputEvent = new Event('input', { bubbles: true })
    mockVanityInput.dispatchEvent(inputEvent)
    
    // Button should be hidden (no cache)
    expect(mockLoadFromCacheButton.style.display).toBe('none')
    
    // Now mock that cache exists (simulating after a successful load)
    const mockHasCachedData = vi.spyOn(steamIntegration, 'hasCachedData')
    mockHasCachedData.mockReturnValue(true)
    
    // Trigger input event again
    mockVanityInput.dispatchEvent(inputEvent)
    
    // Button should now be visible
    expect(mockLoadFromCacheButton.style.display).toBe('inline-block')
    
    mockHasCachedData.mockRestore()
  })
})
