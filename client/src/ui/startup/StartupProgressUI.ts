/**
 * Startup Progress UI
 * 
 * Displays a visual progress indicator during application startup,
 * showing the current phase and progress. Automatically fades out
 * when startup is complete.
 */

import { StartupPhase } from '../../utils/StartupEventTracker'

export class StartupProgressUI {
    private container: HTMLDivElement
    private progressBar: HTMLDivElement
    private phaseText: HTMLDivElement
    private descriptionText: HTMLDivElement
    private isVisible: boolean = true
    
    // Phase weights for progress calculation (total = 100)
    private readonly phaseWeights = new Map<StartupPhase, number>([
        [StartupPhase.PageLoad, 2],
        [StartupPhase.AppConstruction, 3],
        [StartupPhase.DIContainerSetup, 5],
        [StartupPhase.CoordinatorResolution, 5],
        [StartupPhase.EventHandlerSetup, 2],
        [StartupPhase.ControlsInit, 5],
        [StartupPhase.CriticalUIInit, 3],
        [StartupPhase.RenderLoopStart, 5],
        [StartupPhase.SceneConstruction, 40], // This is the big one
        [StartupPhase.NonEssentialSystemsStart, 5],
        [StartupPhase.DebugSystemsInit, 5],
        [StartupPhase.GameStart, 10],
        [StartupPhase.SteamAutoLoad, 5],
        [StartupPhase.FullyLoaded, 5]
    ])
    
    private currentProgress: number = 0
    
    constructor() {
        this.container = this.createContainer()
        this.progressBar = this.createProgressBar()
        this.phaseText = this.createPhaseText()
        this.descriptionText = this.createDescriptionText()
        
        this.container.appendChild(this.phaseText)
        // Progress bar is appended in createProgressBar()
        
        document.body.appendChild(this.container)
    }
    
    private createContainer(): HTMLDivElement {
        const container = document.createElement('div')
        container.id = 'startup-progress-container'
        container.style.cssText = `
            position: fixed;
            bottom: 40px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.7);
            backdrop-filter: blur(8px);
            padding: 12px 24px;
            border-radius: 20px;
            border: 1px solid rgba(255, 255, 255, 0.1);
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
            z-index: 10000;
            min-width: 300px;
            max-width: 400px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            opacity: 1;
            transition: opacity 0.5s ease-out;
            display: flex;
            align-items: center;
            gap: 12px;
        `
        return container
    }
    
    private createPhaseText(): HTMLDivElement {
        const text = document.createElement('div')
        text.style.cssText = `
            color: #fff;
            font-size: 13px;
            font-weight: 500;
            white-space: nowrap;
            flex-shrink: 0;
        `
        text.textContent = 'Loading...'
        return text
    }
    
    private createDescriptionText(): HTMLDivElement {
        const text = document.createElement('div')
        text.style.cssText = `
            display: none;
        `
        return text
    }
    
    private createProgressBar(): HTMLDivElement {
        const barContainer = document.createElement('div')
        barContainer.style.cssText = `
            flex: 1;
            height: 4px;
            background: rgba(255, 255, 255, 0.15);
            border-radius: 2px;
            overflow: hidden;
            position: relative;
        `
        
        const bar = document.createElement('div')
        bar.style.cssText = `
            height: 100%;
            background: linear-gradient(90deg, #4a9eff 0%, #67b5ff 100%);
            border-radius: 2px;
            width: 0%;
            transition: width 0.3s ease-out;
            box-shadow: 0 0 8px rgba(74, 158, 255, 0.4);
        `
        
        barContainer.appendChild(bar)
        this.container.appendChild(barContainer)
        return bar
    }
    
    /**
     * Update the progress UI with current phase
     */
    public updatePhase(phase: StartupPhase, description?: string): void {
        if (!this.isVisible) return
        
        // Calculate cumulative progress up to current phase
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
        
        // Update text
        const phaseName = this.formatPhaseName(phase)
        this.phaseText.textContent = phaseName
        
        if (description) {
            this.descriptionText.textContent = description
        }
    }
    
    /**
     * Update milestone description (sub-progress within a phase)
     */
    public updateMilestone(description: string): void {
        if (!this.isVisible) return
        
        // Update the main text to show the milestone
        this.phaseText.textContent = description
    }
    
    /**
     * Mark a phase as complete and advance progress
     */
    public completePhase(phase: StartupPhase): void {
        if (!this.isVisible) return
        
        const weight = this.phaseWeights.get(phase) || 0
        this.currentProgress += weight
        this.updateProgressBar(this.currentProgress)
    }
    
    /**
     * Mark startup as complete and fade out
     */
    public complete(): void {
        if (!this.isVisible) return
        
        // Set to 100%
        this.updateProgressBar(100)
        this.phaseText.textContent = '✓ Ready!'
        this.descriptionText.textContent = 'Starting your experience...'
        
        // Fade out after a short delay
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
        
        // Remove from DOM after fade completes
        setTimeout(() => {
            this.remove()
        }, 500)
    }
    
    /**
     * Immediately remove the UI (for cleanup)
     */
    public remove(): void {
        if (this.container.parentElement) {
            this.container.parentElement.removeChild(this.container)
        }
        this.isVisible = false
    }
    
    /**
     * Show an error state
     */
    public showError(message: string): void {
        if (!this.isVisible) return
        
        this.container.style.borderColor = 'rgba(255, 100, 100, 0.5)'
        this.progressBar.style.background = 'linear-gradient(90deg, #ff4a4a 0%, #ff6767 100%)'
        this.phaseText.textContent = '✗ Startup Failed'
        this.descriptionText.textContent = message
        this.descriptionText.style.color = '#ff8888'
    }
}
