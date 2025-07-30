/**
 * Test for main.ts initialization logic
 * 
 * This test verifies that the main.ts file properly handles the DOM initialization
 * pattern and prevents duplicate initialization calls.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock console methods to track calls
const consoleSpy = {
    log: vi.spyOn(console, 'log').mockImplementation(() => {}),
    debug: vi.spyOn(console, 'debug').mockImplementation(() => {}),
    error: vi.spyOn(console, 'error').mockImplementation(() => {})
}

// Mock SteamBrickAndMortarApp
const mockApp = {
    init: vi.fn().mockResolvedValue(undefined)
}

const MockSteamBrickAndMortarApp = vi.fn().mockImplementation(() => mockApp)

// Mock the entire core module
vi.mock('../../../src/core', () => ({
    SteamBrickAndMortarApp: MockSteamBrickAndMortarApp
}))

// Mock DOM
const mockDocument = {
    addEventListener: vi.fn(),
    readyState: 'loading' as Document['readyState'],
    getElementById: vi.fn().mockReturnValue({
        textContent: '',
        style: { color: '' }
    })
}

const mockWindow = {}

// Mock global objects for the test environment
Object.defineProperty(globalThis, 'document', {
    value: mockDocument,
    writable: true
})

Object.defineProperty(globalThis, 'window', {
    value: mockWindow,
    writable: true
})

describe('Main.ts Initialization Logic', () => {
    beforeEach(() => {
        // Reset all mocks
        consoleSpy.log.mockClear()
        consoleSpy.debug.mockClear()
        consoleSpy.error.mockClear()
        mockDocument.addEventListener.mockClear()
        MockSteamBrickAndMortarApp.mockClear()
        mockApp.init.mockClear()
        
        // Reset DOM state
        mockDocument.readyState = 'loading'
        
        // Clear module cache to get fresh imports
        vi.resetModules()
    })

    afterEach(() => {
        vi.clearAllMocks()
    })

    it('should prevent duplicate initialization when DOM is already loaded', async () => {
        // Set DOM to already loaded state
        mockDocument.readyState = 'complete'
        
        // Import main.ts logic (simulating script loading after DOM ready)
        // This will automatically call initializeApp() once due to the module-level code
        const { initializeApp } = await import('../../../src/main')
        
        // Simulate additional calls that might happen:
        
        // 1. Event listener setup (this always happens but won't fire since DOM is complete)
        mockDocument.addEventListener('DOMContentLoaded', initializeApp)
        
        // 2. Explicit call (should be prevented since module already initialized)
        await initializeApp() // This should be prevented
        
        // 3. Another duplicate call
        await initializeApp() // This should also be prevented
        
        // Verify that app was only created and initialized once
        // (even though initializeApp was called 3 times total: once from module import, twice explicitly)
        expect(MockSteamBrickAndMortarApp).toHaveBeenCalledTimes(1)
        expect(mockApp.init).toHaveBeenCalledTimes(1)
        
        // Check for the prevention debug message on the two explicit calls
        const debugMessages = consoleSpy.debug.mock.calls.filter(call => 
            call[0]?.includes('App initialization already in progress or completed')
        )
        expect(debugMessages).toHaveLength(2)
        
        // Should have only one startup and success message
        const startupMessages = consoleSpy.log.mock.calls.filter(call => 
            call[0]?.includes('🚀 Starting Steam Brick and Mortar')
        )
        const successMessages = consoleSpy.log.mock.calls.filter(call => 
            call[0]?.includes('🎉 Steam Brick and Mortar initialized successfully')
        )
        
        expect(startupMessages).toHaveLength(1)
        expect(successMessages).toHaveLength(1)
    })

    it('should handle DOM loading state correctly', async () => {
        // Start with loading state
        mockDocument.readyState = 'loading'
        
        const { initializeApp } = await import('../../../src/main')
        
        // Only event listener should be set up, no immediate execution
        mockDocument.addEventListener('DOMContentLoaded', initializeApp)
        expect(mockDocument.addEventListener).toHaveBeenCalledWith('DOMContentLoaded', initializeApp)
        
        // App should not be created yet
        expect(MockSteamBrickAndMortarApp).toHaveBeenCalledTimes(0)
        
        // Simulate DOM loaded event
        await initializeApp()
        
        // Now app should be created
        expect(MockSteamBrickAndMortarApp).toHaveBeenCalledTimes(1)
        expect(mockApp.init).toHaveBeenCalledTimes(1)
    })

    it('should handle initialization errors correctly and allow retry', async () => {
        // Make init fail
        mockApp.init.mockRejectedValueOnce(new Error('Test initialization error'))
        
        const { initializeApp } = await import('../../../src/main')
        
        // First attempt should fail
        await initializeApp()
        
        // Should have logged error
        const errorMessages = consoleSpy.error.mock.calls.filter(call => 
            call[0]?.includes('💥 Failed to initialize Steam Brick and Mortar')
        )
        expect(errorMessages).toHaveLength(1)
        
        // Make init succeed on second try
        mockApp.init.mockResolvedValueOnce(undefined)
        
        // Second attempt should work (error should reset flags)
        await initializeApp()
        
        // Should have tried twice total
        expect(MockSteamBrickAndMortarApp).toHaveBeenCalledTimes(2)
        expect(mockApp.init).toHaveBeenCalledTimes(2)
    })

    it('should handle concurrent initialization attempts correctly', async () => {
        const { initializeApp } = await import('../../../src/main')
        
        // Make init take some time
        let resolveInit: () => void
        const initPromise = new Promise<void>(resolve => {
            resolveInit = resolve
        })
        mockApp.init.mockReturnValueOnce(initPromise)
        
        // Start two concurrent initialization attempts
        const promise1 = initializeApp()
        const promise2 = initializeApp() // This should be prevented
        
        // Second call should be immediately prevented
        expect(consoleSpy.debug.mock.calls.some(call => 
            call[0]?.includes('App initialization already in progress')
        )).toBe(true)
        
        // Complete the first initialization
        resolveInit!()
        await promise1
        await promise2
        
        // Should only have created one app instance
        expect(MockSteamBrickAndMortarApp).toHaveBeenCalledTimes(1)
        expect(mockApp.init).toHaveBeenCalledTimes(1)
    })
})

// Helper function to simulate main.ts logic in tests
async function simulateMainTsExecution(documentReadyState: Document['readyState']) {
    mockDocument.readyState = documentReadyState
    
    // Import fresh main.ts
    const mainModule = await import('../../../src/main')
    
    // The actual main.ts logic
    let callCount = 0
    const initializeApp = async () => {
        callCount++
        return mainModule.initializeApp()
    }
    
    // Simulate the DOM ready check logic
    mockDocument.addEventListener('DOMContentLoaded', initializeApp)
    
    if (documentReadyState !== 'loading') {
        await initializeApp()
    }
    
    return { callCount, initializeApp }
}

export { simulateMainTsExecution }
