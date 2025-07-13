/**
 * Steam Brick and Mortar Application Core
 * 
 * Main application orchestrator that coordinates all subsystems:
 * - Scene management (Three.js)
 * - WebXR management and input handling  
 * - Steam integration and game library
 * - UI management and event handling
 * 
 * This class follows the orchestrator pattern - it initializes and coordinates
 * subsystems but delegates specific functionality to dedicated managers.
 */

import * as THREE from 'three'
import { ValidationUtils } from '../utils'
import { UIManager } from '../ui'
import { CacheManagementUI } from '../ui/CacheManagementUI'
import { SceneManager, AssetLoader, GameBoxRenderer, type SteamGameData } from '../scene'
import { SteamIntegration, type ProgressCallbacks } from '../steam-integration'
import { WebXRManager, type WebXRCapabilities } from '../webxr/WebXRManager'
import { InputManager } from '../webxr/InputManager'

/**
 * Configuration options for the Steam Brick and Mortar application
 */
export interface AppConfig {
    scene?: {
        antialias?: boolean
        enableShadows?: boolean
        shadowMapType?: THREE.ShadowMapType
        outputColorSpace?: THREE.ColorSpace
    }
    steam?: {
        apiBaseUrl?: string
        maxGames?: number
    }
    input?: {
        speed?: number
        mouseSensitivity?: number
    }
}

/**
 * Main application class that orchestrates all subsystems
 */
export class SteamBrickAndMortarApp {
    private sceneManager: SceneManager
    private assetLoader: AssetLoader
    private gameBoxRenderer: GameBoxRenderer
    private steamIntegration: SteamIntegration
    private webxrManager: WebXRManager
    private inputManager: InputManager
    private uiManager: UIManager
    private cacheUI: CacheManagementUI
    
    // Current game index for rendering
    private currentGameIndex: number = 0
    private isInitialized: boolean = false

    constructor(config: AppConfig = {}) {
        // Initialize scene management
        this.sceneManager = new SceneManager({
            antialias: config.scene?.antialias ?? true,
            enableShadows: config.scene?.enableShadows ?? true,
            shadowMapType: config.scene?.shadowMapType ?? THREE.PCFSoftShadowMap,
            outputColorSpace: config.scene?.outputColorSpace ?? THREE.SRGBColorSpace
        })
        
        this.assetLoader = new AssetLoader()
        this.gameBoxRenderer = new GameBoxRenderer()
        
        // Initialize Steam integration
        this.steamIntegration = new SteamIntegration({
            apiBaseUrl: config.steam?.apiBaseUrl ?? 'https://steam-api-dev.wehrly.com',
            maxGames: config.steam?.maxGames ?? 30
        })
        
        // Initialize WebXR components with callbacks
        this.webxrManager = new WebXRManager({
            onSessionStart: () => this.handleWebXRSessionStart(),
            onSessionEnd: () => this.handleWebXRSessionEnd(),
            onError: (error: Error) => this.handleWebXRError(error),
            onSupportChange: (capabilities: WebXRCapabilities) => this.handleWebXRSupportChange(capabilities)
        })
        
        // Initialize input management
        this.inputManager = new InputManager(
            { 
                speed: config.input?.speed ?? 0.1, 
                mouseSensitivity: config.input?.mouseSensitivity ?? 0.005 
            },
            {
                onMouseMove: (deltaX: number, deltaY: number) => this.handleMouseMove(deltaX, deltaY)
            }
        )
        
        // Initialize UI Manager with event handlers
        this.uiManager = new UIManager({
            steamLoadGames: (vanityUrl: string) => this.handleLoadSteamGames(vanityUrl),
            steamUseOffline: (vanityUrl: string) => this.handleUseOfflineData(vanityUrl),
            steamRefreshCache: () => this.handleRefreshCache(),
            steamClearCache: () => this.handleClearCache(),
            steamShowCacheStats: () => this.handleShowCacheStats(),
            webxrEnterVR: () => this.handleWebXRToggle()
        })
        
        // Initialize Cache Management UI
        this.cacheUI = new CacheManagementUI({
            containerId: 'cache-management-container',
            refreshInterval: 5000, // 5 seconds
            autoCollapse: true
        })
    }

    /**
     * Initialize the application
     */
    async init(): Promise<void> {
        if (this.isInitialized) {
            console.warn('⚠️ App already initialized')
            return
        }

        console.log('🎮 Initializing Steam Brick and Mortar WebXR...')
        
        try {
            await this.setupScene()
            await this.setupWebXR()
            this.setupControls()
            this.uiManager.init()
            
            // Initialize cache management UI
            this.cacheUI.init(
                () => this.steamIntegration.getImageCacheStats(),
                () => this.steamIntegration.clearImageCache()
            )
            
            this.uiManager.hideLoading()
            this.startRenderLoop()
            
            this.isInitialized = true
            console.log('✅ WebXR environment ready!')
        } catch (error) {
            console.error('❌ Failed to initialize WebXR environment:', error)
            this.uiManager.showError('Failed to initialize WebXR environment')
            throw error
        }
    }

    /**
     * Dispose of resources and clean up
     */
    dispose(): void {
        if (!this.isInitialized) {
            return
        }

        console.log('🧹 Disposing application resources...')
        
        this.cacheUI.dispose()
        this.inputManager.dispose()
        this.webxrManager.dispose()
        this.sceneManager.dispose()
        
        this.isInitialized = false
        console.log('✅ Application disposed')
    }

    // Scene Setup Methods

    private async setupScene(): Promise<void> {
        // Create floor
        this.sceneManager.createFloor()
        
        // Load shelf model
        await this.loadShelfModel()
        
        // Add test cube for reference
        this.addTestCube()
        
        console.log('✅ Scene setup complete')
    }

    private async loadShelfModel(): Promise<void> {
        try {
            console.log('📦 Loading shelf model...')
            const shelfModel = await this.assetLoader.loadShelfModel()
            this.sceneManager.addToScene(shelfModel)
            
            // Add placeholder game boxes
            this.gameBoxRenderer.createPlaceholderBoxes(this.sceneManager.getScene())
            
            console.log('✅ Shelf model loaded successfully!')
        } catch (error) {
            console.error('❌ Failed to load shelf model:', error)
            console.warn('⚠️ Continuing without shelf model - check file path and format')
        }
    }

    private addTestCube(): void {
        // Small test cube for reference (can be removed later)
        const geometry = new THREE.BoxGeometry(0.2, 0.2, 0.2)
        const material = new THREE.MeshPhongMaterial({ color: 0x00ff00 })
        const cube = new THREE.Mesh(geometry, material)
        cube.position.set(2, 0, -1) // Move to side so it doesn't interfere with shelf
        cube.castShadow = true
        cube.name = 'cube' // For animation reference
        this.sceneManager.addToScene(cube)
    }

    // WebXR Setup Methods

    private async setupWebXR(): Promise<void> {
        // Set the renderer for WebXR
        this.webxrManager.setRenderer(this.sceneManager.getRenderer())
        
        // Check WebXR capabilities
        await this.webxrManager.checkCapabilities()
    }

    private setupControls(): void {
        // Start input listening
        this.inputManager.startListening()
    }

    // WebXR Event Handlers

    private handleWebXRSessionStart(): void {
        console.log('✅ WebXR session started!')
        this.uiManager.setWebXRSessionActive(true)
    }

    private handleWebXRSessionEnd(): void {
        console.log('🚪 WebXR session ended')
        this.uiManager.setWebXRSessionActive(false)
    }

    private handleWebXRError(error: Error): void {
        console.error('❌ WebXR error:', error)
        this.uiManager.showError('Failed to enter VR mode')
    }

    private handleWebXRSupportChange(capabilities: WebXRCapabilities): void {
        this.uiManager.setWebXRSupported(capabilities.supportsImmersiveVR)
    }

    private async handleWebXRToggle(): Promise<void> {
        try {
            await this.webxrManager.startVRSession()
        } catch (error) {
            // Error handling is done in the WebXRManager callbacks
            console.debug('WebXR toggle failed:', error)
        }
    }

    // Input Event Handlers

    private handleMouseMove(deltaX: number, deltaY: number): void {
        const camera = this.sceneManager.getCamera()
        this.inputManager.updateCameraRotation(camera, deltaX, deltaY)
    }

    // Steam Integration Event Handlers

    private async handleLoadSteamGames(vanityUrl: string): Promise<void> {
        // Reset current game index
        this.currentGameIndex = 0
        
        // Remove existing placeholder boxes before loading
        this.clearGameBoxes()
        
        this.uiManager.showProgress(true)
        
        try {
            // Use SteamIntegration with progress callbacks
            const progressCallbacks: ProgressCallbacks = {
                onProgress: (current: number, total: number, message: string) => {
                    this.uiManager.updateProgress(current, total, message)
                },
                onGameLoaded: async (game) => {
                    // Update game boxes in real-time as they load
                    await this.addGameBoxToScene(game, this.currentGameIndex++)
                },
                onStatusUpdate: (message: string, type: 'loading' | 'success' | 'error') => {
                    this.uiManager.showSteamStatus(message, type)
                }
            }
            
            await this.steamIntegration.loadGamesForUser(vanityUrl, progressCallbacks)
            
            // Update cache display and offline availability
            this.updateCacheStatsDisplay()
            this.uiManager.checkOfflineAvailability(ValidationUtils.extractVanityFromInput(vanityUrl))
            
            // Hide progress after a short delay
            setTimeout(() => {
                this.uiManager.showProgress(false)
            }, 2000)
            
        } catch (error) {
            console.error('❌ Failed to load Steam games:', error)
            this.uiManager.showSteamStatus(
                `❌ Failed to load games. Please check the Steam profile name and try again.`, 
                'error'
            )
            this.uiManager.showProgress(false)
        }
    }
    
    private clearGameBoxes(): void {
        // Remove existing game boxes using scene manager
        const clearedCount = this.sceneManager.clearObjectsByUserData('isGameBox')
        console.log(`🗑️ Cleared ${clearedCount} existing game boxes`)
    }
    
    private async addGameBoxToScene(game: SteamGameData, index: number): Promise<void> {
        // Create game box with immediate fallback color
        const gameBox = this.gameBoxRenderer.createGameBox(this.sceneManager.getScene(), game, index)
        if (gameBox) {
            this.currentGameIndex = index + 1
            
            // Apply texture asynchronously when artwork is available
            await this.applyGameArtworkTexture(gameBox, game)
        }
    }

    private async applyGameArtworkTexture(gameBox: THREE.Mesh, game: SteamGameData): Promise<void> {
        try {
            // Get cached artwork for this game
            const artworkBlobs = await this.getGameArtworkBlobs(game)
            
            if (artworkBlobs && Object.values(artworkBlobs).some(blob => blob !== null)) {
                // Apply texture using the GameBoxRenderer texture system
                const textureOptions = {
                    artworkBlobs,
                    fallbackColor: undefined // Keep current fallback color
                }
                
                // Apply texture to existing game box
                await this.gameBoxRenderer.applyTexture(gameBox, game, textureOptions)
                console.log(`🖼️ Applied cached artwork texture to: ${game.name}`)
            }
        } catch (error) {
            console.warn(`⚠️ Failed to apply artwork texture to ${game.name}:`, error)
        }
    }

    private async getGameArtworkBlobs(game: SteamGameData): Promise<Record<string, Blob | null> | null> {
        // Try to get artwork from cache for all available types
        const artworkBlobs: Record<string, Blob | null> = {}
        let hasAnyArtwork = false
        
        const artworkTypes = ['library', 'header', 'logo', 'icon'] as const
        
        for (const type of artworkTypes) {
            const artworkUrl = game.artwork?.[type]
            if (artworkUrl) {
                try {
                    const blob = await this.steamIntegration.getSteamClient().downloadGameImage(artworkUrl)
                    artworkBlobs[type] = blob
                    if (blob) {
                        hasAnyArtwork = true
                    }
                } catch (error) {
                    console.debug(`Could not load ${type} artwork for ${game.name}:`, error)
                    artworkBlobs[type] = null
                }
            } else {
                artworkBlobs[type] = null
            }
        }
        
        return hasAnyArtwork ? artworkBlobs : null
    }

    // Cache Management Methods
    
    private async handleUseOfflineData(vanityUrl: string): Promise<void> {
        // Check if offline data is available using SteamIntegration
        const hasOfflineData = this.steamIntegration.hasOfflineData(vanityUrl)
        
        if (!hasOfflineData) {
            this.uiManager.showSteamStatus('Offline mode not available in simplified client', 'error')
        } else {
            // Future: Load offline data
            this.uiManager.showSteamStatus('Loading offline data...', 'loading')
        }
    }
    
    private async handleRefreshCache(): Promise<void> {
        try {
            const progressCallbacks: ProgressCallbacks = {
                onProgress: (current: number, total: number, message: string) => {
                    this.uiManager.updateProgress(current, total, message)
                },
                onGameLoaded: async (game) => {
                    await this.addGameBoxToScene(game, this.currentGameIndex++)
                },
                onStatusUpdate: (message: string, type: 'loading' | 'success' | 'error') => {
                    this.uiManager.showSteamStatus(message, type)
                }
            }
            
            await this.steamIntegration.refreshData(progressCallbacks)
            this.updateCacheStatsDisplay()
        } catch (error) {
            console.error('❌ Failed to refresh cache:', error)
        }
    }
    
    private handleClearCache(): void {
        this.steamIntegration.clearCache()
        this.uiManager.showSteamStatus('🗑️ Cache cleared successfully', 'success')
        this.updateCacheStatsDisplay()
    }
    
    private handleShowCacheStats(): void {
        const stats = this.steamIntegration.getCacheStats()
        this.uiManager.updateCacheStats(stats)
    }
    
    private updateCacheStatsDisplay(): void {
        const stats = this.steamIntegration.getCacheStats()
        this.uiManager.updateCacheStats(stats)
    }

    // Render Loop

    private startRenderLoop(): void {
        this.sceneManager.startRenderLoop(() => {
            // Update camera movement using InputManager
            const camera = this.sceneManager.getCamera()
            this.inputManager.updateCameraMovement(camera)
            
            // Rotate the test cube
            const scene = this.sceneManager.getScene()
            const cube = scene.getObjectByName('cube') || scene.children.find(obj => obj instanceof THREE.Mesh)
            if (cube) {
                cube.rotation.x += 0.01
                cube.rotation.y += 0.01
            }
        })
    }

    // Public API for testing and debugging

    /**
     * Get access to the scene manager for debugging/testing
     */
    getSceneManager(): SceneManager {
        return this.sceneManager
    }

    /**
     * Get access to the Steam integration for debugging/testing
     */
    getSteamIntegration(): SteamIntegration {
        return this.steamIntegration
    }

    /**
     * Get access to the WebXR manager for debugging/testing
     */
    getWebXRManager(): WebXRManager {
        return this.webxrManager
    }

    /**
     * Check if the application is initialized
     */
    getIsInitialized(): boolean {
        return this.isInitialized
    }
}
