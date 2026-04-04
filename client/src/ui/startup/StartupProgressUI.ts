import { EventManager } from '../../core/EventManager'
import { AppEventTypes, type PhaseCompletedEvent, type GameLoadingProgressEvent, type GameLoadingStartedEvent, type GameLoadingPhaseChangedEvent } from '../../types/InteractionEvents'
import { StartupPhase } from '../../utils/StartupEventTracker'
import './StartupProgressUI.css'

/**
 * StartupProgressUI
 *
 * Displays a startup progress bar driven exclusively by AppEventTypes events emitted
 * through the EventManager. It no longer holds a reference to StartupEventTracker and
 * is not directly called by it.
 */
export class StartupProgressUI {
    private container: HTMLDivElement
    private progressBar: HTMLDivElement
    private phaseText: HTMLDivElement
    private detailText: HTMLDivElement
    private isVisible: boolean = true

    // Game loading sub-progress tracking
    private gameLoadingPhase: 'cache' | 'fetch' | 'batch' | null = null
    private gameLoadingProgress: { current: number; total: number } = { current: 0, total: 0 }
    private gameLoadingStartWeight: number = 0

    /**
     * Phase weights determine how much each phase contributes to the 0-100 progress bar.
     * Ordered to match the new 5-phase architecture.
     */
    private readonly phaseWeights = new Map<StartupPhase, number>([
        [StartupPhase.CoreInit,        10],
        [StartupPhase.EngineStart,     15],
        [StartupPhase.WorldBuild,      40],
        [StartupPhase.ControlsReady,    5],
        [StartupPhase.Interactive,     10],
        [StartupPhase.PrewarmEncore,    5],
        [StartupPhase.DataFetchEncore, 15],
    ])

    private currentProgress: number = 0

    constructor() {
        this.container = this.createContainer()
        this.phaseText = this.createPhaseText()
        this.detailText = this.createDetailText()
        this.progressBar = this.createProgressBarWithLayout()

        document.body.appendChild(this.container)

        this.registerEventListeners()
    }

    // -------------------------------------------------------------------------
    // Event-driven wiring
    // -------------------------------------------------------------------------

    private registerEventListeners(): void {
        const em = EventManager.getInstance()

        em.registerEventHandler(AppEventTypes.PhaseStarted, (e: CustomEvent<PhaseCompletedEvent>) => {
            this.onPhaseStarted(e.detail.phase as StartupPhase)
        })

        em.registerEventHandler(AppEventTypes.PhaseCompleted, (e: CustomEvent<PhaseCompletedEvent>) => {
            this.onPhaseCompleted(e.detail.phase as StartupPhase)
        })

        em.registerEventHandler(AppEventTypes.Milestone, (e: CustomEvent) => {
            this.updateMilestone((e.detail as { description: string }).description)
        })

        em.registerEventHandler(AppEventTypes.DetailUpdate, (e: CustomEvent) => {
            this.updateDetail((e.detail as { detail: string }).detail)
        })

        em.registerEventHandler(AppEventTypes.GameLoadingStarted, (e: CustomEvent<GameLoadingStartedEvent>) => {
            this.startGameLoading(e.detail.totalGames, e.detail.phase as StartupPhase)
        })

        em.registerEventHandler(AppEventTypes.GameLoadingPhaseChanged, (e: CustomEvent<GameLoadingPhaseChangedEvent>) => {
            this.gameLoadingPhase = e.detail.loadingPhase
            this.updateDetail(e.detail.detail)
        })

        em.registerEventHandler(AppEventTypes.GameLoadingProgress, (e: CustomEvent<GameLoadingProgressEvent>) => {
            this.updateGameLoadingProgress(e.detail.current, e.detail.total)
        })

        em.registerEventHandler(AppEventTypes.StartupComplete, () => {
            this.complete()
        })
    }

    // -------------------------------------------------------------------------
    // UI update helpers
    // -------------------------------------------------------------------------

    private onPhaseStarted(phase: StartupPhase): void {
        if (!this.isVisible) return

        let cumulativeProgress = 0
        for (const [p, weight] of this.phaseWeights.entries()) {
            if (p === phase) break
            cumulativeProgress += weight
        }

        this.currentProgress = cumulativeProgress
        this.updateProgressBar(this.currentProgress)
        this.phaseText.textContent = this.formatPhaseName(phase)
    }

    private onPhaseCompleted(phase: StartupPhase): void {
        if (!this.isVisible) return

        const weight = this.phaseWeights.get(phase) || 0
        this.currentProgress += weight
        this.updateProgressBar(this.currentProgress)
    }

    private updateMilestone(description: string): void {
        if (!this.isVisible) return
        this.phaseText.textContent = description
        this.hideDetail()
    }

    private updateDetail(detail: string): void {
        if (!this.isVisible) return
        this.detailText.textContent = detail
        this.detailText.style.display = 'block'
    }

    private hideDetail(): void {
        if (!this.isVisible) return
        this.detailText.style.display = 'none'
    }

    private startGameLoading(totalGames: number, phase: StartupPhase = StartupPhase.DataFetchEncore): void {
        if (!this.isVisible) return

        let cumulativeProgress = 0
        for (const [p, weight] of this.phaseWeights.entries()) {
            if (p === phase) break
            cumulativeProgress += weight
        }
        this.gameLoadingStartWeight = cumulativeProgress
        this.gameLoadingProgress = { current: 0, total: totalGames }
    }

    private updateGameLoadingProgress(current: number, total?: number): void {
        if (!this.isVisible) return

        this.gameLoadingProgress.current = current
        if (total !== undefined) {
            this.gameLoadingProgress.total = total
        }

        const phaseWeight = this.phaseWeights.get(StartupPhase.DataFetchEncore) || 15
        const progressRatio = this.gameLoadingProgress.total > 0
            ? this.gameLoadingProgress.current / this.gameLoadingProgress.total
            : 0
        const subProgress = this.gameLoadingStartWeight + (phaseWeight * progressRatio)

        this.updateProgressBar(subProgress)
    }

    private complete(): void {
        if (!this.isVisible) return

        this.updateProgressBar(100)
        this.phaseText.textContent = 'Application loaded'
        this.hideDetail()

        setTimeout(() => {
            this.fadeOut()
        }, 800)
    }

    private updateProgressBar(progress: number): void {
        const clampedProgress = Math.min(100, Math.max(0, progress))
        this.progressBar.style.width = `${clampedProgress}%`
    }

    private formatPhaseName(phase: StartupPhase): string {
        // PascalCase → spaced words
        return phase.replace(/([A-Z])/g, ' $1').trim()
    }

    private fadeOut(): void {
        this.container.style.opacity = '0'
        setTimeout(() => { this.remove() }, 500)
    }

    public remove(): void {
        if (this.container.parentElement) {
            this.container.parentElement.removeChild(this.container)
        }
        this.isVisible = false

        // Signal for Playwright visual tools.
        if (import.meta.env.DEV) {
            (window as any).__playwrightSceneReady = true
        }
    }

    public showError(message: string): void {
        if (!this.isVisible) return
        this.container.classList.add('startup-error')
        this.phaseText.textContent = 'Startup failed'
        this.detailText.textContent = message
        this.detailText.style.display = 'block'
    }

    // -------------------------------------------------------------------------
    // DOM construction
    // -------------------------------------------------------------------------

    private createContainer(): HTMLDivElement {
        const container = document.createElement('div')
        container.id = 'startup-progress-container'
        return container
    }

    private createPhaseText(): HTMLDivElement {
        const text = document.createElement('div')
        text.className = 'startup-phase-text'
        text.textContent = 'Loading...'
        return text
    }

    private createDetailText(): HTMLDivElement {
        const text = document.createElement('div')
        text.className = 'startup-detail-text'
        return text
    }

    private createProgressBarWithLayout(): HTMLDivElement {
        const textColumn = document.createElement('div')
        textColumn.className = 'startup-text-column'
        textColumn.appendChild(this.phaseText)
        textColumn.appendChild(this.detailText)

        const barContainer = document.createElement('div')
        barContainer.className = 'startup-bar-container'

        const bar = document.createElement('div')
        bar.className = 'startup-progress-bar'
        barContainer.appendChild(bar)

        this.container.appendChild(textColumn)
        this.container.appendChild(barContainer)

        return bar
    }
}
