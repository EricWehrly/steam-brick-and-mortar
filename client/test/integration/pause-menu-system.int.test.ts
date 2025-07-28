/**
 * Integration test for the pause menu system
 * Tests escape key integration and menu functionality
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { PauseMenuManager } from '../../src/ui/pause/PauseMenuManager'
import { CacheManagementPanel } from '../../src/ui/pause/panels/CacheManagementPanel'
import { HelpPanel } from '../../src/ui/pause/panels/HelpPanel'

// Mock DOM environment
function createMockDOM() {
    const mockElement = {
        style: {} as CSSStyleDeclaration,
        classList: {
            add: vi.fn(),
            remove: vi.fn(),
            contains: vi.fn()
        },
        appendChild: vi.fn(),
        removeChild: vi.fn(),
        remove: vi.fn(),
        querySelector: vi.fn(),
        querySelectorAll: vi.fn(() => []),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        insertAdjacentHTML: vi.fn(),
        innerHTML: '',
        textContent: '',
        id: '',
        className: ''
    }

    const mockDocument = {
        createElement: vi.fn(() => mockElement),
        getElementById: vi.fn(() => mockElement),
        querySelector: vi.fn(() => mockElement),
        querySelectorAll: vi.fn(() => []),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        body: mockElement,
        head: mockElement,
        activeElement: null
    }

    return { mockElement, mockDocument }
}

describe('Pause Menu Integration Tests', () => {
    let pauseMenuManager: PauseMenuManager
    let mockCallbacks: any
    let mockDOM: ReturnType<typeof createMockDOM>

    beforeEach(() => {
        // Setup DOM mocks
        mockDOM = createMockDOM()
        vi.stubGlobal('document', mockDOM.mockDocument)
        vi.stubGlobal('window', {
            setInterval: vi.fn((fn, delay) => {
                return setTimeout(fn, delay)
            }),
            clearInterval: vi.fn(),
            caches: {
                keys: vi.fn().mockResolvedValue([]),
                open: vi.fn().mockResolvedValue({
                    keys: vi.fn().mockResolvedValue([]),
                    delete: vi.fn().mockResolvedValue(true)
                }),
                delete: vi.fn().mockResolvedValue(true)
            },
            confirm: vi.fn().mockReturnValue(true)
        })
        vi.stubGlobal('localStorage', {
            getItem: vi.fn(),
            setItem: vi.fn(),
            removeItem: vi.fn(),
            clear: vi.fn()
        })
        vi.stubGlobal('navigator', {
            storage: {
                estimate: vi.fn().mockResolvedValue({
                    usage: 1000000,
                    quota: 10000000
                })
            }
        })

        // Setup callbacks
        mockCallbacks = {
            onPauseInput: vi.fn(),
            onResumeInput: vi.fn(),
            onMenuOpen: vi.fn(),
            onMenuClose: vi.fn()
        }

        // Create pause menu manager
        pauseMenuManager = new PauseMenuManager({}, mockCallbacks)
    })

    afterEach(() => {
        pauseMenuManager?.dispose()
        vi.restoreAllMocks()
        vi.unstubAllGlobals()
    })

    describe('Initialization', () => {
        it('should initialize pause menu system', () => {
            expect(() => pauseMenuManager.init()).not.toThrow()
            expect(mockDOM.mockDocument.createElement).toHaveBeenCalled()
            expect(mockDOM.mockDocument.body.appendChild).toHaveBeenCalled()
        })

        it('should register panels successfully', () => {
            pauseMenuManager.init()
            
            const cachePanel = new CacheManagementPanel()
            const helpPanel = new HelpPanel()
            
            expect(() => pauseMenuManager.registerPanel(cachePanel)).not.toThrow()
            expect(() => pauseMenuManager.registerPanel(helpPanel)).not.toThrow()
        })
    })

    describe('Menu State Management', () => {
        beforeEach(() => {
            pauseMenuManager.init()
            pauseMenuManager.registerPanel(new CacheManagementPanel())
            pauseMenuManager.registerPanel(new HelpPanel())
        })

        it('should toggle menu open and closed', () => {
            expect(pauseMenuManager.isOpen()).toBe(false)
            
            pauseMenuManager.toggle()
            expect(pauseMenuManager.isOpen()).toBe(true)
            expect(mockCallbacks.onMenuOpen).toHaveBeenCalled()
            expect(mockCallbacks.onPauseInput).toHaveBeenCalled()
            
            pauseMenuManager.toggle()
            expect(pauseMenuManager.isOpen()).toBe(false)
            expect(mockCallbacks.onMenuClose).toHaveBeenCalled()
            expect(mockCallbacks.onResumeInput).toHaveBeenCalled()
        })

        it('should open specific panel', () => {
            pauseMenuManager.open('cache-management')
            expect(pauseMenuManager.isOpen()).toBe(true)
            
            const state = pauseMenuManager.getState()
            expect(state.activePanel).toBe('cache-management')
        })

        it('should handle panel switching', () => {
            pauseMenuManager.open('cache-management')
            expect(pauseMenuManager.getState().activePanel).toBe('cache-management')
            
            pauseMenuManager.showPanel('help')
            expect(pauseMenuManager.getState().activePanel).toBe('help')
        })
    })

    describe('Keyboard Integration', () => {
        beforeEach(() => {
            pauseMenuManager.init()
            pauseMenuManager.registerPanel(new CacheManagementPanel())
        })

        it('should setup escape key handler', () => {
            expect(mockDOM.mockDocument.addEventListener).toHaveBeenCalledWith(
                'keydown',
                expect.any(Function)
            )
        })

        it('should toggle menu on escape key', () => {
            // Get the keydown event handler
            const keydownHandler = mockDOM.mockDocument.addEventListener.mock.calls
                .find(([event]) => event === 'keydown')?.[1]
            
            expect(keydownHandler).toBeDefined()
            
            // Simulate escape key press
            const escapeEvent = {
                key: 'Escape',
                preventDefault: vi.fn()
            }
            
            keydownHandler(escapeEvent)
            expect(escapeEvent.preventDefault).toHaveBeenCalled()
            expect(pauseMenuManager.isOpen()).toBe(true)
            
            keydownHandler(escapeEvent)
            expect(pauseMenuManager.isOpen()).toBe(false)
        })

        it('should not trigger on escape when input is focused', () => {
            // Mock focused input element
            const mockInput = { ...mockDOM.mockElement, tagName: 'INPUT' }
            mockDOM.mockDocument.activeElement = mockInput
            
            const keydownHandler = mockDOM.mockDocument.addEventListener.mock.calls
                .find(([event]) => event === 'keydown')?.[1]
            
            const escapeEvent = {
                key: 'Escape',
                preventDefault: vi.fn()
            }
            
            keydownHandler(escapeEvent)
            expect(pauseMenuManager.isOpen()).toBe(false)
        })
    })

    describe('Panel Management', () => {
        beforeEach(() => {
            pauseMenuManager.init()
        })

        it('should create cache management panel with all features', () => {
            const cachePanel = new CacheManagementPanel()
            pauseMenuManager.registerPanel(cachePanel)
            
            expect(cachePanel.id).toBe('cache-management')
            expect(cachePanel.title).toBe('Cache Management')
            expect(cachePanel.icon).toBe('🗂️')
        })

        it('should create help panel with controls information', () => {
            const helpPanel = new HelpPanel()
            pauseMenuManager.registerPanel(helpPanel)
            
            expect(helpPanel.id).toBe('help')
            expect(helpPanel.title).toBe('Help & Controls')
            expect(helpPanel.icon).toBe('❓')
        })

        it('should render panel content correctly', () => {
            const helpPanel = new HelpPanel()
            const content = helpPanel.render()
            
            expect(content).toContain('Movement Controls')
            expect(content).toContain('W A S D')
            expect(content).toContain('System Controls')
            expect(content).toContain('Escape')
            expect(content).toContain('VR Controls')
        })
    })

    describe('Cleanup', () => {
        it('should dispose resources properly', () => {
            pauseMenuManager.init()
            const cachePanel = new CacheManagementPanel()
            pauseMenuManager.registerPanel(cachePanel)
            
            expect(() => pauseMenuManager.dispose()).not.toThrow()
            expect(pauseMenuManager.isOpen()).toBe(false)
        })

        it('should remove DOM elements on dispose', () => {
            pauseMenuManager.init()
            pauseMenuManager.dispose()
            
            expect(mockDOM.mockElement.remove).toHaveBeenCalled()
        })
    })

    describe('Error Handling', () => {
        it('should handle missing panels gracefully', () => {
            pauseMenuManager.init()
            
            expect(() => pauseMenuManager.showPanel('non-existent')).not.toThrow()
            expect(pauseMenuManager.getState().activePanel).toBeNull()
        })

        it('should handle multiple initialization attempts', () => {
            pauseMenuManager.init()
            expect(() => pauseMenuManager.init()).not.toThrow()
        })

        it('should handle disposal without initialization', () => {
            expect(() => pauseMenuManager.dispose()).not.toThrow()
        })
    })

    describe('Input State Management', () => {
        beforeEach(() => {
            pauseMenuManager.init()
        })

        it('should track input pause state correctly', () => {
            const state = pauseMenuManager.getState()
            expect(state.inputPaused).toBe(false)
            
            pauseMenuManager.open()
            const pausedState = pauseMenuManager.getState()
            expect(pausedState.inputPaused).toBe(true)
            
            pauseMenuManager.close()
            const resumedState = pauseMenuManager.getState()
            expect(resumedState.inputPaused).toBe(false)
        })

        it('should preserve focus correctly', () => {
            const mockFocusElement = { ...mockDOM.mockElement, focus: vi.fn() }
            mockDOM.mockDocument.activeElement = mockFocusElement
            
            pauseMenuManager.open()
            pauseMenuManager.close()
            
            expect(mockFocusElement.focus).toHaveBeenCalled()
        })
    })
})
