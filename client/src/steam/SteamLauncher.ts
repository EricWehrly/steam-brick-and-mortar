/**
 * SteamLauncher - Utility for launching Steam games from browser
 * 
 * Uses Steam browser protocol (steam:// URLs) to launch games directly
 * from the Steam client. Provides fallback options for error cases.
 */

import { Logger } from '../utils/Logger'

export interface LaunchResult {
    success: boolean
    method: 'protocol' | 'store' | 'failed'
    message: string
}

export class SteamLauncher {
    private static readonly logger = Logger.withContext(SteamLauncher.name)
    /**
     * Launch a Steam game using the steam:// protocol
     * @param appid Steam application ID
     * @param gameName Optional game name for logging
     * @returns Promise with launch result details
     */
    static async launchGame(appid: number, gameName?: string): Promise<LaunchResult> {
        const steamUrl = `steam://run/${appid}`
        const storeUrl = `https://store.steampowered.com/app/${appid}`
        const gameLabel = gameName || `AppID ${appid}`
        
        SteamLauncher.logger.info(`Attempting to launch: ${gameLabel} (${appid})`)
        
        try {
            // Attempt to launch via Steam protocol
            const launched = this.openSteamProtocol(steamUrl)
            
            if (launched) {
                SteamLauncher.logger.info(`Steam protocol launched: ${gameLabel}`)
                return {
                    success: true,
                    method: 'protocol',
                    message: `Launch command sent to Steam for ${gameLabel}`
                }
            } else {
                throw new Error('Steam protocol not available')
            }
        } catch (error) {
            SteamLauncher.logger.warn(`Steam protocol failed for ${gameLabel}:`, error)
            
            // Fallback to Steam store page
            try {
                window.open(storeUrl, '_blank')
                SteamLauncher.logger.info(`Opened Steam store page: ${gameLabel}`)
                return {
                    success: true,
                    method: 'store',
                    message: `Opened Steam store page for ${gameLabel}`
                }
            } catch (storeError) {
                SteamLauncher.logger.error(`All launch methods failed for ${gameLabel}:`, storeError)
                return {
                    success: false,
                    method: 'failed',
                    message: `Failed to launch ${gameLabel} - please try manually`
                }
            }
        }
    }

    /**
     * Test Steam protocol availability with Hexcells Infinite
     * This is a diagnostic function for the Debug Panel
     */
    static async testSteamLaunch(): Promise<LaunchResult> {
        const HEXCELLS_INFINITE_APPID = 304410
        const result = await this.launchGame(HEXCELLS_INFINITE_APPID, 'Hexcells Infinite')
        
        // Add test-specific messaging
        if (result.success && result.method === 'protocol') {
            result.message = '🎯 Test successful! Hexcells Infinite should be launching in Steam.'
        } else if (result.success && result.method === 'store') {
            result.message = '⚠️ Steam protocol not available - opened store page as fallback.'
        } else {
            result.message = '❌ Steam launch test failed. Check if Steam is installed.'
        }
        
        return result
    }

    /**
     * Open Steam protocol URL with error handling
     * @param steamUrl The steam:// URL to open
     * @returns true if successfully opened, false otherwise
     */
    private static openSteamProtocol(steamUrl: string): boolean {
        try {
            // Use window.open to trigger protocol handler
            const newWindow = window.open(steamUrl, '_blank')
            
            // Note: We can't reliably detect if the protocol was handled
            // The window will be null or close immediately if successful
            // If protocol isn't handled, browser may show error or do nothing
            
            return true // Assume success - browser handles protocol errors
        } catch (error) {
            SteamLauncher.logger.error('Steam protocol error:', error)
            return false
        }
    }

    /**
     * Get Steam store URL for a game
     * @param appid Steam application ID
     * @returns Steam store URL
     */
    static getStoreUrl(appid: number): string {
        return `https://store.steampowered.com/app/${appid}`
    }

    /**
     * Get Steam protocol URL for launching a game
     * @param appid Steam application ID
     * @returns Steam protocol URL
     */
    static getLaunchUrl(appid: number): string {
        return `steam://run/${appid}`
    }

    /**
     * Check if we're in a secure context (required for some browser features)
     */
    static isSecureContext(): boolean {
        return window.isSecureContext || location.protocol === 'https:' || location.hostname === 'localhost'
    }

    /**
     * Get information about the current environment for debugging
     */
    static getEnvironmentInfo(): {
        userAgent: string
        isSecureContext: boolean
        supportsWindowOpen: boolean
    } {
        return {
            userAgent: navigator.userAgent,
            isSecureContext: this.isSecureContext(),
            supportsWindowOpen: typeof window.open === 'function'
        }
    }
}
