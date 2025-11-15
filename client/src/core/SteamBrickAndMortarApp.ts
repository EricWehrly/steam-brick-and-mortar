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
import { PerformanceMonitor, type PerformanceStats, ToastManager, UIManager, StartupProgressUI } from '../ui'
import { SteamUICoordinator, WebXRUICoordinator, SystemUICoordinator } from '../ui/coordinators'
import { SceneManager, SceneCoordinator } from '../scene'
import { DebugStatsProvider } from './DebugStatsProvider'
import { CompassRose } from '../ui/debug/CompassRose'
import { SteamIntegration } from '../steam-integration'
import { WebXRCoordinator } from '../webxr/WebXRCoordinator'
import { WebXREventHandler } from '../webxr/WebXREventHandler'
import { EventManager, EventSource } from './EventManager'
import { GameEventTypes, type GameStartEvent, type SceneReadyEvent } from '../types/InteractionEvents'
import { AppSettings } from './AppSettings'
import { ServiceContainer } from './di/ServiceContainer'
import { ServiceRegistration } from './di/ServiceRegistration'
import { ServiceKeys } from './di/ServiceKeys'
import type { AppConfig as DIAppConfig } from './di'
import { StartupEventTracker, StartupPhase } from '../utils/StartupEventTracker'

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
    private eventManager: EventManager
    private appSettings: AppSettings
    private compassRose?: CompassRose
    
    // Startup tracking
    private startupTracker: StartupEventTracker

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
        // Initialize startup tracker first to capture all events
        this.startupTracker = StartupEventTracker.getInstance()
        
        // Mark the page load phase (from initial HTML to app constructor)
        this.startupTracker.phaseStart(StartupPhase.PageLoad, 'Page resources loading')
        
        // Create and attach progress UI
        const progressUI = new StartupProgressUI()
        this.startupTracker.setProgressUI(progressUI)
        
        this.startupTracker.phaseStart(StartupPhase.AppConstruction, 'App construction')
        
        // Store config for potential container recreation
        this.config = config
        
        // Initialize AppSettings first (needed for default values)
        this.startupTracker.logEvent(StartupPhase.AppConstruction, 'Initializing AppSettings')
        this.appSettings = AppSettings.getInstance()
        
        this.startupTracker.logEvent(StartupPhase.AppConstruction, 'Creating SceneManager')
        this.sceneManager = new SceneManager({
            antialias: config.scene?.antialias ?? true,
            outputColorSpace: config.scene?.outputColorSpace ?? THREE.SRGBColorSpace
        })
        
        this.startupTracker.logEvent(StartupPhase.AppConstruction, 'Setting up DI Container')
        this.container = new ServiceContainer()
        ServiceRegistration.configureServices(this.container, config, this.sceneManager, this.appSettings)
        
        this.startupTracker.logEvent(StartupPhase.AppConstruction, 'Creating PerformanceMonitor')
        this.performanceMonitor = new PerformanceMonitor({
            position: 'top-right',
            showMemory: true,
            showDrawCalls: true,
            updateInterval: 100,
            precision: 1
        })

        const isDevelopmentMode = this.appSettings.getSetting('developmentMode')
        const defaultMaxGames = isDevelopmentMode ? 20 : 100
        const maxGames = config.steam?.maxGames ?? defaultMaxGames

        this.startupTracker.logEvent(StartupPhase.AppConstruction, 'Creating SteamIntegration')
        this.steamIntegration = new SteamIntegration({
            apiBaseUrl: config.steam?.apiBaseUrl ?? BACKEND_URL,
            maxGames: maxGames
        })

        this.startupTracker.logEvent(StartupPhase.AppConstruction, 'Creating WebXRCoordinator')
        this.webxrCoordinator = new WebXRCoordinator({
            camera: this.sceneManager.getCamera(),
            input: {
                speed: config.input?.speed ?? 0.1,
                mouseSensitivity: config.input?.mouseSensitivity ?? 0.005
            }
        })

        this.startupTracker.logEvent(StartupPhase.AppConstruction, 'Creating DebugStatsProvider')
        this.debugStatsProvider = new DebugStatsProvider(
            this.sceneManager,
            this.steamIntegration,
            this.performanceMonitor
        )

        this.startupTracker.logEvent(StartupPhase.AppConstruction, 'Creating UIManager')
        this.uiManager = new UIManager()
        
        this.startupTracker.phaseEnd(StartupPhase.AppConstruction, 'Constructor complete')
    }

    async init(): Promise<void> {
        if (this.isInitialized) {
            return
        }
        
        try {
            this.startupTracker.phaseStart(StartupPhase.DIContainerSetup, 'DI Container initialization')
            
            // Register SystemUICoordinator with runtime dependencies BEFORE initialization
            this.startupTracker.logEvent(StartupPhase.DIContainerSetup, 'Registering SystemUICoordinator')
            ServiceRegistration.registerSystemUICoordinator(
                this.container,
                this.performanceMonitor,
                this.debugStatsProvider,
                EventManager.getInstance(), // Pass EventManager (not yet resolved from DI)
                this.appSettings, // Pass AppSettings for panel DI
                async () => {
                    const { ImageManager } = await import('../steam/images/ImageManager')
                    return ImageManager.getInstance().getStats()
                },
                this.steamIntegration
            )
            
            // Initialize DI services
            this.startupTracker.logEvent(StartupPhase.DIContainerSetup, 'Initializing DI services')
            await this.container.initialize()
            this.startupTracker.phaseEnd(StartupPhase.DIContainerSetup)
            
            this.startupTracker.phaseStart(StartupPhase.CoordinatorResolution, 'Resolving coordinators from DI')
            
            // Resolve EventManager from DI container
            this.startupTracker.logEvent(StartupPhase.CoordinatorResolution, 'Resolving EventManager')
            this.eventManager = await this.container.resolve(ServiceKeys.EventManager) as EventManager
            
            // Set up prerequisite event listeners now that EventManager is available
            this.startupTracker.logEvent(StartupPhase.CoordinatorResolution, 'Setting up prerequisite event listeners')
            this.setupPrerequisiteEventListeners()
            
            // Resolve SceneCoordinator from DI container
            this.startupTracker.logEvent(StartupPhase.CoordinatorResolution, 'Resolving SceneCoordinator')
            this.sceneCoordinator = await this.container.resolve(ServiceKeys.SceneCoordinator) as SceneCoordinator
            
            // Resolve UI coordinators from DI container
            this.startupTracker.logEvent(StartupPhase.CoordinatorResolution, 'Resolving UI coordinators')
            this.steamUICoordinator = await this.container.resolve(ServiceKeys.SteamUICoordinator) as SteamUICoordinator
            this.webxrUICoordinator = await this.container.resolve(ServiceKeys.WebXRUICoordinator) as WebXRUICoordinator
            this.systemUICoordinator = await this.container.resolve(ServiceKeys.SystemUICoordinator) as SystemUICoordinator
            
            this.startupTracker.phaseEnd(StartupPhase.CoordinatorResolution)
            
            this.startupTracker.phaseStart(StartupPhase.EventHandlerSetup, 'WebXR event handler setup')
            // Initialize webxr event handler now that UI coordinators are available
            this.webxrEventHandler = new WebXREventHandler(
                this.webxrCoordinator,
                this.webxrUICoordinator,
                this.eventManager
            )
            this.startupTracker.phaseEnd(StartupPhase.EventHandlerSetup)
            
            
            // 🎯 PRIORITY 1: Get controls working ASAP - this enables user input immediately
            this.startupTracker.phaseStart(StartupPhase.ControlsInit, 'Controls initialization')
            await this.initializeControls()
            this.startupTracker.phaseEnd(StartupPhase.ControlsInit)
            
            this.startupTracker.milestone(StartupPhase.ControlsInit, 'Controls ready - user can move around')
            
            // 🎯 PRIORITY 2: Basic UI and render loop (blocking for interaction)
            this.startupTracker.phaseStart(StartupPhase.CriticalUIInit, 'Critical UI initialization')
            await this.initializeCriticalUI()
            this.startupTracker.phaseEnd(StartupPhase.CriticalUIInit)
            
            this.startupTracker.phaseStart(StartupPhase.RenderLoopStart, 'Starting render loop')
            this.startRenderLoop()
            this.startupTracker.phaseEnd(StartupPhase.RenderLoopStart)
            
            this.prerequisites.renderLoopReady = true
            this.checkGameStartPrerequisites()
            
            this.isInitialized = true
            this.startupTracker.milestone(StartupPhase.RenderLoopStart, 'Core initialization complete')
            
            // 🚀 PRIORITY 3: Everything else happens async (non-blocking)
            this.initializeNonEssentialSystemsAsync()
            
        } catch (error) {
            console.error('Failed to initialize application:', error)
            this.startupTracker.logEvent(StartupPhase.RenderLoopStart, `INITIALIZATION ERROR: ${error}`)
            throw error
        }
    }

    /**
     * Initialize controls so user can move around while everything else loads
     */
    private async initializeControls(): Promise<void> {
        
        await this.webxrCoordinator.setupWebXR(this.sceneManager.getRenderer())
        
    }

    /**
     * Initialize critical UI components needed for interaction
     */
    private async initializeCriticalUI(): Promise<void> {
        
        // Setup UI with minimal components needed for interaction
        this.uiManager.init()
        this.uiManager.hideLoading() // Remove loading screen immediately
        
        
        // Mark UI as ready (coordinators initialized)
        console.log('🎨 Critical UI ready')
        this.prerequisites.uiReady = true
        this.checkGameStartPrerequisites()
    }

    /**
     * Initialize all non-essential systems asynchronously (doesn't block user interaction)
     */
    private initializeNonEssentialSystemsAsync(): void {
        this.startupTracker.logAsyncStart(StartupPhase.NonEssentialSystemsStart, 'Non-essential systems initialization')
        
        // Don't await this - let it happen in the background
        this.loadNonEssentialSystems().catch(error => {
            console.error('⚠️ Non-essential systems failed to load:', error)
            this.startupTracker.logEvent(StartupPhase.NonEssentialSystemsStart, `Non-essential systems error: ${error}`)
            // Don't throw - app should still work
        })
    }

    private async loadNonEssentialSystems(): Promise<void> {
        const asyncStartTime = this.startupTracker.logAsyncStart(StartupPhase.NonEssentialSystemsStart, 'Loading non-essential systems')
        
        try {
            this.startupTracker.phaseStart(StartupPhase.DebugSystemsInit, 'Debug systems initialization')
            // Initialize system UI coordinator (debug panels, etc.)
            await this.systemUICoordinator.init(this.sceneManager.getRenderer())
            this.startupTracker.phaseEnd(StartupPhase.DebugSystemsInit)
            
            
        // Auto-load will happen after GameStart event is emitted            
            // Show success message once everything is fully loaded
            this.startupTracker.phaseStart(StartupPhase.FullyLoaded, 'Application fully loaded')
            ToastManager.success('Steam Brick and Mortar is fully loaded!', { duration: 3000 })
            this.startupTracker.phaseEnd(StartupPhase.FullyLoaded)
            
            this.startupTracker.logAsyncEnd(StartupPhase.NonEssentialSystemsStart, 'Non-essential systems loaded', asyncStartTime)
            this.startupTracker.printSummary()
            
        } catch (error) {
            console.error('Failed to load non-essential systems:', error)
            this.startupTracker.logEvent(StartupPhase.NonEssentialSystemsStart, `Load error: ${error}`)
            // Don't throw - these are nice-to-have features
        }
    }

    private async tryAutoLoadCachedUser(): Promise<void> {
        console.log('try load cached user')
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



    /**
     * Set up event listeners for GameStart prerequisites
     */
    private setupPrerequisiteEventListeners(): void {
        // Listen for SceneReady event
        this.eventManager.registerEventHandler<SceneReadyEvent>(
            GameEventTypes.SceneReady,
            () => {
                this.startupTracker.milestone(StartupPhase.GameStart, 'Scene ready prerequisite met')
                this.prerequisites.sceneReady = true
                this.checkGameStartPrerequisites()
            }
        )

        // Listen for GameStart event to trigger auto-load
        this.eventManager.registerEventHandler<GameStartEvent>(
            GameEventTypes.Start,
            async () => {
                this.startupTracker.phaseStart(StartupPhase.SteamAutoLoad, 'Attempting Steam auto-load')
                await this.tryAutoLoadCachedUser()
                this.startupTracker.phaseEnd(StartupPhase.SteamAutoLoad)
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
        
        this.startupTracker.logEvent(StartupPhase.GameStart, 'Checking prerequisites', {
            sceneReady,
            renderLoopReady,
            uiReady
        })

        
        if (sceneReady && renderLoopReady && uiReady) {
            this.emitGameStartEvent()
            this.gameStartEmitted = true
        } else {
            console.log('⏳ Waiting for remaining prerequisites...')
        }
    }

    private emitGameStartEvent(): void {
        this.startupTracker.phaseStart(StartupPhase.GameStart, 'Emitting GameStart event')
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
        this.startupTracker.phaseEnd(StartupPhase.GameStart)
        this.startupTracker.milestone(StartupPhase.GameStart, 'Game is ready to start')
    }

    private startRenderLoop(): void {
        // Initialize compass rose (self-registers with render loop)
        // TODO: This probably shouldn't go here, but where does it go?
        this.compassRose = new CompassRose(this.sceneManager.getCamera())
        
        // Start the render loop (all updates happen via registry)
        this.sceneManager.startRenderLoop()
        
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
