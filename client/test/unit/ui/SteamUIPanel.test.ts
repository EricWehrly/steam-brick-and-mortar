/**
 * Unit tests for SteamUIPanel event-driven cache availability
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { SteamUIPanel } from '../../../src/ui/SteamUIPanel'
import { SteamEventTypes } from '../../../src/types/InteractionEvents'

describe('SteamUIPanel Cache Availability Events', () => {
  let steamUIPanel: SteamUIPanel
  let mockInput: HTMLInputElement
  let mockButton: HTMLButtonElement
  let eventManagerEmitSpy: any

  beforeEach(async () => {
    // Setup DOM
    document.body.innerHTML = `
      <div id="steam-ui"></div>
      <input id="steam-user-input" type="text" />
      <button id="load-steam-games"></button>
      <button id="load-from-cache" class="hidden"></button>
      <button id="refresh-cache"></button>
      <button id="clear-cache"></button>
      <button id="show-cache-stats"></button>
      <div id="cache-info"></div>
      <div id="steam-status"></div>
    `

    mockInput = document.getElementById('steam-user-input') as HTMLInputElement
    mockButton = document.getElementById('load-from-cache') as HTMLButtonElement

    // Import EventManager and spy on the real instance
    const { EventManager } = await import('../../../src/core/EventManager')
    const eventManager = EventManager.getInstance()
    eventManagerEmitSpy = vi.spyOn(eventManager, 'emit')

    steamUIPanel = new SteamUIPanel()
    steamUIPanel.init()
  })

  afterEach(() => {
    document.body.innerHTML = ''
    vi.clearAllMocks()
  })

  it('should call SteamIntegration.hasCachedData when user types valid input', async () => {
    const testInput = 'testuser'
    
    // Mock SteamIntegration.getInstance
    const mockSteamIntegration = { hasCachedData: vi.fn().mockReturnValue(true) }
    const { SteamIntegration } = await import('../../../src/steam-integration/SteamIntegration')
    vi.spyOn(SteamIntegration, 'getInstance').mockReturnValue(mockSteamIntegration as any)

    mockInput.value = testInput
    const inputEvent = new Event('input', { bubbles: true })
    mockInput.dispatchEvent(inputEvent)

    // Wait for debounce timer (250ms)
    await new Promise(resolve => setTimeout(resolve, 300))

    expect(mockSteamIntegration.hasCachedData).toHaveBeenCalledWith(testInput)
  })

  it('should hide button immediately when input is empty without calling SteamIntegration', async () => {
    const { SteamIntegration } = await import('../../../src/steam-integration/SteamIntegration')
    const mockSteamIntegration = { hasCachedData: vi.fn() }
    vi.spyOn(SteamIntegration, 'getInstance').mockReturnValue(mockSteamIntegration as any)
    
    mockInput.value = ''
    const inputEvent = new Event('input', { bubbles: true })
    mockInput.dispatchEvent(inputEvent)

    // Should not call hasCachedData for empty input
    expect(mockSteamIntegration.hasCachedData).not.toHaveBeenCalled()
    // Button should be hidden
    expect(mockButton.classList.contains('hidden')).toBe(true)
  })

  it('should immediately hide button when input is cleared', () => {
    // Show button first
    steamUIPanel.updateLoadFromCacheButtonVisibility('test', true)
    expect(mockButton.classList.contains('hidden')).toBe(false)

    // Clear input
    mockInput.value = ''
    const inputEvent = new Event('input', { bubbles: true })
    mockInput.dispatchEvent(inputEvent)

    // Button should be hidden immediately
    expect(mockButton.classList.contains('hidden')).toBe(true)
  })

  it('should properly manage button visibility via updateLoadFromCacheButtonVisibility method', () => {
    // Test showing button
    steamUIPanel.updateLoadFromCacheButtonVisibility('testuser', true)
    expect(mockButton.classList.contains('hidden')).toBe(false)

    // Test hiding button
    steamUIPanel.updateLoadFromCacheButtonVisibility('testuser', false)
    expect(mockButton.classList.contains('hidden')).toBe(true)

    // Test hiding button with empty input
    steamUIPanel.updateLoadFromCacheButtonVisibility('', true)
    expect(mockButton.classList.contains('hidden')).toBe(true)
  })
})