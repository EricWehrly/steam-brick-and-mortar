/**
 * Startup Event Tracker
 *
 * Tracks and logs all events during application startup to help understand:
 * - The order of initialization events
 * - Timing between events (comparative)
 * - Total time for each phase
 * - Dependencies and bottlenecks
 *
 * Emits AppEventTypes.PhaseCompleted via EventManager so that UI (StartupProgressUI)
 * can react without being directly coupled to this tracker.
 *
 * Also runs a requestAnimationFrame hitch detector during blocking startup phases
 * (CoreInit → Interactive). If the gap between two rAF ticks exceeds 100ms the
 * tracker logs "Main Thread Hitch Detected: Xms" — intentionally formatted so that
 * our Playwright console-capture tests can find it. The rAF loop is stopped once the
 * Interactive phase ends.
 */

import { EventManager } from '../core/EventManager'
import {
    AppEventTypes,
    type PhaseCompletedEvent,
    type MilestoneEvent,
    type DetailUpdateEvent,
    type GameLoadingStartedEvent,
    type GameLoadingPhaseChangedEvent,
    type GameLoadingProgressEvent,
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

// ---------------------------------------------------------------------------
// Phase enum — aligned to the 5-phase startup architecture doc
// ---------------------------------------------------------------------------

export enum StartupPhase {
    // Blocking startup phases (rAF hitch detector runs during these)
    CoreInit       = 'CoreInit',
    EngineStart    = 'EngineStart',
    WorldBuild     = 'WorldBuild',
    ControlsReady  = 'ControlsReady',
    Interactive    = 'Interactive',

    // Post-interactive async encores
    PrewarmEncore    = 'PrewarmEncore',
    DataFetchEncore  = 'DataFetchEncore',
}

// Phases considered "blocking" for the purpose of hitch detection.
const BLOCKING_PHASES = new Set<StartupPhase>([
    StartupPhase.CoreInit,
    StartupPhase.EngineStart,
    StartupPhase.WorldBuild,
    StartupPhase.ControlsReady,
    StartupPhase.Interactive,
])

// ---------------------------------------------------------------------------
// Threshold warnings
// ---------------------------------------------------------------------------

/** If a phase exceeds `warn` ms log console.warn; if it exceeds `error` ms log console.error. */
const PHASE_THRESHOLDS_MS: Partial<Record<StartupPhase, { warn: number; error: number }>> = {
    [StartupPhase.CoreInit]:      { warn: 50,   error: 200 },
    [StartupPhase.EngineStart]:   { warn: 500,  error: 1000 },
    [StartupPhase.WorldBuild]:    { warn: 2000, error: 5000 },
    [StartupPhase.ControlsReady]: { warn: 100,  error: 500 },
    [StartupPhase.Interactive]:   { warn: 200,  error: 1000 },
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// StartupEventTracker
// ---------------------------------------------------------------------------

export class StartupEventTracker {
    private static instance: StartupEventTracker

    private events: StartupEvent[] = []
    private phases = new Map<StartupPhase, PhaseMetrics>()
    private startTime: number

    private _enabled: boolean = true
    public get enabled(): boolean { return this._enabled }
    public set enabled(value: boolean) { this._enabled = !!value }

    // Game loading progress tracking (for DataFetchEncore)
    private totalGames = 0
    private loadedGames = 0
    private cachedBatchesComplete = false
    private fetchingInProgress = false

    private readonly CACHED_BATCH_THRESHOLD = 0.9
    private readonly COMPLETION_DELAY_MS = 300

    // rAF hitch detector state
    private hitchDetectorActive = false
    private lastRafTime = 0
    private rafHandle: number | null = null
    private readonly HITCH_THRESHOLD_MS = 100

    // Track how many blocking phases are currently open
    private activeBlockingPhaseCount = 0

    private constructor() {
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

    // ---------------------------------------------------------------------------
    // Listener wiring (called once EventManager is available)
    // ---------------------------------------------------------------------------

    public setupProgressListeners(): void {
        const eventManager = EventManager.getInstance()

        eventManager.registerEventHandler(StorePropsEventTypes.Progress, this.handleStorePropsProgress.bind(this))
        eventManager.registerEventHandler(SteamEventTypes.GamesBatchReady, this.handleGamesBatchReady.bind(this))
        eventManager.registerEventHandler(SteamEventTypes.NetworkFetchProgress, this.handleNetworkFetchProgress.bind(this))
        eventManager.registerEventHandler(GameEventTypes.AllBatchesComplete, this.handleAllBatchesComplete.bind(this))
    }

    private handleStorePropsProgress(event: CustomEvent<StorePropsProgressEvent>): void {
        if (event.detail.detail) {
            EventManager.getInstance().emit<DetailUpdateEvent>(AppEventTypes.DetailUpdate, { detail: event.detail.detail })
        }
    }

    private handleGamesBatchReady(event: CustomEvent<SteamGamesBatchEvent>): void {
        const { games, batchIndex, totalBatches } = event.detail
        this.loadedGames += games.length

        if (batchIndex === 0) {
            this.totalGames = totalBatches * games.length
            EventManager.getInstance().emit<GameLoadingStartedEvent>(AppEventTypes.GameLoadingStarted, {
                totalGames: this.totalGames,
                phase: StartupPhase.DataFetchEncore
            })
        }

        const estimatedCachedBatches = Math.floor(totalBatches * this.CACHED_BATCH_THRESHOLD)
        if (batchIndex >= estimatedCachedBatches && !this.cachedBatchesComplete) {
            this.cachedBatchesComplete = true
            this.fetchingInProgress = true
            EventManager.getInstance().emit<GameLoadingPhaseChangedEvent>(AppEventTypes.GameLoadingPhaseChanged, {
                loadingPhase: 'fetch',
                detail: 'Fetching new game metadata from Steam...'
            })
        }

        if (!this.cachedBatchesComplete) {
            EventManager.getInstance().emit<GameLoadingPhaseChangedEvent>(AppEventTypes.GameLoadingPhaseChanged, {
                loadingPhase: 'cache',
                detail: `Loading cached games (${this.loadedGames}/${this.totalGames})...`
            })
        } else if (this.fetchingInProgress) {
            EventManager.getInstance().emit<GameLoadingPhaseChangedEvent>(AppEventTypes.GameLoadingPhaseChanged, {
                loadingPhase: 'fetch',
                detail: `Fetching ${totalBatches - batchIndex} remaining games from Steam...`
            })
            this.fetchingInProgress = batchIndex < totalBatches - 1
        }

        EventManager.getInstance().emit<GameLoadingProgressEvent>(AppEventTypes.GameLoadingProgress, {
            current: this.loadedGames,
            total: this.totalGames
        })
    }

    private handleNetworkFetchProgress(event: CustomEvent<SteamNetworkFetchProgressEvent>): void {
        const { fetched, total } = event.detail
        EventManager.getInstance().emit<GameLoadingPhaseChangedEvent>(AppEventTypes.GameLoadingPhaseChanged, {
            loadingPhase: 'fetch',
            detail: `Waiting for Steam API (${fetched}/${total} games)...`
        })
    }

    private handleAllBatchesComplete(): void {
        EventManager.getInstance().emit<GameLoadingProgressEvent>(AppEventTypes.GameLoadingProgress, {
            current: this.totalGames,
            total: this.totalGames
        })
        setTimeout(() => {
            EventManager.getInstance().emit(AppEventTypes.StartupComplete, {})
        }, this.COMPLETION_DELAY_MS)
    }

    // ---------------------------------------------------------------------------
    // Phase lifecycle
    // ---------------------------------------------------------------------------

    public phaseStart(phase: StartupPhase, description?: string): void {
        if (!this.enabled) return

        const timestamp = getPerformanceNow()
        this.phases.set(phase, { startTime: timestamp, events: [] })

        const desc = description || `Starting ${phase}`
        this.logEvent(phase, desc)

        // Start hitch detector when first blocking phase begins
        if (BLOCKING_PHASES.has(phase)) {
            this.activeBlockingPhaseCount++
            if (!this.hitchDetectorActive) {
                this.startHitchDetector()
            }
        }

        // Notify UI via EventManager
        EventManager.getInstance().emit<PhaseCompletedEvent>(AppEventTypes.PhaseStarted, {
            phase,
            timestamp,
            duration: 0
        })
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

            // Threshold warnings
            const thresholds = PHASE_THRESHOLDS_MS[phase]
            if (thresholds) {
                if (phaseMetrics.duration >= thresholds.error) {
                    console.error(`[StartupTracker] Phase ${phase} took ${phaseMetrics.duration.toFixed(0)}ms (threshold: ${thresholds.error}ms error)`)
                } else if (phaseMetrics.duration >= thresholds.warn) {
                    console.warn(`[StartupTracker] Phase ${phase} took ${phaseMetrics.duration.toFixed(0)}ms (threshold: ${thresholds.warn}ms warn)`)
                }
            }

            // Notify UI via EventManager
            EventManager.getInstance().emit<PhaseCompletedEvent>(AppEventTypes.PhaseCompleted, {
                phase,
                timestamp,
                duration: phaseMetrics.duration
            })
        }

        // Stop hitch detector when all blocking phases are done
        if (BLOCKING_PHASES.has(phase)) {
            this.activeBlockingPhaseCount = Math.max(0, this.activeBlockingPhaseCount - 1)

            // If this is Interactive phase ending, stop unconditionally
            if (phase === StartupPhase.Interactive) {
                this.stopHitchDetector()
            } else if (this.activeBlockingPhaseCount === 0) {
                this.stopHitchDetector()
            }
        }
    }

    // ---------------------------------------------------------------------------
    // rAF hitch detector
    // ---------------------------------------------------------------------------

    private startHitchDetector(): void {
        if (typeof requestAnimationFrame === 'undefined') return
        this.hitchDetectorActive = true
        this.lastRafTime = getPerformanceNow()
        this.scheduleRafTick()
    }

    private scheduleRafTick(): void {
        if (!this.hitchDetectorActive) return
        this.rafHandle = requestAnimationFrame(() => {
            if (!this.hitchDetectorActive) return
            const now = getPerformanceNow()
            const gap = now - this.lastRafTime
            if (gap > this.HITCH_THRESHOLD_MS) {
                console.warn(`Main Thread Hitch Detected: ${gap.toFixed(0)}ms`)
            }
            this.lastRafTime = now
            this.scheduleRafTick()
        })
    }

    private stopHitchDetector(): void {
        this.hitchDetectorActive = false
        if (this.rafHandle !== null && typeof cancelAnimationFrame !== 'undefined') {
            cancelAnimationFrame(this.rafHandle)
            this.rafHandle = null
        }
    }

    // ---------------------------------------------------------------------------
    // Event helpers
    // ---------------------------------------------------------------------------

    public logEvent(phase: StartupPhase, description: string, metadata?: Record<string, unknown>): void {
        if (!this.enabled) return

        const timestamp = getPerformanceNow()
        const event: StartupEvent = { phase, timestamp, description, metadata }

        this.events.push(event)
        const phaseMetrics = this.phases.get(phase)
        if (phaseMetrics) {
            phaseMetrics.events.push(event)
        }
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
        EventManager.getInstance().emit<MilestoneEvent>(AppEventTypes.Milestone, { description })
    }

    // ---------------------------------------------------------------------------
    // Summary
    // ---------------------------------------------------------------------------

    public getSummary(): {
        totalTime: number
        phases: Array<{ phase: StartupPhase; duration: number; eventCount: number }>
        events: StartupEvent[]
    } {
        const totalTime = getPerformanceNow() - this.startTime
        const phaseSummary = Array.from(this.phases.entries()).map(([phase, metrics]) => ({
            phase,
            duration: metrics.duration || 0,
            eventCount: metrics.events.length
        }))
        return { totalTime, phases: phaseSummary, events: this.events }
    }

    public printSummary(): void {
        const summary = this.getSummary()
        console.log(`\n📊 Startup complete: ${summary.totalTime.toFixed(0)}ms`)
        console.table(
            summary.phases.map(p => ({
                phase: p.phase,
                'duration (ms)': p.duration.toFixed(0),
                events: p.eventCount
            }))
        )
    }
}
