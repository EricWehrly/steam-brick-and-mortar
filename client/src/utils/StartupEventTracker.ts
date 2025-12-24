/**
 * Startup Event Tracker
 * 
 * Tracks and logs all events during application startup to help understand:
 * - The order of initialization events
 * - Timing between events (comparative)
 * - Total time for each phase
 * - Dependencies and bottlenecks
 */

import type { StartupProgressUI } from '../ui/startup/StartupProgressUI'
import { EventManager } from '../core/EventManager'
import { 
    StorePropsEventTypes, 
    SteamEventTypes, 
    GameEventTypes,
    type StorePropsProgressEvent,
    type SteamGamesBatchEvent,
    type SteamNetworkFetchProgressEvent
} from '../types/InteractionEvents'

// Use window.performance for browser environment - globally accessible
const getPerformanceNow = (): number => {
    if (typeof window !== 'undefined' && window.performance) {
        return window.performance.now()
    }
    return Date.now()
}

export enum StartupPhase {
    // Phase 0: Pre-initialization
    PageLoad = 'page-load',
    AppConstruction = 'app-construction',
    
    // Phase 1: Core Services
    DIContainerSetup = 'di-container-setup',
    
    // Phase 2: Coordinators & Integration
    CoordinatorResolution = 'coordinator-resolution',
    EventHandlerSetup = 'event-handler-setup',
    
    // Phase 3: Controls & Critical UI
    ControlsInit = 'controls-init',
    CriticalUIInit = 'critical-ui-init',
    RenderLoopStart = 'render-loop-start',
    
    // Phase 4: Scene Construction (async but critical)
    SceneConstruction = 'scene-construction',
    
    // Phase 5: Non-Essential Systems
    NonEssentialSystemsStart = 'non-essential-systems-start',
    DebugSystemsInit = 'debug-systems-init',
    
    // Phase 6: Game Ready
    GameStart = 'game-start',
    
    // Phase 7: Post-Startup (QoL features)
    SteamAutoLoad = 'steam-auto-load',
    FullyLoaded = 'fully-loaded'
}

interface StartupEvent {
    phase: StartupPhase
    timestamp: number
    description: string
    metadata?: Record<string, unknown>
}

interface PhaseMetrics {
    startTime: number
    endTime?: number
    duration?: number
    events: StartupEvent[]
}

export class StartupEventTracker {
    private static instance: StartupEventTracker

    // Event collection and phase metrics
    private events: StartupEvent[] = []
    private phases = new Map<StartupPhase, PhaseMetrics>()
    private startTime: number

    // Feature flag for capturing events (use getter/setter)
    private _enabled: boolean = true
    public get enabled(): boolean { return this._enabled }
    public set enabled(value: boolean) { this._enabled = !!value }

    // Optional progress UI for startup feedback
    private progressUI?: StartupProgressUI

    // Game loading progress tracking
    private totalGames = 0
    private loadedGames = 0
    private cachedBatchesComplete = false
    private fetchingInProgress = false

    // Constants
    private readonly CACHED_BATCH_THRESHOLD = 0.9
    private readonly COMPLETION_DELAY_MS = 300

    private constructor() {
        // Use early page load time if available, otherwise use current time
        const windowWithStartTime = window as Window & { __APP_START_TIME?: number }
        if (typeof window !== 'undefined' && windowWithStartTime.__APP_START_TIME !== undefined) {
            this.startTime = windowWithStartTime.__APP_START_TIME
        } else {
            this.startTime = getPerformanceNow()
        }
    }
    
    public static getInstance(): StartupEventTracker {
        if (!StartupEventTracker.instance) {
            StartupEventTracker.instance = new StartupEventTracker()
        }
        return StartupEventTracker.instance
    }
    
    public setProgressUI(ui: StartupProgressUI): void {
        this.progressUI = ui
        this.setupProgressListeners()
    }
    
    private setupProgressListeners(): void {
        const eventManager = EventManager.getInstance()
        
        eventManager.registerEventHandler(StorePropsEventTypes.Progress, this.handleStorePropsProgress.bind(this))
        eventManager.registerEventHandler(SteamEventTypes.GamesBatchReady, this.handleGamesBatchReady.bind(this))
        eventManager.registerEventHandler(SteamEventTypes.NetworkFetchProgress, this.handleNetworkFetchProgress.bind(this))
        eventManager.registerEventHandler(GameEventTypes.AllBatchesComplete, this.handleAllBatchesComplete.bind(this))
    }

    private handleStorePropsProgress(event: CustomEvent<StorePropsProgressEvent>): void {
        if (this.progressUI && event.detail.detail) {
            this.progressUI.updateDetail(event.detail.detail)
        }
    }

    private handleGamesBatchReady(event: CustomEvent<SteamGamesBatchEvent>): void {
        if (!this.progressUI) return
        
        const { games, batchIndex, totalBatches } = event.detail
        this.loadedGames += games.length
        
        if (batchIndex === 0) {
            this.totalGames = totalBatches * games.length
            this.progressUI.startGameLoading(this.totalGames, StartupPhase.SteamAutoLoad)
        }
        
        const estimatedCachedBatches = Math.floor(totalBatches * this.CACHED_BATCH_THRESHOLD)
        if (batchIndex >= estimatedCachedBatches && !this.cachedBatchesComplete) {
            this.cachedBatchesComplete = true
            this.fetchingInProgress = true
            this.progressUI.updateGameLoadingPhase('fetch', 'Fetching new game metadata from Steam...')
        }
        
        if (!this.cachedBatchesComplete) {
            this.progressUI.updateGameLoadingPhase('cache', `Loading cached games (${this.loadedGames}/${this.totalGames})...`)
        } else if (this.fetchingInProgress) {
            this.progressUI.updateGameLoadingPhase('fetch', `Fetching ${totalBatches - batchIndex} remaining games from Steam...`)
            this.fetchingInProgress = batchIndex < totalBatches - 1
        }
        
        this.progressUI.updateGameLoadingProgress(this.loadedGames, this.totalGames)
    }

    private handleNetworkFetchProgress(event: CustomEvent<SteamNetworkFetchProgressEvent>): void {
        if (!this.progressUI) return
        
        const { fetched, total } = event.detail
        this.progressUI.updateGameLoadingPhase('fetch', `Waiting for Steam API (${fetched}/${total} games)...`)
    }

    private handleAllBatchesComplete(): void {
        if (!this.progressUI) return
        
        this.progressUI.updateGameLoadingProgress(this.totalGames, this.totalGames)
        setTimeout(() => {
            this.completeProgressUI()
        }, this.COMPLETION_DELAY_MS)
    }
    
    public phaseStart(phase: StartupPhase, description?: string): void {
        if (!this.enabled) return
        
        const timestamp = getPerformanceNow()
        
        this.phases.set(phase, {
            startTime: timestamp,
            events: []
        })
        
        const desc = description || `Starting ${phase}`
        this.logEvent(phase, desc)
        
        // Update progress UI
        if (this.progressUI) {
            this.progressUI.updatePhase(phase)
        }
    }
    
    public phaseEnd(phase: StartupPhase, description?: string): void {
        if (!this.enabled) return
        
        const timestamp = getPerformanceNow()
        const phaseMetrics = this.phases.get(phase)
        
        if (phaseMetrics) {
            phaseMetrics.endTime = timestamp
            phaseMetrics.duration = timestamp - phaseMetrics.startTime
            
            const desc = description || `Completed ${phase}`
            
            this.logEvent(phase, desc, { duration: phaseMetrics.duration })
            
            // Update progress UI
            if (this.progressUI) {
                this.progressUI.completePhase(phase)
            }
        }
    }
    
    public logEvent(phase: StartupPhase, description: string, metadata?: Record<string, unknown>): void {
        if (!this.enabled) return
        
        const timestamp = getPerformanceNow()
        
        const event: StartupEvent = {
            phase,
            timestamp,
            description,
            metadata
        }
        
        this.events.push(event)
        
        const phaseMetrics = this.phases.get(phase)
        if (phaseMetrics) {
            phaseMetrics.events.push(event)
        }
        
        // No console logging for regular events - reduces noise
    }
    
    public logAsyncStart(phase: StartupPhase, operation: string): number {
        if (!this.enabled) return 0
        
        const timestamp = getPerformanceNow()
        this.logEvent(phase, `${operation} (started)`)
        
        return timestamp
    }
    
    public logAsyncEnd(phase: StartupPhase, operation: string, startTimestamp: number): void {
        if (!this.enabled) return
        
        const timestamp = getPerformanceNow()
        const duration = timestamp - startTimestamp
        
        this.logEvent(phase, `${operation} (completed)`, { duration })
    }
    
    public milestone(phase: StartupPhase, description: string, metadata?: Record<string, unknown>): void {
        if (!this.enabled) return
        
        this.logEvent(phase, `MILESTONE: ${description}`, metadata)
        
        // Update progress UI with milestone description
        if (this.progressUI) {
            this.progressUI.updateMilestone(description)
        }
    }
    
    public getSummary(): {
        totalTime: number
        phases: Array<{
            phase: StartupPhase
            duration: number
            eventCount: number
        }>
        events: StartupEvent[]
    } {
        const totalTime = getPerformanceNow() - this.startTime
        
        const phaseSummary = Array.from(this.phases.entries()).map(([phase, metrics]) => ({
            phase,
            duration: metrics.duration || 0,
            eventCount: metrics.events.length
        }))
        
        return {
            totalTime,
            phases: phaseSummary,
            events: this.events
        }
    }
    
    public printSummary(): void {
        const summary = this.getSummary()
        
        console.log(`\n📊 Startup complete: ${summary.totalTime.toFixed(0)}ms`)
    }
    
    public completeProgressUI(): void {
        this.progressUI?.complete()
    }
}
