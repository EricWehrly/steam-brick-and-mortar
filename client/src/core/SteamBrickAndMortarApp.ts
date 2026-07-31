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

import { UIManager, StartupProgressUI, GameLibraryBinderUI } from '../ui'
import { WebXRUICoordinator, SystemUICoordinator } from '../ui/coordinators'
import { FocusCoordinator } from '../ui/coordinators/FocusCoordinator'
import { SceneManager, SceneCoordinator } from '../scene'
import { SceneManagerDebug } from '../debug/SceneManagerDebug'
import { CompassRose } from '../ui/debug/CompassRose'
import { SteamIntegration } from '../steam-integration'
import { WebXRCoordinator } from '../webxr/WebXRCoordinator'
import { WebXREventHandler } from '../webxr/WebXREventHandler'
import { EventManager } from './EventManager'
import { AppEventTypes, GameEventTypes, type GameStartEvent, type SceneReadyEvent } from '../types/InteractionEvents'
import { AppSettings } from './AppSettings'

import { StartupEventTracker, StartupPhase } from '../utils/StartupEventTracker'
import { UrlUtils } from '../utils/UrlUtils'
import { RenderLoopDiagnostics } from '../debug/RenderLoopDiagnostics'
import { PerfSweep } from '../debug/PerfSweep'
import { HeapMemoryReporter } from '../debug/HeapMemoryReporter'
// Side-effect import: registers GpuMemoryEstimator to window for console debugging
import '../debug/GpuMemoryEstimator'

export interface AppConfig {
    data?: {
        enablePersistence?: boolean
        defaultTTL?: number
        maxEntries?: number
    }
    tests?: Record<string, string>
}

export class SteamBrickAndMortarApp {
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
    private focusCoordinator?: FocusCoordinator
    private heapMemoryReporter?: HeapMemoryReporter
    private diagnosticsEnabled = false
    
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

        // Initialize AppSettings first (needed for default values)
        this.startupTracker.logEvent(StartupPhase.CoreInit, 'Initializing AppSettings')
        this.appSettings = AppSettings.getInstance()
        
        this.startupTracker.logEvent(StartupPhase.CoreInit, 'Creating SceneManager')
        this.sceneManager = new SceneManagerDebug()
        
        this.startupTracker.logEvent(StartupPhase.CoreInit, 'Preparing core coordinators')

        this.startupTracker.logEvent(StartupPhase.CoreInit, 'Creating SteamIntegration')
        this.steamIntegration = SteamIntegration.getInstance()

        this.startupTracker.logEvent(StartupPhase.CoreInit, 'Creating WebXRCoordinator')
        this.webxrCoordinator = new WebXRCoordinator({
            cameraRig: this.sceneManager.getCameraRig()
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

            // Focus tracking: pause render loop on blur, resume on focus, + window.toggleSceneBlur()
            this.focusCoordinator = new FocusCoordinator()
            this.focusCoordinator.init()

            // GPU memory leak detection (dev mode only — no-op in production)
            this.heapMemoryReporter = new HeapMemoryReporter()
            this.heapMemoryReporter.init(this.diagnosticsEnabled)

            // Initialize system UI coordinator (lighting panel, debug panels, etc.)
            await this.systemUICoordinator.init(this.sceneManager.getRenderer())

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
        this.focusCoordinator?.dispose()
        this.heapMemoryReporter?.dispose()
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

        // Initialize render loop diagnostics if enabled via URL param (?diagnostics=1 or ?sweep=1)
        // This MUST happen before startRenderLoop() - decision is made once, zero per-frame overhead when disabled
        // TODO: set appsettings from url, have diagnostics class set up at this phase?
        const diagnosticsEnabled = UrlUtils.isDiagnosticsEnabled()
        this.diagnosticsEnabled = diagnosticsEnabled
        RenderLoopDiagnostics.initialize({
            enabled: diagnosticsEnabled,
            logInterval: 60,  // Rolling average window size, in frames (~1s at 60fps)
            frameTimeWarnThreshold: 16.67,  // Counts a frame as "slow" past 60fps budget
            callbackTimeWarnThreshold: 5  // Counts a callback/stage occurrence as slow-worth-noting
        })
        // Render-pipeline-specific instrumentation is wired by RenderPipelineManagerDebug at
        // construction time (see SceneManager) — it self-gates on the same UrlUtils check.

        if (UrlUtils.isPerfSweepEnabled()) {
            this.eventManager.registerEventHandler(AppEventTypes.WorldDetailEnhanced, () => {
                PerfSweep.run()
            })
        }

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
