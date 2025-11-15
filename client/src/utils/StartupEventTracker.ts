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
    private events: StartupEvent[] = []
    private phases = new Map<StartupPhase, PhaseMetrics>()
    private startTime: number
    private enabled: boolean = true
    private progressUI?: StartupProgressUI
    
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
        // Listen for props progress events to show detail
        const eventManager = (async () => {
            const { EventManager } = await import('../core/EventManager')
            const { StorePropsEventTypes } = await import('../types/InteractionEvents')
            return { em: EventManager.getInstance(), types: StorePropsEventTypes }
        })()
        
        eventManager.then(({ em, types }) => {
            em.registerEventHandler(types.Progress, (event: CustomEvent<any>) => {
                if (this.progressUI && event.detail.detail) {
                    this.progressUI.updateDetail(event.detail.detail)
                }
            })
        }).catch(err => {
            console.warn('Failed to set up progress listeners:', err)
        })
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
        
        // Complete the progress UI
        if (this.progressUI) {
            this.progressUI.complete()
        }
    }
    
    public disable(): void {
        this.enabled = false
    }
    
    public enable(): void {
        this.enabled = true
    }
}
