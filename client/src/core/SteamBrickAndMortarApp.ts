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
import { UICoordinator, PerformanceMonitor, type PerformanceStats } from '../ui'
import { SceneManager, SceneCoordinator } from '../scene'
import { DebugStatsProvider, type DebugStats } from './DebugStatsProvider'
import { SteamGameManager } from './SteamGameManager'
import { SteamIntegration } from '../steam-integration'
import { SteamWorkflowManager } from '../steam-integration/SteamWorkflowManager'
import { WebXRCoordinator } from '../webxr/WebXRCoordinator'
import { WebXREventHandler } from '../webxr/WebXREventHandler'
import { type WebXRCapabilities } from '../webxr/WebXRManager'
import { EventManager } from './EventManager'

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
    private webxrEventHandler: WebXREventHandler
    private uiCoordinator: UICoordinator
    private performanceMonitor: PerformanceMonitor
    private steamIntegration: SteamIntegration
    private debugStatsProvider: DebugStatsProvider
    private steamGameManager: SteamGameManager
    private eventManager: EventManager
    private steamWorkflowManager: SteamWorkflowManager

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
        // TODO: all (most?) of this should go into advanced visual settings)
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
            this.uiCoordinator,
            this.sceneCoordinator
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
        this.eventManager.emit('webxr:session-start', {
            timestamp: Date.now(),
            source: 'system' as const
        })
    }

    private emitWebXRSessionEndEvent(): void {
        this.eventManager.emit('webxr:session-end', {
            timestamp: Date.now(),
            source: 'system' as const
        })
    }

    private emitWebXRErrorEvent(error: Error): void {
        this.eventManager.emit('webxr:error', {
            error,
            timestamp: Date.now(),
            source: 'system' as const
        })
    }

    private emitWebXRSupportChangeEvent(capabilities: WebXRCapabilities): void {
        this.eventManager.emit('webxr:support-change', {
            capabilities,
            timestamp: Date.now(),
            source: 'system' as const
        })
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
