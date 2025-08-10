/**
 * Steam Brick and Mortar Application Core
 * 
 * Main application orchestrator that coordinates high-level subsystems:
 * - Scene coordination via SceneCoordinator
 * - WebXR and input coordination via WebXRCoordinator  
 * - UI coordination via UICoordinator
 * - Steam integration and game management
 * 
 * This class follows the orchestrator pattern - it initializes coordinators
 * and delegates complex workflows to them, keeping this class focused on
 * high-level application lifecycle management.
 */

import * as THREE from 'three'
import { ValidationUtils } from '../utils'
import { UICoordinator, PerformanceMonitor } from '../ui'
import { SceneManager, SceneCoordinator } from '../scene'
import { DebugStatsProvider, type DebugStats } from './DebugStatsProvider'
import { SteamGameManager } from './SteamGameManager'
import { SteamIntegration, type ProgressCallbacks } from '../steam-integration'
import { WebXRCoordinator } from '../webxr/WebXRCoordinator'
import { WebXRManager, type WebXRCapabilities } from '../webxr/WebXRManager'

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
 * Main application class that orchestrates all subsystems via coordinators
 */
export class SteamBrickAndMortarApp {
    private sceneManager: SceneManager
    private sceneCoordinator: SceneCoordinator
    private webxrCoordinator: WebXRCoordinator
    private uiCoordinator: UICoordinator
    private performanceMonitor: PerformanceMonitor
    private steamIntegration: SteamIntegration
    private debugStatsProvider: DebugStatsProvider
    private steamGameManager: SteamGameManager
    
    // State
    private isInitialized: boolean = false

    constructor(config: AppConfig = {}) {
        // Initialize core scene management
        this.sceneManager = new SceneManager({
            antialias: config.scene?.antialias ?? true,
            enableShadows: config.scene?.enableShadows ?? true,
            shadowMapType: config.scene?.shadowMapType ?? THREE.PCFSoftShadowMap,
            outputColorSpace: config.scene?.outputColorSpace ?? THREE.SRGBColorSpace
        })
        
        // Initialize Performance Monitor
        this.performanceMonitor = new PerformanceMonitor({
            position: 'top-right',
            showMemory: true,
            showDrawCalls: true,
            updateInterval: 100,
            precision: 1
        })

        // Initialize Steam integration
        this.steamIntegration = new SteamIntegration({
            apiBaseUrl: config.steam?.apiBaseUrl ?? 'https://steam-api-dev.wehrly.com',
            maxGames: config.steam?.maxGames ?? 100
        })

        // Initialize scene coordinator with performance configuration
        this.sceneCoordinator = new SceneCoordinator(this.sceneManager, {
            maxGames: config.steam?.maxGames ?? 100,
            performance: {
                maxTextureSize: 1024,
                nearDistance: 2.0,
                farDistance: 10.0,
                highResolutionSize: 512,
                mediumResolutionSize: 256,
                lowResolutionSize: 128,
                maxActiveTextures: Math.min(50, (config.steam?.maxGames ?? 100) / 2),
                frustumCullingEnabled: true
            }
        })

        // Initialize WebXR coordinator
        this.webxrCoordinator = new WebXRCoordinator(
            {
                input: {
                    speed: config.input?.speed ?? 0.1,
                    mouseSensitivity: config.input?.mouseSensitivity ?? 0.005
                }
            },
            {
                onSessionStart: () => this.handleWebXRSessionStart(),
                onSessionEnd: () => this.handleWebXRSessionEnd(),
                onError: (error: Error) => this.handleWebXRError(error),
                onSupportChange: (capabilities: WebXRCapabilities) => this.handleWebXRSupportChange(capabilities)
            }
        )

        // Initialize UI coordinator with all callbacks
        this.uiCoordinator = new UICoordinator(
            this.performanceMonitor,
            {
                onWebXRToggle: () => this.handleWebXRToggle(),
                onLoadSteamGames: (vanityUrl: string) => this.handleLoadSteamGames(vanityUrl),
                onUseOfflineData: (vanityUrl: string) => this.handleUseOfflineData(vanityUrl),
                onRefreshCache: () => this.handleRefreshCache(),
                onClearCache: () => this.handleClearCache(),
                onShowCacheStats: () => this.handleShowCacheStats(),
                onGetImageCacheStats: () => this.steamIntegration.getImageCacheStats(),
                onClearImageCache: () => this.steamIntegration.clearImageCache(),
                onGetDebugStats: () => this.getDebugStats(),
                onPauseInput: () => this.handleInputPause(),
                onResumeInput: () => this.handleInputResume(),
                onMenuOpen: () => this.handlePauseMenuOpen(),
                onMenuClose: () => this.handlePauseMenuClose()
            }
        )

        // Initialize debug stats provider
        this.debugStatsProvider = new DebugStatsProvider(
            this.sceneManager,
            this.steamIntegration,
            this.performanceMonitor
        )

        // Initialize steam game manager with scene coordinator's game box renderer
        this.steamGameManager = new SteamGameManager(
            this.sceneCoordinator.getGameBoxRenderer(),
            this.sceneManager,
            this.steamIntegration
        )
    }

    async init(): Promise<void> {
        if (this.isInitialized) {
            console.warn('⚠️ App already initialized')
            return
        }

        console.log('🎮 Initializing Steam Brick and Mortar WebXR...')
        
        try {
            await this.initializeCoordinators()
            this.startRenderLoop()
            
            this.isInitialized = true
            console.log('✅ WebXR environment ready!')
        } catch (error) {
            console.error('❌ Failed to initialize WebXR environment:', error)
            this.uiCoordinator.showError('Failed to initialize WebXR environment')
            throw error
        }
    }

    private async initializeCoordinators(): Promise<void> {
        // Setup scene with complete store layout
        await this.sceneCoordinator.setupCompleteScene()
        
        // Setup UI with all components
        await this.uiCoordinator.setupUI(this.sceneManager.getRenderer())
        
        // Setup WebXR with input handling
        await this.webxrCoordinator.setupWebXR(this.sceneManager.getRenderer())
    }

    dispose(): void {
        if (!this.isInitialized) {
            return
        }

        console.log('🧹 Disposing application resources...')
        
        this.uiCoordinator.dispose()
        this.webxrCoordinator.dispose()
        this.sceneCoordinator.dispose()
        this.sceneManager.dispose()
        
        this.isInitialized = false
        console.log('✅ Application disposed')
    }

    private async getDebugStats(): Promise<DebugStats> {
        return await this.debugStatsProvider.getDebugStats()
    }

    private startRenderLoop(): void {
        let lastPerformanceUpdate = 0
        const performanceUpdateInterval = 1000 // Update performance data every second
        
        this.sceneManager.startRenderLoop(() => {
            const now = Date.now()
            const camera = this.sceneManager.getCamera()
            
            // Update camera movement via WebXR coordinator
            this.webxrCoordinator.updateCameraMovement(camera)
            
            // Update performance data periodically
            if (now - lastPerformanceUpdate > performanceUpdateInterval) {
                this.sceneCoordinator.updatePerformanceData(camera)
                
                // Update UI performance monitor with Three.js renderer stats
                this.uiCoordinator.updateRenderStats(this.sceneManager.getRenderer())
                
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

    private handleWebXRSessionStart(): void {
        this.uiCoordinator.updateWebXRSessionState(true)
    }

    private handleWebXRSessionEnd(): void {
        this.uiCoordinator.updateWebXRSessionState(false)
    }

    private handleWebXRError(_error: Error): void {
        this.uiCoordinator.showError('Failed to enter VR mode')
    }

    private handleWebXRSupportChange(capabilities: WebXRCapabilities): void {
        this.uiCoordinator.updateWebXRSupport(capabilities)
    }

    private async handleWebXRToggle(): Promise<void> {
        await this.webxrCoordinator.handleWebXRToggle()
    }

    private handleInputPause(): void {
        this.webxrCoordinator.pauseInput()
    }

    private handleInputResume(): void {
        this.webxrCoordinator.resumeInput()
    }

    private handlePauseMenuOpen(): void {
        this.webxrCoordinator.pauseInput()
    }

    private handlePauseMenuClose(): void {
        this.webxrCoordinator.resumeInput()
    }

    private async handleLoadSteamGames(vanityUrl: string): Promise<void> {
        this.prepareForGameLoading()
        
        try {
            const progressCallbacks = this.createProgressCallbacks()
            await this.steamIntegration.loadGamesForUser(vanityUrl, progressCallbacks)
            
            this.handleGameLoadingSuccess(vanityUrl)
        } catch (error) {
            this.handleGameLoadingError(error)
        }
    }

    private prepareForGameLoading(): void {
        // Reset current game index
        this.steamGameManager.resetGameIndex()
        
        // Remove existing placeholder boxes before loading
        this.steamGameManager.clearGameBoxes()
        
        this.uiCoordinator.showProgress(true)
    }

    private createProgressCallbacks(): ProgressCallbacks {
        return {
            onProgress: (current: number, total: number, message: string) => {
                this.uiCoordinator.updateProgress(current, total, message)
            },
            onGameLoaded: async (game) => {
                // Update game boxes in real-time as they load
                await this.steamGameManager.addGameBoxToScene(game, this.steamGameManager.getCurrentGameIndex())
            },
            onStatusUpdate: (message: string, type: 'loading' | 'success' | 'error') => {
                this.uiCoordinator.showSteamStatus(message, type)
            }
        }
    }

    private handleGameLoadingSuccess(vanityUrl: string): void {
        // Enable cache management actions now that Steam profile is loaded
        this.uiCoordinator.enableCacheActions()
        
        // Update cache display and offline availability
        this.updateCacheStatsDisplay()
        this.uiCoordinator.checkOfflineAvailability(ValidationUtils.extractVanityFromInput(vanityUrl))
        
        // Hide progress after a short delay
        setTimeout(() => {
            this.uiCoordinator.showProgress(false)
        }, 2000)
    }

    private handleGameLoadingError(error: unknown): void {
        console.error('❌ Failed to load Steam games:', error)
        this.uiCoordinator.showSteamStatus(
            `❌ Failed to load games. Please check the Steam profile name and try again.`, 
            'error'
        )
        this.uiCoordinator.showProgress(false)
        
        // Disable cache management actions on error
        this.uiCoordinator.disableCacheActions()
    }
    
    private async handleUseOfflineData(vanityUrl: string): Promise<void> {
        // Check if offline data is available using SteamIntegration
        const hasOfflineData = this.steamIntegration.hasOfflineData(vanityUrl)
        
        if (!hasOfflineData) {
            this.uiCoordinator.showSteamStatus('Offline mode not available in simplified client', 'error')
        } else {
            // Future: Load offline data
            this.uiCoordinator.showSteamStatus('Loading offline data...', 'loading')
        }
    }
    
    private async handleRefreshCache(): Promise<void> {
        try {
            const progressCallbacks = this.createProgressCallbacks()
            await this.steamIntegration.refreshData(progressCallbacks)
            this.updateCacheStatsDisplay()
        } catch (error) {
            console.error('❌ Failed to refresh cache:', error)
        }
    }
    
    private handleClearCache(): void {
        this.steamIntegration.clearCache()
        this.uiCoordinator.showSteamStatus('🗑️ Cache cleared successfully', 'success')
        this.updateCacheStatsDisplay()
    }
    
    private handleShowCacheStats(): void {
        const stats = this.steamIntegration.getCacheStats()
        this.uiCoordinator.updateCacheStats(stats)
    }
    
    private updateCacheStatsDisplay(): void {
        const stats = this.steamIntegration.getCacheStats()
        this.uiCoordinator.updateCacheStats(stats)
    }

    getSceneManager(): SceneManager {
        return this.sceneManager
    }

    getSteamIntegration(): SteamIntegration {
        return this.steamIntegration
    }

    getWebXRCoordinator(): WebXRCoordinator {
        return this.webxrCoordinator
    }

    getWebXRManager(): WebXRManager {
        return this.webxrCoordinator.getWebXRManager()
    }

    getIsInitialized(): boolean {
        return this.isInitialized
    }

    getPerformanceStats(): ReturnType<SceneCoordinator['getPerformanceStats']> {
        return this.sceneCoordinator.getPerformanceStats()
    }
    
    togglePerformanceMonitor(): void {
        this.uiCoordinator.togglePerformanceMonitor()
    }
    
    getCurrentPerformanceStats() {
        return this.uiCoordinator.getCurrentPerformanceStats()
    }
}
