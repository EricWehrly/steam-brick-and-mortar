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
import { UIManager, PerformanceMonitor } from '../ui'
import { SceneManager, AssetLoader, GameBoxRenderer, SignageRenderer, StoreLayout, type SteamGameData } from '../scene'
import { PauseMenuManager } from '../ui/pause/PauseMenuManager'
import { CacheManagementPanel } from '../ui/pause/panels/CacheManagementPanel'
import { HelpPanel } from '../ui/pause/panels/HelpPanel'
import { ApplicationPanel } from '../ui/pause/panels/ApplicationPanel'
import { GameSettingsPanel } from '../ui/pause/panels/GameSettingsPanel'
import { DebugPanel, type DebugStats } from '../ui/pause/panels/DebugPanel'
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
    private signageRenderer: SignageRenderer
    private storeLayout: StoreLayout
    private steamIntegration: SteamIntegration
    private webxrManager: WebXRManager
    private inputManager: InputManager
    private uiManager: UIManager
    private performanceMonitor: PerformanceMonitor
    private pauseMenuManager: PauseMenuManager
    private cacheManagementPanel: CacheManagementPanel | null = null
    private applicationPanel: ApplicationPanel | null = null
    
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
        this.signageRenderer = new SignageRenderer()
        
        // Initialize VR-optimized store layout (Phase 2C)
        this.storeLayout = new StoreLayout(this.sceneManager.getScene())
        this.gameBoxRenderer = new GameBoxRenderer(
            undefined, // Use default dimensions
            { maxGames: config.steam?.maxGames ?? 100 }, // Match Steam integration max games
            { 
                // Performance configuration for large libraries
                maxTextureSize: 1024,
                nearDistance: 2.0,
                farDistance: 10.0,
                highResolutionSize: 512,
                mediumResolutionSize: 256,
                lowResolutionSize: 128,
                maxActiveTextures: Math.min(50, (config.steam?.maxGames ?? 100) / 2), // Scale with library size
                frustumCullingEnabled: true
            }
        )
        
        // Initialize Steam integration
        this.steamIntegration = new SteamIntegration({
            apiBaseUrl: config.steam?.apiBaseUrl ?? 'https://steam-api-dev.wehrly.com',
            maxGames: config.steam?.maxGames ?? 100 // Increased from 30 to support larger libraries
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
        
        // Initialize Performance Monitor
        this.performanceMonitor = new PerformanceMonitor({
            position: 'top-right',
            showMemory: true,
            showDrawCalls: true,
            updateInterval: 100,
            precision: 1
        })

        // Initialize Pause Menu System
        this.pauseMenuManager = new PauseMenuManager(
            {
                containerId: 'pause-menu-overlay',
                overlayClass: 'pause-menu-overlay',
                menuClass: 'pause-menu'
            },
            {
                onPauseInput: () => this.handleInputPause(),
                onResumeInput: () => this.handleInputResume(),
                onMenuOpen: () => this.handlePauseMenuOpen(),
                onMenuClose: () => this.handlePauseMenuClose()
            }
        )
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
            
            // Initialize pause menu system
            this.pauseMenuManager.init()
            
            // Register pause menu panels
            const cachePanel = new CacheManagementPanel()
            cachePanel.initCacheFunctions(
                () => this.steamIntegration.getImageCacheStats(),
                () => this.steamIntegration.clearImageCache()
            )
            this.cacheManagementPanel = cachePanel
            this.pauseMenuManager.registerPanel(cachePanel)
            
            // Add help panel
            this.pauseMenuManager.registerPanel(new HelpPanel())
            
            // Add application panel with callbacks
            const applicationPanel = new ApplicationPanel()
            applicationPanel.initialize({
                onSettingsChanged: (settings) => this.handleSettingsChange(settings)
            })
            this.applicationPanel = applicationPanel
            this.pauseMenuManager.registerPanel(applicationPanel)
            
            // Add game settings panel
            const gameSettingsPanel = new GameSettingsPanel()
            this.pauseMenuManager.registerPanel(gameSettingsPanel)
            
            // Add debug panel with callbacks
            const debugPanel = new DebugPanel()
            debugPanel.initialize({
                onGetDebugStats: () => this.getDebugStats()
            })
            this.pauseMenuManager.registerPanel(debugPanel)
            
            // Initialize settings button
            this.initializeSettingsButton()
            
            this.uiManager.hideLoading()
            this.startRenderLoop()
            
            // Start performance monitoring
            this.performanceMonitor.start()
            
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
        
        this.performanceMonitor.dispose()
        this.pauseMenuManager.dispose()
        this.signageRenderer.dispose()
        this.storeLayout.dispose()
        this.inputManager.dispose()
        this.webxrManager.dispose()
        this.sceneManager.dispose()
        
        this.isInitialized = false
        console.log('✅ Application disposed')
    }

    /**
     * Get comprehensive debug statistics for the debug panel
     */
    private async getDebugStats(): Promise<DebugStats> {
        const scene = this.sceneManager.getScene()
        const renderer = this.sceneManager.getRenderer()
        const info = renderer.info

        // Count scene objects
        let meshCount = 0
        let lightCount = 0
        let cameraCount = 0

        scene.traverse((object) => {
            if (object instanceof THREE.Mesh) meshCount++
            if (object instanceof THREE.Light) lightCount++
            if (object instanceof THREE.Camera) cameraCount++
        })

        // Get performance stats
        const performanceStats = this.performanceMonitor.getStats()
        
        // Get cache stats
        const imageCacheStats = await this.steamIntegration.getImageCacheStats()
        
        // Get WebGL context info
        const gl = renderer.getContext()
        const debugInfo = renderer.debug
        
        // Get memory info if available
        const performanceObj = window.performance as unknown as { memory?: { usedJSHeapSize: number; totalJSHeapSize: number } }
        const memoryInfo = performanceObj.memory ?? {
            usedJSHeapSize: 0,
            totalJSHeapSize: 0
        }

        // Get storage quota info
        let quotaUsed = 0
        let quotaTotal = 0
        try {
            if ('storage' in navigator && 'estimate' in navigator.storage) {
                const estimate = await navigator.storage.estimate()
                quotaUsed = estimate.usage ?? 0
                quotaTotal = estimate.quota ?? 0
            }
        } catch {
            // Storage API not available
        }

        return {
            sceneObjects: {
                total: scene.children.length,
                meshes: meshCount,
                lights: lightCount,
                cameras: cameraCount,
                textures: info.memory.textures,
                materials: Object.keys(scene.userData.materials ?? {}).length,
                geometries: info.memory.geometries
            },
            performance: {
                fps: performanceStats.fps,
                frameTime: performanceStats.frameTime,
                memoryUsed: memoryInfo.usedJSHeapSize,
                memoryTotal: memoryInfo.totalJSHeapSize,
                triangles: info.render.triangles,
                drawCalls: info.render.calls
            },
            cache: {
                imageCount: imageCacheStats.totalImages,
                imageCacheSize: imageCacheStats.totalSize,
                gameDataCount: 0, // TODO: Implement getGameDataCount in SteamIntegration
                gameDataSize: 0, // TODO: Implement getGameDataSize in SteamIntegration
                quotaUsed,
                quotaTotal
            },
            system: {
                userAgent: navigator.userAgent,
                webxrSupported: 'xr' in navigator, // Simple check for WebXR support
                webglVersion: renderer.capabilities.isWebGL2 ? 'WebGL 2.0' : 'WebGL 1.0',
                maxTextureSize: renderer.capabilities.maxTextureSize,
                vendor: debugInfo.checkShaderErrors ? 'Debug Mode' : gl.getParameter(gl.VENDOR) ?? 'Unknown',
                renderer: gl.getParameter(gl.RENDERER) ?? 'Unknown'
            }
        }
    }

    // Scene Setup Methods

    private async setupScene(): Promise<void> {
        // Generate the complete VR-optimized store layout with Steam categories
        console.log('🏪 Generating VR-optimized store layout...')
        await this.storeLayout.generateStore()
        
        // Create visible fluorescent fixtures (positioned just below ceiling)
        this.sceneManager.createFluorescentFixtures(3.2)
        
        // Create Blockbuster signage
        this.signageRenderer.createStandardSigns(this.sceneManager.getScene())
        
        // Load shelf model (legacy - may be replaced by procedural shelves)
        await this.loadShelfModel()
        
        // Add test cube for reference
        this.addTestCube()
        
        // Log store stats
        const stats = this.storeLayout.getStoreStats()
        console.log('📊 Store Stats:', stats)
        
        console.log('✅ VR-optimized scene setup complete with Steam categories!')
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

    // Pause Menu Event Handlers

    private handleInputPause(): void {
        // Pause input handling - stop camera movement
        this.inputManager.stopListening()
        console.log('⏸️ Input paused')
    }

    private handleInputResume(): void {
        // Resume input handling - restart camera movement
        this.inputManager.startListening()
        console.log('▶️ Input resumed')
    }

    private handlePauseMenuOpen(): void {
        console.log('📋 Pause menu opened')
        // Additional logic when pause menu opens (e.g., pause animations)
    }

    private handlePauseMenuClose(): void {
        console.log('📋 Pause menu closed')
        // Additional logic when pause menu closes (e.g., resume animations)
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
            
            // Enable cache management actions now that Steam profile is loaded
            this.cacheManagementPanel?.enableCacheActions()
            
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
            
            // Disable cache management actions on error
            this.cacheManagementPanel?.disableCacheActions()
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
                // Calculate viewing distance for performance optimization
                const camera = this.sceneManager.getCamera()
                const viewingDistance = camera.position.distanceTo(gameBox.position)
                
                // Apply optimized texture using the GameBoxRenderer texture system
                const textureOptions = {
                    artworkBlobs,
                    fallbackColor: undefined, // Keep current fallback color
                    enableLazyLoading: true, // Enable lazy loading for performance
                    viewingDistance
                }
                
                // Apply optimized texture to existing game box
                await this.gameBoxRenderer.applyOptimizedTexture(gameBox, game, textureOptions)
                console.log(`🖼️ Applied optimized artwork texture to: ${game.name}`)
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
        let lastPerformanceUpdate = 0
        const performanceUpdateInterval = 1000 // Update performance data every second
        
        this.sceneManager.startRenderLoop(() => {
            const now = Date.now()
            
            // Update camera movement using InputManager
            const camera = this.sceneManager.getCamera()
            this.inputManager.updateCameraMovement(camera)
            
            // Update performance data periodically
            if (now - lastPerformanceUpdate > performanceUpdateInterval) {
                this.gameBoxRenderer.updatePerformanceData(camera, this.sceneManager.getScene())
                this.gameBoxRenderer.cleanupOffScreenTextures()
                
                // Update performance monitor with Three.js renderer stats
                this.performanceMonitor.updateRenderStats(this.sceneManager.getRenderer())
                
                lastPerformanceUpdate = now
            }
            
            // Rotate the test cube
            const scene = this.sceneManager.getScene()
            const cube = scene.getObjectByName('cube') ?? scene.children.find(obj => obj instanceof THREE.Mesh)
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

    /**
     * Get performance statistics for debugging and monitoring
     */
    getPerformanceStats(): ReturnType<GameBoxRenderer['getPerformanceStats']> {
        return this.gameBoxRenderer.getPerformanceStats()
    }
    
    /**
     * Toggle the performance monitor display
     */
    togglePerformanceMonitor(): void {
        this.performanceMonitor.toggle()
    }
    
    /**
     * Get current performance statistics from the performance monitor
     */
    getCurrentPerformanceStats() {
        return this.performanceMonitor.getStats()
    }
    
    /**
     * Initialize the settings button that opens the pause menu
     */
    private initializeSettingsButton(): void {
        const settingsButton = document.getElementById('settings-button')
        if (settingsButton) {
            settingsButton.addEventListener('click', () => {
                this.pauseMenuManager.open()
            })
        } else {
            console.warn('Settings button not found in DOM')
        }
    }

    /**
     * Handle application settings changes
     */
    private handleSettingsChange(settings: Partial<import('../ui/pause/panels/ApplicationPanel').ApplicationSettings>): void {
        console.log('⚙️ Application settings changed:', settings)
        
        // Handle performance settings
        if (settings.showFPS !== undefined) {
            // Toggle FPS display based on setting
            if (settings.showFPS) {
                this.performanceMonitor.show()
            } else {
                this.performanceMonitor.hide()
            }
        }
        
        if (settings.showPerformanceStats !== undefined) {
            // Toggle performance stats visibility
            if (settings.showPerformanceStats) {
                this.performanceMonitor.show()
            } else {
                this.performanceMonitor.hide()
            }
        }
        
        if (settings.qualityLevel !== undefined) {
            // Update graphics quality settings
            console.log(`🎨 Graphics quality set to: ${settings.qualityLevel}`)
            this.updateGraphicsQuality(settings.qualityLevel)
        }
        
        // Handle interface settings
        if (settings.hideUIInVR !== undefined) {
            // Handle VR UI visibility (when VR support is available)
            console.log(`👓 VR UI visibility setting: ${!settings.hideUIInVR}`)
        }
        
        // Handle debug settings
        if (settings.verboseLogging !== undefined) {
            console.log('🐛 Debug settings updated')
        }
    }

    /**
     * Update graphics quality based on setting
     */
    private updateGraphicsQuality(quality: 'low' | 'medium' | 'high' | 'ultra'): void {
        // This would update renderer settings, shadow quality, etc.
        const renderer = this.sceneManager.getRenderer()
        
        switch (quality) {
            case 'low':
                renderer.shadowMap.enabled = false
                renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1))
                break
            case 'medium':
                renderer.shadowMap.enabled = true
                renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
                break
            case 'high':
                renderer.shadowMap.enabled = true
                renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
                break
            case 'ultra':
                renderer.shadowMap.enabled = true
                renderer.setPixelRatio(window.devicePixelRatio)
                break
        }
        
        console.log(`🎨 Graphics quality applied: ${quality}`)
    }
}
