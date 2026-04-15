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
import { ToastManager, UIManager, StartupProgressUI, GameLibraryBinderUI } from '../ui'
import { WebXRUICoordinator, SystemUICoordinator } from '../ui/coordinators'
import { VisibilityCoordinator } from '../ui/coordinators/VisibilityCoordinator'
import { SceneManager, SceneCoordinator } from '../scene'
import { SceneManagerDebug } from '../debug/SceneManagerDebug'
import { CompassRose } from '../ui/debug/CompassRose'
import { SteamIntegration } from '../steam-integration'
import { WebXRCoordinator } from '../webxr/WebXRCoordinator'
import { WebXREventHandler } from '../webxr/WebXREventHandler'
import { EventManager } from './EventManager'
import { GameEventTypes, type GameStartEvent, type SceneReadyEvent } from '../types/InteractionEvents'
import { AppSettings } from './AppSettings'

import { StartupEventTracker, StartupPhase } from '../utils/StartupEventTracker'
import { RenderLoopDiagnostics } from '../debug/RenderLoopDiagnostics'
// Side-effect import: registers GpuMemoryEstimator to window for console debugging
import '../debug/GpuMemoryEstimator'

export interface AppConfig {
    scene?: {
        antialias?: boolean
        outputColorSpace?: THREE.ColorSpace
    }
    input?: {
        speed?: number
        mouseSensitivity?: number
    }
    steam?: {
        apiBaseUrl?: string
        maxGames?: number
    }
    data?: {
        enablePersistence?: boolean
        defaultTTL?: number
        maxEntries?: number
    }
    tests?: Record<string, string>
}

const BACKEND_URL = 'https://steam-api-dev.wehrly.com';

export class SteamBrickAndMortarApp {
    private readonly config: AppConfig // Store config for potential recreation
    
    // Services - will be resolved from container where available
    private sceneManager: SceneManager
    private sceneCoordinator!: SceneCoordinator // Will be resolved from DI container in init()
    private webxrCoordinator: WebXRCoordinator
    private webxrEventHandler: WebXREventHandler
    // UI coordinators resolved from DI container
    private webxrUICoordinator: WebXRUICoordinator  
    private systemUICoordinator: SystemUICoordinator
    private uiManager: UIManager
    private steamIntegration: SteamIntegration
    private eventManager: EventManager
    private appSettings: AppSettings
    private compassRose?: CompassRose
    private gameLibraryBinder?: GameLibraryBinderUI
    private visibilityCoordinator?: VisibilityCoordinator
    
    // Startup tracking
    private startupTracker: StartupEventTracker

    // State
    private isInitialized: boolean = false
    private initPromise: Promise<void> | null = null
    
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
        
        // Phase 1: CoreInit — everything up through DI resolution
        this.startupTracker.phaseStart(StartupPhase.CoreInit, 'Core initialization')

        // Create startup progress UI (self-contained; listens to AppEventTypes events)
        new StartupProgressUI()
        // Wire game-loading progress listeners now that we have an EventManager instance
        this.startupTracker.setupProgressListeners()
        
        // Store config for potential container recreation
        this.config = config
        
        // Initialize AppSettings first (needed for default values)
        this.startupTracker.logEvent(StartupPhase.CoreInit, 'Initializing AppSettings')
        this.appSettings = AppSettings.getInstance()
        
        this.startupTracker.logEvent(StartupPhase.CoreInit, 'Creating SceneManager')
        this.sceneManager = new SceneManagerDebug({
            antialias: config.scene?.antialias ?? true,
            outputColorSpace: config.scene?.outputColorSpace ?? THREE.SRGBColorSpace
        })
        
        this.startupTracker.logEvent(StartupPhase.CoreInit, 'Preparing core coordinators')

        const isDevelopmentMode = this.appSettings.getSetting('developmentMode')
        const defaultMaxGames = isDevelopmentMode ? 20 : 100
        const maxGames = config.steam?.maxGames ?? defaultMaxGames

        this.startupTracker.logEvent(StartupPhase.CoreInit, 'Creating SteamIntegration')
        this.steamIntegration = new SteamIntegration({
            apiBaseUrl: config.steam?.apiBaseUrl ?? BACKEND_URL,
            maxGames: maxGames
        })

        this.startupTracker.logEvent(StartupPhase.CoreInit, 'Creating WebXRCoordinator')
        this.webxrCoordinator = new WebXRCoordinator({
            camera: this.sceneManager.getCamera(),
            input: {
                speed: config.input?.speed ?? 0.1,
                mouseSensitivity: config.input?.mouseSensitivity ?? 0.005
            }
        })

        this.startupTracker.logEvent(StartupPhase.CoreInit, 'Creating UIManager')
        this.uiManager = new UIManager()

        this.startupTracker.phaseEnd(StartupPhase.CoreInit, 'Constructor complete')
    }

    async init(): Promise<void> {
        if (this.isInitialized) {
            return
        }

        if (this.initPromise) {
            return this.initPromise
        }

        this.initPromise = this.initImpl()
        try {
            await this.initPromise
        } finally {
            this.initPromise = null
        }
    }

    private async initImpl(): Promise<void> {
        try {
            this.startupTracker.phaseStart(StartupPhase.EngineStart, 'DI Container + coordinators initialization')
            
            this.eventManager = EventManager.getInstance()

            // Set up prerequisite event listeners now that EventManager is available
            this.startupTracker.logEvent(StartupPhase.EngineStart, 'Setting up prerequisite event listeners')
            this.setupPrerequisiteEventListeners()

            // Construct SceneCoordinator directly (DI container removed)
            this.startupTracker.logEvent(StartupPhase.EngineStart, 'Constructing SceneCoordinator')
            this.sceneCoordinator = new SceneCoordinator(this.sceneManager)

            // Construct UI coordinators directly — no DI indirection needed
            this.startupTracker.logEvent(StartupPhase.EngineStart, 'Constructing UI coordinators')
            this.webxrUICoordinator = new WebXRUICoordinator()
            this.systemUICoordinator = new SystemUICoordinator(
                this.eventManager,
                this.appSettings
            )
            
            // Initialize webxr event handler now that UI coordinators are available
            this.webxrEventHandler = new WebXREventHandler(
                this.webxrCoordinator,
                this.webxrUICoordinator,
                this.eventManager
            )

            this.startupTracker.phaseEnd(StartupPhase.EngineStart)


            // 🎯 PRIORITY 1: Get controls working ASAP - this enables user input immediately
            this.startupTracker.phaseStart(StartupPhase.ControlsReady, 'Controls initialization')
            this.startupTracker.milestone(StartupPhase.ControlsReady, 'Setting up controls')
            await this.initializeControls()
            this.startupTracker.phaseEnd(StartupPhase.ControlsReady)
            
            this.startupTracker.milestone(StartupPhase.ControlsReady, 'Player can move')
            
            // 🎯 PRIORITY 2: Basic UI and render loop (blocking for interaction)
            this.startupTracker.phaseStart(StartupPhase.Interactive, 'Starting render loop and critical UI')
            this.startupTracker.milestone(StartupPhase.Interactive, 'Initializing UI')
            await this.initializeCriticalUI()
            
            this.startupTracker.milestone(StartupPhase.Interactive, 'Starting render engine')
            this.startRenderLoop()
            
            this.prerequisites.renderLoopReady = true
            this.checkGameStartPrerequisites()
            
            this.isInitialized = true
            this.startupTracker.phaseEnd(StartupPhase.Interactive)
            this.startupTracker.milestone(StartupPhase.Interactive, 'User can move - starting world build')

            // 🎬 PRIORITY 2.5: Start scene building AFTER render loop is running.
            // Material prewarm runs concurrently — the scene setup pipeline has enough
            // async steps that materials will be ready before shelves are actually built.
            // Do NOT await materialPrewarmPromise here — that caused a visible black-screen hitch.
            this.sceneCoordinator.startSceneSetup()
            
            // PRIORITY 3: Everything else happens async (non-blocking)
            this.initializeNonEssentialSystemsAsync()
            
        } catch (error) {
            console.error('Failed to initialize application:', error)
            this.startupTracker.logEvent(StartupPhase.Interactive, `INITIALIZATION ERROR: ${error}`)
            throw error
        }
    }

    private async initializeControls(): Promise<void> {
        await this.webxrCoordinator.setupWebXR(this.sceneManager.getRenderer())
    }

    private async initializeCriticalUI(): Promise<void> {
        this.uiManager.init()
        this.uiManager.hideLoading()
        
        console.debug('🎨 Critical UI ready')
        this.prerequisites.uiReady = true
        this.checkGameStartPrerequisites()
    }

    private initializeNonEssentialSystemsAsync(): void {
        this.loadNonEssentialSystems().catch(error => {
            console.error('⚠️ Non-essential systems failed to load:', error)
        })
    }

    private async loadNonEssentialSystems(): Promise<void> {
        try {
            // Binder button first so it occupies the top slot in ui-right-center-group;
            // lighting panel appends after and sits below it.
            this.gameLibraryBinder = GameLibraryBinderUI.getInstance()
            this.gameLibraryBinder.init()

            // Visibility tracking: focus/blur logging + window.toggleSceneBlur() debug helper
            this.visibilityCoordinator = new VisibilityCoordinator(this.eventManager)
            this.visibilityCoordinator.init()

            // Initialize system UI coordinator (lighting panel, debug panels, etc.)
            await this.systemUICoordinator.init(this.sceneManager.getRenderer())

            ToastManager.success('Steam Brick and Mortar is fully loaded!', { duration: 3000 })

        } catch (error) {
            console.error('Failed to load non-essential systems:', error)
        }
    }

    async dispose(): Promise<void> {
        if (!this.isInitialized) {
            return
        }
        
        this.webxrEventHandler.dispose()
        this.eventManager.dispose()
        
        this.systemUICoordinator.dispose()
        this.visibilityCoordinator?.dispose()
        this.webxrCoordinator.dispose()
        this.sceneCoordinator.dispose()
        this.sceneManager.dispose()
        
        this.isInitialized = false
        this.initPromise = null
        console.debug('✅ Application disposed')
    }

    private setupPrerequisiteEventListeners(): void {
        this.eventManager.registerEventHandler<SceneReadyEvent>(
            GameEventTypes.SceneReady,
            () => {
                this.startupTracker.milestone(StartupPhase.WorldBuild, 'World has spawned')
                this.prerequisites.sceneReady = true
                this.checkGameStartPrerequisites()
            }
        )

        // GameStart event triggers auto-load via SteamIntegration
    }

    private checkGameStartPrerequisites(): void {
        if (this.gameStartEmitted) {
            console.debug('✅ GameStart already emitted')
            return
        }

        const { sceneReady, renderLoopReady, uiReady } = this.prerequisites
        
        this.startupTracker.logEvent(StartupPhase.WorldBuild, 'Checking prerequisites', {
            sceneReady,
            renderLoopReady,
            uiReady
        })

        if (sceneReady && renderLoopReady && uiReady) {
            this.emitGameStartEvent()
            this.gameStartEmitted = true
        } else {
            console.debug('⏳ Waiting for remaining prerequisites...', { sceneReady, renderLoopReady, uiReady })
        }
    }

    private emitGameStartEvent(): void {
        this.startupTracker.phaseStart(StartupPhase.WorldBuild, 'Emitting GameStart event')
        this.startupTracker.milestone(StartupPhase.WorldBuild, 'World ready')
        console.debug('🎮 GameStart event emitted')
        this.eventManager.emit<GameStartEvent>(GameEventTypes.Start, {
            prerequisites: {
                sceneReady: this.prerequisites.sceneReady,
                renderLoopReady: this.prerequisites.renderLoopReady,
                uiReady: this.prerequisites.uiReady
            }
        })
        this.startupTracker.phaseEnd(StartupPhase.WorldBuild)
    }

    private startRenderLoop(): void {
        // Initialize compass rose (self-registers with render loop)
        // TODO: This probably shouldn't go here, but where does it go?
        this.compassRose = new CompassRose(this.sceneManager.getCamera())
        
        // TODO: Normalize configuration inputs
        // and don't require so many lines in the main files

        // Initialize render loop diagnostics if enabled via URL param (?diagnostics=1)
        // This MUST happen before startRenderLoop() - decision is made once, zero per-frame overhead when disabled
        // TODO: set appsettings from url, have diagnostics class set up at this phase?
        const urlParams = new URLSearchParams(window.location.search)
        const diagnosticsEnabled = urlParams.get('diagnostics') === '1'
        RenderLoopDiagnostics.initialize({ 
            enabled: diagnosticsEnabled,
            logInterval: 60,  // Log every ~1 second at 60fps
            frameTimeWarnThreshold: 16.67,  // Warn if frame exceeds 60fps budget
            callbackTimeWarnThreshold: 5  // Warn if any callback > 5ms
        })
        
        // Start the render loop (all updates happen via registry)
        this.sceneManager.startRenderLoop()
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
}
