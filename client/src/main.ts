/**
 * Steam Brick and Mortar - WebXR Main Entry Point
 * 
 * This is the application entry point that initializes the Steam Brick and Mortar
 * WebXR environment. The actual application logic is handled by the 
 * SteamBrickAndMortarApp orchestrator class.
 */

import { SteamBrickAndMortarApp } from './core'

/**
 * Initialize the Steam Brick and Mortar application
 */
async function initializeApp(): Promise<void> {
    try {
        console.log('🚀 Starting Steam Brick and Mortar...')
        
        const app = new SteamBrickAndMortarApp({
            scene: {
                antialias: true,
                enableShadows: true
            },
            steam: {
                apiBaseUrl: 'https://steam-api-dev.wehrly.com',
                maxGames: 30
            },
            input: {
                speed: 0.1,
                mouseSensitivity: 0.005
            }
        })
        
        await app.init()
        
        // Store app reference globally for debugging
        if (typeof window !== 'undefined') {
            ;(window as typeof window & { steamBrickAndMortarApp: SteamBrickAndMortarApp }).steamBrickAndMortarApp = app
        }
        
        console.log('🎉 Steam Brick and Mortar initialized successfully!')
        
    } catch (error) {
        console.error('💥 Failed to initialize Steam Brick and Mortar:', error)
        
        // Show user-friendly error message
        const errorElement = document.getElementById('loading-status')
        if (errorElement) {
            errorElement.textContent = 'Failed to initialize application. Please refresh to try again.'
            errorElement.style.color = '#ff6b6b'
        }
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initializeApp)

// Also initialize immediately if DOM is already loaded
if (document.readyState === 'loading') {
    // DOM is still loading, event listener will handle it
} else {
    // DOM is already loaded
    initializeApp()
}
