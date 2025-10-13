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
        
        this.sceneManager = new SceneManager({
            antialias: config.scene?.antialias ?? true,
            outputColorSpace: config.scene?.outputColorSpace ?? THREE.SRGBColorSpace
        })
        
        this.container = new ServiceContainer()
        ServiceRegistration.configureServices(this.container, config, this.sceneManager, this.appSettings)
        
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

        this.steamIntegration = new SteamIntegration({
            apiBaseUrl: config.steam?.apiBaseUrl ?? BACKEND_URL,
            maxGames: maxGames
        })

        this.webxrCoordinator = new WebXRCoordinator({
            input: {
                speed: config.input?.speed ?? 0.1,
                mouseSensitivity: config.input?.mouseSensitivity ?? 0.005
            }
        })

        this.debugStatsProvider = new DebugStatsProvider(
            this.sceneManager,
            this.steamIntegration,
            this.performanceMonitor
        )

        this.uiManager = new UIManager()
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
                EventManager.getInstance(), // Pass EventManager (not yet resolved from DI)
                this.appSettings, // Pass AppSettings for panel DI
                () => this.steamIntegration.getImageCacheStats(),
                this.steamIntegration
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
            
            // Initialize steam workflow manager with DI-resolved DataManager
            const dataManager = await this.container.resolve(ServiceKeys.DataManager) as DataManager
            this.steamWorkflowManager = new SteamWorkflowManager(
                this.eventManager,
                this.steamIntegration,
                this.steamUICoordinator,
                dataManager
            )
            
            // Initialize webxr event handler now that UI coordinators are available
            this.webxrEventHandler = new WebXREventHandler(
                this.webxrCoordinator,
                this.webxrUICoordinator,
                this.eventManager
            )
            
            
            // 🎯 PRIORITY 1: Get controls working ASAP - this enables user input immediately
            await this.initializeControls()
            
            console.log('🎮 Controls are ready - user can now move around!')
            
            // 🎯 PRIORITY 2: Basic UI and render loop (blocking for interaction)
            await this.initializeCriticalUI()
            this.startRenderLoop()
            
            this.prerequisites.renderLoopReady = true
            this.checkGameStartPrerequisites()
            
            this.isInitialized = true
            
            // 🚀 PRIORITY 3: Everything else happens async (non-blocking)
            this.initializeNonEssentialSystemsAsync()
            
        } catch (error) {
            console.error('Failed to initialize application:', error)
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
        // Don't await this - let it happen in the background
        this.loadNonEssentialSystems().catch(error => {
            console.error('⚠️ Non-essential systems failed to load:', error)
            // Don't throw - app should still work
        })
    }

    private async loadNonEssentialSystems(): Promise<void> {
        try {
            
            // Initialize system UI coordinator (debug panels, etc.)
            await this.systemUICoordinator.init(this.sceneManager.getRenderer(), this.steamWorkflowManager)
            
            
            // Auto-load first cached user if available (this can happen later)
            await this.tryAutoLoadCachedUser()
            
            
            // Show success message once everything is fully loaded
            ToastManager.success('Steam Brick and Mortar is fully loaded!', { duration: 3000 })
            
            
        } catch (error) {
            console.error('Failed to load non-essential systems:', error)
            // Don't throw - these are nice-to-have features
        }
    }

    private async initializeCoordinators(): Promise<void> {
        // This method is now replaced by the new progressive loading approach
        // Keeping for backward compatibility but content moved to specific methods
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
