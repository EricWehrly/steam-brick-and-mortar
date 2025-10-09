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
import { PerformanceMonitor, type PerformanceStats, ToastManager, UIManager } from '../ui'
import { SteamUICoordinator, WebXRUICoordinator, SystemUICoordinator } from '../ui/coordinators'
import { SceneManager, SceneCoordinator, GameBoxRenderer } from '../scene'
import { DebugStatsProvider } from './DebugStatsProvider'
import { SteamGameManager } from './SteamGameManager'
import { SteamIntegration } from '../steam-integration'
import { SteamWorkflowManager } from '../steam-integration/SteamWorkflowManager'
import { DataManager } from './data'
import { WebXRCoordinator } from '../webxr/WebXRCoordinator'
import { WebXREventHandler } from '../webxr/WebXREventHandler'
import { type WebXRCapabilities } from '../webxr/WebXRManager'
import { EventManager, EventSource } from './EventManager'
import { GameEventTypes, WebXREventTypes, type GameStartEvent, type SceneReadyEvent } from '../types/InteractionEvents'
import { AppSettings } from './AppSettings'
import { ServiceContainer } from './di/ServiceContainer'
import { ServiceRegistration } from './di/ServiceRegistration'
import { ServiceKeys } from './di/ServiceKeys'
import type { AppConfig as DIAppConfig } from './di'

export interface AppConfig extends DIAppConfig {
    steam?: {
        apiBaseUrl?: string
        maxGames?: number
    }
}

const BACKEND_URL = 'https://steam-api-dev.wehrly.com';

export class SteamBrickAndMortarApp {
    // DI Container - Phase 1: Core services
    private container: ServiceContainer
    private readonly config: AppConfig // Store config for container recreation
    
    // Services - will be resolved from container where available
    private sceneManager: SceneManager
    private sceneCoordinator!: SceneCoordinator // Will be resolved from DI container in init()
    private webxrCoordinator: WebXRCoordinator
    private webxrEventHandler: WebXREventHandler
    // UI coordinators resolved from DI container
    private steamUICoordinator: SteamUICoordinator
    private webxrUICoordinator: WebXRUICoordinator  
    private systemUICoordinator: SystemUICoordinator
    private uiManager: UIManager
    private performanceMonitor: PerformanceMonitor
    private steamIntegration: SteamIntegration
    private debugStatsProvider: DebugStatsProvider
    private steamGameManager!: SteamGameManager // Will be initialized in init() with DI-resolved GameBoxRenderer
    private eventManager: EventManager
    private steamWorkflowManager: SteamWorkflowManager
    private appSettings: AppSettings

    // State
    private isInitialized: boolean = false
    
    // GameStart prerequisite tracking
    private prerequisites = {
        sceneReady: false,
        renderLoopReady: false,
        uiReady: false
    }
    private gameStartEmitted = false
    
    constructor(config: AppConfig = {}) {
        // Store config for potential container recreation
        this.config = config
        
        // Initialize AppSettings first (needed for default values)
        this.appSettings = AppSettings.getInstance()
        
        // Initialize core scene management first - this will be shared via DI
        this.sceneManager = new SceneManager({
            antialias: config.scene?.antialias ?? true,
            outputColorSpace: config.scene?.outputColorSpace ?? THREE.SRGBColorSpace
        })
        
        // Initialize DI Container and register existing instances
        this.container = new ServiceContainer()
        ServiceRegistration.configureServices(this.container, config, this.sceneManager, this.appSettings)
        
        // Initialize Performance Monitor
        this.performanceMonitor = new PerformanceMonitor({
            position: 'top-right',
            showMemory: true,
            showDrawCalls: true,
            updateInterval: 100,
            precision: 1
        })

        // Determine maxGames based on AppSettings developmentMode or config override
        const isDevelopmentMode = this.appSettings.getSetting('developmentMode')
        const defaultMaxGames = isDevelopmentMode ? 20 : 100
        const maxGames = config.steam?.maxGames ?? defaultMaxGames

        // Initialize Steam integration
        this.steamIntegration = new SteamIntegration({
            apiBaseUrl: config.steam?.apiBaseUrl ?? BACKEND_URL,
            maxGames: maxGames
        })

        // SceneCoordinator will be resolved from DI container in init() method

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

        // Initialize UI Manager - completely self-sufficient, no dependencies
        this.uiManager = new UIManager()
        
        // UI coordinators will be resolved from DI container in init() method
        // SystemUICoordinator requires runtime dependencies, so we'll register it manually

        // SteamGameManager will be initialized in init() method with DI-resolved GameBoxRenderer

        // EventManager will be resolved from DI container in init() method
        // setupPrerequisiteEventListeners() will be called after EventManager is resolved

        // SteamWorkflowManager will be initialized in init() method with DI-resolved dependencies

        // WebXREventHandler will be initialized in init() method after UI coordinators are resolved
    }

    async init(): Promise<void> {
        if (this.isInitialized) {
            return
        }
        
        try {
            // Register SystemUICoordinator with runtime dependencies BEFORE initialization
            ServiceRegistration.registerSystemUICoordinator(
                this.container,
                this.performanceMonitor,
                this.debugStatsProvider,
                () => this.steamIntegration.getImageCacheStats(),
                this.steamIntegration,
                EventManager.getInstance(), // Pass EventManager (not yet resolved from DI)
                this.appSettings // Pass AppSettings for panel DI
            )
            
            // Initialize DI services
            await this.container.initialize()
            
            // Resolve EventManager from DI container
            this.eventManager = await this.container.resolve(ServiceKeys.EventManager) as EventManager
            
            // Set up prerequisite event listeners now that EventManager is available
            this.setupPrerequisiteEventListeners()
            
            // Resolve SceneCoordinator from DI container
            this.sceneCoordinator = await this.container.resolve(ServiceKeys.SceneCoordinator) as SceneCoordinator
            
            // Resolve UI coordinators from DI container
            this.steamUICoordinator = await this.container.resolve(ServiceKeys.SteamUICoordinator) as SteamUICoordinator
            this.webxrUICoordinator = await this.container.resolve(ServiceKeys.WebXRUICoordinator) as WebXRUICoordinator
            this.systemUICoordinator = await this.container.resolve(ServiceKeys.SystemUICoordinator) as SystemUICoordinator
            
            // Initialize steam game manager with DI-resolved GameBoxRenderer
            const gameBoxRenderer = await this.container.resolve(ServiceKeys.GameBoxRenderer) as GameBoxRenderer
            this.steamGameManager = new SteamGameManager(
                gameBoxRenderer, // Use DI-resolved singleton GameBoxRenderer
                this.sceneManager,
                this.steamIntegration
            )
            
            // Initialize steam workflow manager with DI-resolved DataManager
            const dataManager = await this.container.resolve(ServiceKeys.DataManager) as DataManager
            this.steamWorkflowManager = new SteamWorkflowManager(
                this.eventManager,
                this.steamIntegration,
                this.sceneCoordinator,
                this.steamUICoordinator,
                dataManager
            )
            
            // Initialize webxr event handler now that UI coordinators are available
            // TODO: Update WebXREventHandler to not require full UICoordinator
            const uiCoordinatorCompat = {
                steam: this.steamUICoordinator,
                webxr: this.webxrUICoordinator,
                system: this.systemUICoordinator
            }
            this.webxrEventHandler = new WebXREventHandler(
                this.webxrCoordinator,
                uiCoordinatorCompat as any, // Temporary compatibility object
                this.eventManager
            )
            
            await this.initializeCoordinators()
            
            // Mark UI as ready (coordinators initialized)
            console.log('🎨 UI coordinators ready')
            this.prerequisites.uiReady = true
            this.checkGameStartPrerequisites()
            
            this.startRenderLoop()
            
            // Mark render loop as ready
            console.log('🔄 Render loop ready')
            this.prerequisites.renderLoopReady = true
            this.checkGameStartPrerequisites()
            
            this.isInitialized = true
            
            // Auto-load first cached user if available
            await this.tryAutoLoadCachedUser()
            
            ToastManager.success('Steam Brick and Mortar is ready to explore!', { duration: 5000 })
        } catch (error) {
            console.error('Failed to initialize application:', error)
            throw error
        }
    }

    private async initializeCoordinators(): Promise<void> {
        // Setup UI with all components (replacing UICoordinator.setupUI())
        this.uiManager.init()
        await this.systemUICoordinator.init(this.sceneManager.getRenderer(), this.steamWorkflowManager)
        this.uiManager.hideLoading()

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
                this.steamUICoordinator.loadFromCache(firstUser.vanityUrl)
                
                ToastManager.info(`Auto-loaded ${firstUser.displayName} (${firstUser.gameCount} games)`, { duration: 3000 })
            }
        } catch (error) {
            console.warn('Failed to auto-load cached user:', error)
            // Don't throw - this is a nice-to-have feature
        }
    }    async dispose(): Promise<void> {
        if (!this.isInitialized) {
            return
        }
        
        // Stop performance monitoring
        this.performanceMonitor.stop()
        
        // Dispose workflow managers first
        this.steamWorkflowManager.dispose()
        this.webxrEventHandler.dispose()
        this.eventManager.dispose()
        
        // Then dispose coordinators
        this.systemUICoordinator.dispose()
        this.webxrCoordinator.dispose()
        this.sceneCoordinator.dispose()
        this.sceneManager.dispose()
        
        // Dispose and recreate the DI container for clean reinitialization
        await this.container.dispose()
        this.container = ServiceRegistration.configureServices(
            new ServiceContainer(),
            this.config,
            this.sceneManager,
            this.appSettings
        )
        
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

    /**
     * Set up event listeners for GameStart prerequisites
     */
    private setupPrerequisiteEventListeners(): void {
        // Listen for SceneReady event
        this.eventManager.registerEventHandler<SceneReadyEvent>(
            GameEventTypes.SceneReady,
            (event) => {
                
                this.prerequisites.sceneReady = true
                this.checkGameStartPrerequisites()
            }
        )
    }

    /**
     * Check if all prerequisites are met and emit GameStart if so
     */
    private checkGameStartPrerequisites(): void {
        // Idempotency guard - exit early if already emitted
        if (this.gameStartEmitted) {
            console.log('✅ GameStart already emitted - maintaining idempotency')
            return
        }

        const { sceneReady, renderLoopReady, uiReady } = this.prerequisites
        

        
        if (sceneReady && renderLoopReady && uiReady) {
            this.emitGameStartEvent()
            this.gameStartEmitted = true
        } else {
            console.log('⏳ Waiting for remaining prerequisites...')
        }
    }

    private emitGameStartEvent(): void {
        console.log('🎮 GameStart event emitted')
        this.eventManager.emit<GameStartEvent>(GameEventTypes.Start, {
            timestamp: Date.now(),
            source: EventSource.System,
            prerequisites: {
                sceneReady: this.prerequisites.sceneReady,
                renderLoopReady: this.prerequisites.renderLoopReady,
                uiReady: this.prerequisites.uiReady
            }
        })
    }

    private startRenderLoop(): void {
        this.sceneManager.startRenderLoop({
            webxrCoordinator: this.webxrCoordinator,
            sceneCoordinator: this.sceneCoordinator,
            systemUICoordinator: this.systemUICoordinator
        })
        
        this.performanceMonitor.start()
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
