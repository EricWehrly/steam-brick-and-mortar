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
import { UICoordinator, PerformanceMonitor, type PerformanceStats, ToastManager } from '../ui'
import { SceneManager, SceneCoordinator } from '../scene'
import { DebugStatsProvider, type DebugStats } from './DebugStatsProvider'
import { SteamGameManager } from './SteamGameManager'
import { SteamIntegration } from '../steam-integration'
import { SteamWorkflowManager } from '../steam-integration/SteamWorkflowManager'
import { WebXRCoordinator } from '../webxr/WebXRCoordinator'
import { WebXREventHandler } from '../webxr/WebXREventHandler'
import { type WebXRCapabilities } from '../webxr/WebXRManager'
import { EventManager, EventSource } from './EventManager'
import { GameEventTypes, WebXREventTypes, type GameStartEvent } from '../types/InteractionEvents'
import { AppSettings } from './AppSettings'

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

export class SteamBrickAndMortarApp {
    private sceneManager: SceneManager
    private sceneCoordinator: SceneCoordinator
    private webxrCoordinator: WebXRCoordinator
    private webxrEventHandler: WebXREventHandler
    private uiCoordinator: UICoordinator
    private performanceMonitor: PerformanceMonitor
    private steamIntegration: SteamIntegration
    private debugStatsProvider: DebugStatsProvider
    private steamGameManager: SteamGameManager
    private eventManager: EventManager
    private steamWorkflowManager: SteamWorkflowManager
    private appSettings: AppSettings

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

        // Initialize scene coordinator with visual system configuration
        this.sceneCoordinator = new SceneCoordinator(this.sceneManager, {
            maxGames: config.steam?.maxGames ?? 100,
            props: {
                // TODO: Game limiting: OFF by default, configurable via UI settings
                // maxGames: 100,
                // TODO: Wire this to UI settings panel for user control
            },
            lighting: {
                quality: 'enhanced',
                enableShadows: true
            },
            environment: {
                skyboxPreset: 'aurora'
            }
            
            /* TODO: Future Performance Configuration Roadmap
             * Re-implement these granular performance settings when needed:
             * performance: {
             *     maxTextureSize: 1024,
             *     nearDistance: 2.0,
             *     farDistance: 10.0,
             *     highResolutionSize: 512,
             *     mediumResolutionSize: 256,
             *     lowResolutionSize: 128,
             *     maxActiveTextures: Math.min(50, maxGames / 2),
             *     frustumCullingEnabled: true
             * }
             * These should be exposed via UI settings when performance tuning becomes necessary.
             */
        })

        // Initialize WebXR coordinator (callbacks now handled by WebXREventHandler)
        this.webxrCoordinator = new WebXRCoordinator(
            {
                input: {
                    speed: config.input?.speed ?? 0.1,
                    mouseSensitivity: config.input?.mouseSensitivity ?? 0.005
                }
            },
            {
                // Events will be emitted by WebXRCoordinator and handled by WebXREventHandler
                onSessionStart: () => this.emitWebXRSessionStartEvent(),
                onSessionEnd: () => this.emitWebXRSessionEndEvent(),
                onError: (error: Error) => this.emitWebXRErrorEvent(error),
                onSupportChange: (capabilities: WebXRCapabilities) => this.emitWebXRSupportChangeEvent(capabilities)
            }
        )

        // Initialize debug stats provider
        this.debugStatsProvider = new DebugStatsProvider(
            this.sceneManager,
            this.steamIntegration,
            this.performanceMonitor
        )

        // Initialize UI coordinator (events now handled by EventManager)
        this.uiCoordinator = new UICoordinator(
            this.performanceMonitor,
            this.debugStatsProvider,
            () => this.steamIntegration.getImageCacheStats(),
            this.steamIntegration
        )

        // Initialize steam game manager with scene coordinator's game box renderer
        this.steamGameManager = new SteamGameManager(
            this.sceneCoordinator.getGameBoxRenderer(),
            this.sceneManager,
            this.steamIntegration
        )

        // Initialize event manager for interaction architecture
        this.eventManager = EventManager.getInstance()

        // Initialize steam workflow manager to handle Steam interactions
        this.steamWorkflowManager = new SteamWorkflowManager(
            this.eventManager,
            this.steamIntegration,
            this.sceneCoordinator,
            this.uiCoordinator
        )

        // Initialize webxr event handler to handle WebXR and input interactions
        this.webxrEventHandler = new WebXREventHandler(
            this.webxrCoordinator,
            this.uiCoordinator,
            this.eventManager
        )
    }

    async init(): Promise<void> {
        if (this.isInitialized) {
            return
        }
        
        try {
            this.appSettings = AppSettings.getInstance()
            
            await this.initializeCoordinators()
            this.startRenderLoop()
            
            this.isInitialized = true

            this.emitGameStartEvent()
            
            // Auto-load first cached user if available
            await this.tryAutoLoadCachedUser()
            
            ToastManager.success('Steam Brick and Mortar is ready to explore!', { duration: 5000 })
        } catch (error) {
            console.error('Failed to initialize application:', error)
            throw error
        }
    }

    private async initializeCoordinators(): Promise<void> {
        // Setup UI with all components (Steam workflow manager will be set later)
        await this.uiCoordinator.setupUI(this.sceneManager.getRenderer(),
            this.steamWorkflowManager)

        // Setup WebXR capabilities
        await this.webxrCoordinator.setupWebXR(this.sceneManager.getRenderer())
    }

    private async tryAutoLoadCachedUser(): Promise<void> {
        try {
            // Check if auto-load is enabled in settings
            if (!this.appSettings.getSetting('autoLoadProfile')) {
                console.log('Auto-load cached user is disabled in settings')
                return
            }
            
            const cachedUsers = this.steamIntegration.getCachedUsers()
            if (cachedUsers.length > 0) {
                const firstUser = cachedUsers[0]
                console.log(`Auto-loading cached user: ${firstUser.displayName} (${firstUser.vanityUrl})`)
                
                // Load from cache using the established workflow
                this.uiCoordinator.steam.loadFromCache(firstUser.vanityUrl)
                
                ToastManager.info(`Auto-loaded ${firstUser.displayName} (${firstUser.gameCount} games)`, { duration: 3000 })
            }
        } catch (error) {
            console.warn('Failed to auto-load cached user:', error)
            // Don't throw - this is a nice-to-have feature
        }
    }    dispose(): void {
        if (!this.isInitialized) {
            return
        }
        
        // Dispose workflow managers first
        this.steamWorkflowManager.dispose()
        this.webxrEventHandler.dispose()
        this.eventManager.dispose()
        
        // Then dispose coordinators
        this.uiCoordinator.dispose()
        this.webxrCoordinator.dispose()
        this.sceneCoordinator.dispose()
        this.sceneManager.dispose()
        
        this.isInitialized = false
        console.log('✅ Application disposed')
    }

    // WebXR event emission methods - bridge WebXRCoordinator callbacks to events
    private emitWebXRSessionStartEvent(): void {
        this.eventManager.emit(WebXREventTypes.SessionStart, {
            timestamp: Date.now(),
            source: EventSource.System
        })
    }

    private emitWebXRSessionEndEvent(): void {
        this.eventManager.emit('webxr:session-end', {
            timestamp: Date.now(),
            source: EventSource.System
        })
    }

    private emitWebXRErrorEvent(error: Error): void {
        this.eventManager.emit('webxr:error', {
            error,
            timestamp: Date.now(),
            source: EventSource.System
        })
    }

    private emitWebXRSupportChangeEvent(capabilities: WebXRCapabilities): void {
        this.eventManager.emit('webxr:support-change', {
            capabilities,
            timestamp: Date.now(),
            source: EventSource.System
        })
    }

    private emitGameStartEvent(): void {
        this.eventManager.emit<GameStartEvent>(GameEventTypes.Start, {
            timestamp: Date.now(),
            source: EventSource.System
        })
    }

    private startRenderLoop(): void {
        this.sceneManager.startRenderLoop({
            webxrCoordinator: this.webxrCoordinator,
            sceneCoordinator: this.sceneCoordinator,
            systemUICoordinator: this.uiCoordinator.system
        })
    }

    // TODO: This method exists solely for testing purposes - remove or refactor
    getIsInitialized(): boolean {
        return this.isInitialized
    }

    // Test-only getters - minimal interface for testing
    getSteamIntegration(): SteamIntegration {
        return this.steamIntegration
    }

    getSceneManager(): SceneManager {
        return this.sceneManager
    }

    getCurrentPerformanceStats(): PerformanceStats {
        return this.performanceMonitor.getStats()
    }
}
