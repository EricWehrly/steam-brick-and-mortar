import { StartupPhase } from '../../utils/StartupEventTracker'
import './StartupProgressUI.css'

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
    
    private readonly phaseWeights = new Map<StartupPhase, number>([
        [StartupPhase.PageLoad, 2],
        [StartupPhase.AppConstruction, 3],
        [StartupPhase.DIContainerSetup, 5],
        [StartupPhase.CoordinatorResolution, 5],
        [StartupPhase.EventHandlerSetup, 2],
        [StartupPhase.ControlsInit, 5],
        [StartupPhase.CriticalUIInit, 3],
        [StartupPhase.RenderLoopStart, 5],
        [StartupPhase.SceneConstruction, 40],
        [StartupPhase.NonEssentialSystemsStart, 5],
        [StartupPhase.DebugSystemsInit, 5],
        [StartupPhase.GameStart, 10],
        [StartupPhase.SteamAutoLoad, 5],
        [StartupPhase.FullyLoaded, 5]
    ])
    
    private currentProgress: number = 0
    
    constructor() {
        this.container = this.createContainer()
        this.phaseText = this.createPhaseText()
        this.detailText = this.createDetailText()
        this.progressBar = this.createProgressBarWithLayout()
        
        document.body.appendChild(this.container)
    }
    
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
    
    public updatePhase(phase: StartupPhase): void {
        if (!this.isVisible) return
        
        let cumulativeProgress = 0
        let foundPhase = false
        
        for (const [p, weight] of this.phaseWeights.entries()) {
            if (p === phase) {
                foundPhase = true
                break
            }
            cumulativeProgress += weight
        }
        
        if (foundPhase) {
            this.currentProgress = cumulativeProgress
            this.updateProgressBar(this.currentProgress)
        }
        
        const phaseName = this.formatPhaseName(phase)
        this.phaseText.textContent = phaseName
    }
    
    public updateMilestone(description: string): void {
        if (!this.isVisible) return
        
        this.phaseText.textContent = description
        this.hideDetail()
    }
    
    public updateDetail(detail: string): void {
        if (!this.isVisible) return
        
        this.detailText.textContent = detail
        this.detailText.style.display = 'block'
    }
    
    public hideDetail(): void {
        if (!this.isVisible) return
        
        this.detailText.style.display = 'none'
    }
    
    public startGameLoading(totalGames: number, phase: StartupPhase = StartupPhase.SteamAutoLoad): void {
        if (!this.isVisible) return
        
        // Calculate starting weight for this phase
        let cumulativeProgress = 0
        for (const [p, weight] of this.phaseWeights.entries()) {
            if (p === phase) {
                break
            }
            cumulativeProgress += weight
        }
        this.gameLoadingStartWeight = cumulativeProgress
        this.gameLoadingProgress = { current: 0, total: totalGames }
    }
    
    public updateGameLoadingPhase(phase: 'cache' | 'fetch' | 'batch', detail: string): void {
        if (!this.isVisible) return
        
        this.gameLoadingPhase = phase
        this.updateDetail(detail)
    }
    
    public updateGameLoadingProgress(current: number, total?: number): void {
        if (!this.isVisible) return
        
        this.gameLoadingProgress.current = current
        if (total !== undefined) {
            this.gameLoadingProgress.total = total
        }
        
        // Calculate sub-progress within the phase
        const phaseWeight = this.phaseWeights.get(StartupPhase.SteamAutoLoad) || 5
        const progressRatio = this.gameLoadingProgress.total > 0 
            ? this.gameLoadingProgress.current / this.gameLoadingProgress.total 
            : 0
        const subProgress = this.gameLoadingStartWeight + (phaseWeight * progressRatio)
        
        this.updateProgressBar(subProgress)
    }
    
    public completePhase(phase: StartupPhase): void {
        if (!this.isVisible) return
        
        const weight = this.phaseWeights.get(phase) || 0
        this.currentProgress += weight
        this.updateProgressBar(this.currentProgress)
    }
    
    public complete(): void {
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
        // Convert kebab-case to Title Case
        return phase
            .split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ')
    }
    
    private fadeOut(): void {
        this.container.style.opacity = '0'
        
        setTimeout(() => {
            this.remove()
        }, 500)
    }
    
    public remove(): void {
        if (this.container.parentElement) {
            this.container.parentElement.removeChild(this.container)
        }
        this.isVisible = false
    }
    
    public showError(message: string): void {
        if (!this.isVisible) return
        
        this.container.classList.add('startup-error')
        this.phaseText.textContent = 'Startup failed'
        this.detailText.textContent = message
        this.detailText.style.display = 'block'
    }
}
