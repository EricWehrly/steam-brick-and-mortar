/**
 * Steam Brick and Mortar - WebXR Main Entry Point
 * 
 * This is the application entry point that initializes the Steam Brick and Mortar
 * WebXR environment. The actual application logic is handled by the 
 * SteamBrickAndMortarApp orchestrator class.
 */

import './styles/main.css'
import { SteamBrickAndMortarApp } from './core'
import { TestMode } from './types/TestMode'

// Track if initialization is already in progress or completed
let isInitializing = false
let isInitialized = false

/**
 * Initialize the Steam Brick and Mortar application
 */
export async function initializeApp(): Promise<void> {
    // Prevent duplicate initialization
    if (isInitializing || isInitialized) {
        console.debug('⚠️ App initialization already in progress or completed, skipping duplicate attempt')
        return
    }
    
    isInitializing = true
    
    try {
        console.log('🚀 Starting Steam Brick and Mortar...')
        
        const app = new SteamBrickAndMortarApp({
            scene: {
                antialias: true
            },
            steam: {
                apiBaseUrl: 'https://steam-api-dev.wehrly.com'
                // maxGames will be determined by AppSettings developmentMode default (20 when dev mode is enabled)
            },
            input: {
                speed: 0.1,
                mouseSensitivity: 0.005
            },
            tests: {
                [TestMode.GPU_INSTANCED_TEXTURES]: 'enabled'
            }
        })
        
        await app.init()
        
        // Store app reference globally for debugging
        if (typeof window !== 'undefined') {
            ;(window as typeof window & { steamBrickAndMortarApp: SteamBrickAndMortarApp }).steamBrickAndMortarApp = app
        }
        
        isInitialized = true
        
    } catch (error) {
        console.error('💥 Failed to initialize Steam Brick and Mortar:', error)
        
        // Show user-friendly error message
        const errorElement = document.getElementById('loading-status')
        if (errorElement) {
            errorElement.textContent = 'Failed to initialize application. Please refresh to try again.'
            errorElement.style.color = '#ff6b6b'
        }
        
        // Reset flags so user can try again
        isInitializing = false
        isInitialized = false
    } finally {
        isInitializing = false
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initializeApp)

// Also initialize immediately if DOM is already loaded
if (document.readyState !== 'loading') {
    // DOM is already loaded, initialize immediately
    initializeApp()
}
